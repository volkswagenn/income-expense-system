-- ไฟล์: supabase/card_interest.sql
-- ============================================================================
-- JodFlow — ผ่อนชำระแบบมีดอกเบี้ย   [card_interest.sql]
--
-- Supabase → SQL Editor → Role = postgres → วางทั้งไฟล์ → Run
-- รันซ้ำได้ ไม่ลบข้อมูล  (ต้องรัน card_installment.sql ก่อน)
--
-- วิธีคิดดอกเบี้ยที่ใช้คือ **แบบคงที่ (flat rate) คิดจากเงินต้น** ซึ่งเป็นแบบที่
-- โปรผ่อนสินค้าในไทยใช้กัน ไม่ใช่แบบลดต้นลดดอก
--
--   ยอดผ่อนรวม = เงินต้น × (1 + อัตราต่อเดือน% ÷ 100 × จำนวนงวด)
--   งวดละ      = ยอดผ่อนรวม ÷ จำนวนงวด
--
--   ตัวอย่าง เงินต้น 100 ผ่อน 10 งวด 3% ต่อเดือน
--     ดอกเบี้ยรวม = 100 × 3% × 10 = 30
--     ยอดผ่อนรวม  = 130
--     งวดละ       = 13
--
-- เดิม total_amount เก็บราคาสินค้าตรงๆ เพราะรองรับแค่ผ่อน 0%
-- ตอนนี้แยกเป็นสองคอลัมน์ให้ชัด
--   principal_amount = ราคาสินค้า (เงินต้น)
--   total_amount     = ยอดที่ต้องผ่อนจริงรวมดอกเบี้ยแล้ว = ผลรวมของทุกงวด
-- รายจ่ายที่ถูกบันทึกตอนเรียกเก็บแต่ละงวดจึงรวมกันได้เท่ากับ total_amount พอดี
-- ซึ่งตรงกับเงินที่ไหลออกจริง
-- ============================================================================

alter table card_installments
  add column if not exists principal_amount numeric(14,2);

-- แถวเดิมทั้งหมดเป็นผ่อน 0% อยู่แล้ว เงินต้นจึงเท่ากับยอดรวม
update card_installments
   set principal_amount = total_amount
 where principal_amount is null;

alter table card_installments
  alter column principal_amount set default 0;

-- ── สร้างสัญญาผ่อน: รับเงินต้นเข้ามาด้วย ────────────────────────────────────
-- ยอดต่องวดกับยอดรวมคำนวณที่ฝั่ง client (installmentSchedule ใน cardCycle.js
-- ซึ่งมีเทสต์แล้ว) จะได้ไม่ต้องเขียนสูตรซ้ำสองภาษาแล้วปัดเศษคนละแบบ

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
