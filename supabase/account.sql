-- ไฟล์: supabase/account.sql
-- ============================================================================
-- JodFlow — บัญชีธนาคาร ส่วนที่เพิ่มทีหลัง   [account.sql]
--
-- ★ ไฟล์ประจำเรื่อง "บัญชีธนาคาร" ★
-- มีอะไรเปลี่ยนเรื่องบัญชีเงินโอน จะถูกเพิ่มลงไฟล์นี้เสมอ ไม่แตกไฟล์ใหม่
-- เวลาอัปเดต: เปิดแท็บเดิมใน SQL Editor ลบของเก่าออก วางไฟล์นี้ทั้งไฟล์ แล้ว Run
--
-- รันซ้ำได้ ไม่ลบข้อมูล  รันเมื่อไรก็ได้ ไม่ขึ้นกับไฟล์อื่น
--
-- สิ่งที่เพิ่ม
--   1. ประเภทบัญชี (ออมทรัพย์ / กระแสรายวัน / e-Wallet / อื่นๆ)
--   2. เลขบัญชี — เก็บเท่าที่ผู้ใช้อยากใส่ (แนะนำแค่ 4 ตัวท้าย) ไว้แยกบัญชีธนาคารเดียวกัน
--   ใช้ในเมนู "จัดการข้อมูล → บัญชีธนาคาร" ซึ่งเป็นที่เดียวที่เพิ่ม/แก้บัญชีได้
--   หน้ากระเป๋าเงินเหลือแค่ดูยอดกับย้ายเงิน
-- ============================================================================

alter table transfer_accounts add column if not exists kind text not null default 'savings';
alter table transfer_accounts drop constraint if exists transfer_accounts_kind_check;
alter table transfer_accounts add  constraint transfer_accounts_kind_check
  check (kind in ('savings', 'current', 'ewallet', 'other'));

alter table transfer_accounts add column if not exists account_no text;

-- ── ตรวจว่าผ่าน ─────────────────────────────────────────────────────────────
select column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'transfer_accounts'
   and column_name in ('kind', 'account_no')
 order by column_name;
-- ต้องเห็น 2 แถว: account_no (text) และ kind (text, default 'savings')
