-- ไฟล์: supabase/category-sort.sql
-- ============================================================================
-- JodFlow — จัดเรียงลำดับหมวดหมู่เอง   [category-sort.sql]
--
-- ฐานข้อมูลใหม่ไม่ต้องรัน (setup.sql มีอยู่แล้ว)
-- ฐานข้อมูลที่ติดตั้งไปแล้ว: Supabase → SQL Editor → Role = postgres → วางทั้งไฟล์ → Run
-- รันซ้ำได้ ไม่ลบข้อมูล
--
-- เดิมหมวดหมู่เรียงตามวันที่สร้างอย่างเดียว ย้ายลำดับไม่ได้ พอมีหมวดหมู่เยอะ
-- ตัวที่ใช้บ่อยจะจมอยู่ล่างสุดเพราะเพิ่งสร้าง
--
-- sort_order เริ่มที่ 0 ทุกแถว การเรียงจึงยังเหมือนเดิมจนกว่าจะลากจัดครั้งแรก
-- (เรียงด้วย sort_order ก่อน แล้วค่อย created_at เป็นตัวตัดสินเมื่อเท่ากัน)
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

-- ── ตรวจผล: ควรได้ 2 แถว (คอลัมน์ + ฟังก์ชัน) ─────────────────────────────

select column_name as ชื่อ from information_schema.columns
 where table_schema = 'public' and table_name = 'categories' and column_name = 'sort_order'
union all
select routine_name from information_schema.routines
 where routine_schema = 'public' and routine_name = 'reorder_categories'
 order by 1;
