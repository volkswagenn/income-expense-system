-- ไฟล์: supabase/keep.sql
-- ============================================================================
-- JodFlow — กันประวัติรายการประจำหายตอนลบแม่แบบ   [keep.sql]
--
-- ปัญหา: recurring_entries.recurring_id เป็น on delete cascade การลบแม่แบบ 1 แถว
--        จึงลบรอบที่ "จ่ายไปแล้ว" ของทุกเดือนทุกปีตามไปด้วย ทั้งที่หน้าจอบอกว่า
--        รายการที่จ่ายแล้วยังคงอยู่ (หน้าจอโชว์ต่อจนกว่าจะรีเฟรช จึงดูเหมือน
--        ข้อมูลหายไปเองทีหลัง)
--
-- แก้: เพิ่มคอลัมน์ deleted แล้วให้แอปซ่อนแม่แบบที่ยังมีประวัติแทนการลบแถวทิ้ง
--
-- วิธีใช้: Supabase → SQL Editor → Role = postgres → วางทั้งไฟล์ → Run
--          (รันซ้ำได้ ไม่กระทบข้อมูลเดิม)
-- ============================================================================

alter table recurring_items add column if not exists deleted boolean not null default false;

-- ตรวจผล: ควรได้ 1 แถว (deleted, boolean, default false)
select column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'recurring_items'
   and column_name = 'deleted';
