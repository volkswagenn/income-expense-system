import {
  startOfMonth, endOfMonth, subMonths, subDays, startOfYear, endOfYear,
} from 'date-fns'
import { localDateStr } from './dateUtils'

/**
 * ช่วงวันที่สำเร็จรูปที่ใช้ร่วมกันทั้งระบบ
 * ทุกค่าคำนวณด้วยเวลาท้องถิ่น (ไม่ใช้ UTC) ผ่าน localDateStr
 */
export const ALL_TIME_START = '2000-01-01'
// ของเดิมอ้าง ALL_TIME_END โดยไม่เคยประกาศ → เลือก "ทั้งหมด" แล้วหน้ารายงานพังทั้งหน้า
export const ALL_TIME_END = '2099-12-31'

export const DATE_PRESETS = [
  {
    key: 'today',
    label: 'วันนี้',
    range: () => { const d = localDateStr(); return [d, d] },
  },
  {
    key: 'yesterday',
    label: 'เมื่อวานนี้',
    range: () => { const d = localDateStr(subDays(new Date(), 1)); return [d, d] },
  },
  {
    key: 'last7',
    label: '7 วันล่าสุด',
    range: () => [localDateStr(subDays(new Date(), 6)), localDateStr()],
  },
  {
    key: 'last30',
    label: '30 วันล่าสุด',
    range: () => [localDateStr(subDays(new Date(), 29)), localDateStr()],
  },
  {
    key: 'month',
    label: 'เดือนนี้',
    range: () => [localDateStr(startOfMonth(new Date())), localDateStr(endOfMonth(new Date()))],
  },
  {
    key: 'lastMonth',
    label: 'เดือนที่แล้ว',
    range: () => {
      const d = subMonths(new Date(), 1)
      return [localDateStr(startOfMonth(d)), localDateStr(endOfMonth(d))]
    },
  },
  {
    key: 'year',
    label: 'ปีนี้',
    range: () => [localDateStr(startOfYear(new Date())), localDateStr(endOfYear(new Date()))],
  },
  {
    key: 'all',
    label: 'ทั้งหมด',
    range: () => [ALL_TIME_START, ALL_TIME_END],
  },
  {
    key: 'custom',
    label: 'กำหนดเอง',
    range: null, // เลือกเองจากปฏิทิน
  },
]

export function presetRange(key) {
  const p = DATE_PRESETS.find((x) => x.key === key)
  return p?.range ? p.range() : null
}

/** เดาว่าช่วงที่ให้มาตรงกับ preset ไหน — ใช้ตอนโหลดหน้าครั้งแรก */
export function detectPreset(start, end) {
  for (const p of DATE_PRESETS) {
    if (!p.range) continue
    const [s, e] = p.range()
    if (s === start && e === end) return p.key
  }
  return 'custom'
}
