-- ============================================================================
-- JodFlow — รายการประจำแบบรายปี
--
-- สำหรับฐานข้อมูลที่ติดตั้งไปแล้ว: วางไฟล์นี้ใน Supabase → SQL Editor → Run
-- (ฐานข้อมูลใหม่ไม่ต้องรัน เพราะ 00_setup_all.sql มีคำสั่งนี้อยู่แล้ว)
--
--   frequency     : 'monthly' = เรียกเก็บทุกเดือน (ค่าเดิม) / 'yearly' = ปีละครั้ง
--   billing_month : เดือนที่เรียกเก็บ (1–12) ใช้เฉพาะรายปี
-- ============================================================================

alter table recurring_items add column if not exists frequency text not null default 'monthly'
  check (frequency in ('monthly', 'yearly'));
alter table recurring_items add column if not exists billing_month int
  check (billing_month between 1 and 12);

-- ตรวจผล: ควรได้ 2 แถว
select column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'recurring_items'
   and column_name in ('frequency', 'billing_month')
 order by column_name;
