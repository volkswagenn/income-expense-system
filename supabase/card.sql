-- ไฟล์: supabase/card.sql
-- ============================================================================
-- JodFlow — บัตรเครดิตทั้งระบบในไฟล์เดียว   [card.sql]
--
-- วิธีใช้: Supabase → SQL Editor → ตรวจว่า Role เป็น postgres → วางทั้งไฟล์ → Run
-- ทุกคำสั่งเป็น if not exists / create or replace รันซ้ำได้ไม่เสียหาย
-- และไม่มีคำสั่งใดลบข้อมูลของร้าน
--
-- ไฟล์นี้รวมของเดิม 5 ไฟล์ไว้ด้วยกัน (card / card_statement / card_installment /
-- card_extra / card_interest) โดยเก็บเฉพาะ "เวอร์ชันสุดท้าย" ของแต่ละฟังก์ชัน
-- ฐานข้อมูลที่เคยรันไฟล์เก่าไปแล้วรันไฟล์นี้ทับได้เลย ผลลัพธ์เหมือนกัน
--
-- ต้องรันหลัง setup.sql และ fix.sql เสมอ เพราะทับฟังก์ชันชุดเดียวกับ fix.sql
-- และถ้ารัน columns.sql ใหม่เมื่อไร ต้องรันไฟล์นี้ซ้ำ เพราะ columns.sql จะตั้ง
-- constraint ของ transactions.method กลับเป็นชุดที่ไม่มี 'card'
--
-- ── แนวคิดหลักสี่ข้อ ────────────────────────────────────────────────────────
--
-- 1) บัตรเครดิตคือ "กระเป๋าเงินชนิดที่สี่" ต่อจาก cash / transfer / sub
--    ปลายทางของเงินเขียนเป็น 'card:<uuid>' แล้วเสียบเข้า apply_wallet_effect
--    ทำให้ post_transaction / edit_transaction / cancel_transaction รองรับบัตร
--    ทันที รวมถึงการย้อนยอดตอนแก้ไขและคืนยอดตอนยกเลิก
--
-- 2) บัตรเป็นหนี้ ไม่ใช่ทรัพย์สิน สาขา card จึงเก็บ outstanding - delta
--      รูดจ่าย (expense) delta = -1000 → outstanding เพิ่ม 1000
--      เงินคืน (income)  delta = +50   → outstanding ลด   50
--
-- 3) เก็บเฉพาะรอบบิลที่ "ปิดแล้ว" รอบที่กำลังเดินอยู่ไม่มีแถวในตาราง
--    เพราะยอดเปลี่ยนทุกครั้งที่รูด หน้าจอคำนวณสดจาก transactions เอา
--
-- 4) จ่ายบิลคือการย้ายเงิน ไม่ใช่รายจ่าย ค่าใช้จ่ายเกิดตอนรูดไปแล้ว
--    ถ้าบันทึกเป็นรายจ่ายอีกครั้งตอนจ่ายบิล ยอดจะถูกนับซ้ำสองเท่า
--    pay_card_statement จึงไม่ insert transactions แต่ขยับสองกระเป๋าพร้อมกัน
-- ============================================================================


-- ###########################################################################
-- ##  1. ตาราง
-- ###########################################################################

-- ── บัตร ────────────────────────────────────────────────────────────────────

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

-- ตั้งค่าหักบัญชีอัตโนมัติที่ผู้ใช้ผูกไว้กับธนาคาร
--
-- "หักบัญชีอัตโนมัติ" มีสองความหมายและต้องแยกให้ชัด
--   1) เงินถูกหักจริงจากบัญชี — เกิดที่ธนาคาร ผู้ใช้สมัครเอง JodFlow ทำแทนไม่ได้
--   2) แอปรู้ว่าถูกหักไปแล้ว — ทำได้ ให้ผู้ใช้บอกว่าผูกไว้แบบไหน แล้วแอปเตรียม
--      รายการจ่ายบิลไว้ให้ตรงกับที่ธนาคารจะหัก เหลือแค่กดยืนยัน
-- คอลัมน์พวกนี้เก็บแค่ข้อ 2 ไม่มีอะไรหักเงินเอง เพราะแอปไม่มีทางรู้ว่าธนาคาร
-- หักสำเร็จจริงหรือไม่ (เงินอาจไม่พอ บัตรอาจถูกระงับ)
alter table credit_cards add column if not exists autopay_mode text not null default 'off';
alter table credit_cards drop constraint if exists credit_cards_autopay_mode_check;
alter table credit_cards add  constraint credit_cards_autopay_mode_check
  check (autopay_mode in ('off', 'full', 'minimum', 'fixed'));

alter table credit_cards add column if not exists autopay_account_id uuid
  references transfer_accounts(id) on delete set null;
alter table credit_cards add column if not exists autopay_amount numeric(14,2) not null default 0;

-- ค่าธรรมเนียมรายปี (จัดการข้อมูล → บัตรเครดิต) — แอปเตือนเมื่อถึงเดือน ผู้ใช้กดบันทึกเป็นรายจ่ายเอง
alter table credit_cards add column if not exists annual_fee       numeric(14,2) not null default 0;
alter table credit_cards add column if not exists annual_fee_month int check (annual_fee_month between 1 and 12);

-- ── ใบแจ้งยอด (เก็บเฉพาะรอบที่ปิดแล้ว) ──────────────────────────────────────

create table if not exists card_statements (
  id             uuid primary key default gen_random_uuid(),
  shop_id        uuid not null references shops(id) on delete cascade,
  card_id        uuid not null references credit_cards(id) on delete cascade,
  -- 'YYYY-MM' ของเดือนที่ปิดรอบ — กันปิดซ้ำด้วย unique ข้างล่าง
  cycle          text not null,
  period_start   date not null,
  period_end     date not null,   -- วันสรุปยอด
  due_date       date not null,   -- วันครบกำหนดชำระ
  status         text not null default 'closed'
                 check (status in ('closed', 'partial', 'paid')),

  previous_balance numeric(14,2) not null default 0,  -- ยอดยกมาจากรอบก่อนที่จ่ายไม่หมด
  spend_amount     numeric(14,2) not null default 0,  -- ยอดรูดในรอบ
  credit_amount    numeric(14,2) not null default 0,  -- เงินคืน / คืนสินค้า ในรอบ
  amount           numeric(14,2) not null default 0,  -- ยอดที่ต้องชำระ
  minimum_amount   numeric(14,2) not null default 0,
  paid_amount      numeric(14,2) not null default 0,

  -- ยอดที่จ่ายไม่หมดถูกยกไปอยู่ในใบไหน — กันนับยอดค้างซ้ำตอนปิดรอบถัดไป
  carried_to     uuid references card_statements(id) on delete set null,

  paid_at             date,
  paid_method         text check (paid_method in ('cash', 'transfer')),
  transfer_account_id uuid references transfer_accounts(id) on delete set null,

  closed_at      timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  unique (card_id, cycle)
);

