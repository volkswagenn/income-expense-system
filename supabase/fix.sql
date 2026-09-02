-- ไฟล์: supabase/fix.sql
-- ============================================================================
-- JodFlow — แก้บั๊กฐานข้อมูลสำหรับร้านที่ติดตั้งไปแล้ว   [fix.sql]
--
-- ฐานข้อมูลใหม่ไม่ต้องรันไฟล์นี้ (setup.sql มีทุกอย่างในนี้แล้ว)
-- ฐานข้อมูลที่ติดตั้งก่อนหน้า: Supabase → SQL Editor → Role = postgres → วางทั้งไฟล์ → Run
-- รันซ้ำได้ ไม่ลบข้อมูล
--
-- สิ่งที่แก้
--   1. post_transaction อ่านคีย์ camelCase แต่ client ส่ง snake_case → ทุกรายการที่บันทึก
--      ไม่มีชื่อ/หมวด/บัญชีโอน โดยไม่มี error  (ตอนนี้รับทั้งสองแบบ + เก็บคอลัมน์ที่เคยตกหล่น)
--   2. recurring_entries ขาดคอลัมน์ transfer_account_id / amount_updated_at → กดจ่าย/ยกเลิก/
--      บันทึกยอดของรายการประจำถูก PostgREST ปฏิเสธทั้งหน้า
--   3. edit_transaction ใหม่ — แก้รายการ + ย้อน/ปรับยอดเงิน ใน RPC เดียว (ของเดิม client ยิงหลายคำสั่ง)
--   4. write_log ตรวจว่าเป็นสมาชิกร้านก่อน (ของเดิมใครก็เขียนประวัติใส่ร้านอื่นได้)
--   5. apply_wallet_effect / move_cash_transfer / move_between_transfer_accounts / return_loan
--      ตรวจว่าแก้โดนแถวจริง — ของเดิมปลายทางผิดแล้วเงินหายหรือเพิ่มเงียบๆ
--   6. pay_pending_payment เก็บบัญชีที่จ่ายลง recurring_entries ด้วย
--   7. bucket 'attachments' + policy ของ Storage (ฐานข้อมูลบางชุดยังไม่มี → แนบไฟล์ไม่ได้)
--   8. คอลัมน์ใหม่ของ recurring_items (พักเรียกเก็บ / VAT) จาก columns.sql
-- ============================================================================

-- ── 2, 8. คอลัมน์ที่ขาด ────────────────────────────────────────────────────

alter table recurring_entries add column if not exists transfer_account_id uuid
  references transfer_accounts(id) on delete set null;
alter table recurring_entries add column if not exists amount_updated_at timestamptz;
alter table recurring_items add column if not exists paused_from  date;
alter table recurring_items add column if not exists paused_until date;
alter table recurring_items add column if not exists vat_rate     numeric(5,2) not null default 0;

-- ── 1, 3, 4, 5, 6 ฟังก์ชัน (create or replace — ทับของเดิม) ─────────────────

create or replace function public.move_between_transfer_accounts(
  p_from uuid, p_to uuid, p_amount numeric
) returns void language plpgsql security definer set search_path = public as $$
declare v_shop uuid;
begin
  select shop_id into v_shop from transfer_accounts where id = p_from;
  if v_shop is null then raise exception 'ไม่พบบัญชีต้นทาง'; end if;
  perform assert_can_edit(v_shop);
  if p_from = p_to then raise exception 'ต้นทางกับปลายทางเป็นบัญชีเดียวกัน'; end if;
  update transfer_accounts set balance = balance - p_amount where id = p_from;
  update transfer_accounts set balance = balance + p_amount where id = p_to and shop_id = v_shop;
  -- ปลายทางไม่ใช่บัญชีของร้านนี้ = เงินถูกตัดไปแล้วแต่ไม่เข้าที่ไหน ต้องล้มทั้งคำสั่ง
  if not found then raise exception 'ไม่พบบัญชีปลายทางของร้านนี้'; end if;
end;
$$;

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
  else
    raise exception 'ปลายทางไม่ถูกต้อง: %', p_target;
  end if;
end;
$$;

