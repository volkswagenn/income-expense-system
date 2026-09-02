-- ไฟล์: supabase/categories.sql
-- ============================================================================
-- JodFlow — หมวดหมู่ ทั้งส่วนที่เพิ่มทีหลัง   [categories.sql]
--
-- ★ ไฟล์ประจำเรื่อง "หมวดหมู่" ★
-- มีอะไรเปลี่ยนเรื่องหมวดหมู่ จะถูกเพิ่มลงไฟล์นี้เสมอ ไม่แตกไฟล์ใหม่
-- เวลาอัปเดต: เปิดแท็บเดิมใน SQL Editor ลบของเก่าออก วางไฟล์นี้ทั้งไฟล์ แล้ว Run
--
-- ทุกคำสั่งรันซ้ำได้ ไม่มีคำสั่งลบหรือแก้ข้อมูล
-- ฐานข้อมูลใหม่เอี่ยมไม่ต้องรัน ใช้ setup.sql ไฟล์เดียวจบ
--
-- สิ่งที่อยู่ในไฟล์นี้
--   ลากจัดลำดับหมวดหมู่เอง (sort_order + ฟังก์ชันเขียนลำดับทั้งชุดในครั้งเดียว)
-- ============================================================================



alter table categories add column if not exists sort_order int not null default 0;

create index if not exists categories_sort_idx
  on categories (shop_id, type, sort_order, created_at);

-- ── จัดลำดับใหม่ทั้งชุดในครั้งเดียว ────────────────────────────────────────
--
-- รับ id เรียงตามลำดับที่ต้องการ แล้วเขียน sort_order ตามตำแหน่งในอาเรย์
-- ต้องทำเป็นคำสั่งเดียว ไม่ใช่ยิงอัปเดตทีละแถวจากหน้าจอ เพราะถ้าเน็ตหลุดกลางทาง
-- จะได้ลำดับที่ครึ่งเก่าครึ่งใหม่ แล้วหมวดหมู่จะสลับตำแหน่งมั่วโดยไม่มีใครรู้

create or replace function public.reorder_categories(
  p_shop uuid,
  p_ids  uuid[]
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform assert_can_edit(p_shop);

  update categories c
     set sort_order = pos.idx
    from unnest(p_ids) with ordinality as pos(id, idx)
   where c.id = pos.id
     and c.shop_id = p_shop;
end;
$$;

-- ── ตรวจผล: ควรได้ 2 แถว ───────────────────────────────────────────────────

select 'คอลัมน์' as ประเภท, column_name as ชื่อ
  from information_schema.columns
 where table_schema = 'public' and table_name = 'categories' and column_name = 'sort_order'
union all
select 'ฟังก์ชัน', routine_name
  from information_schema.routines
 where routine_schema = 'public' and routine_name = 'reorder_categories'
 order by 1;
