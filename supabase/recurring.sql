-- ไฟล์: supabase/recurring.sql
-- ============================================================================
-- JodFlow — คอลัมน์ทั้งหมดของรายการประจำ   [recurring.sql]
--
-- รวม yearly.sql + keep.sql + pause.sql เดิมไว้ที่เดียว จะได้ไม่ต้องไล่รันทีละไฟล์
-- เติมคอลัมน์อย่างเดียว ไม่มีคำสั่งลบหรือแก้ข้อมูล รันซ้ำได้ไม่เสียหาย
--
-- วิธีใช้: Supabase → SQL Editor → วางทั้งไฟล์ → Run
--
-- คอลัมน์ที่เติม
--   frequency     monthly = เรียกเก็บทุกเดือน (ค่าตั้งต้น) / yearly = ปีละครั้ง
--   billing_month เดือนที่เรียกเก็บ 1–12 ใช้เฉพาะแบบรายปี
--   deleted       ลบแม่แบบที่เคยจ่ายไปแล้วต้องเป็นการ "ซ่อน" ไม่ใช่ลบแถวจริง
--                 เพราะ recurring_entries ผูกด้วย on delete cascade ลบแถวเดียว
--                 จะพารอบที่จ่ายไปแล้วหายตามไปทั้งหมด
--   paused_from   เดือนแรกที่พักเรียกเก็บ (เก็บเป็นวันที่ 1 ของเดือน)
--   paused_until  เดือนที่ "กลับมาเรียกเก็บ" ไม่ใช่เดือนสุดท้ายที่พัก
--                 พัก ก.ย.–พ.ย. = from 2026-09-01, until 2026-12-01
--   vat_rate      อัตรา VAT (7 = VAT ไทย)
--   vat_mode      none = ไม่มี VAT / included = ยอดที่กรอกรวม VAT มาแล้ว
--                 add = บวก VAT เพิ่มจากยอดที่กรอก
--                 fixed_amount เก็บตัวเลขที่ผู้ใช้กรอกเสมอทุกโหมด
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

-- ── ตรวจผล: ต้องได้ครบ 7 แถว ───────────────────────────────────────────────
select column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'recurring_items'
   and column_name in (
     'frequency', 'billing_month', 'deleted',
     'paused_from', 'paused_until', 'vat_rate', 'vat_mode'
   )
 order by column_name;