create or replace function public.write_log(p_shop uuid, p_log jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_log is null then return; end if;
  -- เรียกตรงผ่าน RPC ได้ จึงต้องกันไม่ให้สมาชิกร้านหนึ่งเขียนประวัติใส่ร้านอื่น
  if not is_member(p_shop) then
    raise exception 'ไม่มีสิทธิ์เขียนประวัติของร้านนี้' using errcode = '42501';
  end if;
  insert into activity_logs (
    shop_id, user_id, activity_type, description, old_value, new_value,
    change_note, wallet_effect, status, error_message, device_info, session_id
  ) values (
    p_shop, auth.uid(),
    p_log->>'activityType', p_log->>'description',
    p_log->'oldValue', p_log->'newValue',
    p_log->>'changeNote', p_log->'walletEffect',
    coalesce(p_log->>'status', 'success'), p_log->>'errorMessage',
    p_log->>'deviceInfo', p_log->>'sessionId'
  );
end;
$$;

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
  -- รับ camelCase ไว้ด้วยเผื่อผู้เรียกเก่า — เวอร์ชันแรกอ่านแต่ camelCase ทำให้ทุกรายการ
  -- ที่บันทึกจริงไม่มีชื่อ ไม่มีหมวด ไม่มีบัญชีโอน โดยไม่มี error อะไรเลย
  insert into transactions (
    shop_id, date, type, amount, method, category_id, item_name, vendor,
    receipt_no, tax_status, due_date, tax_due_date, note, detail, other_income_type,
    transfer_account_id, recurring_entry_id, attachments,
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

create or replace function public.move_cash_transfer(
  p_shop    uuid,
  p_account uuid,
  p_amount  numeric,
  p_to      text,               -- 'transfer' = สด→โอน, 'cash' = โอน→สด
  p_log     jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform assert_can_edit(p_shop);
  if p_amount <= 0 then raise exception 'จำนวนเงินต้องมากกว่า 0'; end if;

  -- ตรวจ `found` ทันทีหลัง update บัญชีเงินโอน — ถ้าไปตรวจหลัง update wallet_state
  -- (ซึ่งเจอแถวเสมอ) ฝั่ง โอน→สด จะบวกเงินสดให้ทั้งที่บัญชีต้นทางไม่มีอยู่จริง
  if p_to = 'transfer' then
    update wallet_state set cash = cash - p_amount, updated_at = now() where shop_id = p_shop;
    update transfer_accounts set balance = balance + p_amount
     where id = p_account and shop_id = p_shop;
    if not found then raise exception 'ไม่พบบัญชีเงินโอนของร้านนี้'; end if;
  elsif p_to = 'cash' then
    update transfer_accounts set balance = balance - p_amount
     where id = p_account and shop_id = p_shop;
    if not found then raise exception 'ไม่พบบัญชีเงินโอนของร้านนี้'; end if;
    update wallet_state set cash = cash + p_amount, updated_at = now() where shop_id = p_shop;
  else
    raise exception 'ปลายทางไม่ถูกต้อง: %', p_to;
  end if;

  perform write_log(p_shop, p_log);
end;
$$;

create or replace function public.return_loan(
  p_loan    uuid,
  p_method  text,
  p_account uuid default null,
  p_log     jsonb default null
) returns loans language plpgsql security definer set search_path = public as $$
declare v_loan loans;
begin
  select * into v_loan from loans where id = p_loan;
  if v_loan.id is null then raise exception 'ไม่พบรายการยืมนี้'; end if;
  if v_loan.returned then raise exception 'รายการนี้คืนไปแล้ว'; end if;
  perform assert_can_edit(v_loan.shop_id);
  if p_method = 'transfer' and p_account is null then raise exception 'ต้องระบุบัญชีเงินโอน'; end if;

  if p_method = 'cash' then
    update wallet_state set cash = cash - v_loan.amount, updated_at = now()
     where shop_id = v_loan.shop_id;
  else
    update transfer_accounts set balance = balance - v_loan.amount
     where id = p_account and shop_id = v_loan.shop_id;
    if not found then raise exception 'ไม่พบบัญชีเงินโอนของร้านนี้'; end if;
  end if;

  -- กระเป๋าย่อยที่ยืมมาอาจถูกลบไปแล้ว (FK เป็น set null) — ถ้าเป็นแบบนั้นห้ามตัดเงินหลัก
  -- ทิ้งโดยไม่มีที่ให้คืน ต้องบอกผู้ใช้ให้ลบรายการยืมแทน
  update sub_wallets set balance = balance + v_loan.amount where id = v_loan.sub_wallet_id;
  if not found then
    raise exception 'กระเป๋าตังค์ย่อยที่ยืมมาถูกลบไปแล้ว คืนเงินไม่ได้ — ให้ลบรายการยืมนี้แทน';
  end if;

  update loans
     set returned = true, returned_at = now(), return_method = p_method, return_account_id = p_account
   where id = p_loan
  returning * into v_loan;

  perform write_log(v_loan.shop_id, p_log);
  return v_loan;
end;
$$;

create or replace function public.pay_pending_payment(
  p_pending uuid,
  p_method  text,
  p_account uuid default null,
  p_date    date default null,
  p_log     jsonb default null
) returns transactions language plpgsql security definer set search_path = public as $$
declare v_p pending_payments; v_tx transactions; v_target text;
begin
  select * into v_p from pending_payments where id = p_pending;
  if v_p.id is null then raise exception 'ไม่พบรายการค้างชำระนี้'; end if;
  if v_p.status = 'paid' then raise exception 'รายการนี้จ่ายไปแล้ว'; end if;
  perform assert_can_edit(v_p.shop_id);
  if p_method = 'transfer' and p_account is null then raise exception 'ต้องระบุบัญชีเงินโอน'; end if;

  insert into transactions (
    shop_id, date, type, amount, method, category_id, item_name, vendor,
    receipt_no, tax_status, note, transfer_account_id, recurring_entry_id,
    attachments, document_path, document_type, document_label, created_by
  ) values (
    v_p.shop_id, coalesce(p_date, current_date), 'expense', v_p.amount, p_method,
    v_p.category_id, v_p.item_name, v_p.vendor, v_p.receipt_no, v_p.tax_status,
    v_p.note, p_account, v_p.recurring_entry_id,
    v_p.attachments, v_p.document_path, v_p.document_type, v_p.document_label, auth.uid()
  ) returning * into v_tx;

  v_target := case when p_method = 'cash' then 'cash' else 'transfer:' || p_account end;
  perform apply_wallet_effect(v_p.shop_id, v_target, -v_p.amount);

  update pending_payments
     set status = 'paid', paid_at = now(), paid_method = p_method,
         transfer_account_id = p_account, transaction_id = v_tx.id
   where id = p_pending;

  -- รายการประจำที่ผูกอยู่ต้องเปลี่ยนเป็นจ่ายแล้วด้วย ไม่งั้นเดือนนั้นจะค้างอยู่
  if v_p.recurring_entry_id is not null then
    update recurring_entries
       set status = 'paid', paid_at = now(), paid_method = p_method,
           transaction_id = v_tx.id, amount = v_p.amount,
           transfer_account_id = p_account
     where id = v_p.recurring_entry_id;
  end if;

  perform write_log(v_p.shop_id, p_log);
  return v_tx;
end;
$$;

-- ── 7. Storage ─────────────────────────────────────────────────────────────

-- ── Storage: ไฟล์แนบ ───────────────────────────────────────────────────────
-- bucket 'attachments' ตั้งเป็น private แล้วอ่านผ่าน signed URL
-- โครงพาธบังคับ: <shop_id>/<receipts|taxinvoices>/<YYYY>/<MM>/<filename>

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

drop policy if exists attachments_read on storage.objects;
create policy attachments_read on storage.objects for select using (
  bucket_id = 'attachments' and is_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists attachments_write on storage.objects;
create policy attachments_write on storage.objects for insert with check (
  bucket_id = 'attachments' and can_edit(((storage.foldername(name))[1])::uuid)
);

drop policy if exists attachments_update on storage.objects;
create policy attachments_update on storage.objects for update using (
  bucket_id = 'attachments' and can_edit(((storage.foldername(name))[1])::uuid)
);

drop policy if exists attachments_delete on storage.objects;
create policy attachments_delete on storage.objects for delete using (
  bucket_id = 'attachments' and can_edit(((storage.foldername(name))[1])::uuid)
);

-- ── ตรวจผล: ควรได้ 5 แถวคอลัมน์ + 8 แถวฟังก์ชัน + 1 แถว bucket ───────────────

select 'column' as kind, table_name || '.' || column_name as name
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'recurring_entries' and column_name in ('transfer_account_id', 'amount_updated_at'))
     or (table_name = 'recurring_items'   and column_name in ('paused_from', 'paused_until', 'vat_rate')))
union all
select 'function', routine_name
  from information_schema.routines
 where routine_schema = 'public'
   and routine_name in ('post_transaction', 'edit_transaction', 'write_log', 'apply_wallet_effect',
                        'move_between_transfer_accounts', 'move_cash_transfer', 'return_loan', 'pay_pending_payment')
union all
select 'bucket', id from storage.buckets where id = 'attachments'
order by 1, 2;
