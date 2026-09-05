-- ###########################################################################
-- ##  ล้างข้อมูลของร้าน กลับไปเป็นร้านที่เพิ่งสร้างใหม่
-- ###########################################################################
--
-- ⚠️ ลบแล้วกู้คืนไม่ได้ ไม่มีถังขยะ ไม่มี undo
--    แนะนำให้โหลดไฟล์สำรองไว้ก่อน: ในแอป → ตั้งค่า → ส่งออกและสำรองข้อมูล
--    → เปิดหน้าสำรองข้อมูล → ดาวน์โหลด Backup JSON
--
-- ลบอะไรบ้าง (ทุกอย่างที่เป็น "ข้อมูลที่กรอกเข้าไป")
--    รายรับ-รายจ่าย · ค้างชำระ · รอรับเงิน · ใบกำกับภาษี · โน้ตปฏิทิน
--    รายการประจำและงวดของมัน · หนี้สินและงวดผ่อน · บัตรเครดิต บิล งวดผ่อนบัตร
--    การกดเงินสด เครื่องหมายถูกรายแถว · กระเป๋าตังค์ย่อยและการยืม
--    บัญชีธนาคาร · หมวดหมู่ · ผู้ขาย · รายการที่บันทึกไว้ · ประวัติการใช้งาน
--
-- เก็บอะไรไว้ (ไม่ต้องสมัครใหม่ ไม่ต้องตั้งร้านใหม่)
--    บัญชีผู้ใช้และรหัสผ่าน · ตัวร้านและสมาชิกร้าน (ยังล็อกอินเข้าร้านเดิมได้)
--
-- ตั้งค่ากลับเป็นค่าเริ่มต้น
--    เงินสดในร้าน = 0 · เตือนล่วงหน้า 3 วัน · หมวดหมู่ "อื่นๆ" รายรับ/รายจ่าย
--    (ชุดเดียวกับที่ระบบสร้างให้ตอนเปิดร้านใหม่ ดู handle_new_shop ใน schema.sql)
--
-- วิธีใช้ รันทีละขั้นใน SQL Editor ของ Supabase
-- ###########################################################################


-- ── ขั้นที่ 1: หา id ของร้าน ────────────────────────────────────────────────
-- รันเฉพาะบรรทัดนี้ก่อน แล้วคัดลอกค่า id ของร้านที่ต้องการล้าง

select s.id, s.name, s.created_at,
       (select count(*) from transactions t where t.shop_id = s.id) as รายการที่มีอยู่
from shops s
order by s.created_at;


-- ── ขั้นที่ 2: เอา id มาใส่ในบรรทัด v_shop แล้วรันทั้งบล็อกนี้ ──────────────

do $$
declare
  -- ⬇️ วาง id ของร้านจากขั้นที่ 1 ลงตรงนี้ (แทนที่ข้อความในเครื่องหมายคำพูด)
  v_shop uuid := '00000000-0000-0000-0000-000000000000';
  v_name text;
