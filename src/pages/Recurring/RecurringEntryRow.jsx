import useCategoryStore from '../../store/useCategoryStore'
import { isYearly, scheduleLabel } from '../../lib/recurringSchedule'

/**
 * แถวย่อ — บรรทัดเดียวต่อรายการ สำหรับคนที่มีรายจ่ายประจำเยอะ
 * ข้อมูลเท่าการ์ดเต็ม (ชื่อ / สถานะ / หมวด / รอบ / ยอด / ปุ่ม) แต่บีบให้อยู่บรรทัดเดียว
 */

const STATUS = {
  paid:    { dot: 'bg-emerald-500', text: 'text-emerald-600', label: 'จ่ายแล้ว' },
  skipped: { dot: 'bg-gray-300',    text: 'text-gray-400',    label: 'ข้าม' },
  pending: { dot: 'bg-amber-400',   text: 'text-amber-600',   label: 'รอจ่าย' },
}

export default function RecurringEntryRow({ entry, item, onPay, onUndoPay, onSkip }) {
  const { getCategoryName, getCategories } = useCategoryStore()
  const cat = getCategories('expense').find((c) => c.id === item.category)
  const catName = cat ? cat.name : getCategoryName(item.category) || 'หมวดหมู่ถูกลบ'

  const isVariable = item.amountType === 'variable'
  const hasAmount = entry.amount > 0
  const isPaid = entry.status === 'paid'
  const isSkipped = entry.status === 'skipped'
  const isPending = entry.status === 'pending'
  const st = STATUS[entry.status] ?? STATUS.pending

  return (
    <div
      className={`flex items-center gap-2 px-3 h-11 rounded-lg border bg-white ${
        isPaid ? 'border-emerald-200 bg-emerald-50/30' :
        isSkipped ? 'border-gray-200 opacity-60' :
        'border-gray-200 hover:border-gray-300'
      }`}
      title={`${item.name} · ${catName} · ${scheduleLabel(item)}${item.vendor ? ` · ${item.vendor}` : ''}${item.note ? ` · ${item.note}` : ''}`}
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot}`} />

      {/* ชื่อ + รายละเอียด */}
      <div className="flex-1 min-w-0 flex items-baseline gap-2">
        <span className="text-sm font-semibold text-gray-800 truncate">{item.name}</span>
        {isYearly(item) && (
          <span className="text-[10px] font-medium px-1.5 rounded bg-violet-100 text-violet-700 flex-shrink-0">รายปี</span>
        )}
        <span className="hidden sm:inline text-xs text-gray-400 truncate">
          {catName} · {scheduleLabel(item, { short: true })}
        </span>
      </div>

      {/* สถานะ */}
      <span className={`hidden md:inline text-xs font-medium w-14 text-right flex-shrink-0 ${st.text}`}>{st.label}</span>

      {/* ยอด */}
      <span className={`text-sm font-bold tabular-nums w-24 text-right flex-shrink-0 ${
        isPaid ? 'text-emerald-600' : hasAmount ? 'text-gray-800' : 'text-gray-400 font-normal italic'
      }`}>
        {hasAmount ? entry.amount.toLocaleString('th-TH') : '—'}
      </span>

      {/* ปุ่ม */}
      <div className="flex gap-1 flex-shrink-0 w-[104px] justify-end whitespace-nowrap">
        {isPending && (
          <>
            <button
              onClick={() => onPay(entry, item)}
              className="btn btn-primary text-xs !h-7 px-2.5"
              title={isVariable && !hasAmount ? 'กรอกยอด' : 'จ่ายแล้ว'}
            >
              {isVariable && !hasAmount ? '📝' : '✓'} {isVariable && !hasAmount ? 'ยอด' : 'จ่าย'}
            </button>
            <button
              onClick={() => onSkip(entry.id)}
              className="btn btn-secondary text-xs !h-7 px-2"
              title="ข้ามเดือนนี้"
            >
              ⏭
            </button>
          </>
        )}
        {isSkipped && (
          <button onClick={() => onSkip(entry.id)} className="btn btn-secondary text-xs !h-7 px-2" title="เปลี่ยนกลับเป็นรอจ่าย">
            ↩ คืน
          </button>
        )}
        {isPaid && (
          <button onClick={() => onUndoPay(entry)} className="btn btn-secondary text-xs !h-7 px-2 text-orange-500" title="ยกเลิกการจ่าย">
            ↩ ยกเลิก
          </button>
        )}
      </div>
    </div>
  )
}