create index if not exists card_statements_shop_due_idx
  on card_statements (shop_id, status, due_date);
create index if not exists card_statements_card_idx
  on card_statements (card_id, period_end desc);

-- ── ผ่อนชำระ ────────────────────────────────────────────────────────────────
--
-- ตอนกดซื้อ **ไม่สร้างรายจ่ายก้อนเดียว** ธนาคารเรียกเก็บทีละงวด เงินไหลออกจริง
-- ทีละงวด ถ้าลงก้อนเดียวรายจ่ายเดือนที่ซื้อจะพองผิดปกติ และเดือนถัดไปจะดูเหมือน
-- ไม่มีภาระทั้งที่ยังผ่อนอยู่ ตอนสร้างจึงบันทึกแค่สัญญากับตารางงวด
--
-- ดอกเบี้ยคิดแบบคงที่จากเงินต้น (flat rate) ซึ่งเป็นแบบที่โปรผ่อนสินค้าในไทยใช้
--   ยอดผ่อนรวม = เงินต้น × (1 + อัตราต่อเดือน% ÷ 100 × จำนวนงวด)
--   ตัวอย่าง เงินต้น 100 ผ่อน 10 งวด 3%/เดือน → ดอกเบี้ย 30 รวม 130 งวดละ 13
--   principal_amount = ราคาสินค้า
--   total_amount     = ยอดที่ต้องผ่อนจริงรวมดอกเบี้ยแล้ว = ผลรวมของทุกงวด

