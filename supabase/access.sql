-- ไฟล์: supabase/access.sql
-- ============================================================================
-- JodFlow — ซ่อมสิทธิ์เข้าถึงร้าน   [access.sql]
--
-- ใช้เมื่อ check.sql หัวข้อ 3 ขึ้นว่ามีร้านที่ไม่มี owner
-- หรือข้อมูลยังนับได้ในหัวข้อ 1 แต่แอปแสดงว่าว่างเปล่า
--
-- สาเหตุ: แถวใน shop_members หายไป ทำให้ RLS ปฏิเสธทุก query ของร้านนั้น
--
-- วิธีใช้ 2 รอบ
--   รอบแรก  วางทั้งไฟล์ → Run  ยังไม่แก้อะไร แค่แสดงตารางบัญชีและร้านให้ดู
--   รอบสอง  เอา user_id กับ shop_id จากตารางนั้นมาใส่ใน 2 บรรทัดที่มีเครื่องหมาย ←
--           แล้ว Run อีกครั้ง สิทธิ์จะถูกคืนให้ทันที
--
-- ปลอดภัยที่จะรันทั้งไฟล์รวดเดียว ตราบใดที่ยังไม่ได้ใส่ค่า จะไม่มีอะไรถูกแก้
-- ============================================================================

do $fix$
declare
  -- ↓↓↓ แก้ 2 บรรทัดนี้ในรอบสอง (คัดลอกค่ามาจากตารางผลลัพธ์ด้านล่าง) ↓↓↓
  v_shop uuid := '00000000-0000-0000-0000-000000000000';   -- ← shop_id ของร้านที่มีข้อมูล
  v_user uuid := '00000000-0000-0000-0000-000000000000';   -- ← user_id ของบัญชีที่จะให้เป็นเจ้าของ
  -- ↑↑↑ แก้แค่ 2 บรรทัดนี้ ที่เหลือไม่ต้องแตะ ↑↑↑
  v_placeholder uuid := '00000000-0000-0000-0000-000000000000';
begin
  if v_shop = v_placeholder or v_user = v_placeholder then
    raise notice 'ยังไม่ได้ใส่ค่า — ดูตารางข้างล่าง แล้วเอา shop_id กับ user_id มาใส่ในบรรทัดที่มี ← จากนั้นรันไฟล์นี้อีกครั้ง';
    return;
  end if;

  if not exists (select 1 from shops where id = v_shop) then
    raise exception 'ไม่มีร้าน id = %  (คัดลอก shop_id ผิดหรือเปล่า)', v_shop;
  end if;

  if not exists (select 1 from auth.users where id = v_user) then
    raise exception 'ไม่มีผู้ใช้ id = %  (คัดลอก user_id ผิดหรือเปล่า)', v_user;
  end if;

  insert into shop_members (shop_id, user_id, role)
  values (v_shop, v_user, 'owner')
  on conflict (shop_id, user_id) do update set role = 'owner';

  raise notice 'คืนสิทธิ์ owner ให้ % ในร้าน % เรียบร้อย', v_user, v_shop;
end
$fix$;

-- ── ตารางอ้างอิง: คัดลอก id จากตรงนี้ไปใส่ข้างบน และใช้ตรวจผลหลังแก้ ────────
-- แถว "บัญชี"  → เอาค่าในคอลัมน์ id ไปใส่ที่ v_user
-- แถว "ร้าน"   → เอาค่าในคอลัมน์ id ไปใส่ที่ v_shop (เลือกร้านที่มีข้อมูลอยู่จริง)
-- แถว "สิทธิ์" → ผลลัพธ์ปัจจุบัน ใครเป็นอะไรในร้านไหน

select * from (

  select 1 as "ลำดับ", 'บัญชี' as "ประเภท", u.id::text as "id",
         u.email as "ชื่อ", to_char(u.created_at, 'YYYY-MM-DD') as "หมายเหตุ"
  from auth.users u

  union all

  select 2, 'ร้าน', s.id::text, s.name,
         'รับจ่าย ' || (select count(*) from transactions   t where t.shop_id = s.id) ||
         ' · ประจำ ' || (select count(*) from recurring_items r where r.shop_id = s.id)
  from shops s

  union all

  select 3, 'สิทธิ์', m.shop_id::text, u.email || ' → ' || sh.name, m.role
  from shop_members m
  join auth.users u on u.id = m.user_id
  join shops sh     on sh.id = m.shop_id

) as "อ้างอิง"
order by "ลำดับ", "ชื่อ";

-- หมายเหตุ: แอปเลือกร้านที่บัญชีนี้ "เป็นสมาชิกเก่าที่สุด" เสมอ
-- ถ้าอยู่หลายร้านแล้วร้านที่มีข้อมูลไม่ถูกเลือก ให้ถอนตัวออกจากร้านที่ไม่ใช้
-- (ลบเฉพาะสิทธิ์เข้าถึง ข้อมูลของร้านนั้นยังอยู่ครบ) โดยแก้ค่าแล้วรันบรรทัดนี้เดี่ยวๆ
--   delete from shop_members where shop_id = '<ร้านที่ไม่ใช้>' and user_id = '<user_id>';
