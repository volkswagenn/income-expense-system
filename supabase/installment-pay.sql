-- ไฟล์: supabase/installment-pay.sql
-- ============================================================================
-- JodFlow — จ่ายค่างวดผ่อนทีละงวด   [installment-pay.sql]
--
-- ฐานข้อมูลใหม่ไม่ต้องรัน (setup.sql มีอยู่แล้ว)
-- ฐานข้อมูลที่ติดตั้งไปแล้ว: Supabase → SQL Editor → Role = postgres → วางทั้งไฟล์ → Run
-- รันซ้ำได้ ไม่ลบข้อมูล
--
-- ที่มา: บัตรเครดิตในระบบนี้มีไว้ติดตามวงเงินและยอดผ่อน ไม่ใช่ตัวจ่ายเงิน
-- เงินจริงออกจากบัญชีหรือเงินสดเสมอ พอถึงวันจ่ายงวดจึงต้องเลือกได้ว่าหักจากที่ไหน
--
-- ⚠ จุดที่ต้องระวังและเป็นเหตุผลของโครงสร้างนี้
--   หนี้บัตรของงวดผ่อน "ยังไม่เกิด" จนกว่างวดนั้นจะถูกเรียกเก็บเข้าบิล
--   (close_card_statement เป็นคนเพิ่มหนี้ทีละงวดตอนปิดรอบ พร้อมสร้างรายจ่าย)
--   ดังนั้นการจ่ายงวดที่ยังไม่เข้าบิลต้อง "ไม่" ไปลดหนี้บัตร ไม่งั้นหนี้จะติดลบ
--   ส่วนงวดที่เข้าบิลไปแล้วต้องจ่ายผ่านบิล ไม่ใช่จ่ายทีละงวด ไม่งั้นจะจ่ายซ้ำ
--
-- สิ่งที่เพิ่ม
--   1. สถานะ 'paid' ของงวดผ่อน + ช่องเก็บว่าจ่ายเมื่อไร ด้วยวิธีไหน จากบัญชีไหน
--   2. pay_installment_entry  — ตัดเงิน สร้างรายจ่าย ปิดงวด เขียน log ในครั้งเดียว
--   3. undo_installment_entry — ย้อนทุกขาให้ครบ
--
-- งวดที่จ่ายด้วยวิธีนี้จะไม่ถูกเรียกเก็บเข้าบิลอีก เพราะบิลนับเฉพาะงวดสถานะ pending
-- ============================================================================

-- ── 1. คอลัมน์และสถานะใหม่ ─────────────────────────────────────────────────

alter table card_installment_entries add column if not exists paid_at             timestamptz;
alter table card_installment_entries add column if not exists paid_method         text;
alter table card_installment_entries add column if not exists transfer_account_id uuid
  references transfer_accounts(id) on delete set null;

-- เดิม check อนุญาตแค่ pending / billed / cancelled ต้องเปิดรับ 'paid' เพิ่ม
alter table card_installment_entries drop constraint if exists card_installment_entries_status_check;
alter table card_installment_entries add  constraint card_installment_entries_status_check
  check (status in ('pending', 'billed', 'paid', 'cancelled'));

-- ── 2. จ่ายค่างวด ──────────────────────────────────────────────────────────

create or replace function public.pay_installment_entry(
  p_entry   uuid,
  p_method  text,
  p_account uuid,
  p_amount  numeric,
  p_paid_at timestamptz,
  p_log     jsonb default null
) returns card_installment_entries language plpgsql security definer set search_path = public as $$
declare
  v_entry card_installment_entries;
  v_ins   card_installments;
  v_tx    transactions;
  v_src   text;
  v_date  date;
