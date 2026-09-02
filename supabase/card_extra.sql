-- ไฟล์: supabase/card_extra.sql
-- ============================================================================
-- JodFlow — บัตรเครดิต เฟส 4: เงินคืน หักบัญชีจำลอง และรายการประจำผ่านบัตร
--                                                          [card_extra.sql]
-- Supabase → SQL Editor → Role = postgres → วางทั้งไฟล์ → Run
-- รันซ้ำได้ ไม่ลบข้อมูล  (ต้องรัน card.sql, card_statement.sql, card_installment.sql ก่อน)
--
-- หมายเหตุเรื่อง "หักบัญชีอัตโนมัติ"
-- คำนี้มีสองความหมายและต้องแยกให้ชัด
--   1) เงินถูกหักจริงจากบัญชี — เกิดที่ธนาคาร ผู้ใช้สมัครบริการหักบัญชีเอง
--      JodFlow ทำแทนไม่ได้ และไม่ควรทำ
--   2) แอปรู้ว่าถูกหักไปแล้ว — ทำได้ ให้ผู้ใช้บอกว่าผูกไว้แบบไหน แล้วแอปเตรียม
--      รายการจ่ายบิลไว้ให้ตรงกับที่ธนาคารจะหัก เหลือแค่กดยืนยัน
--
-- คอลัมน์ข้างล่างเก็บ "สิ่งที่ผู้ใช้ผูกไว้กับธนาคาร" เท่านั้น ไม่มีอะไรหักเงินเอง
-- เพราะแอปไม่มีทางรู้ว่าธนาคารหักสำเร็จจริงหรือไม่ (เงินอาจไม่พอ บัตรอาจถูกระงับ)
-- ถ้าสร้างการเคลื่อนไหวเองโดยไม่มีใครยืนยัน ยอดในแอปจะเริ่มไม่ตรงกับยอดจริง
-- ============================================================================

-- ── 1. ตั้งค่าหักบัญชีอัตโนมัติที่ผูกไว้กับธนาคาร ──────────────────────────

alter table credit_cards add column if not exists autopay_mode text not null default 'off';
alter table credit_cards drop constraint if exists credit_cards_autopay_mode_check;
alter table credit_cards add  constraint credit_cards_autopay_mode_check
  check (autopay_mode in ('off', 'full', 'minimum', 'fixed'));

alter table credit_cards add column if not exists autopay_account_id uuid
  references transfer_accounts(id) on delete set null;
alter table credit_cards add column if not exists autopay_amount numeric(14,2) not null default 0;

-- ── 2. รายการประจำจ่ายผ่านบัตรได้ ───────────────────────────────────────────
-- เช่นค่าเน็ต ค่าสตรีมมิง ที่ตัดบัตรทุกเดือน

alter table recurring_entries drop constraint if exists recurring_entries_paid_method_check;
alter table recurring_entries add  constraint recurring_entries_paid_method_check
  check (paid_method in ('cash', 'transfer', 'pending', 'card'));

alter table recurring_entries add column if not exists card_id uuid
  references credit_cards(id) on delete set null;

-- ── 3. เลิกผูกบัญชีหักบัญชีตอนลบบัญชีเงินโอน ────────────────────────────────
-- on delete set null จัดการให้แล้ว แต่ต้องปิดโหมดด้วย ไม่งั้นจะค้างเป็น
-- "หักจากบัญชีที่ไม่มีอยู่" ซึ่งหน้าจอจะแสดงว่าพร้อมหักทั้งที่หักไม่ได้

create or replace function public.reset_orphan_autopay() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update credit_cards
     set autopay_mode = 'off', updated_at = now()
   where autopay_account_id is null and autopay_mode <> 'off';
  return null;
end;
$$;

drop trigger if exists transfer_accounts_autopay_cleanup on transfer_accounts;
create trigger transfer_accounts_autopay_cleanup
  after delete on transfer_accounts
  for each statement execute function reset_orphan_autopay();
