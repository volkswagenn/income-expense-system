-- ไฟล์: supabase/functions.sql
-- ============================================================================
-- JodFlow — RPC สำหรับงานที่ต้อง "จบในครั้งเดียว" (atomic)
--
-- ทำไมต้องมี: ตอนนี้แอปทำงานหลายคนพร้อมกัน ถ้า client อ่านยอด → บวกเลข → เขียนกลับ
-- สองคนที่กดพร้อมกันจะเขียนทับกันและเงินหาย ทุกการขยับยอดจึงต้องเป็น
-- `set balance = balance + delta` ที่ฝั่งฐานข้อมูล และงานที่มีหลายสเต็ป
-- (บันทึกรายการ + ตัดเงิน + เขียน log) ต้องอยู่ใน transaction เดียวกัน
-- ============================================================================

create or replace function public.assert_can_edit(p_shop uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not can_edit(p_shop) then
    raise exception 'ไม่มีสิทธิ์แก้ไขข้อมูลของร้านนี้' using errcode = '42501';
  end if;
end;
$$;

-- ── ขยับยอดทีละก้อน ────────────────────────────────────────────────────────

create or replace function public.adjust_cash(p_shop uuid, p_delta numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_cash numeric;
begin
  perform assert_can_edit(p_shop);
  update wallet_state set cash = cash + p_delta, updated_at = now()
   where shop_id = p_shop
  returning cash into v_cash;
  return v_cash;
end;
$$;

create or replace function public.adjust_transfer_account(p_account uuid, p_delta numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_shop uuid; v_balance numeric;
begin
  select shop_id into v_shop from transfer_accounts where id = p_account;
  if v_shop is null then raise exception 'ไม่พบบัญชีเงินโอน'; end if;
  perform assert_can_edit(v_shop);
  update transfer_accounts set balance = balance + p_delta
   where id = p_account
  returning balance into v_balance;
  return v_balance;
end;
$$;

create or replace function public.adjust_sub_wallet(p_sub uuid, p_delta numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_shop uuid; v_balance numeric;
begin
  select shop_id into v_shop from sub_wallets where id = p_sub;
  if v_shop is null then raise exception 'ไม่พบกระเป๋าตังค์ย่อย'; end if;
  perform assert_can_edit(v_shop);
  update sub_wallets set balance = balance + p_delta
   where id = p_sub
  returning balance into v_balance;
  return v_balance;
end;
$$;

create or replace function public.move_between_transfer_accounts(
  p_from uuid, p_to uuid, p_amount numeric
) returns void language plpgsql security definer set search_path = public as $$
declare v_shop uuid;
begin
  select shop_id into v_shop from transfer_accounts where id = p_from;
  if v_shop is null then raise exception 'ไม่พบบัญชีต้นทาง'; end if;
  perform assert_can_edit(v_shop);
  if p_from = p_to then raise exception 'ต้นทางกับปลายทางเป็นบัญชีเดียวกัน'; end if;
  update transfer_accounts set balance = balance - p_amount where id = p_from;
  update transfer_accounts set balance = balance + p_amount where id = p_to and shop_id = v_shop;
  -- ปลายทางไม่ใช่บัญชีของร้านนี้ = เงินถูกตัดไปแล้วแต่ไม่เข้าที่ไหน ต้องล้มทั้งคำสั่ง
  if not found then raise exception 'ไม่พบบัญชีปลายทางของร้านนี้'; end if;
end;
$$;

-- ── ปลายทางของเงินแบบข้อความเดียว: 'cash' | 'transfer:<uuid>' | 'sub:<uuid>' ──

create or replace function public.apply_wallet_effect(
  p_shop uuid, p_target text, p_delta numeric
) returns void language plpgsql security definer set search_path = public as $$
declare v_kind text; v_id text;
begin
  if p_target is null or p_delta = 0 then return; end if;
  perform assert_can_edit(p_shop);

  v_kind := split_part(p_target, ':', 1);
  v_id   := nullif(split_part(p_target, ':', 2), '');

  -- ทุกสาขาต้องตรวจว่าแก้โดนแถวจริง — ปลายทางที่ไม่ใช่ของร้านนี้ (หรือถูกลบไปแล้ว)
  -- ถ้าปล่อยผ่านเงียบๆ รายการจะถูกบันทึกโดยไม่มีเงินขยับ = ยอดไม่ตรงโดยไม่มีใครรู้
  if v_kind = 'cash' then
    update wallet_state set cash = cash + p_delta, updated_at = now() where shop_id = p_shop;
    if not found then raise exception 'ไม่พบกระเป๋าเงินสดของร้านนี้'; end if;
  elsif v_kind = 'transfer' then
    update transfer_accounts set balance = balance + p_delta
     where id = v_id::uuid and shop_id = p_shop;
    if not found then raise exception 'ไม่พบบัญชีเงินโอนของร้านนี้'; end if;
  elsif v_kind = 'sub' then
    update sub_wallets set balance = balance + p_delta
     where id = v_id::uuid and shop_id = p_shop;
    if not found then raise exception 'ไม่พบกระเป๋าตังค์ย่อยของร้านนี้'; end if;
  else
    raise exception 'ปลายทางไม่ถูกต้อง: %', p_target;
  end if;
end;
$$;

create or replace function public.write_log(p_shop uuid, p_log jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_log is null then return; end if;
  -- เรียกตรงผ่าน RPC ได้ จึงต้องกันไม่ให้สมาชิกร้านหนึ่งเขียนประวัติใส่ร้านอื่น
  if not is_member(p_shop) then
    raise exception 'ไม่มีสิทธิ์เขียนประวัติของร้านนี้' using errcode = '42501';
  end if;
  insert into activity_logs (
    shop_id, user_id, activity_type, description, old_value, new_value,
    change_note, wallet_effect, status, error_message, device_info, session_id
  ) values (
    p_shop, auth.uid(),
    p_log->>'activityType', p_log->>'description',
    p_log->'oldValue', p_log->'newValue',
    p_log->>'changeNote', p_log->'walletEffect',
    coalesce(p_log->>'status', 'success'), p_log->>'errorMessage',
    p_log->>'deviceInfo', p_log->>'sessionId'
  );
end;
$$;

-- ── บันทึกรายการ + ตัด/เพิ่มเงิน + เขียน log ในครั้งเดียว ────────────────────

create or replace function public.post_transaction(
  p_shop   uuid,
  p_tx     jsonb,
  p_target text default null,
  p_delta  numeric default 0,
  p_log    jsonb default null
) returns transactions language plpgsql security definer set search_path = public as $$
declare v_tx transactions; v_log jsonb;
begin
  perform assert_can_edit(p_shop);

  -- client ส่ง p_tx ผ่าน toRow() จึงเป็น snake_case (item_name, category_id, ...)
  -- รับ camelCase ไว้ด้วยเผื่อผู้เรียกเก่า — เวอร์ชันแรกอ่านแต่ camelCase ทำให้ทุกรายการ
  -- ที่บันทึกจริงไม่มีชื่อ ไม่มีหมวด ไม่มีบัญชีโอน โดยไม่มี error อะไรเลย
  insert into transactions (
    shop_id, date, type, amount, method, category_id, item_name, vendor,
    receipt_no, tax_status, due_date, tax_due_date, note, detail, other_income_type,
    transfer_account_id, recurring_entry_id, attachments,
    document_path, document_type, document_label, created_by
  ) values (
    p_shop,
    (p_tx->>'date')::date,
    p_tx->>'type',
    (p_tx->>'amount')::numeric,
    p_tx->>'method',
    nullif(coalesce(p_tx->>'category_id', p_tx->>'categoryId'), '')::uuid,
    coalesce(p_tx->>'item_name', p_tx->>'itemName', ''),
    p_tx->>'vendor',
    coalesce(p_tx->>'receipt_no', p_tx->>'receiptNo'),
    coalesce(p_tx->>'tax_status', p_tx->>'taxStatus'),
    nullif(coalesce(p_tx->>'due_date', p_tx->>'dueDate'), '')::date,
    nullif(coalesce(p_tx->>'tax_due_date', p_tx->>'taxDueDate'), '')::date,
    p_tx->>'note',
    p_tx->>'detail',
    coalesce(p_tx->>'other_income_type', p_tx->>'otherIncomeType'),
    nullif(coalesce(p_tx->>'transfer_account_id', p_tx->>'transferAccountId'), '')::uuid,
    nullif(coalesce(p_tx->>'recurring_entry_id', p_tx->>'recurringEntryId'), '')::uuid,
    coalesce(p_tx->'attachments', '[]'::jsonb),
    coalesce(p_tx->>'document_path', p_tx->>'documentPath'),
    coalesce(p_tx->>'document_type', p_tx->>'documentType'),
    coalesce(p_tx->>'document_label', p_tx->>'documentLabel'),
    auth.uid()
  ) returning * into v_tx;

  perform apply_wallet_effect(p_shop, p_target, p_delta);

  -- ฝัง id ของรายการลงใน log ให้หน้าประวัติจับคู่ได้ว่า log นี้คือรายการไหน
  v_log := p_log;
  if v_log is not null then
    v_log := jsonb_set(
      v_log, '{newValue}',
      coalesce(v_log->'newValue', '{}'::jsonb) || jsonb_build_object('transactionId', v_tx.id)
    );
  end if;
  perform write_log(p_shop, v_log);
  return v_tx;
end;
$$;

-- ── แก้ไขรายการ + ย้อนเงินเดิม + ตัด/เพิ่มเงินใหม่ ในครั้งเดียว ───────────────
-- p_changes เป็น snake_case (ผ่าน toRow) แก้เฉพาะคีย์ที่ส่งมา คีย์ที่ไม่ส่งคงค่าเดิม
-- p_reverse_* = ย้อนผลของยอด/วิธีเดิม, p_apply_* = ผลของยอด/วิธีใหม่
create or replace function public.edit_transaction(
  p_tx_id          uuid,
  p_changes        jsonb,
  p_reverse_target text    default null,
  p_reverse_delta  numeric default 0,
  p_apply_target   text    default null,
  p_apply_delta    numeric default 0,
  p_log            jsonb   default null
) returns transactions language plpgsql security definer set search_path = public as $$
declare v_shop uuid; v_tx transactions;
begin
  select shop_id into v_shop from transactions where id = p_tx_id;
  if v_shop is null then raise exception 'ไม่พบรายการนี้'; end if;
  perform assert_can_edit(v_shop);

  update transactions set
    date                = case when p_changes ? 'date'                then (p_changes->>'date')::date                          else date                end,
    amount              = case when p_changes ? 'amount'              then (p_changes->>'amount')::numeric                     else amount              end,
    method              = case when p_changes ? 'method'              then p_changes->>'method'                                else method              end,
    item_name           = case when p_changes ? 'item_name'           then coalesce(p_changes->>'item_name', '')               else item_name           end,
    category_id         = case when p_changes ? 'category_id'         then nullif(p_changes->>'category_id', '')::uuid         else category_id         end,
    vendor              = case when p_changes ? 'vendor'              then p_changes->>'vendor'                                else vendor              end,
    receipt_no          = case when p_changes ? 'receipt_no'          then p_changes->>'receipt_no'                            else receipt_no          end,
    tax_status          = case when p_changes ? 'tax_status'          then p_changes->>'tax_status'                            else tax_status          end,
    due_date            = case when p_changes ? 'due_date'            then nullif(p_changes->>'due_date', '')::date            else due_date            end,
    tax_due_date        = case when p_changes ? 'tax_due_date'        then nullif(p_changes->>'tax_due_date', '')::date        else tax_due_date        end,
    note                = case when p_changes ? 'note'                then p_changes->>'note'                                  else note                end,
    detail              = case when p_changes ? 'detail'              then p_changes->>'detail'                                else detail              end,
    other_income_type   = case when p_changes ? 'other_income_type'   then p_changes->>'other_income_type'                     else other_income_type   end,
    transfer_account_id = case when p_changes ? 'transfer_account_id' then nullif(p_changes->>'transfer_account_id', '')::uuid else transfer_account_id end,
    attachments         = case when p_changes ? 'attachments'         then coalesce(p_changes->'attachments', '[]'::jsonb)     else attachments         end,
    document_path       = case when p_changes ? 'document_path'       then p_changes->>'document_path'                         else document_path       end,
    document_type       = case when p_changes ? 'document_type'       then p_changes->>'document_type'                         else document_type       end,
    document_label      = case when p_changes ? 'document_label'      then p_changes->>'document_label'                        else document_label      end,
    updated_at          = now()
  where id = p_tx_id
  returning * into v_tx;

  perform apply_wallet_effect(v_shop, p_reverse_target, p_reverse_delta);
  perform apply_wallet_effect(v_shop, p_apply_target, p_apply_delta);
  perform write_log(v_shop, p_log);
  return v_tx;
end;
$$;

-- ยกเลิกรายการ: คืนเงิน + ลบรายการค้าง/ใบกำกับที่ผูกอยู่ + ย้อนสถานะรอรับเงิน
create or replace function public.cancel_transaction(
  p_tx_id  uuid,
  p_target text default null,
  p_delta  numeric default 0,
  p_log    jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_shop uuid;
begin
  select shop_id into v_shop from transactions where id = p_tx_id;
  if v_shop is null then raise exception 'ไม่พบรายการนี้'; end if;
  perform assert_can_edit(v_shop);

  perform apply_wallet_effect(v_shop, p_target, p_delta);

  update pending_incomes
     set status = 'pending', received_at = null, received_method = null,
         transaction_id = null, transfer_account_id = null
   where transaction_id = p_tx_id;

  update recurring_entries
     set status = 'pending', transaction_id = null, pending_payment_id = null,
         paid_at = null, paid_method = null, amount = 0
   where transaction_id = p_tx_id;

  delete from pending_payments where transaction_id = p_tx_id;
  delete from tax_invoices    where transaction_id = p_tx_id;
  delete from transactions    where id = p_tx_id;

  perform write_log(v_shop, p_log);
end;
$$;

-- ── ล้างข้อมูลทั้งร้าน (เฉพาะเจ้าของ) — ใช้กับปุ่ม "ล้างข้อมูลทั้งหมด" ────────

create or replace function public.clear_shop_data(p_shop uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_owner(p_shop) then
    raise exception 'เฉพาะเจ้าของร้านเท่านั้นที่ล้างข้อมูลได้' using errcode = '42501';
  end if;

  delete from tax_invoices      where shop_id = p_shop;
  delete from pending_payments  where shop_id = p_shop;
  delete from pending_incomes   where shop_id = p_shop;
  delete from transactions      where shop_id = p_shop;
  delete from recurring_entries where shop_id = p_shop;
  delete from recurring_items   where shop_id = p_shop;
  delete from loans             where shop_id = p_shop;
  delete from sub_wallets       where shop_id = p_shop;
  delete from transfer_accounts where shop_id = p_shop;
  delete from calendar_notes    where shop_id = p_shop;
  delete from activity_logs     where shop_id = p_shop;
  delete from quick_items       where shop_id = p_shop;
  delete from vendors           where shop_id = p_shop;
  delete from categories        where shop_id = p_shop;

  update wallet_state set cash = 0, updated_at = now() where shop_id = p_shop;
  insert into categories (shop_id, name, type)
  values (p_shop, 'อื่นๆ', 'expense'), (p_shop, 'อื่นๆ', 'income');
end;
$$;
