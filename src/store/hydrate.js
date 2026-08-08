import { loadAllData } from '../lib/api'
import useCategoryStore from './useCategoryStore'
import useNoteStore from './useNoteStore'

/**
 * เติมข้อมูลจากเซิร์ฟเวอร์เข้า store ทุกตัว — เรียกครั้งเดียวตอนเปิดแอปหลังล็อกอินเสร็จ
 *
 * ระหว่างที่ยังย้าย store ไม่ครบ ตัวที่ยังไม่มี _hydrate จะถูกข้ามไปเงียบๆ
 * (ยังทำงานบน localStorage แบบเดิมอยู่) — รายการที่ย้ายแล้วอยู่ใน MIGRATED ข้างล่าง
 */
const MIGRATED = [
  [useCategoryStore, (d) => d],
  [useNoteStore, (d) => d.notes],
]

export async function hydrateStores() {
  const data = await loadAllData()
  for (const [store, pick] of MIGRATED) {
    store.getState()._hydrate(pick(data))
  }
  return data
}
