import { lazy } from 'react'

/**
 * โหลดหน้าที่แยกไฟล์ พร้อมกู้สถานการณ์เมื่อไฟล์ของ build เก่าหายไปแล้ว
 *
 * อาการที่เจอจริงบนของที่ deploy แล้ว: เปิดแอปค้างไว้ในแท็บ แล้วมี deploy ใหม่ทับ
 * ไฟล์ที่ build ออกมามีแฮชติดในชื่อ (index-2Rk1hBNI.js) พอ deploy ใหม่ของเดิมก็หายจากเซิร์ฟเวอร์
 * แท็บที่เปิดค้างยังถือ index.html ของ build เก่าอยู่ พอกดเข้าหน้าที่โหลดแยก
 * (ประวัติทั้งหมด · ตั้งค่า · จัดการข้อมูล · รายงาน · นำเข้า · สำรองข้อมูล)
 * เบราว์เซอร์จึงไปขอไฟล์ที่ไม่มีแล้ว → "Failed to fetch dynamically imported module"
 *
 * ทางแก้คือโหลดหน้าใหม่ให้เอง จะได้ index.html ชุดใหม่ที่ชี้ไปไฟล์ที่มีอยู่จริง
 * กันวนไม่จบด้วยการเว้นระยะ — ถ้าเพิ่งรีโหลดไปไม่ถึง 1 นาทีแล้วยังพังอีก แปลว่าไม่ใช่เรื่อง
 * deploy (เช่นเน็ตหลุดหรือไฟล์เสียจริง) ปล่อยให้ error ลอยขึ้นไปให้หน้าแจ้งเตือนรับแทน
 */
export const RELOAD_KEY = 'jodflow.staleChunkReload'
export const RELOAD_GAP = 60_000

/**
 * @param load   ฟังก์ชันที่คืน promise ของ dynamic import
 * @param deps   ตัวแทนของ global ไว้ให้เทสต์ส่งของปลอมเข้ามาได้
 */
export function retryOnStaleChunk(load, deps = {}) {
  const store = deps.storage ?? (typeof sessionStorage === 'undefined' ? null : sessionStorage)
  const reload = deps.reload ?? (() => window.location.reload())
  const now = deps.now ?? (() => Date.now())

  return load().catch((err) => {
    const last = Number(store?.getItem(RELOAD_KEY)) || 0
    if (now() - last < RELOAD_GAP) throw err
    store?.setItem(RELOAD_KEY, String(now()))
    reload()
    // ค้าง promise ไว้เฉยๆ ระหว่างรอหน้ารีโหลด ไม่ต้องให้ React วาดหน้า error แว่บหนึ่ง
    return new Promise(() => {})
  })
}

/** ใช้แทน React.lazy สำหรับหน้าที่โหลดแยกไฟล์ */
export default function lazyPage(load) {
  return lazy(() => retryOnStaleChunk(load))
}
