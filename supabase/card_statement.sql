-- ไฟล์: supabase/card_statement.sql
-- ============================================================================
-- JodFlow — บัตรเครดิต เฟส 2: รอบบิลและการจ่ายบิล   [card_statement.sql]
--
-- Supabase → SQL Editor → Role = postgres → วางทั้งไฟล์ → Run
-- รันซ้ำได้ ไม่ลบข้อมูล  (ต้องรัน card.sql ก่อน)
--
-- แนวคิดสำคัญสองข้อ
--
-- 1) เก็บเฉพาะรอบที่ "ปิดแล้ว"
--    รอบที่กำลังเดินอยู่ไม่มีแถวในตาราง เพราะยอดของมันเปลี่ยนทุกครั้งที่รูด
--    หน้าจอคำนวณสดจาก transactions เอา ส่วนแถวในตารางคือใบแจ้งหนี้ที่แช่แข็งแล้ว
--    ปิดรอบซ้ำไม่เกิดผลข้างเคียง เพราะ unique (card_id, cycle) + คืนแถวเดิมถ้ามีอยู่แล้ว
--
-- 2) จ่ายบิลคือการย้ายเงิน ไม่ใช่รายจ่าย
--    ค่าใช้จ่ายเกิดตอนรูดไปแล้ว ถ้าบันทึกเป็นรายจ่ายอีกครั้งตอนจ่ายบิล
--    ยอดรายจ่ายเดือนนั้นจะถูกนับซ้ำสองเท่า pay_card_statement จึงไม่ insert transactions
--    แต่ขยับสองกระเป๋าพร้อมกันแบบเดียวกับ move_cash_transfer
-- ============================================================================

-- ── 1. อัตราผ่อนชำระขั้นต่ำ เก็บเป็นค่าตั้งค่า ไม่ใช่ค่าคงที่ในโค้ด ─────────
-- เกณฑ์ ธปท. คือ 8% ถึงรอบบัญชีเดือน ธ.ค. 2569 แล้วเป็น 10% ตั้งแต่ ม.ค. 2570
-- เก็บไว้ตรงนี้จะได้แก้ตอนเกณฑ์เปลี่ยนโดยไม่ต้องดีพลอยใหม่

alter table shop_settings add column if not exists card_min_rate numeric(5,2) not null default 8;

-- ── 2. ตารางใบแจ้งยอด ───────────────────────────────────────────────────────

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

  -- ยอดที่จ่ายไม่หมดถูกยกไปอยู่ในใบไหน — ทำให้ไม่นับยอดค้างซ้ำตอนปิดรอบถัดไป
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

-- ── 3. ปิดรอบ ───────────────────────────────────────────────────────────────
-- ขอบเขตของรอบคำนวณที่ฝั่ง client (src/lib/cardCycle.js ซึ่งมีเทสต์แล้ว)
-- แล้วส่งเข้ามา จะได้ไม่ต้องเขียนเลขวันที่ซ้ำสองภาษาแล้วเพี้ยนคนละแบบ

create or replace function public.close_card_statement(
  p_shop  uuid,
  p_card  uuid,
  p_cycle text,
  p_start date,
  p_end   date,
  p_due   date
) returns card_statements language plpgsql security definer set search_path = public as $$
declare
  v_st       card_statements;
  v_prev     numeric(14,2);
  v_spend    numeric(14,2);
  v_credit   numeric(14,2);
  v_amount   numeric(14,2);
  v_rate     numeric(5,2);
  v_min      numeric(14,2);
