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
--   vat_rate                    : อัตรา VAT (7 = VAT ไทย)
--   vat_mode                    : none = ไม่มี VAT / included = ยอดที่กรอกรวม VAT แล้ว
--                                 add = บวก VAT เพิ่มจากยอดที่กรอก
--                                 fixed_amount เก็บตัวเลขที่ผู้ใช้กรอกเสมอทุกโหมด
-- ============================================================================

alter table recurring_items add column if not exists paused_from  date;
alter table recurring_items add column if not exists paused_until date;
alter table recurring_items add column if not exists vat_rate     numeric(5,2) not null default 0;
alter table recurring_items add column if not exists vat_mode     text not null default 'none'
  check (vat_mode in ('none', 'included', 'add'));

-- ตรวจผล: ควรได้ 4 แถว
select column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'recurring_items'
   and column_name in ('paused_from', 'paused_until', 'vat_rate', 'vat_mode')
 order by column_name;
