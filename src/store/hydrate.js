import { loadAllData } from '../lib/api'
import useAppStore from './useAppStore'
import useCategoryStore from './useCategoryStore'
import useNoteStore from './useNoteStore'
import usePendingStore from './usePendingStore'
import useRecurringStore from './useRecurringStore'
import useTransactionStore from './useTransactionStore'
import useLogStore from './useLogStore'
import useWalletStore from './useWalletStore'

/**
 * เติมข้อมูลจากเซิร์ฟเวอร์เข้า store ทุกตัว — เรียกครั้งเดียวตอนเปิดแอปหลังล็อกอินเสร็จ
 *
 * ประวัติการใช้งาน (useLogStore) ไม่อยู่ในนี้ เพราะโหลดทีละหน้าตอนเปิดหน้าประวัติ
 * จะได้ไม่ดึงข้อมูลเป็นหมื่นแถวมาตั้งแต่เปิดแอป
 */
const STORES = [
  [useWalletStore, (d) => d.wallet],
  [useTransactionStore, (d) => d.transactions],
  [usePendingStore, (d) => d],
  [useRecurringStore, (d) => d],
  [useCategoryStore, (d) => d],
  [useNoteStore, (d) => d.notes],
  [useAppStore, (d) => d.settings],
]

export async function hydrateStores() {
  const data = await loadAllData()
  for (const [store, pick] of STORES) {
    store.getState()._hydrate(pick(data))
  }
  return data
}

/**
 * ล้าง store ทุกตัวตอนออกจากระบบ กันข้อมูลร้านเดิมค้างให้คนถัดไปเห็น
 *
 * ต้องรวม useLogStore ด้วย แม้มันจะไม่ได้อยู่ใน STORES (เพราะโหลดคนละจังหวะ)
 * ไม่งั้นประวัติของร้านเดิมจะยังค้างอยู่ในหน่วยความจำหลังสลับบัญชี
 */
export function resetStores() {
  for (const [store] of STORES) store.getState()._reset()
  useLogStore.getState()._reset()
}