create table if not exists card_installments (
  id             uuid primary key default gen_random_uuid(),
  shop_id        uuid not null references shops(id) on delete cascade,
  card_id        uuid not null references credit_cards(id) on delete cascade,
  name           text not null default '',
  vendor         text,
  category_id    uuid references categories(id) on delete set null,
  note           text,

  total_amount   numeric(14,2) not null,
  months         int not null check (months between 1 and 120),
  monthly_amount numeric(14,2) not null,
  interest_rate  numeric(5,2) not null default 0,   -- อัตราต่อเดือน

  purchase_date  date not null,
  first_cycle    text not null,        -- 'YYYY-MM' ของรอบแรกที่เรียกเก็บ
  status         text not null default 'active'
                 check (status in ('active', 'completed', 'cancelled')),

  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table card_installments add column if not exists principal_amount numeric(14,2);
-- แถวเดิมที่สร้างก่อนมีช่องดอกเบี้ยเป็นผ่อน 0% ทั้งหมด เงินต้นจึงเท่ากับยอดรวม
update card_installments set principal_amount = total_amount where principal_amount is null;
alter table card_installments alter column principal_amount set default 0;

create index if not exists card_installments_card_idx
  on card_installments (card_id, status, created_at);

-- หนึ่งแถวต่อหนึ่งงวด — โครงเดียวกับ recurring_items คู่กับ recurring_entries
--
-- งวดที่ "จ่ายแล้ว" ไม่เก็บสถานะซ้ำ อ่านจากใบแจ้งยอดที่ statement_id ชี้ไป
-- ถ้าเก็บสองที่ วันหนึ่งจะมีที่หนึ่งอัปเดตไม่ทันแล้วตัวเลขสองหน้าจะขัดกัน
create table if not exists card_installment_entries (
  id             uuid primary key default gen_random_uuid(),
  shop_id        uuid not null references shops(id) on delete cascade,
  installment_id uuid not null references card_installments(id) on delete cascade,
  seq            int not null,          -- งวดที่เท่าไร
  cycle          text not null,         -- รอบบิลที่งวดนี้จะเข้า
  due_date       date not null,         -- เก็บไว้เพื่อให้แสดงตารางได้โดยไม่ต้อง join
  amount         numeric(14,2) not null,
  status         text not null default 'pending'
                 check (status in ('pending', 'billed', 'cancelled')),

  statement_id   uuid references card_statements(id) on delete set null,
  transaction_id uuid references transactions(id) on delete set null,
  billed_at      date,

  created_at     timestamptz not null default now(),
  unique (installment_id, seq)
);

create index if not exists card_installment_entries_cycle_idx
  on card_installment_entries (installment_id, cycle, status);


-- ###########################################################################
-- ##  2. คอลัมน์และ constraint บนตารางเดิม
-- ###########################################################################

alter table transactions add column if not exists card_id uuid
  references credit_cards(id) on delete set null;
create index if not exists transactions_card_idx on transactions (card_id, date desc);

-- รู้ว่ารายจ่ายแถวนี้มาจากงวดผ่อนไหน — ใช้กรองในรายงานว่าอันไหนเป็นภาระผ่อน
alter table transactions add column if not exists installment_entry_id uuid
  references card_installment_entries(id) on delete set null;

-- ของเดิมอนุญาต cash / transfer / pending / other (ดู columns.sql)
alter table transactions drop constraint if exists transactions_method_check;
alter table transactions add  constraint transactions_method_check
  check (method in ('cash', 'transfer', 'pending', 'other', 'card'));

-- รายการประจำจ่ายผ่านบัตรได้ เช่นค่าเน็ต ค่าสตรีมมิง ที่ตัดบัตรทุกเดือน
alter table recurring_entries drop constraint if exists recurring_entries_paid_method_check;
alter table recurring_entries add  constraint recurring_entries_paid_method_check
  check (paid_method in ('cash', 'transfer', 'pending', 'card'));

alter table recurring_entries add column if not exists card_id uuid
  references credit_cards(id) on delete set null;

-- อัตราผ่อนชำระขั้นต่ำ เก็บเป็นค่าตั้งค่า ไม่ใช่ค่าคงที่ในโค้ด
-- เกณฑ์ ธปท. คือ 8% ถึงรอบบัญชีเดือน ธ.ค. 2569 แล้วเป็น 10% ตั้งแต่ ม.ค. 2570
alter table shop_settings add column if not exists card_min_rate numeric(5,2) not null default 8;


-- ###########################################################################
-- ##  3. ปลายทางของเงิน — เพิ่มสาขา card
-- ###########################################################################

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


-- ###########################################################################
-- ##  4. บันทึก / แก้ไขรายการ — พก card_id ไปด้วย
-- ###########################################################################
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


-- ###########################################################################
-- ##  5. ปิดรอบบิล
-- ###########################################################################
-- ขอบเขตของรอบคำนวณที่ฝั่ง client (src/lib/cardCycle.js ซึ่งมีเทสต์แล้ว) แล้วส่งเข้ามา
-- จะได้ไม่ต้องเขียนเลขวันที่ซ้ำสองภาษาแล้วเพี้ยนคนละแบบ
--
-- ดึงงวดผ่อนที่ถึงกำหนดเข้าบิล **ก่อน** รวมยอดรูด งวดที่สร้างเป็น transaction แล้ว
-- จะถูกนับใน spend_amount เอง จึงไม่ต้องบวกยอดผ่อนแยกอีกชั้น ไม่มีทางนับซ้ำ

create or replace function public.close_card_statement(
  p_shop  uuid,
  p_card  uuid,
  p_cycle text,
  p_start date,
  p_end   date,
  p_due   date
) returns card_statements language plpgsql security definer set search_path = public as $$
declare
  v_st     card_statements;
  v_prev   numeric(14,2);
  v_spend  numeric(14,2);
  v_credit numeric(14,2);
  v_adv    numeric(14,2);
  v_amount numeric(14,2);
  v_rate   numeric(5,2);
  v_min    numeric(14,2);
  v_entry  record;
  v_tx     transactions;
begin
  perform assert_can_edit(p_shop);

  if not exists (select 1 from credit_cards where id = p_card and shop_id = p_shop) then
    raise exception 'ไม่พบบัตรเครดิตของร้านนี้';
  end if;

  -- ปิดไปแล้ว → คืนใบเดิม ไม่ทำอะไรซ้ำ (หน้าจอเรียกทุกครั้งที่เปิดแอป)
  select * into v_st from card_statements where card_id = p_card and cycle = p_cycle;
  if found then return v_st; end if;

  -- ยอดค้างจากใบก่อนหน้าที่ยังไม่ถูกยกไปไหน
  -- รวมใบที่จ่ายเกิน (amount - paid_amount ติดลบ) ด้วย เครดิตจะได้ไหลไปหักรอบถัดไป
  select coalesce(sum(amount - paid_amount), 0) into v_prev
    from card_statements
   where card_id = p_card and carried_to is null
     and (status <> 'paid' or amount - paid_amount < 0) and period_end < p_start;

  -- งวดผ่อนที่ถึงรอบนี้ → สร้างรายจ่ายหนึ่งแถวต่องวด แล้วเพิ่มหนี้เท่ายอดงวดเดียว
  for v_entry in
    select e.*, i.name, i.vendor, i.category_id, i.months
      from card_installment_entries e
      join card_installments i on i.id = e.installment_id
     where i.card_id = p_card and i.status = 'active'
       and e.cycle = p_cycle and e.status = 'pending'
     order by e.seq
  loop
    insert into transactions (
      shop_id, date, type, amount, method, category_id, item_name, vendor,
      card_id, installment_entry_id, note, created_by
    ) values (
      p_shop, p_end, 'expense', v_entry.amount, 'card', v_entry.category_id,
      v_entry.name || ' (งวด ' || v_entry.seq || '/' || v_entry.months || ')',
      v_entry.vendor, p_card, v_entry.id,
      'งวดผ่อนที่เรียกเก็บอัตโนมัติ', auth.uid()
    ) returning * into v_tx;

    -- รูดจ่าย = delta ติดลบ สาขา card กลับเครื่องหมายเป็นหนี้เพิ่ม
    perform apply_wallet_effect(p_shop, 'card:' || p_card, -v_entry.amount);

    update card_installment_entries
       set status = 'billed', transaction_id = v_tx.id, billed_at = p_end
     where id = v_entry.id;
  end loop;

  -- ปิดสัญญาที่เรียกเก็บครบทุกงวดแล้ว
  update card_installments i
     set status = 'completed', updated_at = now()
   where i.card_id = p_card and i.status = 'active'
     and not exists (
       select 1 from card_installment_entries e
        where e.installment_id = i.id and e.status = 'pending'
     );

  select coalesce(sum(amount), 0) into v_spend
    from transactions
   where card_id = p_card and shop_id = p_shop and type = 'expense'
     and date between p_start and p_end;

  -- รายรับที่ปลายทางเป็นบัตร = เครดิตเงินคืน หรือเงินคืนสินค้า → ลดยอดที่ต้องชำระ
  select coalesce(sum(amount), 0) into v_credit
    from transactions
   where card_id = p_card and shop_id = p_shop and type = 'income'
     and date between p_start and p_end;

  -- เงินสดที่กดจากบัตรในรอบนี้ ธนาคารเรียกเก็บเหมือนยอดรูด (ค่าธรรมเนียมเป็นรายจ่ายอยู่ใน v_spend แล้ว)
  select coalesce(sum(amount), 0) into v_adv
    from card_advances
   where card_id = p_card and shop_id = p_shop and date between p_start and p_end;

  v_amount := v_prev + v_spend + v_adv - v_credit;
  -- ติดลบ = เครดิตเหลือ (จ่ายเกินหรือเงินคืนมากกว่ายอดรูด) เก็บเป็นใบสถานะ paid ยอดติดลบ
  -- ไม่ปัดเป็นศูนย์ เพื่อให้รอบถัดไปดึงไปหักต่อ เครดิตจะได้ไม่หาย

  select coalesce(card_min_rate, 8) into v_rate from shop_settings where shop_id = p_shop;
  v_min := greatest(0, least(v_amount, round(v_amount * coalesce(v_rate, 8) / 100, 2)));

  insert into card_statements (
    shop_id, card_id, cycle, period_start, period_end, due_date,
    status, previous_balance, spend_amount, credit_amount, amount, minimum_amount, advance_amount
  ) values (
    p_shop, p_card, p_cycle, p_start, p_end, p_due,
    case when v_amount <= 0 then 'paid' else 'closed' end,
    v_prev, v_spend, v_credit, v_amount, v_min, v_adv
  ) returning * into v_st;

  -- ผูกงวดที่เพิ่งเข้าบิลกับใบนี้ เพื่อให้อ่านวันที่จ่ายจริงจากใบได้
  update card_installment_entries e
     set statement_id = v_st.id
    from card_installments i
   where e.installment_id = i.id and i.card_id = p_card
     and e.cycle = p_cycle and e.status = 'billed' and e.statement_id is null;

  -- ผูกรายการกดเงินสดของรอบนี้กับใบ — หลังจากนี้ย้อนไม่ได้แล้ว
  update card_advances
     set statement_id = v_st.id
   where card_id = p_card and shop_id = p_shop and statement_id is null
     and date between p_start and p_end;

  -- ใบเก่าที่ยอดถูกยกมาแล้ว ทำเครื่องหมายไว้ไม่ให้ถูกนับอีกรอบหน้า
  update card_statements
     set carried_to = v_st.id
   where card_id = p_card and carried_to is null
     and (status <> 'paid' or amount - paid_amount < 0)
     and period_end < p_start and id <> v_st.id;

  return v_st;
end;
$$;


-- ###########################################################################
-- ##  6. จ่ายบิล — ย้ายเงินสองขาในทรานแซกชันเดียว ไม่สร้าง transactions
-- ###########################################################################

create or replace function public.pay_card_statement(
  p_statement uuid,
  p_method    text,
  p_account   uuid,
  p_amount    numeric,
  p_date      date,
  p_log       jsonb default null
) returns card_statements language plpgsql security definer set search_path = public as $$
declare
  v_st     card_statements;
  v_src    text;
  v_remain numeric(14,2);
begin
  select * into v_st from card_statements where id = p_statement;
  if not found then raise exception 'ไม่พบใบแจ้งยอดนี้'; end if;
  perform assert_can_edit(v_st.shop_id);

  if v_st.status = 'paid' then raise exception 'ใบแจ้งยอดนี้จ่ายครบแล้ว'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'จำนวนเงินต้องมากกว่าศูนย์'; end if;

  -- จ่ายเกินยอดได้ (แบบ Wallet Story 16.0) ส่วนที่เกินทำให้ outstanding ติดลบ = เครดิตในบัตร
  -- และ amount - paid_amount ของใบนี้ติดลบ close_card_statement จะยกไปหักบิลรอบถัดไปเอง
  v_remain := v_st.amount - v_st.paid_amount;

  if p_method = 'transfer' and p_account is null then
    raise exception 'ต้องเลือกบัญชีเงินโอนที่จะจ่าย';
  end if;
  if p_method not in ('cash', 'transfer') then
    raise exception 'วิธีจ่ายบิลไม่ถูกต้อง: %', p_method;
  end if;

  -- ขาที่ 1 เงินออกจากกระเป๋าที่เลือก
  v_src := case when p_method = 'cash' then 'cash' else 'transfer:' || p_account end;
  perform apply_wallet_effect(v_st.shop_id, v_src, -p_amount);

  -- ขาที่ 2 หนี้บัตรลดลง (สาขา card กลับเครื่องหมายให้เอง) — ผลรวมสองขาเป็นศูนย์
  perform apply_wallet_effect(v_st.shop_id, 'card:' || v_st.card_id, p_amount);

  update card_statements
     set paid_amount = paid_amount + p_amount,
         status = case when paid_amount + p_amount >= amount then 'paid' else 'partial' end,
         paid_at = p_date,
         paid_method = p_method,
         transfer_account_id = p_account
   where id = p_statement
   returning * into v_st;

  perform write_log(v_st.shop_id, p_log);
  return v_st;
end;
$$;

-- ย้อนการจ่ายบิล — คืนเงินกลับกระเป๋าต้นทาง และหนี้บัตรกลับมาเท่าเดิม
create or replace function public.undo_card_payment(
  p_statement uuid,
  p_amount    numeric,
  p_log       jsonb default null
) returns card_statements language plpgsql security definer set search_path = public as $$
declare v_st card_statements; v_src text;
begin
  select * into v_st from card_statements where id = p_statement;
  if not found then raise exception 'ไม่พบใบแจ้งยอดนี้'; end if;
  perform assert_can_edit(v_st.shop_id);

  if v_st.paid_amount <= 0 then raise exception 'ใบแจ้งยอดนี้ยังไม่ได้จ่าย'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > v_st.paid_amount then
    raise exception 'จำนวนเงินที่ย้อนไม่ถูกต้อง';
  end if;
  if v_st.paid_method is null then raise exception 'ไม่รู้ว่าจ่ายจากกระเป๋าไหน ย้อนให้ไม่ได้'; end if;

  v_src := case when v_st.paid_method = 'cash' then 'cash'
                else 'transfer:' || v_st.transfer_account_id end;
  perform apply_wallet_effect(v_st.shop_id, v_src, p_amount);
  perform apply_wallet_effect(v_st.shop_id, 'card:' || v_st.card_id, -p_amount);

  update card_statements
     set paid_amount = paid_amount - p_amount,
         status = case when paid_amount - p_amount <= 0 then 'closed' else 'partial' end,
         paid_at = case when paid_amount - p_amount <= 0 then null else paid_at end,
         paid_method = case when paid_amount - p_amount <= 0 then null else paid_method end,
         transfer_account_id = case when paid_amount - p_amount <= 0 then null else transfer_account_id end
   where id = p_statement
   returning * into v_st;

  perform write_log(v_st.shop_id, p_log);
  return v_st;
end;
$$;


-- ###########################################################################
-- ##  7. ผ่อนชำระ
-- ###########################################################################
-- p_entries เป็น jsonb array ของ { seq, cycle, due_date, amount } ที่ client คำนวณมา
-- (ใช้ src/lib/cardCycle.js ตัวเดียวกับที่อื่น จะได้ไม่เขียนสูตรซ้ำสองภาษา
--  แล้วปัดเศษคนละแบบ) เศษที่หารไม่ลงตัวไปรวมงวดสุดท้าย ผลรวมทุกงวดจึงเท่ากับ
--  total_amount พอดีเสมอ

create or replace function public.create_card_installment(
  p_shop    uuid,
  p_card    uuid,
  p_data    jsonb,
  p_entries jsonb,
  p_log     jsonb default null
) returns card_installments language plpgsql security definer set search_path = public as $$
declare v_ins card_installments; v_e jsonb;
begin
  perform assert_can_edit(p_shop);
  if not exists (select 1 from credit_cards where id = p_card and shop_id = p_shop) then
    raise exception 'ไม่พบบัตรเครดิตของร้านนี้';
  end if;
  if jsonb_array_length(coalesce(p_entries, '[]'::jsonb)) = 0 then
    raise exception 'ต้องมีอย่างน้อยหนึ่งงวด';
  end if;

  insert into card_installments (
    shop_id, card_id, name, vendor, category_id, note,
    principal_amount, total_amount, months, monthly_amount, interest_rate,
    purchase_date, first_cycle, created_by
  ) values (
    p_shop, p_card,
    coalesce(p_data->>'name', ''),
    p_data->>'vendor',
    nullif(p_data->>'category_id', '')::uuid,
    p_data->>'note',
    coalesce((p_data->>'principal_amount')::numeric, (p_data->>'total_amount')::numeric),
    (p_data->>'total_amount')::numeric,
    (p_data->>'months')::int,
    (p_data->>'monthly_amount')::numeric,
    coalesce((p_data->>'interest_rate')::numeric, 0),
    (p_data->>'purchase_date')::date,
    p_data->>'first_cycle',
    auth.uid()
  ) returning * into v_ins;

  for v_e in select * from jsonb_array_elements(p_entries) loop
    insert into card_installment_entries (shop_id, installment_id, seq, cycle, due_date, amount)
    values (
      p_shop, v_ins.id,
      (v_e->>'seq')::int,
      v_e->>'cycle',
      (v_e->>'due_date')::date,
      (v_e->>'amount')::numeric
    );
  end loop;

  -- ยังไม่แตะ outstanding และยังไม่สร้าง transactions โดยเจตนา
  perform write_log(p_shop, p_log);
  return v_ins;
end;
$$;

-- ปิดยอดคงเหลือก่อนกำหนด — รวมงวดที่เหลือเป็นรายการเดียวเข้ารอบที่เปิดอยู่
create or replace function public.settle_card_installment(
  p_installment uuid,
  p_date        date,
  p_fee         numeric default 0,
  p_log         jsonb default null
) returns card_installments language plpgsql security definer set search_path = public as $$
declare v_ins card_installments; v_left numeric(14,2); v_tx transactions; v_n int;
begin
  select * into v_ins from card_installments where id = p_installment;
  if not found then raise exception 'ไม่พบรายการผ่อนนี้'; end if;
  perform assert_can_edit(v_ins.shop_id);
  if v_ins.status <> 'active' then raise exception 'รายการผ่อนนี้ปิดไปแล้ว'; end if;

  select coalesce(sum(amount), 0), count(*) into v_left, v_n
    from card_installment_entries
   where installment_id = p_installment and status = 'pending';
  if v_n = 0 then raise exception 'ไม่มีงวดที่เหลือให้ปิด'; end if;

  insert into transactions (
    shop_id, date, type, amount, method, category_id, item_name, vendor,
    card_id, note, created_by
  ) values (
    v_ins.shop_id, p_date, 'expense', v_left + coalesce(p_fee, 0), 'card',
    v_ins.category_id,
    v_ins.name || ' (ปิดยอดคงเหลือ ' || v_n || ' งวด)',
    v_ins.vendor, v_ins.card_id, 'ปิดยอดผ่อนก่อนกำหนด', auth.uid()
  ) returning * into v_tx;

  perform apply_wallet_effect(v_ins.shop_id, 'card:' || v_ins.card_id, -(v_left + coalesce(p_fee, 0)));

  update card_installment_entries
     set status = 'billed', transaction_id = v_tx.id, billed_at = p_date
   where installment_id = p_installment and status = 'pending';

  update card_installments set status = 'completed', updated_at = now()
   where id = p_installment returning * into v_ins;

  perform write_log(v_ins.shop_id, p_log);
  return v_ins;
end;
$$;

-- ยกเลิกงวดที่เหลือ (เช่น คืนสินค้ากลางคัน)
-- งวดที่เรียกเก็บไปแล้วยังอยู่ เพราะเกิดขึ้นจริง ส่วนเงินที่ได้คืนให้บันทึกเป็น
-- รายรับที่ปลายทางเป็นบัตรแยกต่างหาก
create or replace function public.cancel_card_installment(
  p_installment uuid,
  p_log         jsonb default null
) returns card_installments language plpgsql security definer set search_path = public as $$
declare v_ins card_installments;
begin
  select * into v_ins from card_installments where id = p_installment;
  if not found then raise exception 'ไม่พบรายการผ่อนนี้'; end if;
  perform assert_can_edit(v_ins.shop_id);

  update card_installment_entries set status = 'cancelled'
   where installment_id = p_installment and status = 'pending';

  update card_installments set status = 'cancelled', updated_at = now()
   where id = p_installment returning * into v_ins;

  perform write_log(v_ins.shop_id, p_log);
  return v_ins;
end;
$$;


-- ###########################################################################
-- ##  8. เลิกผูกหักบัญชีตอนบัญชีเงินโอนถูกลบ
-- ###########################################################################
-- on delete set null จัดการ autopay_account_id ให้แล้ว แต่ต้องปิดโหมดด้วย
-- ไม่งั้นจะค้างเป็น "หักจากบัญชีที่ไม่มีอยู่" ซึ่งหน้าจอจะบอกว่าพร้อมหักทั้งที่หักไม่ได้

create or replace function public.reset_orphan_autopay() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update credit_cards
     set autopay_mode = 'off', updated_at = now()
   where autopay_account_id is null and autopay_mode <> 'off';
  return null;
end;
$$;

drop trigger if exists transfer_accounts_autopay_cleanup on transfer_accounts;
create trigger transfer_accounts_autopay_cleanup
  after delete on transfer_accounts
  for each statement execute function reset_orphan_autopay();


-- ###########################################################################
-- ##  9. ล้างข้อมูลร้าน — ต้องลบตารางบัตรด้วย
-- ###########################################################################
-- ลบ transactions ก่อน แล้ว card_id / installment_entry_id จึงไม่มีอะไรอ้างถึง
-- carried_to อ้างถึงกันเองในตาราง จึงต้องตัดการอ้างอิงก่อนลบ

create or replace function public.clear_shop_data(p_shop uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_owner(p_shop) then
    raise exception 'เฉพาะเจ้าของร้านเท่านั้นที่ล้างข้อมูลได้' using errcode = '42501';
  end if;

  delete from tax_invoices             where shop_id = p_shop;
  delete from pending_payments         where shop_id = p_shop;
  delete from pending_incomes          where shop_id = p_shop;
  delete from transactions             where shop_id = p_shop;
  delete from card_advances            where shop_id = p_shop;
  delete from card_installment_entries where shop_id = p_shop;
  delete from card_installments        where shop_id = p_shop;
  delete from recurring_entries        where shop_id = p_shop;
  delete from recurring_items          where shop_id = p_shop;
  delete from loans                    where shop_id = p_shop;
  delete from sub_wallets              where shop_id = p_shop;
  delete from transfer_accounts        where shop_id = p_shop;
  update card_statements set carried_to = null where shop_id = p_shop;
  delete from card_statements          where shop_id = p_shop;
  delete from credit_cards             where shop_id = p_shop;
  delete from calendar_notes           where shop_id = p_shop;
  delete from activity_logs            where shop_id = p_shop;
  delete from quick_items              where shop_id = p_shop;
  delete from vendors                  where shop_id = p_shop;
  delete from categories               where shop_id = p_shop;

  update wallet_state set cash = 0, updated_at = now() where shop_id = p_shop;
  insert into categories (shop_id, name, type)
  values (p_shop, 'อื่นๆ', 'expense'), (p_shop, 'อื่นๆ', 'income');
end;
$$;


-- ###########################################################################
-- ##  9b. จัดการข้อมูล — กดเงินสด / จ่ายเกิน / ค่าธรรมเนียมรายปี
-- ###########################################################################
-- เพิ่มตามแบบ Wallet Story (16.0 จ่ายเกินเป็นเครดิต, 16.4 กดเงินสดพร้อมค่าธรรมเนียม)
--
--   กดเงินสด   = ย้ายเงินจากบัตรเข้ากระเป๋า ไม่ใช่รายจ่าย (หนี้บัตรเพิ่ม เงินสดเพิ่ม)
--                ค่าธรรมเนียมเท่านั้นที่เป็นรายจ่ายจริง (หมวด "ค่าธรรมเนียมบัตร") เข้ารายงาน
--                ทั้งสองส่วนเข้าบิลรอบที่กด (close_card_statement รวม card_advances ให้)
--   จ่ายเกิน   = pay_card_statement ไม่ raise แล้ว ส่วนเกินทำให้ outstanding ติดลบ (เครดิต)
--                และ close_card_statement ยกเครดิตไปหักบิลรอบถัดไป ไม่ปัดเป็นศูนย์
--   ค่าธรรมเนียมรายปี = คอลัมน์บน credit_cards ให้การ์ดเตือน ผู้ใช้กดบันทึกเป็นรายจ่ายเอง

create table if not exists card_advances (
  id                 uuid primary key default gen_random_uuid(),
  shop_id            uuid not null references shops(id) on delete cascade,
  card_id            uuid not null references credit_cards(id) on delete cascade,
  date               date not null default current_date,
  amount             numeric(14,2) not null check (amount > 0),
  fee                numeric(14,2) not null default 0 check (fee >= 0),
  target             text not null,               -- 'cash' | 'transfer:<uuid>' ปลายทางที่เงินเข้า
  fee_transaction_id uuid references transactions(id) on delete set null,
  statement_id       uuid references card_statements(id) on delete set null,  -- ใบที่เรียกเก็บแล้ว
  note               text,
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now()
);
create index if not exists card_advances_card_idx on card_advances (card_id, date);
create index if not exists card_advances_shop_idx on card_advances (shop_id, statement_id);

alter table card_statements add column if not exists advance_amount numeric(14,2) not null default 0;

create or replace function public.card_cash_advance(
  p_shop   uuid,
  p_card   uuid,
  p_amount numeric,
  p_fee    numeric,
  p_target text,
  p_date   date,
  p_note   text  default null,
  p_log    jsonb default null
) returns card_advances language plpgsql security definer set search_path = public as $$
declare
  v_card credit_cards;
  v_adv  card_advances;
  v_cat  uuid;
  v_tx   transactions;
  v_fee  numeric(14,2) := coalesce(p_fee, 0);
begin
  perform assert_can_edit(p_shop);

  select * into v_card from credit_cards where id = p_card and shop_id = p_shop and deleted = false;
  if not found then raise exception 'ไม่พบบัตรเครดิตของร้านนี้'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'จำนวนเงินต้องมากกว่าศูนย์'; end if;
  if v_fee < 0 then raise exception 'ค่าธรรมเนียมต้องไม่ติดลบ'; end if;
  if p_target is null or split_part(p_target, ':', 1) not in ('cash', 'transfer') then
    raise exception 'ปลายทางเงินต้องเป็นเงินสดหรือบัญชีเงินโอน';
  end if;
  -- รอบที่ปิดแล้วออกใบแจ้งยอดไปแล้ว ถ้ายอมให้ย้อนวันเข้าไป ยอดบิลจะไม่ตรงกับที่ปิดไว้
  if exists (
    select 1 from card_statements
     where card_id = p_card and p_date between period_start and period_end
  ) then
    raise exception 'รอบบิลของวันที่ % ปิดไปแล้ว เลือกวันที่ในรอบที่ยังเปิดอยู่', to_char(p_date, 'DD/MM/YYYY');
  end if;

  -- ขาที่ 1 หนี้บัตรเพิ่มเท่าเงินที่กด (สาขา card กลับเครื่องหมาย)  ขาที่ 2 เงินเข้าปลายทาง
  perform apply_wallet_effect(p_shop, 'card:' || p_card, -p_amount);
  perform apply_wallet_effect(p_shop, p_target, p_amount);

  -- ค่าธรรมเนียมเป็นรายจ่ายจริงบนบัตร → เข้ารายงานและเข้าบิลรอบนี้เองผ่าน transactions
  if v_fee > 0 then
    select id into v_cat from categories
     where shop_id = p_shop and type = 'expense' and name = 'ค่าธรรมเนียมบัตร' and deleted = false
     order by created_at limit 1;
    if v_cat is null then
      insert into categories (shop_id, name, type) values (p_shop, 'ค่าธรรมเนียมบัตร', 'expense')
      returning id into v_cat;
    end if;

    insert into transactions (
      shop_id, date, type, amount, method, category_id, item_name, card_id, note, created_by
    ) values (
      p_shop, p_date, 'expense', v_fee, 'card', v_cat,
      'ค่าธรรมเนียมกดเงินสด — ' || v_card.bank_name || ' ' || v_card.name,
      p_card, p_note, auth.uid()
    ) returning * into v_tx;
    perform apply_wallet_effect(p_shop, 'card:' || p_card, -v_fee);
  end if;

  insert into card_advances (shop_id, card_id, date, amount, fee, target, fee_transaction_id, note, created_by)
  values (p_shop, p_card, p_date, p_amount, v_fee, p_target, v_tx.id, p_note, auth.uid())
  returning * into v_adv;

  perform write_log(p_shop, p_log);
  return v_adv;
end;
$$;

-- ย้อนได้เฉพาะรายการที่ยังไม่เข้าบิลที่ปิดแล้ว
create or replace function public.undo_card_advance(
  p_advance uuid,
  p_log     jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_adv card_advances;
begin
  select * into v_adv from card_advances where id = p_advance;
  if not found then raise exception 'ไม่พบรายการกดเงินสดนี้'; end if;
  perform assert_can_edit(v_adv.shop_id);

  if v_adv.statement_id is not null or exists (
    select 1 from card_statements
     where card_id = v_adv.card_id and v_adv.date between period_start and period_end
  ) then
    raise exception 'รายการนี้เข้าบิลที่ปิดแล้ว ย้อนไม่ได้ — ถ้าผิดให้บันทึกเงินคืนเข้าบัตรแทน';
  end if;

  perform apply_wallet_effect(v_adv.shop_id, 'card:' || v_adv.card_id, v_adv.amount);
  perform apply_wallet_effect(v_adv.shop_id, v_adv.target, -v_adv.amount);

  if v_adv.fee_transaction_id is not null then
    perform apply_wallet_effect(v_adv.shop_id, 'card:' || v_adv.card_id, v_adv.fee);
    delete from transactions where id = v_adv.fee_transaction_id;
  end if;

  delete from card_advances where id = p_advance;
  perform write_log(v_adv.shop_id, p_log);
end;
$$;


-- ###########################################################################
-- ##  10. RLS + Realtime
-- ###########################################################################
-- ลืม RLS = query คืนค่าว่างเปล่าโดยไม่มี error
-- ลืม realtime = เครื่องอื่นไม่เห็นยอดบัตรขยับ

do $$
declare t text;
begin
  foreach t in array array[
    'credit_cards', 'card_statements', 'card_installments', 'card_installment_entries',
    'card_advances'
  ] loop
    execute format('alter table %I enable row level security', t);

    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format('create policy %I on %I for select using (is_member(shop_id))', t || '_select', t);

    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format('create policy %I on %I for insert with check (can_edit(shop_id))', t || '_insert', t);

    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format(
      'create policy %I on %I for update using (can_edit(shop_id)) with check (can_edit(shop_id))',
      t || '_update', t);

    execute format('drop policy if exists %I on %I', t || '_delete', t);
    execute format('create policy %I on %I for delete using (can_edit(shop_id))', t || '_delete', t);

    execute format('alter table %I replica identity full', t);
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- สั่งให้ API โหลด schema ใหม่ทันที (กันอาการฟังก์ชัน 404 จาก cache ค้าง)
notify pgrst, 'reload schema';


-- ###########################################################################
-- ##  ตรวจผลการติดตั้ง — ต้องได้ครบทุกบรรทัด
-- ###########################################################################

select 'ตารางบัตร' as "รายการ", count(*)::text || ' / 5' as "ผล"
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('credit_cards','card_statements','card_installments','card_installment_entries','card_advances')
union all
select 'คอลัมน์ที่เติมเพิ่ม', count(*)::text || ' / 11'
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name='transactions'      and column_name in ('card_id','installment_entry_id'))
     or (table_name='credit_cards'      and column_name in ('autopay_mode','autopay_account_id','autopay_amount','annual_fee','annual_fee_month'))
     or (table_name='card_statements'   and column_name = 'advance_amount')
     or (table_name='card_installments' and column_name = 'principal_amount')
     or (table_name='recurring_entries' and column_name = 'card_id')
     or (table_name='shop_settings'     and column_name = 'card_min_rate'))
union all
select 'ฟังก์ชัน RPC ของบัตร', count(*)::text || ' / 8'
  from information_schema.routines
 where routine_schema = 'public'
   and routine_name in ('close_card_statement','pay_card_statement','undo_card_payment',
     'create_card_installment','settle_card_installment','cancel_card_installment',
     'card_cash_advance','undo_card_advance')
union all
select 'รับ method = card แล้ว',
       case when exists (
         select 1 from pg_constraint
          where conname = 'transactions_method_check'
            and pg_get_constraintdef(oid) like '%''card''%'
       ) then '✅' else '❌ ยังไม่รับ' end
union all
select 'RLS เปิดครบ',
       case when (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relrowsecurity
                     and c.relname in ('credit_cards','card_statements','card_installments','card_installment_entries','card_advances')
                 ) = 5 then '✅' else '❌ ยังไม่ครบ' end;


-- ###########################################################################
-- ##  จ่ายค่างวดผ่อนทีละงวด
-- ###########################################################################

-- ── คอลัมน์และสถานะใหม่ ─────────────────────────────────────────────────

alter table card_installment_entries add column if not exists paid_at             timestamptz;
alter table card_installment_entries add column if not exists paid_method         text;
alter table card_installment_entries add column if not exists transfer_account_id uuid
  references transfer_accounts(id) on delete set null;

-- เดิม check อนุญาตแค่ pending / billed / cancelled ต้องเปิดรับ 'paid' เพิ่ม
alter table card_installment_entries drop constraint if exists card_installment_entries_status_check;
alter table card_installment_entries add  constraint card_installment_entries_status_check
  check (status in ('pending', 'billed', 'paid', 'cancelled'));

-- ── 2. จ่ายค่างวด ──────────────────────────────────────────────────────────

create or replace function public.pay_installment_entry(
  p_entry   uuid,
  p_method  text,
  p_account uuid,
  p_amount  numeric,
  p_paid_at timestamptz,
  p_log     jsonb default null
) returns card_installment_entries language plpgsql security definer set search_path = public as $$
declare
  v_entry card_installment_entries;
  v_ins   card_installments;
  v_tx    transactions;
  v_src   text;
  v_date  date;
begin
  select * into v_entry from card_installment_entries where id = p_entry;
  if not found then raise exception 'ไม่พบงวดผ่อนนี้'; end if;
  perform assert_can_edit(v_entry.shop_id);

  if v_entry.status = 'paid' then raise exception 'งวดนี้จ่ายไปแล้ว'; end if;
  if v_entry.status = 'cancelled' then raise exception 'งวดนี้ถูกยกเลิกไปแล้ว'; end if;
  if v_entry.status = 'billed' then
    raise exception 'งวดนี้ถูกเรียกเก็บเข้าบิลรอบ % ไปแล้ว ให้จ่ายผ่านบิลบัตรแทน', v_entry.cycle;
  end if;

  if p_amount is null or p_amount <= 0 then raise exception 'จำนวนเงินต้องมากกว่าศูนย์'; end if;
  if p_method not in ('cash', 'transfer') then
    raise exception 'วิธีจ่ายไม่ถูกต้อง: %', p_method;
  end if;
  if p_method = 'transfer' and p_account is null then
    raise exception 'ต้องเลือกบัญชีที่จะตัดเงิน';
  end if;

  select * into v_ins from card_installments where id = v_entry.installment_id;
  if not found then raise exception 'ไม่พบสัญญาผ่อนของงวดนี้'; end if;

  v_date := (coalesce(p_paid_at, now()) at time zone 'Asia/Bangkok')::date;

  -- สร้างรายจ่ายจริง เพื่อให้ยอดไปโผล่ในรายงานและประวัติเหมือนรายจ่ายอื่น
  -- ไม่ผูก card_id เพราะงวดนี้ไม่ได้ผ่านบัตร เงินออกจากบัญชีตรงๆ
  insert into transactions (
    shop_id, date, type, amount, method, transfer_account_id, category_id,
    item_name, vendor, installment_entry_id, note, created_by
  ) values (
    v_entry.shop_id, v_date, 'expense', p_amount, p_method,
    case when p_method = 'transfer' then p_account else null end,
    v_ins.category_id,
    v_ins.name || ' (งวด ' || v_entry.seq || '/' || v_ins.months || ')',
    v_ins.vendor, v_entry.id, 'จ่ายค่างวดผ่อนจากบัญชี', auth.uid()
  ) returning * into v_tx;

  -- เงินออกจากกระเป๋าที่เลือก — ไม่แตะหนี้บัตร เพราะงวดนี้ยังไม่เคยเป็นหนี้บัตร
  v_src := case when p_method = 'cash' then 'cash' else 'transfer:' || p_account end;
  perform apply_wallet_effect(v_entry.shop_id, v_src, -p_amount);

  update card_installment_entries
     set status = 'paid',
         amount = p_amount,
         paid_at = coalesce(p_paid_at, now()),
         paid_method = p_method,
         transfer_account_id = p_account,
         transaction_id = v_tx.id
   where id = p_entry
   returning * into v_entry;

  perform write_log(v_entry.shop_id, p_log);
  return v_entry;
end;
$$;

-- ── 3. ย้อนการจ่ายค่างวด ───────────────────────────────────────────────────

create or replace function public.undo_installment_entry(
  p_entry uuid,
  p_log   jsonb default null
) returns card_installment_entries language plpgsql security definer set search_path = public as $$
declare
  v_entry card_installment_entries;
  v_src   text;
begin
  select * into v_entry from card_installment_entries where id = p_entry;
  if not found then raise exception 'ไม่พบงวดผ่อนนี้'; end if;
  perform assert_can_edit(v_entry.shop_id);
  if v_entry.status <> 'paid' then raise exception 'งวดนี้ยังไม่ได้จ่าย'; end if;

  -- คืนเงินเข้ากระเป๋าต้นทางก่อน แล้วค่อยลบรายจ่ายที่ผูกไว้
  v_src := case when v_entry.paid_method = 'cash' then 'cash'
                else 'transfer:' || v_entry.transfer_account_id end;
  perform apply_wallet_effect(v_entry.shop_id, v_src, v_entry.amount);

  if v_entry.transaction_id is not null then
    delete from transactions where id = v_entry.transaction_id;
  end if;

  update card_installment_entries
     set status = 'pending', paid_at = null, paid_method = null,
         transfer_account_id = null, transaction_id = null
   where id = p_entry
   returning * into v_entry;

  perform write_log(v_entry.shop_id, p_log);
  return v_entry;
end;
$$;



-- ###########################################################################
-- ##  ผ่อนขั้นบันได + สัญญาที่ผ่อนมาก่อนแล้ว
-- ###########################################################################
--
-- โปรผ่อนจริงมักไม่ได้จ่ายเท่ากันทุกงวด เช่น 6 งวดแรก 390 แล้วงวดที่เหลือ 820
-- ทั้งโปรลดราคาช่วงแรก งวดแรกฟรี และขั้นบันไดหลายช่วง เขียนได้ด้วยโครงเดียวกัน
-- คือ "งวดที่ X ถึง Y จ่ายงวดละ Z" ต่อกันหลายบรรทัด จึงเก็บเป็น jsonb array
-- ไว้ดูย้อนหลังและใช้ตอนแก้ไข ส่วนยอดจริงของแต่ละงวดอยู่ในตารางงวดเหมือนเดิม
--
-- สัญญาที่ผ่อนมาก่อนเริ่มใช้แอป: งวดที่จ่ายไปแล้วถูกทำเครื่องหมาย 'prepaid'
-- ซึ่ง close_card_statement มองข้ามอยู่แล้ว (กรองเฉพาะ status = 'pending')
-- จึงไม่สร้างรายจ่ายย้อนหลังและไม่ขยับยอดหนี้บัตร เพราะเงินก้อนนั้นจ่ายไปก่อน
-- จะมาใช้ระบบ ถ้าลงย้อนหลังให้ รายงานเดือนที่ผ่านมาจะพองขึ้นและอาจนับซ้ำกับ
-- ที่ผู้ใช้เคยบันทึกไว้ด้วยวิธีอื่น งวดพวกนี้มีไว้ให้เลขงวดกับยอดคงเหลือถูกต้องเท่านั้น

-- สัญญาเช่าใช้จริงยาวได้ถึง 84 งวด (7 ปี) เพดาน 60 เดิมจึงต่ำเกินไป
alter table card_installments drop constraint if exists card_installments_months_check;
alter table card_installments add  constraint card_installments_months_check
  check (months between 1 and 120);

alter table card_installments add column if not exists tiers jsonb;
alter table card_installments add column if not exists prepaid_count int not null default 0;

-- เปิดรับสถานะ prepaid เพิ่ม (ของเดิมมี pending / billed / paid / cancelled)
alter table card_installment_entries drop constraint if exists card_installment_entries_status_check;
alter table card_installment_entries add  constraint card_installment_entries_status_check
  check (status in ('pending', 'billed', 'paid', 'prepaid', 'cancelled'));

-- ── สร้างสัญญาผ่อน: รับ tiers / prepaid_count และสถานะรายงวด ────────────────
-- p_entries รับ status รายงวดได้แล้ว ('pending' หรือ 'prepaid') ค่าเริ่มต้นคือ pending
-- ยอดต่องวดคำนวณที่ฝั่ง client (src/lib/cardCycle.js ซึ่งมีเทสต์แล้ว) เหมือนเดิม
-- จะได้ไม่ต้องเขียนสูตรซ้ำสองภาษาแล้วปัดเศษคนละแบบ

create or replace function public.create_card_installment(
  p_shop    uuid,
  p_card    uuid,
  p_data    jsonb,
  p_entries jsonb,
  p_log     jsonb default null
) returns card_installments language plpgsql security definer set search_path = public as $$
declare v_ins card_installments; v_e jsonb;
begin
  perform assert_can_edit(p_shop);
  if not exists (select 1 from credit_cards where id = p_card and shop_id = p_shop) then
    raise exception 'ไม่พบบัตรเครดิตของร้านนี้';
  end if;
  if jsonb_array_length(coalesce(p_entries, '[]'::jsonb)) = 0 then
    raise exception 'ต้องมีอย่างน้อยหนึ่งงวด';
  end if;

  insert into card_installments (
    shop_id, card_id, name, vendor, category_id, note,
    principal_amount, total_amount, months, monthly_amount, interest_rate,
    tiers, prepaid_count, purchase_date, first_cycle, created_by
  ) values (
    p_shop, p_card,
    coalesce(p_data->>'name', ''),
    p_data->>'vendor',
    nullif(p_data->>'category_id', '')::uuid,
    p_data->>'note',
    coalesce((p_data->>'principal_amount')::numeric, (p_data->>'total_amount')::numeric),
    (p_data->>'total_amount')::numeric,
    (p_data->>'months')::int,
    (p_data->>'monthly_amount')::numeric,
    coalesce((p_data->>'interest_rate')::numeric, 0),
    p_data->'tiers',
    coalesce((p_data->>'prepaid_count')::int, 0),
    (p_data->>'purchase_date')::date,
    p_data->>'first_cycle',
    auth.uid()
  ) returning * into v_ins;

  for v_e in select * from jsonb_array_elements(p_entries) loop
    insert into card_installment_entries (shop_id, installment_id, seq, cycle, due_date, amount, status)
    values (
      p_shop, v_ins.id,
      (v_e->>'seq')::int,
      v_e->>'cycle',
      (v_e->>'due_date')::date,
      (v_e->>'amount')::numeric,
      coalesce(v_e->>'status', 'pending')
    );
  end loop;

  -- ยังไม่แตะ outstanding และยังไม่สร้าง transactions โดยเจตนา
  -- งวด prepaid จะไม่ถูกเรียกเก็บเลย เพราะ close_card_statement กรองเฉพาะ pending
  perform write_log(p_shop, p_log);
  return v_ins;
end;
$$;

notify pgrst, 'reload schema';
