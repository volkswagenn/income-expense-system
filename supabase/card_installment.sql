-- ไฟล์: supabase/card_installment.sql
-- ============================================================================
-- JodFlow — บัตรเครดิต เฟส 3: ผ่อนชำระ   [card_installment.sql]
--
-- Supabase → SQL Editor → Role = postgres → วางทั้งไฟล์ → Run
-- รันซ้ำได้ ไม่ลบข้อมูล  (ต้องรัน card.sql และ card_statement.sql ก่อน)
--
-- แนวคิด: ตอนกดซื้อ **ไม่สร้างรายจ่ายก้อนเดียว**
-- ธนาคารเรียกเก็บทีละงวด เงินไหลออกจริงทีละงวด ถ้าลงก้อนเดียวรายจ่ายเดือนที่ซื้อ
-- จะพองผิดปกติ และเดือนถัดไปจะดูเหมือนไม่มีภาระทั้งที่ยังผ่อนอยู่
-- ตอนสร้างจึงบันทึกแค่สัญญาผ่อนกับตารางงวด ยังไม่มี transaction และหนี้ยังไม่ขยับ
-- พอปิดรอบ งวดที่ถึงกำหนดถึงจะกลายเป็นรายจ่ายหนึ่งแถวและเพิ่มหนี้เท่ายอดงวดเดียว
--
-- ข้อยกเว้นคือ "วงเงิน" ธนาคารกันไว้เต็มก้อนตั้งแต่วันซื้อ ฝั่งหน้าจอจึงหักยอดผ่อน
-- ที่ยังไม่ถูกเรียกเก็บออกจากวงเงินคงเหลือด้วย (ดู useCreditCardStore.getCardLimitUsage)
-- ============================================================================

-- ── 1. สัญญาผ่อนหนึ่งรายการ ─────────────────────────────────────────────────

create table if not exists card_installments (
  id             uuid primary key default gen_random_uuid(),
  shop_id        uuid not null references shops(id) on delete cascade,
  card_id        uuid not null references credit_cards(id) on delete cascade,
  name           text not null default '',
  vendor         text,
  category_id    uuid references categories(id) on delete set null,
  note           text,

  total_amount   numeric(14,2) not null,
  months         int not null check (months between 1 and 60),
  monthly_amount numeric(14,2) not null,
  interest_rate  numeric(5,2) not null default 0,

  purchase_date  date not null,
  first_cycle    text not null,        -- 'YYYY-MM' ของรอบแรกที่เรียกเก็บ
  status         text not null default 'active'
                 check (status in ('active', 'completed', 'cancelled')),

  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists card_installments_card_idx
  on card_installments (card_id, status, created_at);

-- ── 2. หนึ่งแถวต่อหนึ่งงวด ──────────────────────────────────────────────────
-- โครงเดียวกับ recurring_items คู่กับ recurring_entries ที่ทีมคุ้นอยู่แล้ว

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

  -- ใบแจ้งยอดที่งวดนี้ไปอยู่ และรายจ่ายที่สร้างตอนเข้าบิล
  statement_id   uuid references card_statements(id) on delete set null,
  transaction_id uuid references transactions(id) on delete set null,
  billed_at      date,

  created_at     timestamptz not null default now(),
  unique (installment_id, seq)
);

create index if not exists card_installment_entries_cycle_idx
  on card_installment_entries (installment_id, cycle, status);

-- งวดที่ "จ่ายแล้ว" ไม่ได้เก็บสถานะซ้ำ — อ่านจากใบแจ้งยอดที่ statement_id ชี้ไป
-- ถ้าเก็บสองที่ วันหนึ่งจะมีที่หนึ่งอัปเดตไม่ทันแล้วตัวเลขสองหน้าจะขัดกัน

-- ── 3. transactions รู้ว่ามาจากงวดผ่อนไหน ───────────────────────────────────
-- ใช้กรองในรายงานว่ารายการไหนเป็นภาระผ่อน

alter table transactions add column if not exists installment_entry_id uuid
  references card_installment_entries(id) on delete set null;

-- ── 4. สร้างสัญญาผ่อนพร้อมงวดทั้งหมดในคำสั่งเดียว ──────────────────────────
-- p_entries เป็น jsonb array ของ { seq, cycle, due_date, amount } ที่ client คำนวณมา
-- (ใช้ src/lib/cardCycle.js ตัวเดียวกับที่อื่น จะได้ไม่เขียนเลขวันที่ซ้ำสองภาษา)

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
    total_amount, months, monthly_amount, interest_rate,
    purchase_date, first_cycle, created_by
  ) values (
    p_shop, p_card,
    coalesce(p_data->>'name', ''),
    p_data->>'vendor',
    nullif(p_data->>'category_id', '')::uuid,
    p_data->>'note',
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

-- ── 5. ดึงงวดที่ถึงกำหนดเข้าบิลตอนปิดรอบ ────────────────────────────────────
-- ทำก่อนรวมยอดรูด งวดที่สร้างเป็น transaction แล้วจะถูกนับใน spend_amount เอง
-- จึงไม่ต้องบวกยอดผ่อนแยกอีกชั้น ไม่มีทางนับซ้ำ

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

  select coalesce(sum(amount - paid_amount), 0) into v_prev
    from card_statements
   where card_id = p_card and carried_to is null
     and status <> 'paid' and period_end < p_start;

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

  select coalesce(sum(amount), 0) into v_credit
    from transactions
   where card_id = p_card and shop_id = p_shop and type = 'income'
     and date between p_start and p_end;

  v_amount := v_prev + v_spend - v_credit;
  if v_amount < 0 then v_amount := 0; end if;

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

  -- ผูกงวดที่เพิ่งเข้าบิลกับใบนี้ เพื่อให้อ่านวันที่จ่ายจริงจากใบได้
  update card_installment_entries e
     set statement_id = v_st.id
    from card_installments i
   where e.installment_id = i.id and i.card_id = p_card
     and e.cycle = p_cycle and e.status = 'billed' and e.statement_id is null;

  update card_statements
     set carried_to = v_st.id
   where card_id = p_card and carried_to is null
     and status <> 'paid' and period_end < p_start and id <> v_st.id;

  return v_st;
end;
$$;

-- ── 6. ปิดยอดคงเหลือก่อนกำหนด ───────────────────────────────────────────────
-- รวมงวดที่เหลือทั้งหมดเป็นรายการเดียวเข้ารอบที่เปิดอยู่ แล้วปิดสัญญา

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

-- ── 7. ยกเลิกงวดที่เหลือ (เช่น คืนสินค้ากลางคัน) ────────────────────────────
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

-- ── 8. ล้างข้อมูลร้านต้องลบตารางผ่อนด้วย ────────────────────────────────────

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

-- ── 9. RLS + Realtime ───────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['card_installments', 'card_installment_entries'] loop
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
