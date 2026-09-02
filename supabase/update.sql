-- ไฟล์: supabase/update.sql
-- ============================================================================
-- JodFlow — อัปเดตฐานข้อมูลที่ติดตั้งไปแล้ว   [update.sql]
--
-- ★ ไฟล์เดียวที่ต้องรัน ★
-- มีอะไรเปลี่ยนในฐานข้อมูล จะถูกเพิ่มลงในไฟล์นี้เสมอ ไม่มีไฟล์แยกอีก
--
-- วิธีใช้: เปิดแท็บเดิมใน Supabase → SQL Editor → ลบของเก่าออกให้หมด
--          วางไฟล์นี้ทั้งไฟล์ → Run   (ไม่ต้องเปิดแท็บใหม่ทุกครั้ง)
--
-- ทุกคำสั่งเขียนแบบรันซ้ำได้และไม่มีคำสั่งลบหรือแก้ข้อมูล จะรันกี่รอบก็ปลอดภัย
-- ของที่ติดตั้งไปแล้วจะถูกข้ามเอง เหลือเฉพาะส่วนที่ยังขาด
--
-- ฐานข้อมูลใหม่เอี่ยมไม่ต้องรันไฟล์นี้ ใช้ setup.sql ไฟล์เดียวจบ
--
-- สิ่งที่อยู่ในไฟล์นี้
--   1. รายการประจำ   รอบรายปี, ซ่อนแทนลบ, พักการเรียกเก็บ, VAT 3 แบบ
--   2. ผ่อนชำระ      จ่ายค่างวดทีละงวดจากบัญชี + ย้อนการจ่าย
--   3. หมวดหมู่      ลากจัดลำดับเองได้
-- ============================================================================

-- ###########################################################################
-- ##  1. รายการประจำ
-- ###########################################################################

-- ── รอบเรียกเก็บ: รายเดือน / รายปี ─────────────────────────────────────────
alter table recurring_items add column if not exists frequency text not null default 'monthly'
  check (frequency in ('monthly', 'yearly'));
alter table recurring_items add column if not exists billing_month int
  check (billing_month between 1 and 12);

-- ── กันประวัติหายตอนลบแม่แบบ ───────────────────────────────────────────────
alter table recurring_items add column if not exists deleted boolean not null default false;

-- ── พักการเรียกเก็บชั่วคราว ────────────────────────────────────────────────
alter table recurring_items add column if not exists paused_from  date;
alter table recurring_items add column if not exists paused_until date;

-- ── VAT ────────────────────────────────────────────────────────────────────
alter table recurring_items add column if not exists vat_rate numeric(5,2) not null default 0;
alter table recurring_items add column if not exists vat_mode text not null default 'none'
  check (vat_mode in ('none', 'included', 'add'));

-- ###########################################################################
-- ##  2. ผ่อนชำระ — จ่ายค่างวดทีละงวด
-- ###########################################################################

-- ── 1. คอลัมน์และสถานะใหม่ ─────────────────────────────────────────────────

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
-- ##  3. หมวดหมู่ — จัดลำดับเอง
-- ###########################################################################

alter table categories add column if not exists sort_order int not null default 0;

create index if not exists categories_sort_idx
  on categories (shop_id, type, sort_order, created_at);

-- ── จัดลำดับใหม่ทั้งชุดในครั้งเดียว ────────────────────────────────────────
--
-- รับ id เรียงตามลำดับที่ต้องการ แล้วเขียน sort_order ตามตำแหน่งในอาเรย์
-- ต้องทำเป็นคำสั่งเดียว ไม่ใช่ยิงอัปเดตทีละแถวจากหน้าจอ เพราะถ้าเน็ตหลุดกลางทาง
-- จะได้ลำดับที่ครึ่งเก่าครึ่งใหม่ แล้วหมวดหมู่จะสลับตำแหน่งมั่วโดยไม่มีใครรู้

create or replace function public.reorder_categories(
  p_shop uuid,
  p_ids  uuid[]
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform assert_can_edit(p_shop);

  update categories c
     set sort_order = pos.idx
    from unnest(p_ids) with ordinality as pos(id, idx)
   where c.id = pos.id
     and c.shop_id = p_shop;
end;
$$;


-- ── ตรวจผล ─────────────────────────────────────────────────────────────────
-- ควรได้ 13 แถว (คอลัมน์ 11 + ฟังก์ชัน 3 ... ดูรายชื่อในผลลัพธ์)

select 'คอลัมน์' as ประเภท, table_name || '.' || column_name as ชื่อ
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'recurring_items' and column_name in
         ('frequency','billing_month','deleted','paused_from','paused_until','vat_rate','vat_mode'))
     or (table_name = 'card_installment_entries' and column_name in
         ('paid_at','paid_method','transfer_account_id'))
     or (table_name = 'categories' and column_name = 'sort_order'))
union all
select 'ฟังก์ชัน', routine_name
  from information_schema.routines
 where routine_schema = 'public'
   and routine_name in ('pay_installment_entry', 'undo_installment_entry', 'reorder_categories')
 order by 1, 2;
