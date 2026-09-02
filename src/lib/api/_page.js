import { unwrap } from '../supabase'

/**
 * ดึงทุกแถวจริงๆ โดยไม่ชนเพดานของ PostgREST
 *
 * ทำไมต้องมี: Supabase ตั้ง max-rows ไว้ที่ 1,000 แถวต่อ request คำสั่ง select
 * ธรรมดาจึงถูกตัดที่ 1,000 แถวเงียบๆ — ไม่มี error ไม่มีสัญญาณอะไรเลย
 * ผลคือพอข้อมูลโตเกินพัน ผู้ใช้จะเห็นว่า "ข้อมูลเก่าหายไป" ทั้งที่ยังอยู่ในฐานข้อมูลครบ
 * และไฟล์ Backup ที่ดาวน์โหลดก็จะขาดไปเงียบๆ เหมือนกัน ซึ่งอันตรายกว่าไม่มีปุ่มสำรอง
 *
 * ใช้กับทุก query ที่ "ต้องได้ครบทั้งชุด" เช่น รายการ ยอดค้าง รายการประจำ
 *
 * @param build ฟังก์ชันที่คืน query builder ใหม่ทุกครั้ง — ต้องสร้างใหม่ทุกหน้า
 *              เพราะ builder ของ supabase-js ใช้ซ้ำไม่ได้ (ยิงแล้วจบไปเลย)
 *              และต้องมี .order() ที่ผลลัพธ์เรียงคงที่ ไม่งั้นแบ่งหน้าแล้วแถวสลับ
 */
const PAGE_SIZE = 1000

export async function selectAll(build) {
  const rows = []
  for (let page = 0; ; page++) {
    const from = page * PAGE_SIZE
    const chunk = await unwrap(build().range(from, from + PAGE_SIZE - 1))
    if (chunk?.length) rows.push(...chunk)
    // ได้ไม่เต็มหน้า = หมดแล้ว (รวมกรณีหน้าว่างเปล่า)
    if (!chunk || chunk.length < PAGE_SIZE) return rows
  }
}