begin
  select * into v_entry from card_installment_entries where id = p_entry;
  if not found then raise exception 'ไม่พบงวดผ่อนนี้'; end if;
  perform assert_can_edit(v_entry.shop_id);

  if v_entry.status = 'paid' then raise exception 'งวดนี้จ่ายไปแล้ว'; end if;
  if v_entry.status = 'cancelled' then raise exception 'งวดนี้ถูกยกเลิกไปแล้ว'; end if;
  if v_entry.status = 'billed' then
    raise exception 'งวดนี้ถูกเรียกเก็บเข้าบิลรอบ % ไปแล้ว ให้จ่ายผ่านบิลบัตรแทน', v_entry.cycle;
  end if;

  if p_amount is null or p_amount <= 0 then raise exception 'จำนวนเงินต้องมากกว่าศูนย์'; end if;
  if p_method not in ('cash', 'transfer') then
    raise exception 'วิธีจ่ายไม่ถูกต้อง: %', p_method;
  end if;
  if p_method = 'transfer' and p_account is null then
    raise exception 'ต้องเลือกบัญชีที่จะตัดเงิน';
  end if;

  select * into v_ins from card_installments where id = v_entry.installment_id;
  if not found then raise exception 'ไม่พบสัญญาผ่อนของงวดนี้'; end if;

  v_date := (coalesce(p_paid_at, now()) at time zone 'Asia/Bangkok')::date;

  -- สร้างรายจ่ายจริง เพื่อให้ยอดไปโผล่ในรายงานและประวัติเหมือนรายจ่ายอื่น
  -- ไม่ผูก card_id เพราะงวดนี้ไม่ได้ผ่านบัตร เงินออกจากบัญชีตรงๆ
  insert into transactions (
    shop_id, date, type, amount, method, transfer_account_id, category_id,
    item_name, vendor, installment_entry_id, note, created_by
  ) values (
    v_entry.shop_id, v_date, 'expense', p_amount, p_method,
    case when p_method = 'transfer' then p_account else null end,
    v_ins.category_id,
    v_ins.name || ' (งวด ' || v_entry.seq || '/' || v_ins.months || ')',
    v_ins.vendor, v_entry.id, 'จ่ายค่างวดผ่อนจากบัญชี', auth.uid()
  ) returning * into v_tx;

  -- เงินออกจากกระเป๋าที่เลือก — ไม่แตะหนี้บัตร เพราะงวดนี้ยังไม่เคยเป็นหนี้บัตร
  v_src := case when p_method = 'cash' then 'cash' else 'transfer:' || p_account end;
  perform apply_wallet_effect(v_entry.shop_id, v_src, -p_amount);

  update card_installment_entries
     set status = 'paid',
         amount = p_amount,
         paid_at = coalesce(p_paid_at, now()),
         paid_method = p_method,
         transfer_account_id = p_account,
         transaction_id = v_tx.id
   where id = p_entry
   returning * into v_entry;

  perform write_log(v_entry.shop_id, p_log);
  return v_entry;
end;
$$;

-- ── 3. ย้อนการจ่ายค่างวด ───────────────────────────────────────────────────

create or replace function public.undo_installment_entry(
  p_entry uuid,
  p_log   jsonb default null
) returns card_installment_entries language plpgsql security definer set search_path = public as $$
declare
  v_entry card_installment_entries;
  v_src   text;
begin
  select * into v_entry from card_installment_entries where id = p_entry;
  if not found then raise exception 'ไม่พบงวดผ่อนนี้'; end if;
  perform assert_can_edit(v_entry.shop_id);
  if v_entry.status <> 'paid' then raise exception 'งวดนี้ยังไม่ได้จ่าย'; end if;

  -- คืนเงินเข้ากระเป๋าต้นทางก่อน แล้วค่อยลบรายจ่ายที่ผูกไว้
  v_src := case when v_entry.paid_method = 'cash' then 'cash'
                else 'transfer:' || v_entry.transfer_account_id end;
  perform apply_wallet_effect(v_entry.shop_id, v_src, v_entry.amount);

  if v_entry.transaction_id is not null then
    delete from transactions where id = v_entry.transaction_id;
  end if;

  update card_installment_entries
     set status = 'pending', paid_at = null, paid_method = null,
         transfer_account_id = null, transaction_id = null
   where id = p_entry
   returning * into v_entry;

  perform write_log(v_entry.shop_id, p_log);
  return v_entry;
end;
$$;

-- ── ตรวจผล: ควรได้ 5 แถว (3 คอลัมน์ + 2 ฟังก์ชัน) ─────────────────────────

select column_name as ชื่อ from information_schema.columns
 where table_schema = 'public' and table_name = 'card_installment_entries'
   and column_name in ('paid_at', 'paid_method', 'transfer_account_id')
union all
select routine_name from information_schema.routines
 where routine_schema = 'public'
   and routine_name in ('pay_installment_entry', 'undo_installment_entry')
 order by 1;
