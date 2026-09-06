import { THAI_MONTH_SHORT } from './dateUtils'

/**
 * ใบแจ้งยอดรายบัญชี — สร้างจาก activity_logs ไม่ใช่จากตารางรายการ
 *
 * เหตุผล: เงินในบัญชีขยับได้หลายทางที่ไม่ใช่ "รายรับ-รายจ่าย" เช่น ย้ายเงินระหว่างบัญชี
 * ฝาก/ถอนกระเป๋าย่อย คืนเงินที่ยืม หรือจ่ายบิลบัตร ถ้าไล่จากตาราง transactions อย่างเดียว
 * ยอดคงเหลือจะไม่ตรงกับยอดจริง — log เป็นที่เดียวที่บันทึกครบทุกทาง (ดู walletEngine.js)
 *
 * ยอดคงเหลือปลายเดือนไล่ถอยหลังจาก "ยอดตอนนี้" ไม่ได้บวกไปข้างหน้าจากศูนย์
 * เพราะยอดตอนนี้คือค่าที่ฐานข้อมูลถือไว้จริง ส่วน log อาจเริ่มหลังจากที่ร้านเปิดใช้ระบบ
 */

/** ขาของ log ใบหนึ่ง — ใบเก่าที่ยังไม่มี legs ให้ถือว่ามีขาเดียวตามรูปแบบเดิม */
export function legsOf(log) {
  const eff = log?.walletEffect
  if (!eff) return []
  if (Array.isArray(eff.legs) && eff.legs.length > 0) return eff.legs
  return [eff]
}

/** ยอดที่ log ใบนี้ทำให้บัญชีเงินโอนใบนั้นขยับ (บวก = เงินเข้า) */
export function deltaForAccount(log, accountId) {
  return legsOf(log)
    .filter((l) => l?.target === 'transfer' && l?.transferAccountId === accountId)
    .reduce((s, l) => s + (Number(l.delta) || 0), 0)
}

/** ยอดที่ log ใบนี้ทำให้กระเป๋าตังค์ย่อยใบนั้นขยับ */
export function deltaForSubWallet(log, subId) {
  return legsOf(log)
    .filter((l) => l?.target === `sub:${subId}`)
    .reduce((s, l) => s + (Number(l.delta) || 0), 0)
}

const monthKey = (iso) => String(iso ?? '').slice(0, 7)

export function monthLabel(key) {
  const [y, m] = String(key).split('-').map(Number)
  if (!y || !m) return key
  return `${THAI_MONTH_SHORT[m - 1]} ${y + 543}`
}

/**
 * รายการเดินบัญชีรายเดือนของหนึ่งปี
 *
 * @param logs           log ที่มี walletEffect เรียงจากเก่าไปใหม่
 * @param getDelta       ฟังก์ชันหายอดที่ขยับของ log หนึ่งใบ
 * @param currentBalance ยอดคงเหลือตอนนี้ (ค่าจริงจากฐานข้อมูล)
 * @param year           ปี ค.ศ. ที่ต้องการดู
 * @returns { rows, opening } — rows เรียงจากเดือนแรกของปี
 */
export function buildYearStatement({ logs, getDelta, currentBalance, year }) {
  const moves = []
  for (const log of logs) {
    const delta = getDelta(log)
    if (delta) moves.push({ key: monthKey(log.timestamp), delta, log })
  }

  // ยอดปลายเดือน = ยอดตอนนี้ ลบทุกความเคลื่อนไหวที่เกิดหลังเดือนนั้น
  const totalAfter = (key) =>
    moves.filter((m) => m.key > key).reduce((s, m) => s + m.delta, 0)

  const rows = []
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`
    const inMonth = moves.filter((x) => x.key === key)
    const income = inMonth.reduce((s, x) => s + (x.delta > 0 ? x.delta : 0), 0)
    const expense = inMonth.reduce((s, x) => s + (x.delta < 0 ? -x.delta : 0), 0)
    const closing = currentBalance - totalAfter(key)
    rows.push({
      key,
      label: monthLabel(key),
      income,
      expense,
      net: income - expense,
      closing,
      opening: closing - (income - expense),
      count: inMonth.length,
    })
  }
  return { rows, opening: rows[0]?.opening ?? currentBalance }
}

/** ความเคลื่อนไหวรายบรรทัดของเดือนหนึ่ง พร้อมยอดคงเหลือหลังรายการนั้น */
export function buildMonthEntries({ logs, getDelta, currentBalance, monthKey: key }) {
  const moves = []
  for (const log of logs) {
    const delta = getDelta(log)
    if (delta) moves.push({ key: monthKey(log.timestamp), delta, log })
  }
  const after = moves.filter((m) => m.key > key).reduce((s, m) => s + m.delta, 0)
  const closing = currentBalance - after

  const inMonth = moves.filter((m) => m.key === key)
  // ไล่ถอยหลังจากยอดปลายเดือนเพื่อหายอดคงเหลือหลังแต่ละรายการ
  let running = closing
  const rows = []
  for (let i = inMonth.length - 1; i >= 0; i--) {
    const m = inMonth[i]
    rows.unshift({
      id: m.log.id,
      timestamp: m.log.timestamp,
      description: m.log.description ?? m.log.activityType,
      activityType: m.log.activityType,
      delta: m.delta,
      balance: running,
    })
    running -= m.delta
  }
  return { rows, opening: running, closing }
}

/** ปีที่มีความเคลื่อนไหว (ค.ศ.) เรียงจากใหม่ไปเก่า — ใส่ปีปัจจุบันไว้เสมอ */
export function yearsWithMovement(logs, getDelta) {
  const set = new Set([new Date().getFullYear()])
  for (const log of logs) {
    if (getDelta(log)) set.add(Number(String(log.timestamp).slice(0, 4)))
  }
  return [...set].filter(Boolean).sort((a, b) => b - a)
}

/** ยอดที่ log ใบนี้ทำให้เงินสดในร้านขยับ (บวก = เงินเข้า) */
export function deltaForCash(log) {
  return legsOf(log)
    .filter((l) => l?.target === 'cash')
    .reduce((s, l) => s + (Number(l.delta) || 0), 0)
}
