-- ไฟล์: supabase/card.sql
-- ============================================================================
-- JodFlow — บัตรเครดิต เฟส 1   [card.sql]
--
-- Supabase → SQL Editor → Role = postgres → วางทั้งไฟล์ → Run
-- รันซ้ำได้ ไม่ลบข้อมูล  (ต้องรัน fix.sql ก่อน เพราะไฟล์นี้ทับฟังก์ชันชุดเดียวกัน)
--
-- แนวคิด: บัตรเครดิตคือ "กระเป๋าเงินชนิดที่สี่" ต่อจาก cash / transfer / sub
-- ปลายทางของเงินเขียนเป็น 'card:<uuid>' แล้วเสียบเข้า apply_wallet_effect ที่มีอยู่
-- ทำให้ post_transaction / edit_transaction / cancel_transaction รองรับบัตรทันที
-- รวมถึงการย้อนยอดตอนแก้ไขและการคืนยอดตอนยกเลิก โดยไม่ต้องเขียนใหม่
--
-- เครื่องหมายกลับด้าน: บัตรเป็นหนี้ ไม่ใช่ทรัพย์สิน จึงเก็บ outstanding - delta
--   รูดจ่าย (expense) delta = -1000  →  outstanding เพิ่ม 1000
--   เงินคืน (income)  delta = +50    →  outstanding ลด   50
-- ============================================================================

-- ── 1. ตารางบัตร ────────────────────────────────────────────────────────────