begin
  select name into v_name from shops where id = v_shop;
  if v_name is null then
    raise exception 'ไม่พบร้าน id นี้ — กลับไปรันขั้นที่ 1 แล้วคัดลอก id มาวางให้ถูก';
  end if;

  raise notice 'กำลังล้างข้อมูลของร้าน "%"', v_name;

  -- ลบจากตารางลูกไปหาตารางแม่ (ความสัมพันธ์ส่วนใหญ่เป็น cascade/set null อยู่แล้ว
  -- ลำดับนี้จึงเป็นการทำให้อ่านง่าย มากกว่าเป็นข้อบังคับทางเทคนิค)

  -- บัตรเครดิต
  delete from card_row_marks           where shop_id = v_shop;
  delete from card_installment_entries where shop_id = v_shop;
  delete from card_advances            where shop_id = v_shop;
  delete from card_statements          where shop_id = v_shop;
  delete from card_installments        where shop_id = v_shop;

  -- หนี้สิน
  delete from debt_entries where shop_id = v_shop;
  delete from debts        where shop_id = v_shop;

  -- รายการประจำ
  delete from recurring_entries where shop_id = v_shop;
  delete from recurring_items   where shop_id = v_shop;

  -- กระเป๋าตังค์ย่อยและการยืม
  delete from loans       where shop_id = v_shop;
  delete from sub_wallets where shop_id = v_shop;

  -- สิ่งที่รอดำเนินการ
  delete from tax_invoices     where shop_id = v_shop;
  delete from pending_payments where shop_id = v_shop;
  delete from pending_incomes  where shop_id = v_shop;

  -- รายการเงินและของประกอบ
  delete from transactions where shop_id = v_shop;
  delete from quick_items  where shop_id = v_shop;
  delete from vendors      where shop_id = v_shop;
  delete from calendar_notes where shop_id = v_shop;

  -- ข้อมูลตั้งต้นที่ผู้ใช้สร้างเอง
  delete from transfer_accounts where shop_id = v_shop;
  delete from credit_cards      where shop_id = v_shop;
  delete from categories        where shop_id = v_shop;

  -- ประวัติการใช้งาน (ลบทีหลังสุด เพื่อให้ยังอ่านย้อนได้ถ้าบล็อกนี้ล้มกลางทาง
  -- ทั้งบล็อกอยู่ใน transaction เดียว ล้มที่ไหนก็ย้อนกลับทั้งหมด ไม่มีสภาพลบครึ่งๆ)
  delete from activity_logs where shop_id = v_shop;

  -- ── ตั้งค่ากลับเป็นของร้านใหม่ ──────────────────────────────────────────
  update wallet_state  set cash = 0,               updated_at = now() where shop_id = v_shop;
  update shop_settings set notify_days_before = 3, updated_at = now() where shop_id = v_shop;

  -- เผื่อร้านเก่าที่ยังไม่มีแถวพวกนี้
  insert into wallet_state  (shop_id) values (v_shop) on conflict do nothing;
  insert into shop_settings (shop_id) values (v_shop) on conflict do nothing;

  -- หมวดหมู่ตั้งต้นชุดเดียวกับตอนเปิดร้านใหม่
  insert into categories (shop_id, name, type)
  values (v_shop, 'อื่นๆ', 'expense'), (v_shop, 'อื่นๆ', 'income');

  raise notice 'ล้างข้อมูลเสร็จแล้ว — ร้าน "%" กลับเป็นสถานะเริ่มต้น', v_name;
end $$;


-- ── ขั้นที่ 3: ตรวจว่าล้างครบ ──────────────────────────────────────────────
-- ใส่ id ร้านเดิมอีกครั้งแล้วรัน ทุกบรรทัดควรเป็น 0 ยกเว้นหมวดหมู่ที่ต้องเป็น 2

select 'รายการเงิน' as ตาราง, count(*) as เหลือ from transactions     where shop_id = '00000000-0000-0000-0000-000000000000'
union all select 'ค้างชำระ',      count(*) from pending_payments where shop_id = '00000000-0000-0000-0000-000000000000'
union all select 'รอรับเงิน',     count(*) from pending_incomes  where shop_id = '00000000-0000-0000-0000-000000000000'
union all select 'บัตรเครดิต',    count(*) from credit_cards     where shop_id = '00000000-0000-0000-0000-000000000000'
union all select 'บัญชีธนาคาร',   count(*) from transfer_accounts where shop_id = '00000000-0000-0000-0000-000000000000'
union all select 'กระเป๋าย่อย',   count(*) from sub_wallets      where shop_id = '00000000-0000-0000-0000-000000000000'
union all select 'หนี้สิน',       count(*) from debts            where shop_id = '00000000-0000-0000-0000-000000000000'
union all select 'รายการประจำ',   count(*) from recurring_items  where shop_id = '00000000-0000-0000-0000-000000000000'
union all select 'ประวัติใช้งาน', count(*) from activity_logs    where shop_id = '00000000-0000-0000-0000-000000000000'
union all select 'หมวดหมู่ (ควรเป็น 2)', count(*) from categories where shop_id = '00000000-0000-0000-0000-000000000000';
