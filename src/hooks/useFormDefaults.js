import { useCallback, useSyncExternalStore } from 'react'

/**
 * ค่าเริ่มต้นของฟอร์มบันทึกรายการ — เก็บในเครื่อง ไม่ได้เก็บบนเซิร์ฟเวอร์
 *
 * ทำไมไม่เก็บที่ shop_settings เหมือนค่าเตือนล่วงหน้า
 *   สองค่านี้เป็นความเคยชินของคนกรอก ไม่ใช่นโยบายของร้าน คนหน้าร้านที่รับเงินสด
 *   กับเจ้าของที่จ่ายผ่านบัญชีควรตั้งคนละอย่างได้ ถ้าเก็บระดับร้านจะทับกันเอง
 *   และไม่ต้องเพิ่มคอลัมน์ในฐานข้อมูลให้ต้องรัน SQL เพิ่มอีกไฟล์
 *
 * ผลข้างเคียงที่ยอมรับ: เปลี่ยนเครื่องแล้วต้องตั้งใหม่
 */
const KEY = 'jodflow.formDefaults'

const DEFAULTS = {
  method: 'cash',        // ช่องทางจ่ายที่เลือกไว้ให้ตอนเปิดฟอร์ม
  reopenAfterSave: true, // บันทึกแล้วล้างฟอร์มให้กรอกต่อทันที
}

const METHOD_LABEL = {
  cash: 'เงินสด', transfer: 'เงินโอน', card: 'บัตรเครดิต', pending: 'ค้างชำระ',
}

let cache = read()
const listeners = new Set()

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

function emit() {
  listeners.forEach((fn) => fn())
}

export function setFormDefaults(patch) {
  cache = { ...cache, ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(cache)) } catch { /* โหมดส่วนตัวเขียนไม่ได้ ไม่เป็นไร */ }
  emit()
}

export function getFormDefaults() {
  return cache
}

export function formMethodLabel(method) {
  return METHOD_LABEL[method] ?? 'เงินสด'
}

/** อ่านค่าแบบ subscribe — ทุกที่ที่ใช้จะอัปเดตพร้อมกันเมื่อค่าถูกแก้ */
export default function useFormDefaults() {
  const subscribe = useCallback((fn) => {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])
  return useSyncExternalStore(subscribe, getFormDefaults, getFormDefaults)
}
