-- ไฟล์: supabase/pause.sql
-- ============================================================================
-- JodFlow — พักการเรียกเก็บชั่วคราว + บวก VAT ให้ยอดรายการประจำ   [pause.sql]
--
-- เพิ่มคอลัมน์อย่างเดียว ไม่แตะข้อมูลเดิม รันซ้ำได้
-- วิธีใช้: Supabase → SQL Editor → วางทั้งไฟล์ → Run
--
--   paused_from  / paused_until : ช่วงเดือนที่พักเรียกเก็บ (เก็บเป็นวันที่ 1 ของเดือน)
--                                 พัก ก.ย.–พ.ย. = from 2026-09-01, until 2026-12-01
--                                 until คือเดือนที่ "กลับมาเรียกเก็บ" ไม่ใช่เดือนสุดท้ายที่พัก
--   vat_rate                    : บวก VAT กี่เปอร์เซ็นต์ (0 = ไม่บวก, 7 = VAT ไทย)
--                                 fixed_amount ยังเก็บยอดก่อน VAT เสมอ
-- ============================================================================

alter table recurring_items add column if not exists paused_from  date;
alter table recurring_items add column if not exists paused_until date;
alter table recurring_items add column if not exists vat_rate     numeric(5,2) not null default 0;

-- ตรวจผล: ควรได้ 3 แถว
select column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'recurring_items'
   and column_name in ('paused_from', 'paused_until', 'vat_rate')
 order by column_name;
