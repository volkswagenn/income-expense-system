/**
 * รอบของรายการประจำ
 *   monthly = เรียกเก็บทุกเดือน วันที่ billingDay
 *   yearly  = เรียกเก็บปีละครั้ง เดือน billingMonth วันที่ billingDay
 *
 * รายการเก่าที่ไม่มี frequency ถือเป็นรายเดือน
 */

export const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
export const THAI_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

export const FREQUENCY_OPTIONS = [
  { value: 'monthly', label: '🗓️ รายเดือน', desc: 'เรียกเก็บทุกเดือน' },
  { value: 'yearly', label: '📆 รายปี', desc: 'เรียกเก็บปีละครั้ง' },
]

export const isYearly = (item) => item?.frequency === 'yearly'

/** รายการนี้ต้องมี entry ในเดือน (1–12) นี้ไหม */
export function occursInMonth(item, month) {
  if (!isYearly(item)) return true
  return Number(item.billingMonth) === Number(month)
}

/** ข้อความสั้นบอกรอบ เช่น "ทุกวันที่ 4" / "ทุก 4 ม.ค. ของทุกปี" */
export function scheduleLabel(item, { short = false } = {}) {
  if (!isYearly(item)) return short ? `ทุกวันที่ ${item.billingDay}` : `ทุกวันที่ ${item.billingDay} ของเดือน`
  const m = THAI_MONTHS_SHORT[(Number(item.billingMonth) || 1) - 1]
  return short ? `${item.billingDay} ${m} ทุกปี` : `ทุกวันที่ ${item.billingDay} ${m} ของทุกปี`
}

// ── VAT ─────────────────────────────────────────────────────────────────────

/** อัตรา VAT มาตรฐานของไทย เก็บเป็นตัวเลขในฐานข้อมูลเผื่อวันหน้าเปลี่ยน */
export const VAT_RATE = 7

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

export const hasVat = (item) => Number(item?.vatRate ?? 0) > 0

/**
 * ยอดที่เรียกเก็บจริง
 *
 * fixedAmount เก็บ "ยอดก่อน VAT" เสมอ ส่วน vatRate บอกว่าต้องบวกกี่เปอร์เซ็นต์
 * เก็บแยกกันแบบนี้เพื่อให้กดปิด VAT แล้วได้ยอดเดิมกลับมาตรงๆ ถ้าเก็บยอดรวมไว้
 * ค่าเดียว พอเปิดปิดสลับไปมาจะบวกซ้อนกันจนยอดเพี้ยนโดยไม่มีทางย้อนกลับ
 */
export function billedAmount(item) {
  const base = Number(item?.fixedAmount ?? 0)
  const rate = Number(item?.vatRate ?? 0)
  return round2(rate > 0 ? base * (1 + rate / 100) : base)
}

/** ยอดฐาน + VAT จากตัวเลขดิบ ใช้ตอนแสดงตัวอย่างในฟอร์มที่ยังไม่ได้บันทึก */
export function withVat(base, rate) {
  const b = Number(base) || 0
  const r = Number(rate) || 0
  return round2(r > 0 ? b * (1 + r / 100) : b)
}

// ── พักการเรียกเก็บชั่วคราว ─────────────────────────────────────────────────
//
// ต่างจากการปิดใช้งาน
//   พัก     = มีกำหนด ครบแล้วกลับมาเรียกเก็บเอง ระหว่างพักยังเห็นการ์ดอยู่
//   ปิดใช้  = ไม่มีกำหนด หายไปจากทุกหน้า จนกว่าจะกดเปิดเอง
//
// เก็บเป็นเดือนไม่ใช่วัน เพราะรอบเรียกเก็บเป็นรายเดือน การพัก "ครึ่งเดือน"
// ไม่มีความหมายกับบิลที่ออกเดือนละครั้ง

const monthOf = (d) => (d ? String(d).slice(0, 7) : null)

/** จำนวนเดือนจาก a ถึง b (รูปแบบ 'YYYY-MM') */
export function monthDiff(a, b) {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}

/** เลื่อนเดือนไปข้างหน้า n เดือน คืนรูปแบบ 'YYYY-MM' */
export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number)
  const total = (y * 12 + (m - 1)) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

export const monthFirstDay = (month) => `${month}-01`

/**
 * รายการนี้ถูกพักอยู่ในเดือนที่ระบุไหม
 * @returns null ถ้าไม่ได้พัก หรือ { resumeMonth, totalMonths, monthsLeft }
 */
export function pauseInfo(item, month) {
  const resume = monthOf(item?.pausedUntil)
  if (!resume || month >= resume) return null
  const from = monthOf(item.pausedFrom) ?? month
  return {
    resumeMonth: resume,
    totalMonths: Math.max(monthDiff(from, resume), 1),
    monthsLeft: Math.max(monthDiff(month, resume), 1),
  }
}

/** ข้อความบอกสถานะพัก เช่น "พัก 3 เดือน เหลืออีก 2 เดือน กลับมาเรียกเก็บ ธ.ค. 2569" */
export function pauseLabel(info) {
  if (!info) return ''
  const [y, m] = info.resumeMonth.split('-').map(Number)
  return `พัก ${info.totalMonths} เดือน · เหลืออีก ${info.monthsLeft} เดือน · กลับมาเรียกเก็บ ${THAI_MONTHS_SHORT[m - 1]} ${y + 543}`
}
