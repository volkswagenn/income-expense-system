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

const THAI_DOW = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const THAI_MONTH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const THAI_MONTH_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

/** 'พฤหัสบดี 3 กันยายน 2569' — ใช้บนหัวเรื่องของหน้าที่ผูกกับวันนี้ */
export function thaiFullDate(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${THAI_DOW[d.getDay()]} ${d.getDate()} ${THAI_MONTH[d.getMonth()]} ${d.getFullYear() + 543}`
}

/** '3 ก.ย. 2569' */
export function thaiShortDate(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getDate()} ${THAI_MONTH_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`
}

/** 'กันยายน 2569' — หัวปฏิทิน */
export function thaiMonthLabel(year, monthIndex) {
  return `${THAI_MONTH[monthIndex]} ${year + 543}`
}

export { THAI_MONTH, THAI_MONTH_SHORT, THAI_DOW }