begin
  perform assert_can_edit(p_shop);

  if not exists (select 1 from credit_cards where id = p_card and shop_id = p_shop) then
    raise exception 'ไม่พบบัตรเครดิตของร้านนี้';
  end if;

  -- ปิดไปแล้ว → คืนใบเดิม ไม่ทำอะไรซ้ำ (หน้าจอเรียกทุกครั้งที่เปิดหน้า)
  select * into v_st from card_statements where card_id = p_card and cycle = p_cycle;
  if found then return v_st; end if;

  -- ยอดค้างจากใบก่อนหน้าที่ยังไม่ถูกยกไปไหน
  select coalesce(sum(amount - paid_amount), 0) into v_prev
    from card_statements
   where card_id = p_card and carried_to is null
     and status <> 'paid' and period_end < p_start;

  select coalesce(sum(amount), 0) into v_spend
    from transactions
   where card_id = p_card and shop_id = p_shop and type = 'expense'
     and date between p_start and p_end;

  -- รายรับที่ปลายทางเป็นบัตร = เครดิตเงินคืน หรือเงินคืนสินค้า → ลดยอดที่ต้องชำระ
  select coalesce(sum(amount), 0) into v_credit
    from transactions
   where card_id = p_card and shop_id = p_shop and type = 'income'
     and date between p_start and p_end;

  v_amount := v_prev + v_spend - v_credit;
  if v_amount < 0 then v_amount := 0; end if;   -- เงินคืนมากกว่ายอดรูด = ไม่ต้องจ่าย

  select coalesce(card_min_rate, 8) into v_rate from shop_settings where shop_id = p_shop;
  v_min := least(v_amount, round(v_amount * coalesce(v_rate, 8) / 100, 2));

  insert into card_statements (
    shop_id, card_id, cycle, period_start, period_end, due_date,
    status, previous_balance, spend_amount, credit_amount, amount, minimum_amount
  ) values (
    p_shop, p_card, p_cycle, p_start, p_end, p_due,
    case when v_amount <= 0 then 'paid' else 'closed' end,
    v_prev, v_spend, v_credit, v_amount, v_min
  ) returning * into v_st;

  -- ใบเก่าที่ยอดถูกยกมาแล้ว ทำเครื่องหมายไว้ไม่ให้ถูกนับอีกรอบหน้า
  update card_statements
     set carried_to = v_st.id
   where card_id = p_card and carried_to is null
     and status <> 'paid' and period_end < p_start;

  return v_st;
end;
$$;

-- ── 4. จ่ายบิล — ย้ายเงินสองขาในทรานแซกชันเดียว ไม่สร้าง transactions ───────

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

  v_remain := v_st.amount - v_st.paid_amount;
  if p_amount > v_remain then
    raise exception 'จ่ายเกินยอดที่ค้างอยู่ (เหลือ % บาท)', to_char(v_remain, 'FM999999990.00');
  end if;

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

-- ── 5. ย้อนการจ่ายบิล ───────────────────────────────────────────────────────
-- คืนเงินกลับกระเป๋าต้นทาง และหนี้บัตรกลับมาเท่าเดิม

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

-- ── 6. ล้างข้อมูลร้านต้องลบใบแจ้งยอดด้วย ────────────────────────────────────
-- carried_to อ้างถึงกันเองในตาราง จึงต้องตัดการอ้างอิงก่อนลบ

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
  update card_statements set carried_to = null where shop_id = p_shop;
  delete from card_statements   where shop_id = p_shop;
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

-- ── 7. RLS + Realtime ───────────────────────────────────────────────────────

alter table card_statements enable row level security;

drop policy if exists card_statements_select on card_statements;
create policy card_statements_select on card_statements
  for select using (is_member(shop_id));

drop policy if exists card_statements_insert on card_statements;
create policy card_statements_insert on card_statements
  for insert with check (can_edit(shop_id));

drop policy if exists card_statements_update on card_statements;
create policy card_statements_update on card_statements
  for update using (can_edit(shop_id)) with check (can_edit(shop_id));

drop policy if exists card_statements_delete on card_statements;
create policy card_statements_delete on card_statements
  for delete using (can_edit(shop_id));

alter table card_statements replica identity full;
do $$
begin
  alter publication supabase_realtime add table card_statements;
exception when duplicate_object then null;
end $$;
