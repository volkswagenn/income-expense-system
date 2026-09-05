-- ###########################################################################
-- ##  ล้างข้อมูลของร้าน — RPC เบื้องหลังปุ่มรีเซ็ตในหน้าตั้งค่า
-- ###########################################################################
--
-- ทำเป็น RPC ไม่ใช่ให้หน้าจอยิง delete ทีละตาราง เพราะการล้างข้อมูลแตะ 20 กว่าตาราง
-- ถ้าทำจากหน้าจอแล้วเน็ตหลุดกลางทาง จะเหลือสภาพ "ลบไปครึ่งหนึ่ง" ที่ยอดเงินไม่ตรง
-- กับรายการอีกต่อไป และย้อนกลับไม่ได้ ในนี้ทั้งฟังก์ชันอยู่ใน transaction เดียว
-- ล้มตรงไหนก็ย้อนกลับหมด
--
-- จำกัดเฉพาะเจ้าของร้าน (is_owner) ไม่ใช่แค่ can_edit — พนักงานที่แก้รายการได้
-- ไม่ควรล้างข้อมูลทั้งร้านได้
--
-- ⚠️ ไฟล์นี้ทับ clear_shop_data ฉบับใน debt.sql ที่เขียนไว้ก่อนจะมีตาราง
--    card_row_marks (card.sql ส่วนที่ 11) ของเดิมจึงลืมลบตารางนั้น ต้องรันไฟล์นี้
--    หลัง card.sql และ debt.sql เสมอ
--
-- รันทับซ้ำได้ ไม่ลบอะไรตอนรัน (สร้างฟังก์ชันอย่างเดียว)
-- ###########################################################################

create or replace function public.assert_is_owner(p_shop uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not is_owner(p_shop) then
    raise exception 'เฉพาะเจ้าของร้านเท่านั้นที่ล้างข้อมูลได้' using errcode = '42501';
  end if;
end;
$$;


-- ── 1. ล้างเฉพาะรายการเดินบัญชี ────────────────────────────────────────────
--
-- ลบทุกอย่างที่เป็น "เงินที่เคลื่อนไหว" แล้วตั้งยอดทุกก้อนเป็น 0 เพื่อเริ่มใส่ใหม่
-- เก็บโครงที่ตั้งไว้แล้ว: หมวดหมู่ · บัญชีธนาคาร · บัตรเครดิต · กระเป๋าตังค์ย่อย ·
-- ผู้ขาย · รายการที่บันทึกไว้ · แม่แบบรายการประจำ · โน้ตปฏิทิน
--
-- ลบประวัติการใช้งานด้วยโดยตั้งใจ ไม่ใช่ของแถม — ใบแจ้งยอดรายบัญชีไล่ยอดจาก
-- activity_logs (ดู src/lib/accountStatement.js) ถ้าลบรายการแต่เก็บ log ไว้
-- ใบแจ้งยอดจะแสดงความเคลื่อนไหวของเงินที่ไม่มีอยู่แล้ว และไม่ตรงกับยอดที่ตั้งใหม่

create or replace function public.reset_shop_ledger(p_shop uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform assert_is_owner(p_shop);

  -- บัตรเครดิต: ลบบิลและงวดผ่อน แต่เก็บตัวบัตรไว้
  delete from card_row_marks           where shop_id = p_shop;
  delete from card_installment_entries where shop_id = p_shop;
  delete from card_advances            where shop_id = p_shop;
  delete from card_installments        where shop_id = p_shop;
  -- ใบแจ้งยอดอ้างถึงกันเอง (carried_to = ยอดที่ยกไปใบถัดไป) ต้องตัดสายก่อนลบ
  update card_statements set carried_to = null where shop_id = p_shop;
  delete from card_statements          where shop_id = p_shop;

  -- หนี้สิน — เป็นข้อผูกพันทางการเงิน ไม่ใช่โครงที่ตั้งไว้ จึงลบทั้งสัญญา
  delete from debt_entries where shop_id = p_shop;
  delete from debts        where shop_id = p_shop;

  -- รายการประจำ: ลบเฉพาะงวดของแต่ละเดือน เก็บแม่แบบไว้
  delete from recurring_entries where shop_id = p_shop;

  -- การยืมเงินจากกระเป๋าย่อย
  delete from loans where shop_id = p_shop;

  -- สิ่งที่รอดำเนินการ
  delete from tax_invoices     where shop_id = p_shop;
  delete from pending_payments where shop_id = p_shop;
  delete from pending_incomes  where shop_id = p_shop;

  delete from transactions  where shop_id = p_shop;
  delete from activity_logs where shop_id = p_shop;

  -- ── ตั้งยอดทุกก้อนเป็น 0 เพื่อเริ่มใส่เงินเดินบัญชีใหม่ ────────────────────
  update wallet_state      set cash = 0, updated_at = now() where shop_id = p_shop;
  update transfer_accounts set balance = 0                  where shop_id = p_shop;
  update sub_wallets       set balance = 0                  where shop_id = p_shop;
  update credit_cards      set outstanding = 0              where shop_id = p_shop;

  insert into wallet_state (shop_id) values (p_shop) on conflict do nothing;
end;
$$;


-- ── 2. ล้างข้อมูลทั้งหมด ───────────────────────────────────────────────────
--
-- กลับไปเป็นร้านที่เพิ่งสร้าง เก็บไว้แค่บัญชีผู้ใช้กับตัวร้าน (ยังล็อกอินเข้าร้านเดิมได้)
-- หมวดหมู่ "อื่นๆ" ใส่กลับให้ชุดเดียวกับ handle_new_shop ใน schema.sql
-- ถ้าไม่ใส่กลับ จะไม่มีหมวดหมู่ให้เลือกเลยตอนบันทึกรายการแรก

create or replace function public.clear_shop_data(p_shop uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform assert_is_owner(p_shop);

  -- ล้างฝั่งเงินก่อน แล้วค่อยลบโครงที่ผู้ใช้ตั้งไว้
  perform reset_shop_ledger(p_shop);

  delete from recurring_items   where shop_id = p_shop;
  delete from sub_wallets       where shop_id = p_shop;
  delete from transfer_accounts where shop_id = p_shop;
  delete from credit_cards      where shop_id = p_shop;
  delete from quick_items       where shop_id = p_shop;
  delete from vendors           where shop_id = p_shop;
  delete from calendar_notes    where shop_id = p_shop;
  delete from categories        where shop_id = p_shop;

  update shop_settings set notify_days_before = 3, updated_at = now() where shop_id = p_shop;
  insert into shop_settings (shop_id) values (p_shop) on conflict do nothing;

  insert into categories (shop_id, name, type)
  values (p_shop, 'อื่นๆ', 'expense'), (p_shop, 'อื่นๆ', 'income');
end;
$$;


notify pgrst, 'reload schema';
