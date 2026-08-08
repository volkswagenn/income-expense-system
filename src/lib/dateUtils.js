/**
 * ตัวช่วยแปลงวันที่เป็นสตริงตาม "เวลาท้องถิ่น"
 *
 * อย่าใช้ toISOString().slice(0, 10) เพื่อหาวันที่ — มันคืนวันที่แบบ UTC
 * ประเทศไทยเป็น UTC+7 ดังนั้นรายการที่ทำระหว่าง 00:00–07:00 จะถูกนับเป็น
 * "เมื่อวาน" ทำให้หลุดจากตัวกรองวันที่และนับเดือนผิด
 */

function pad(n) {
  return String(n).padStart(2, '0')
}

/** คืนค่า 'yyyy-MM-dd' ตามเวลาท้องถิ่น */
export function localDateStr(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** คืนค่า 'yyyy-MM' ตามเวลาท้องถิ่น */
export function localMonthStr(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
