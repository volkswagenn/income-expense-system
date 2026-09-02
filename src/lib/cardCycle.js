/**
 * รอบบิลบัตรเครดิต — วันสรุปยอดและวันครบกำหนดชำระ
 *
 * กฎที่ใช้ทั้งไฟล์
 *   • วันสรุปยอด (closingDay) คือวันสุดท้ายของรอบ รายการที่ทำ "ถึงวันนั้น" ยังนับอยู่ในรอบนั้น
 *   • วันครบกำหนด (dueDay) คือวันที่ dueDay ครั้งแรกที่มา "หลัง" วันสรุปยอด
 *     สูตรเดียวนี้ครอบคลุมทั้งสองแบบที่เจอจริง โดยไม่ต้องให้ผู้ใช้เลือกว่าเดือนไหน
 *       สรุปยอด 25 ครบกำหนด 15 → ได้วันที่ 15 ของเดือนถัดไป
 *       สรุปยอด 5  ครบกำหนด 25 → ได้วันที่ 25 ของเดือนเดียวกัน
 *   • วันที่ 31 ในเดือนที่ไม่มีวันที่ 31 จะถูกหนีบเป็นวันสุดท้ายของเดือนนั้น
 *     (วิธีเดียวกับ computeDueDate ของรายการประจำ)
 */

const THAI_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

/** เที่ยงคืนของวันนั้นตามเวลาเครื่อง — ตัดเวลาออกให้เทียบวันกันได้ตรงๆ */
function atMidnight(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function lastDayOfMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

/** วันที่ day ของเดือนนั้น หนีบไม่ให้ล้นเดือน (31 ก.พ. → 28 หรือ 29) */
export function clampedDate(year, month, day) {
  return new Date(year, month, Math.min(day, lastDayOfMonth(year, month)))
}

/**
 * วันสรุปยอดครั้งถัดไปที่ยังไม่ผ่าน (นับวันนี้ด้วย)
 * รูดวันนี้จะไปอยู่ในบิลที่ปิดวันนี้
 */
export function nextClosingDate(closingDay, from = new Date()) {
  const today = atMidnight(from)
  const thisMonth = clampedDate(today.getFullYear(), today.getMonth(), closingDay)
  if (thisMonth >= today) return thisMonth
  return clampedDate(today.getFullYear(), today.getMonth() + 1, closingDay)
}

/** วันครบกำหนดของบิลที่ปิดในวันที่ closingDate — วันที่ dueDay ครั้งแรกหลังจากนั้น */
export function dueDateFor(closingDate, dueDay) {
  const sameMonth = clampedDate(closingDate.getFullYear(), closingDate.getMonth(), dueDay)
  if (sameMonth > closingDate) return sameMonth
  return clampedDate(closingDate.getFullYear(), closingDate.getMonth() + 1, dueDay)
}

/** วันครบกำหนดของบิลที่รายการวันนี้จะไปตกอยู่ */
export function nextDueDate(closingDay, dueDay, from = new Date()) {
  return dueDateFor(nextClosingDate(closingDay, from), dueDay)
}

/**
 * ขอบเขตของรอบบิลที่ครอบวันที่ที่ระบุ
 * คืน { start, end, due, cycle } โดย cycle เป็น 'YYYY-MM' ของเดือนที่ปิดรอบ
 * ใช้ตอนปิดรอบในเฟสถัดไป และใช้ตอบว่า "รายการนี้อยู่บิลไหน" ได้เลย
 */
export function cyclePeriod(closingDay, dueDay, on = new Date()) {
  const end = nextClosingDate(closingDay, on)
  // ต้นรอบคือวันถัดจากวันสรุปยอดของรอบก่อนหน้า
  const prevClosing = clampedDate(end.getFullYear(), end.getMonth() - 1, closingDay)
  const start = new Date(prevClosing.getFullYear(), prevClosing.getMonth(), prevClosing.getDate() + 1)
  const cycle = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`
  return { start, end, due: dueDateFor(end, dueDay), cycle }
}

/** จำนวนวันจากวันนี้ถึงวันที่ระบุ — ติดลบแปลว่าเลยมาแล้ว */
export function daysUntil(date, from = new Date()) {
  const MS_PER_DAY = 86_400_000
  return Math.round((atMidnight(date) - atMidnight(from)) / MS_PER_DAY)
}

/** '15 ต.ค. 2569' — ปี พ.ศ. ตามที่ใช้ทั้งแอป */
export function formatThaiDate(date) {
  if (!date) return '-'
  return `${date.getDate()} ${THAI_MONTHS[date.getMonth()]} ${date.getFullYear() + 543}`
}

/** 'yyyy-MM-dd' สำหรับส่งเข้าฐานข้อมูล — ห้ามใช้ toISOString เพราะจะเลื่อนตามโซนเวลา */
export function toDateString(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}
