/**
 * ร้านที่กำลังเปิดอยู่
 *
 * ทุก query ต้องกรองด้วย shop_id เสมอ (RLS กันอีกชั้นที่ฐานข้อมูลอยู่แล้ว แต่ถ้าไม่กรอง
 * ฝั่ง client เวลาเปิดหลายร้านในอนาคตจะได้ข้อมูลปนกัน) เก็บไว้ที่เดียวตรงนี้
 * แทนที่จะส่ง shopId ผ่านทุกฟังก์ชัน — AuthProvider เป็นคนตั้งค่าให้ตอนโหลดร้านเสร็จ
 */
let currentShopId = null
let currentRole = null

export function setShopId(id) {
  currentShopId = id ?? null
}

/** role ของผู้ใช้ในร้านนี้ ('owner' | 'editor' | 'viewer') — AuthProvider ตั้งให้พร้อม shopId */
export function setShopRole(role) {
  currentRole = role ?? null
}

/**
 * แก้ไขข้อมูลได้ไหม — ใช้ที่ชั้น api สำหรับงานที่ "แอบเขียน" ตอนเปิดหน้า
 * (เช่นสร้างรอบรายการประจำของเดือนที่ดู) จะได้ข้ามไปเลยสำหรับ viewer
 * แทนที่จะยิงไปให้ RLS ปฏิเสธแล้วเด้ง error ทุกครั้งที่เปิดหน้า
 */
export function canEditShop() {
  return currentRole === 'owner' || currentRole === 'editor'
}

export function getShopId() {
  if (!currentShopId) {
    throw new Error('ยังไม่ได้เลือกร้าน — เกิดจากเรียก api ก่อนที่ระบบจะโหลดข้อมูลร้านเสร็จ')
  }
  return currentShopId
}

export function hasShop() {
  return Boolean(currentShopId)
}
