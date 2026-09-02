-- ไฟล์: supabase/check.sql
-- ============================================================================
-- JodFlow — ตรวจว่าข้อมูลหายจริงไหม   [check.sql]
--
-- อ่านอย่างเดียว ไม่แก้ไขอะไรทั้งสิ้น รันซ้ำได้ตลอด
-- วิธีใช้: Supabase → SQL Editor → วางทั้งไฟล์ → Run   (คำตอบออกมาเป็นตารางเดียว)
--
-- เขียนรวมเป็น query เดียวเพราะ SQL Editor ของ Supabase แสดงผลเฉพาะคำสั่งสุดท้าย
-- ถ้าแยกเป็นหลาย select จะเห็นแค่อันท้ายสุด แล้วเข้าใจผิดว่าที่เหลือไม่มีผลลัพธ์
--
-- อ่านผลตามคอลัมน์ "หัวข้อ" 5 กลุ่ม
--   1 ข้อมูลในแต่ละร้าน   → ถ้าตัวเลขไม่เป็น 0 = ข้อมูลไม่ได้หาย แอปแค่อ่านไม่เห็น
--   2 บัญชีเข้าร้านไหนได้  → แอปเลือกร้านที่เป็นสมาชิกเก่าที่สุดเสมอ
--   3 ร้านที่ไม่มี owner   → ข้อมูลอยู่ครบแต่ RLS บล็อก แก้ด้วย access.sql
--   4 ร่องรอยการลบ        → มีบรรทัด = ถูกลบจากในแอป, ไม่มี = ถูกลบจากนอกแอป
--   5 คอลัมน์ที่ติดตั้งแล้ว → ต้องครบ 3 ตัว ถ้าขาดให้รัน yearly.sql และ keep.sql
-- ============================================================================

select * from (

  -- ── 1. ข้อมูลในแต่ละร้านเหลืออยู่เท่าไร ───────────────────────────────────
  select
    1                                        as "ลำดับ",
    '1 ข้อมูลในร้าน'                          as "หัวข้อ",
    s.name || '  (' || s.id || ')'           as "รายการ",
    'รายการประจำ '   || (select count(*) from recurring_items   x where x.shop_id = s.id) ||
    ' · รอบประจำ '   || (select count(*) from recurring_entries x where x.shop_id = s.id) ||
    ' · รับจ่าย '    || (select count(*) from transactions      x where x.shop_id = s.id) ||
    ' · ค้างชำระ '   || (select count(*) from pending_payments  x where x.shop_id = s.id) ||
    ' · หมวดหมู่ '   || (select count(*) from categories        x where x.shop_id = s.id) ||
    ' · ประวัติ '    || (select count(*) from activity_logs     x where x.shop_id = s.id)
                                             as "ผล"
  from shops s

  union all

  -- ── 2. บัญชีนี้เข้าร้านไหนได้บ้าง และแอปจะเลือกร้านไหน ────────────────────
  select
    2,
    '2 บัญชีและร้าน',
    u.email || '  →  ' || sh.name,
    'สิทธิ์ ' || m.role ||
    ' · เป็นสมาชิกลำดับที่ ' ||
      row_number() over (partition by u.id order by m.created_at) ||
      case when row_number() over (partition by u.id order by m.created_at) = 1
           then '  ← แอปเลือกร้านนี้' else '' end
  from auth.users u
  join shop_members m on m.user_id = u.id
  join shops sh       on sh.id = m.shop_id

  union all

  -- ── 3. ร้านที่ไม่มี owner เหลืออยู่ ──────────────────────────────────────
  select 3, '3 ร้านไม่มี owner', s.name || '  (' || s.id || ')', 'ต้องซ่อมด้วย access.sql'
  from shops s
  where not exists (
    select 1 from shop_members m where m.shop_id = s.id and m.role = 'owner'
  )

  union all

  select 3, '3 ร้านไม่มี owner', '—', 'ไม่พบ (ปกติ)'
  where not exists (
    select 1 from shops s
    where not exists (
      select 1 from shop_members m where m.shop_id = s.id and m.role = 'owner'
    )
  )

  union all

  -- ── 4. ร่องรอยการลบใน log ของแอป (10 รายการล่าสุด) ───────────────────────
  select 4, '4 ร่องรอยการลบ',
         to_char(l."timestamp", 'YYYY-MM-DD HH24:MI') || '  ' || l.activity_type,
         left(l.description, 120)
  from (
    select * from activity_logs
     where activity_type in ('RECURRING_DELETE', 'CLEAR_DATA', 'DELETE_TRANSACTION', 'IMPORT_DATA')
        or description ilike '%ลบ%' or description ilike '%ล้าง%'
     order by "timestamp" desc
     limit 10
  ) l

  union all

  select 4, '4 ร่องรอยการลบ', '—', 'ไม่พบการลบในแอป'
  where not exists (
    select 1 from activity_logs
     where activity_type in ('RECURRING_DELETE', 'CLEAR_DATA', 'DELETE_TRANSACTION', 'IMPORT_DATA')
        or description ilike '%ลบ%' or description ilike '%ล้าง%'
  )

  union all

  -- ── 5. คอลัมน์ใหม่ติดตั้งครบหรือยัง (ต้องได้ครบ 3 ตัว) ────────────────────
  select 5, '5 คอลัมน์ที่ต้องมี', t.col,
         case when exists (
           select 1 from information_schema.columns c
            where c.table_schema = 'public' and c.table_name = 'recurring_items'
              and c.column_name = t.col
         ) then 'ติดตั้งแล้ว'
            else 'ยังไม่มี → รัน ' || t.file end
  from (values
    ('frequency',     'yearly.sql'),
    ('billing_month', 'yearly.sql'),
    ('deleted',       'keep.sql')
  ) as t(col, file)

) as "ผลตรวจ"
order by "ลำดับ", "รายการ";
