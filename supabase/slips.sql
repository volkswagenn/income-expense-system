-- ไฟล์: supabase/slips.sql
-- ============================================================================
-- JodFlow — สลิปการจ่ายเงิน   [slips.sql]
--
-- ★ ไฟล์ประจำเรื่อง "สลิป/หลักฐานการจ่าย" ★
-- มีอะไรเปลี่ยนเรื่องสลิปการจ่าย จะถูกเพิ่มลงไฟล์นี้เสมอ ไม่แตกไฟล์ใหม่
-- เวลาอัปเดต: เปิดแท็บเดิมใน SQL Editor ลบของเก่าออก วางไฟล์นี้ทั้งไฟล์ แล้ว Run
--
-- ทุกคำสั่งรันซ้ำได้ ไม่มีคำสั่งลบหรือแก้ข้อมูล
--
-- ── ทำไมเป็นตารางกลาง ไม่ใช่คอลัมน์ในแต่ละตาราง ────────────────────────────
--
-- การจ่ายเงินในระบบมีห้าชนิด อยู่คนละตาราง คนละไฟล์ SQL
--   จ่ายบิลบัตร (card_statement_payments) · จ่ายค่างวดผ่อน (card_installment_entries)
--   จ่ายงวดหนี้ (debt_entries) · จ่ายรายการค้างชำระ (pending_payments)
--   จ่ายรายการประจำ (recurring_entries)
--
-- ถ้าเติมคอลัมน์ทีละตาราง ต้องแก้ RPC จ่ายเงินทั้งห้าตัวเพื่อรับพารามิเตอร์เพิ่ม
-- ซึ่งการเปลี่ยน signature ของฟังก์ชันที่ขยับเงินจริงคือความเสี่ยงที่ไม่คุ้มกับ
-- การเก็บ "ไฟล์แนบ" ที่ไม่ได้กระทบยอดเงินเลย
--
-- ตารางกลางตารางเดียวจึงตอบโจทย์กว่า: เพิ่มสลิปทีหลังได้ ลบสลิปได้โดยไม่แตะเงิน
-- และหน้าประวัติการจ่ายอ่านที่เดียวจบ ไม่ต้อง join ห้าตาราง
--
-- ไฟล์จริงของสลิปอยู่บน Storage bucket 'attachments' เหมือนใบเสร็จ/ใบกำกับภาษี
-- ตารางนี้เก็บแค่พาธ (ดู src/lib/api/attachments.js)
-- ============================================================================

create table if not exists payment_slips (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references shops(id) on delete cascade,

  -- ชนิดของการจ่าย + id ของแถวการจ่ายนั้นในตารางของมันเอง
  -- ไม่ใช้ foreign key เพราะปลายทางเป็นคนละตารางกันตาม kind
  kind       text not null check (kind in
               ('card_bill', 'card_installment', 'debt', 'pending', 'recurring')),
  ref_id     uuid not null,

  -- คัดลอกเวลาที่จ่ายมาไว้ เพื่อเรียงและกรองช่วงเวลาได้โดยไม่ต้องแตะตารางต้นทาง
  paid_at    timestamptz,

  -- [{ path, type, label, uploadedAt }] รูปแบบเดียวกับ transactions.attachments
  attachments jsonb not null default '[]',
  note        text,

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- การจ่ายหนึ่งครั้งมีสลิปได้ชุดเดียว (หลายไฟล์ในชุดเดียวได้) — upsert ทับได้เลย
  unique (kind, ref_id)
);

create index if not exists payment_slips_shop_idx on payment_slips (shop_id, paid_at desc);

do $$
begin
  execute 'alter table payment_slips enable row level security';

  execute 'drop policy if exists payment_slips_select on payment_slips';
  execute 'create policy payment_slips_select on payment_slips for select using (is_member(shop_id))';

  execute 'drop policy if exists payment_slips_insert on payment_slips';
  execute 'create policy payment_slips_insert on payment_slips for insert with check (can_edit(shop_id))';

  execute 'drop policy if exists payment_slips_update on payment_slips';
  execute 'create policy payment_slips_update on payment_slips for update using (can_edit(shop_id)) with check (can_edit(shop_id))';

  execute 'drop policy if exists payment_slips_delete on payment_slips';
  execute 'create policy payment_slips_delete on payment_slips for delete using (can_edit(shop_id))';

  execute 'alter table payment_slips replica identity full';
  begin
    execute 'alter publication supabase_realtime add table payment_slips';
  exception when duplicate_object then null;
  end;
end $$;

-- ล้างข้อมูลทั้งร้านต้องล้างสลิปด้วย ไม่งั้นจะเหลือสลิปที่ชี้ไปยังการจ่ายที่ไม่มีแล้ว
-- (ตัวไฟล์บน Storage ไม่ถูกลบ เพราะเป็นหลักฐานที่ผู้ใช้อาจยังต้องการ)
create or replace function public.clear_payment_slips(p_shop uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_owner(p_shop) then
    raise exception 'เฉพาะเจ้าของร้านเท่านั้นที่ล้างข้อมูลได้' using errcode = '42501';
  end if;
  delete from payment_slips where shop_id = p_shop;
end;
$$;

notify pgrst, 'reload schema';


-- ###########################################################################
-- ##  ตรวจผล — ต้องได้ครบทุกบรรทัด
-- ###########################################################################

select 'ตารางสลิป' as "รายการ",
       case when to_regclass('public.payment_slips') is not null then '✅' else '❌' end as "ผล"
union all
select 'คอลัมน์ครบ',
       case when (select count(*) from information_schema.columns
                   where table_schema = 'public' and table_name = 'payment_slips'
                     and column_name in ('kind','ref_id','paid_at','attachments','note')) = 5
            then '✅' else '❌' end
union all
select 'RLS เปิดครบ',
       case when (select count(*) from pg_policies
                   where schemaname = 'public' and tablename = 'payment_slips') = 4
            then '✅' else '❌' end;
