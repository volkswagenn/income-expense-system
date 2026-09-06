-- ไฟล์: supabase/recurring.sql
-- ============================================================================
-- JodFlow — รายการประจำ ทั้งส่วนที่เพิ่มทีหลัง   [recurring.sql]
--
-- ★ ไฟล์ประจำเรื่อง "รายการประจำ" ★
-- มีอะไรเปลี่ยนเรื่องรายการประจำ จะถูกเพิ่มลงไฟล์นี้เสมอ ไม่แตกไฟล์ใหม่
-- เวลาอัปเดต: เปิดแท็บเดิมใน SQL Editor ลบของเก่าออก วางไฟล์นี้ทั้งไฟล์ แล้ว Run
--
-- ทุกคำสั่งรันซ้ำได้ ไม่มีคำสั่งลบหรือแก้ข้อมูล ของที่มีอยู่แล้วจะถูกข้ามเอง
-- ฐานข้อมูลใหม่เอี่ยมไม่ต้องรัน ใช้ setup.sql ไฟล์เดียวจบ
--
-- สิ่งที่อยู่ในไฟล์นี้
--   รอบรายปี · ซ่อนแทนการลบเมื่อมีประวัติ · พักการเรียกเก็บชั่วคราว · VAT 3 แบบ
-- ============================================================================



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

-- ── บัตรเครดิตที่ตั้งไว้ล่วงหน้า ────────────────────────────────────────────
--
-- default_method รับค่า 'card' ได้อยู่แล้ว (คอลัมน์เป็น text ไม่มี check) แต่ยัง
-- ไม่มีที่เก็บว่า "รูดใบไหน" พอถึงวันจ่ายจึงต้องมานั่งเลือกบัตรใหม่ทุกครั้ง
--
-- ห่อด้วย do block เพราะตารางบัตรเครดิตมาจาก card.sql — ถ้ายังไม่ได้รันไฟล์นั้น
-- คำสั่งนี้จะข้ามไปเงียบๆ แทนที่จะ error แล้วทำให้ทั้งไฟล์ rollback
do $$
begin
  if to_regclass('public.credit_cards') is not null then
    alter table recurring_items add column if not exists default_card_id uuid
      references credit_cards(id) on delete set null;
  end if;
end $$;

-- ── รอบบิลที่บิลใบนี้เรียกเก็บ ──────────────────────────────────────────────
--
-- บิลสาธารณูปโภคของไทยเกือบทั้งหมดเรียกเก็บ "ย้อนหลัง": บิลค่าไฟที่ครบกำหนดวันที่ 15
-- กันยายน คือค่าไฟที่ใช้ไปเมื่อเดือนสิงหาคม ส่วนค่าบริการรายเดือนอย่างซอฟต์แวร์
-- มักเก็บล่วงหน้าสำหรับเดือนที่กำลังจะใช้ ทั้งสองแบบอยู่ปนกันในหน้าเดียว
--
-- ของเดิมระบบรู้แค่ "เดือนที่ต้องจ่าย" (recurring_entries.month) เลยตอบไม่ได้ว่า
-- เงินก้อนนี้เป็นค่าอะไรของเดือนไหน เวลาเทียบกับบิลจริงจากผู้ให้บริการจึงงง
--
-- คอลัมน์นี้เก็บส่วนต่างเป็นจำนวนเดือน: รอบบิล = เดือนที่จ่าย + offset
--    0 = รอบเดือนเดียวกับที่จ่าย (ค่าตั้งต้น — ของเดิมทั้งหมดถือเป็นแบบนี้)
--   -1 = บิลของเดือนก่อน (ค่าไฟ ค่าน้ำ ค่าเน็ต ค่าโทรศัพท์)
--   +1 = จ่ายล่วงหน้าสำหรับเดือนถัดไป (ค่าเช่า ค่าบริการรายเดือนบางเจ้า)
alter table recurring_items add column if not exists billing_cycle_offset int not null default 0
  check (billing_cycle_offset between -3 and 3);

-- ── ตรวจผล: ควรได้ 9 แถว (ถ้ายังไม่ได้รัน card.sql จะได้ 8 — ขาด default_card_id) ──

select column_name as คอลัมน์, data_type as ชนิด, column_default as ค่าตั้งต้น
  from information_schema.columns
 where table_schema = 'public' and table_name = 'recurring_items'
   and column_name in ('frequency','billing_month','deleted',
                       'paused_from','paused_until','vat_rate','vat_mode',
                       'default_card_id','billing_cycle_offset')
 order by column_name;
