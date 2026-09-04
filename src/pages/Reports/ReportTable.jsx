import { useMemo } from 'react'
import useCategoryStore from '../../store/useCategoryStore'
import useCreditCardStore from '../../store/useCreditCardStore'
import { thaiShortDate, THAI_MONTH_SHORT } from '../../lib/dateUtils'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const METHOD_LABEL = {
  cash: 'เงินสด', transfer: 'เงินโอน', card: 'บัตรเครดิต',
  pending: 'ค้างชำระ', debt: 'หนี้สิน', other: 'ช่องทางอื่น',
}

/**
 * ตารางผลลัพธ์ของรายงาน — รูปเดียวทุกประเภท: วันที่ · รายการ · รายรับ · รายจ่าย · สุทธิ
 *
 * ประเภทรายงานไม่ได้เปลี่ยนหน้าตาตาราง แต่เปลี่ยน "วิธีจัดกลุ่มแถว"
 *   daily       จัดกลุ่มตามวัน
 *   category    จัดกลุ่มตามหมวดหมู่
 *   vendor      จัดกลุ่มตามผู้ขาย
 *   method      จัดกลุ่มตามช่องทางจ่าย
 *   installment เฉพาะงวดผ่อนที่ถูกเรียกเก็บแล้ว จัดกลุ่มตามเดือน
 *   tax         เฉพาะรายการที่เกี่ยวกับใบกำกับภาษี จัดกลุ่มตามวัน
 *
 * ตารางรูปเดียวทำให้เทียบข้ามประเภทได้ และไฟล์ที่ส่งออกมีคอลัมน์เท่ากันเสมอ
 */
export function buildReportRows(type, transactions, { getCategoryPath, getCardLabel } = {}) {
  const rows = []
  const add = (key, label, t) => {
    let r = rows.find((x) => x.key === key)
    if (!r) { r = { key, label, date: t.date, inc: 0, exp: 0, count: 0 }; rows.push(r) }
    if (t.type === 'income') r.inc += Number(t.amount) || 0
    else r.exp += Number(t.amount) || 0
    r.count += 1
    if (String(t.date) < String(r.date)) r.date = t.date
  }

  let source = transactions
  if (type === 'installment') source = transactions.filter((t) => !!t.installmentEntryId)
  if (type === 'tax') source = transactions.filter((t) => t.taxStatus && t.taxStatus !== 'none')

  for (const t of source) {
    if (type === 'category') {
      const name = getCategoryPath?.(t.category) || 'ไม่ระบุหมวดหมู่'
      add(`c:${t.category ?? 'none'}`, name, t)
    } else if (type === 'vendor') {
      const name = (t.vendor || '').trim() || 'ไม่ระบุผู้ขาย'
      add(`v:${name}`, name, t)
    } else if (type === 'method') {
      add(`m:${t.method ?? 'other'}`, METHOD_LABEL[t.method] ?? 'ช่องทางอื่น', t)
    } else if (type === 'installment') {
      const key = String(t.date).slice(0, 7)
      const [y, m] = key.split('-').map(Number)
      add(`i:${key}`, `${THAI_MONTH_SHORT[m - 1]} ${y + 543}`, t)
    } else {
      // daily และ tax จัดกลุ่มตามวัน
      add(`d:${t.date}`, t.itemName || thaiShortDate(t.date), t)
    }
  }

  // จัดกลุ่มตามวันให้เรียงตามวัน ที่เหลือเรียงตามยอดที่ขยับมากสุดก่อน
  if (type === 'daily' || type === 'tax' || type === 'installment') {
    rows.sort((a, b) => String(b.date).localeCompare(String(a.date)))
  } else {
    rows.sort((a, b) => (b.inc + b.exp) - (a.inc + a.exp))
  }
  return rows
}

export default function ReportTable({ type, transactions }) {
  const getCategoryPath = useCategoryStore((s) => s.getCategoryPath)
  const getCardLabel = useCreditCardStore((s) => s.getCardLabel)

  const rows = useMemo(
    () => buildReportRows(type, transactions, { getCategoryPath, getCardLabel }),
    [type, transactions, getCategoryPath, getCardLabel],
  )

  if (rows.length === 0) {
    return <p className="text-center text-[13px] text-faint py-10">ไม่มีข้อมูลในช่วงที่เลือก</p>
  }

  const totalInc = rows.reduce((s, r) => s + r.inc, 0)
  const totalExp = rows.reduce((s, r) => s + r.exp, 0)
  const showDate = type === 'daily' || type === 'tax' || type === 'installment'

  return (
    <>
      {rows.map((r) => {
        const net = r.inc - r.exp
        return (
          <div
            key={r.key}
            className="grid grid-cols-[110px_minmax(0,1fr)_130px_130px_130px] gap-2.5 text-[13px] py-2.5 border-b border-[#F2F0EA]"
          >
            <span className="tabular-nums text-muted">{showDate ? thaiShortDate(r.date) : `${r.count} รายการ`}</span>
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="tabular-nums text-right text-income">{r.inc ? fmt(r.inc) : '—'}</span>
            <span className="tabular-nums text-right text-expense">{r.exp ? fmt(r.exp) : '—'}</span>
            <span className={`tabular-nums text-right font-semibold ${net < 0 ? 'text-expense' : ''}`}>{fmt(net)}</span>
          </div>
        )
      })}
      <div className="grid grid-cols-[110px_minmax(0,1fr)_130px_130px_130px] gap-2.5 text-[13px] py-2.5 font-semibold border-t border-hairline">
        <span />
        <span>รวมทั้งหมด</span>
        <span className="tabular-nums text-right text-income">{fmt(totalInc)}</span>
        <span className="tabular-nums text-right text-expense">{fmt(totalExp)}</span>
        <span className="tabular-nums text-right">{fmt(totalInc - totalExp)}</span>
      </div>
    </>
  )
}