create table if not exists credit_cards (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references shops(id) on delete cascade,
  bank_name     text not null default '',
  name          text not null default '',
  -- เลขสี่ตัวท้าย ไว้แยกบัตรที่ธนาคารเดียวกัน — ห้ามเก็บเลขบัตรเต็ม
  last4         text,
  credit_limit  numeric(14,2) not null default 0,
  -- หนี้คงค้าง ค่าบวก = เป็นหนี้ ขยับผ่าน apply_wallet_effect เท่านั้น
  outstanding   numeric(14,2) not null default 0,
  closing_day   int not null default 25 check (closing_day between 1 and 31),
  due_day       int not null default 15 check (due_day between 1 and 31),
  cashback_rate numeric(5,2) not null default 0,
  note          text,
  enabled       boolean not null default true,
  deleted       boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists credit_cards_shop_idx
  on credit_cards (shop_id, sort_order, created_at);

-- ── 2. transactions: คอลัมน์บัตร + ขยายวิธีชำระเงิน ─────────────────────────

alter table transactions add column if not exists card_id uuid
  references credit_cards(id) on delete set null;

create index if not exists transactions_card_idx on transactions (card_id, date desc);

-- ของเดิมอนุญาต cash / transfer / pending / other (ดู columns.sql)
alter table transactions drop constraint if exists transactions_method_check;
alter table transactions add  constraint transactions_method_check
  check (method in ('cash', 'transfer', 'pending', 'other', 'card'));

-- ── 3. apply_wallet_effect: เพิ่มสาขา card ──────────────────────────────────

create or replace function public.apply_wallet_effect(
  p_shop uuid, p_target text, p_delta numeric
) returns void language plpgsql security definer set search_path = public as $$
declare v_kind text; v_id text;
begin
  if p_target is null or p_delta = 0 then return; end if;
  perform assert_can_edit(p_shop);

  v_kind := split_part(p_target, ':', 1);
  v_id   := nullif(split_part(p_target, ':', 2), '');

  -- ทุกสาขาต้องตรวจว่าแก้โดนแถวจริง — ปลายทางที่ไม่ใช่ของร้านนี้ (หรือถูกลบไปแล้ว)
  -- ถ้าปล่อยผ่านเงียบๆ รายการจะถูกบันทึกโดยไม่มีเงินขยับ = ยอดไม่ตรงโดยไม่มีใครรู้
  if v_kind = 'cash' then
    update wallet_state set cash = cash + p_delta, updated_at = now() where shop_id = p_shop;
    if not found then raise exception 'ไม่พบกระเป๋าเงินสดของร้านนี้'; end if;
  elsif v_kind = 'transfer' then
    update transfer_accounts set balance = balance + p_delta
     where id = v_id::uuid and shop_id = p_shop;
    if not found then raise exception 'ไม่พบบัญชีเงินโอนของร้านนี้'; end if;
  elsif v_kind = 'sub' then
    update sub_wallets set balance = balance + p_delta
     where id = v_id::uuid and shop_id = p_shop;
    if not found then raise exception 'ไม่พบกระเป๋าตังค์ย่อยของร้านนี้'; end if;
  elsif v_kind = 'card' then
    -- กลับเครื่องหมาย: บัตรเป็นหนี้ รูดแล้วหนี้เพิ่ม จ่ายบิลแล้วหนี้ลด
    update credit_cards set outstanding = outstanding - p_delta, updated_at = now()
     where id = v_id::uuid and shop_id = p_shop;
    if not found then raise exception 'ไม่พบบัตรเครดิตของร้านนี้'; end if;
  else
    raise exception 'ปลายทางไม่ถูกต้อง: %', p_target;
  end if;
end;
$$;

-- ── 4. post_transaction: พก card_id ไปด้วย ──────────────────────────────────
-- คอลัมน์ที่ไม่อยู่ในรายชื่อของคำสั่ง insert จะถูกทิ้งเงียบๆ จึงต้องเพิ่มที่นี่ด้วย

create or replace function public.post_transaction(
  p_shop   uuid,
  p_tx     jsonb,
  p_target text default null,
  p_delta  numeric default 0,
  p_log    jsonb default null
) returns transactions language plpgsql security definer set search_path = public as $$
declare v_tx transactions; v_log jsonb;
begin
  perform assert_can_edit(p_shop);

  -- client ส่ง p_tx ผ่าน toRow() จึงเป็น snake_case (item_name, category_id, ...)
  -- รับ camelCase ไว้ด้วยเผื่อผู้เรียกเก่า
  insert into transactions (
    shop_id, date, type, amount, method, category_id, item_name, vendor,
    receipt_no, tax_status, due_date, tax_due_date, note, detail, other_income_type,
    transfer_account_id, card_id, recurring_entry_id, attachments,
    document_path, document_type, document_label, created_by
  ) values (
    p_shop,
    (p_tx->>'date')::date,
    p_tx->>'type',
    (p_tx->>'amount')::numeric,
    p_tx->>'method',
    nullif(coalesce(p_tx->>'category_id', p_tx->>'categoryId'), '')::uuid,
    coalesce(p_tx->>'item_name', p_tx->>'itemName', ''),
    p_tx->>'vendor',
    coalesce(p_tx->>'receipt_no', p_tx->>'receiptNo'),
    coalesce(p_tx->>'tax_status', p_tx->>'taxStatus'),
    nullif(coalesce(p_tx->>'due_date', p_tx->>'dueDate'), '')::date,
    nullif(coalesce(p_tx->>'tax_due_date', p_tx->>'taxDueDate'), '')::date,
    p_tx->>'note',
    p_tx->>'detail',
    coalesce(p_tx->>'other_income_type', p_tx->>'otherIncomeType'),
    nullif(coalesce(p_tx->>'transfer_account_id', p_tx->>'transferAccountId'), '')::uuid,
    nullif(coalesce(p_tx->>'card_id', p_tx->>'cardId'), '')::uuid,
    nullif(coalesce(p_tx->>'recurring_entry_id', p_tx->>'recurringEntryId'), '')::uuid,
    coalesce(p_tx->'attachments', '[]'::jsonb),
    coalesce(p_tx->>'document_path', p_tx->>'documentPath'),
    coalesce(p_tx->>'document_type', p_tx->>'documentType'),
    coalesce(p_tx->>'document_label', p_tx->>'documentLabel'),
    auth.uid()
  ) returning * into v_tx;

  perform apply_wallet_effect(p_shop, p_target, p_delta);

  -- ฝัง id ของรายการลงใน log ให้หน้าประวัติจับคู่ได้ว่า log นี้คือรายการไหน
  v_log := p_log;
  if v_log is not null then
    v_log := jsonb_set(
      v_log, '{newValue}',
      coalesce(v_log->'newValue', '{}'::jsonb) || jsonb_build_object('transactionId', v_tx.id)
    );
  end if;
  perform write_log(p_shop, v_log);
  return v_tx;
end;
$$;

-- ── 5. edit_transaction: แก้ card_id ได้ ────────────────────────────────────

create or replace function public.edit_transaction(
  p_tx_id          uuid,
  p_changes        jsonb,
  p_reverse_target text    default null,
  p_reverse_delta  numeric default 0,
  p_apply_target   text    default null,
  p_apply_delta    numeric default 0,
  p_log            jsonb   default null
) returns transactions language plpgsql security definer set search_path = public as $$
declare v_shop uuid; v_tx transactions;
begin
  select shop_id into v_shop from transactions where id = p_tx_id;
  if v_shop is null then raise exception 'ไม่พบรายการนี้'; end if;
  perform assert_can_edit(v_shop);

  update transactions set
    date                = case when p_changes ? 'date'                then (p_changes->>'date')::date                          else date                end,
    amount              = case when p_changes ? 'amount'              then (p_changes->>'amount')::numeric                     else amount              end,
    method              = case when p_changes ? 'method'              then p_changes->>'method'                                else method              end,
    item_name           = case when p_changes ? 'item_name'           then coalesce(p_changes->>'item_name', '')               else item_name           end,
    category_id         = case when p_changes ? 'category_id'         then nullif(p_changes->>'category_id', '')::uuid         else category_id         end,
    vendor              = case when p_changes ? 'vendor'              then p_changes->>'vendor'                                else vendor              end,
    receipt_no          = case when p_changes ? 'receipt_no'          then p_changes->>'receipt_no'                            else receipt_no          end,
    tax_status          = case when p_changes ? 'tax_status'          then p_changes->>'tax_status'                            else tax_status          end,
    due_date            = case when p_changes ? 'due_date'            then nullif(p_changes->>'due_date', '')::date            else due_date            end,
    tax_due_date        = case when p_changes ? 'tax_due_date'        then nullif(p_changes->>'tax_due_date', '')::date        else tax_due_date        end,
    note                = case when p_changes ? 'note'                then p_changes->>'note'                                  else note                end,
    detail              = case when p_changes ? 'detail'              then p_changes->>'detail'                                else detail              end,
    other_income_type   = case when p_changes ? 'other_income_type'   then p_changes->>'other_income_type'                     else other_income_type   end,
    transfer_account_id = case when p_changes ? 'transfer_account_id' then nullif(p_changes->>'transfer_account_id', '')::uuid else transfer_account_id end,
    card_id             = case when p_changes ? 'card_id'             then nullif(p_changes->>'card_id', '')::uuid             else card_id             end,
    attachments         = case when p_changes ? 'attachments'         then coalesce(p_changes->'attachments', '[]'::jsonb)     else attachments         end,
    document_path       = case when p_changes ? 'document_path'       then p_changes->>'document_path'                         else document_path       end,
    document_type       = case when p_changes ? 'document_type'       then p_changes->>'document_type'                         else document_type       end,
    document_label      = case when p_changes ? 'document_label'      then p_changes->>'document_label'                        else document_label      end,
    updated_at          = now()
  where id = p_tx_id
  returning * into v_tx;

  perform apply_wallet_effect(v_shop, p_reverse_target, p_reverse_delta);
  perform apply_wallet_effect(v_shop, p_apply_target, p_apply_delta);
  perform write_log(v_shop, p_log);
  return v_tx;
end;
$$;

-- ── 6. ล้างข้อมูลร้าน ต้องลบบัตรด้วย ────────────────────────────────────────
-- ลบ transactions ก่อน card_id จึงไม่มีอะไรอ้างถึงบัตรตอนลบ

create or replace function public.clear_shop_data(p_shop uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_owner(p_shop) then
    raise exception 'เฉพาะเจ้าของร้านเท่านั้นที่ล้างข้อมูลได้' using errcode = '42501';
  end if;

  delete from tax_invoices      where shop_id = p_shop;
  delete from pending_payments  where shop_id = p_shop;
  delete from pending_incomes   where shop_id = p_shop;
  delete from transactions      where shop_id = p_shop;
  delete from recurring_entries where shop_id = p_shop;
  delete from recurring_items   where shop_id = p_shop;
  delete from loans             where shop_id = p_shop;
  delete from sub_wallets       where shop_id = p_shop;
  delete from transfer_accounts where shop_id = p_shop;
  delete from credit_cards      where shop_id = p_shop;
  delete from calendar_notes    where shop_id = p_shop;
  delete from activity_logs     where shop_id = p_shop;
  delete from quick_items       where shop_id = p_shop;
  delete from vendors           where shop_id = p_shop;
  delete from categories        where shop_id = p_shop;

  update wallet_state set cash = 0, updated_at = now() where shop_id = p_shop;
  insert into categories (shop_id, name, type)
  values (p_shop, 'อื่นๆ', 'expense'), (p_shop, 'อื่นๆ', 'income');
end;
$$;

-- ── 7. RLS: อ่าน = สมาชิก, เขียน = owner/editor (ชุดเดียวกับตารางอื่น) ──────
-- ลืมข้อนี้แล้ว query จะคืนค่าว่างเปล่าโดยไม่มี error

alter table credit_cards enable row level security;

drop policy if exists credit_cards_select on credit_cards;
create policy credit_cards_select on credit_cards
  for select using (is_member(shop_id));

drop policy if exists credit_cards_insert on credit_cards;
create policy credit_cards_insert on credit_cards
  for insert with check (can_edit(shop_id));

drop policy if exists credit_cards_update on credit_cards;
create policy credit_cards_update on credit_cards
  for update using (can_edit(shop_id)) with check (can_edit(shop_id));

drop policy if exists credit_cards_delete on credit_cards;
create policy credit_cards_delete on credit_cards
  for delete using (can_edit(shop_id));

-- ── 8. Realtime: ลืมข้อนี้แล้วเครื่องอื่นจะไม่เห็นยอดบัตรขยับ ───────────────

alter table credit_cards replica identity full;
do $$
begin
  alter publication supabase_realtime add table credit_cards;
exception when duplicate_object then null;
end $$;
