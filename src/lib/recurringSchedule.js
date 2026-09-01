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
