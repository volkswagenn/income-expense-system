-- ไฟล์: supabase/icons.sql
-- ============================================================================
-- JodFlow — ไอคอนประจำรายการ   [icons.sql]
--
-- ★ ไฟล์ประจำเรื่อง "ไอคอน" ★
-- มีอะไรเปลี่ยนเรื่องไอคอน จะถูกเพิ่มลงไฟล์นี้เสมอ ไม่แตกไฟล์ใหม่
-- เวลาอัปเดต: เปิดแท็บเดิมใน SQL Editor ลบของเก่าออก วางไฟล์นี้ทั้งไฟล์ แล้ว Run
--
-- ทุกคำสั่งรันซ้ำได้ ไม่มีคำสั่งลบหรือแก้ข้อมูล
-- ฐานข้อมูลใหม่เอี่ยมไม่ต้องรัน ใช้ setup.sql ไฟล์เดียวจบ
--
-- สิ่งที่อยู่ในไฟล์นี้
--   คอลัมน์ icon ของ 4 ตาราง: หมวดหมู่ / กระเป๋าตังค์ย่อย / รายการประจำ / ผู้ขาย
-- ============================================================================


-- ── คอลัมน์เก็บไอคอนที่ผู้ใช้เลือก ─────────────────────────────────────────
--
-- เก็บเป็นข้อความสั้นที่มีคำนำหน้าบอกชุด เช่น
--   'ms:bolt'      ไอคอนทั่วไปจากชุด Material Symbols
--   'brand:line'   โลโก้แบรนด์จากชุด Simple Icons
--   'bank:kbank'   โลโก้ธนาคารไทยที่มีอยู่เดิมในแอป
--
-- ทำไมเก็บชื่อ ไม่เก็บไฟล์
--   ไฟล์ SVG ทั้งชุดอยู่ในตัวแอปอยู่แล้ว (public/icons) ถ้าเก็บเป็นไฟล์ในฐานข้อมูล
--   จะเปลืองพื้นที่และโหลดช้ากว่าโดยไม่ได้อะไรเพิ่ม เก็บแค่ชื่อพอ
--
-- ทำไมมีคำนำหน้า
--   ชื่อจากคนละชุดชนกันได้ (shell เป็นทั้งไอคอนและปั๊มน้ำมัน) และเวลาย้ายไอคอน
--   ข้ามกลุ่มในอนาคต ค่าที่ผู้ใช้บันทึกไว้แล้วต้องยังใช้ได้เหมือนเดิม
--
-- ทำไมปล่อยให้เป็น null ได้ ไม่ใส่ค่าเริ่มต้น
--   ข้อมูลเก่าทั้งหมดยังไม่มีไอคอน ถ้าบังคับใส่ค่าจะกลายเป็นว่าทุกหมวดหมู่มี
--   ไอคอนเดียวกันหมดซึ่งอ่านยากกว่าไม่มีเลย ฝั่งหน้าจอมีไอคอนสำรองตามชนิดอยู่แล้ว

alter table categories        add column if not exists icon text;
alter table sub_wallets       add column if not exists icon text;
alter table recurring_items   add column if not exists icon text;
alter table vendors           add column if not exists icon text;
-- เพิ่มภายหลัง: บัญชีธนาคารกับบัตรเครดิตเลือกไอคอนเองได้แล้ว
-- ปกติสองอย่างนี้ใช้โลโก้ธนาคารตามชื่อธนาคารที่เลือก ไอคอนที่ตั้งเองจะไปทับโลโก้นั้น
-- มีไว้สำหรับบัญชี/บัตรที่ไม่ได้อยู่ในรายชื่อธนาคาร หรือคนที่อยากแยกด้วยสัญลักษณ์ของตัวเอง
alter table transfer_accounts add column if not exists icon text;
alter table credit_cards      add column if not exists icon text;


-- ── กันค่าที่ไม่มีทางแสดงผลได้ ─────────────────────────────────────────────
--
-- ไม่ตรวจถึงขั้นว่าไอคอนชื่อนั้นมีจริงไหม เพราะรายชื่อไอคอนอยู่ในตัวแอป
-- ไม่ได้อยู่ในฐานข้อมูล ถ้าผูกไว้จะต้องมาแก้ฐานข้อมูลทุกครั้งที่เพิ่มไอคอน
-- ตรวจแค่รูปแบบว่าเป็น '<ชุด>:<ชื่อ>' ที่ชุดถูกต้อง พอกันค่าขยะที่หลุดเข้ามา
-- ส่วนชื่อที่ถูกถอดออกจากชุดไปแล้ว ฝั่งหน้าจอจะแสดงไอคอนสำรองให้เอง

do $$
declare
  t text;
begin
  foreach t in array array['categories', 'sub_wallets', 'recurring_items', 'vendors',
                           'transfer_accounts', 'credit_cards'] loop
    if not exists (
      select 1 from pg_constraint
       where conname = t || '_icon_format'
         and conrelid = t::regclass
    ) then
      execute format(
        'alter table %I add constraint %I check (icon is null or icon ~ ''^(ms|brand|bank):[a-z0-9_]+$'')',
        t, t || '_icon_format'
      );
    end if;
  end loop;
end $$;


-- ── ตรวจว่าลงครบ ───────────────────────────────────────────────────────────
--
-- ต้องได้ 6 แถว ทุกแถวขึ้น "พร้อมใช้งาน"
-- ถ้าได้ไม่ครบ 6 แถว แปลว่าตารางนั้นยังไม่ถูกสร้าง ให้รัน setup.sql ก่อน

select
  c.table_name                                          as "ตาราง",
  c.data_type                                           as "ชนิดข้อมูล",
  case when con.conname is null then 'ยังไม่มีตัวตรวจรูปแบบ'
       else 'พร้อมใช้งาน' end                            as "สถานะ"
from information_schema.columns c
left join pg_constraint con
       on con.conname = c.table_name || '_icon_format'
      and con.conrelid = c.table_name::regclass
where c.table_schema = 'public'
  and c.column_name = 'icon'
  and c.table_name in ('categories', 'sub_wallets', 'recurring_items', 'vendors',
                       'transfer_accounts', 'credit_cards')
order by c.table_name;
