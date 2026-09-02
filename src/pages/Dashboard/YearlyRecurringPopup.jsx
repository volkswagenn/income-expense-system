import useCategoryStore from '../../store/useCategoryStore'
import {
  billedAmount, monthDiff, pauseInfo, THAI_MONTHS_SHORT, vatLabel,
} from '../../lib/recurringSchedule'
import { localMonthStr } from '../../lib/dateUtils'

/**
 * รายจ่ายประจำแบบรายปีทั้งหมด
 *
 * ทำไมต้องมีหน้าต่างนี้: รายปีโผล่ในปฏิทินแค่เดือนเดียวจาก 12 เดือน อีก 11 เดือน
 * มันหายไปจากสายตาทั้งที่ยอดมักก้อนใหญ่ ผู้ใช้จึงลืมแล้วเจอเซอร์ไพรส์
 * ที่นี่รวมไว้ที่เดียว เรียงตามรอบที่จะถึงก่อน พร้อมบอกว่าอีกกี่เดือน
 */

/** อีกกี่เดือนจะถึงรอบถัดไป (0 = เดือนนี้) */
function monthsUntilNext(item, thisMonth) {
  const [y] = thisMonth.split('-').map(Number)
  const billing = Number(item.billingMonth) || 1
  const thisYear = `${y}-${String(billing).padStart(2, '0')}`
  const diff = monthDiff(thisMonth, thisYear)
  return diff >= 0 ? diff : monthDiff(thisMonth, `${y + 1}-${String(billing).padStart(2, '0')}`)
}

export default function YearlyRecurringPopup({ items, entries, onClose }) {
  const { getCategoryName, getCategories } = useCategoryStore()
  const categories = getCategories('expense')
  const thisMonth = localMonthStr()
  const thisYear = Number(thisMonth.split('-')[0])

  const rows = items
    .map((item) => {
      const billing = Number(item.billingMonth) || 1
      const dueMonth = `${thisYear}-${String(billing).padStart(2, '0')}`
      const entry = entries.find((e) => e.recurringId === item.id && e.month === dueMonth)
      const cat = categories.find((c) => c.id === item.category)
      return {
        item,
        billing,
        left: monthsUntilNext(item, thisMonth),
        status: entry?.status ?? 'pending',
        paidAmount: entry?.status === 'paid' ? entry.amount : null,
        catName: cat ? cat.name : getCategoryName(item.category) || 'หมวดหมู่ถูกลบ',
        paused: pauseInfo(item, thisMonth),
      }
    })
    .sort((a, b) => a.left - b.left || a.item.billingDay - b.item.billingDay)

  const yearTotal = rows.reduce((s, r) => s + (r.paidAmount ?? billedAmount(r.item)), 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[85vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-semibold text-base text-gray-900">📆 รายจ่ายประจำรายปี</h3>
            <p className="text-sm text-gray-500">เรียกเก็บปีละครั้ง · {rows.length} รายการ</p>
          </div>
          <button type="button" className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onClose}>×</button>
        </div>

        <div className="p-4 space-y-2 overflow-y-auto flex-1">
          {rows.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">ยังไม่มีรายจ่ายประจำแบบรายปี</p>
          )}

          {rows.map(({ item, billing, left, status, paidAmount, catName, paused }) => (
            <div
              key={item.id}
              className={`rounded-xl border p-3 ${
                paused ? 'border-dashed border-gray-300 bg-gray-50' :
                status === 'paid' ? 'border-emerald-200 bg-emerald-50/40' :
                left === 0 ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-sm font-semibold truncate ${paused ? 'text-gray-500' : 'text-gray-800'}`}>
                    {item.name}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    📁 {catName} · 📅 {item.billingDay} {THAI_MONTHS_SHORT[billing - 1]} ทุกปี
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-bold tabular-nums ${status === 'paid' ? 'text-emerald-600' : 'text-gray-800'}`}>
                    {(paidAmount ?? billedAmount(item)).toLocaleString('th-TH')}
                    <span className="text-xs font-normal text-gray-400"> บาท</span>
                  </p>
                  {vatLabel(item) && <p className="text-[10px] text-gray-400">{vatLabel(item)}</p>}
                </div>
              </div>

              <p className="text-xs mt-1.5">
                {paused ? (
                  <span className="text-gray-500">⏸ พักอยู่ · เหลืออีก {paused.monthsLeft} เดือน</span>
                ) : status === 'paid' ? (
                  <span className="text-emerald-600">✅ ปีนี้จ่ายแล้ว</span>
                ) : left === 0 ? (
                  <span className="text-amber-700 font-medium">⏳ ครบกำหนดเดือนนี้</span>
                ) : (
                  <span className="text-gray-500">อีก {left} เดือนจะถึงรอบ</span>
                )}
              </p>
            </div>
          ))}
        </div>

        {rows.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex-shrink-0 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">รวมทั้งปี</span>
              <span className="font-bold tabular-nums text-gray-900">{yearTotal.toLocaleString('th-TH')} บาท</span>
            </div>
            {/* เฉลี่ยต่อเดือนช่วยให้กันเงินไว้ล่วงหน้าได้ ไม่ใช่เจอก้อนใหญ่ทีเดียว */}
            <div className="flex justify-between text-xs text-gray-400">
              <span>เฉลี่ยต่อเดือนถ้าทยอยกันไว้</span>
              <span className="tabular-nums">{Math.round(yearTotal / 12).toLocaleString('th-TH')} บาท</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
