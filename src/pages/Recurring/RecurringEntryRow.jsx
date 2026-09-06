import useCategoryStore from '../../store/useCategoryStore'
import { isYearly, scheduleLabel, cycleLabel } from '../../lib/recurringSchedule'

/**
 * แถวย่อ — บรรทัดเดียวต่อรายการ สำหรับคนที่มีรายจ่ายประจำเยอะ
 * ข้อมูลเท่าการ์ดเต็ม (ชื่อ / สถานะ / หมวด / รอบ / ยอด / ปุ่ม) แต่บีบให้อยู่บรรทัดเดียว
 */

const STATUS = {
  paid:    { dot: 'bg-emerald-500', text: 'text-emerald-600', label: 'จ่ายแล้ว' },
  skipped: { dot: 'bg-gray-300',    text: 'text-gray-400',    label: 'ข้าม' },
  pending: { dot: 'bg-amber-400',   text: 'text-amber-600',   label: 'รอจ่าย' },
}

export default function RecurringEntryRow({ entry, item, daysLeft, upcoming = false, onPay, onUndoPay, onSkip, onEdit, onDelete, onPause }) {
  const { getCategoryName, getCategories } = useCategoryStore()
  const cat = getCategories('expense').find((c) => c.id === item.category)
  const catName = cat ? cat.name : getCategoryName(item.category) || 'หมวดหมู่ถูกลบ'

  const isVariable = item.amountType === 'variable'
  const hasAmount = entry.amount > 0
  const isPaid = entry.status === 'paid'
  const isSkipped = entry.status === 'skipped'
  const isPending = entry.status === 'pending' && !upcoming
  const st = STATUS[entry.status] ?? STATUS.pending
  // รอบบิลที่เก็บ ต่างจากเดือนที่จ่ายได้ (ค่าไฟเดือน ส.ค. มาเก็บเดือน ก.ย.)
  const cycle = cycleLabel(item, entry.month)

  return (
    <div
      className={`flex items-center gap-2 px-3 h-11 rounded-lg border ${
        upcoming ? 'border-dashed border-gray-200 bg-transparent' :
        isPaid ? 'border-emerald-200 bg-emerald-50/30' :
        isSkipped ? 'border-gray-200 opacity-60' :
        'border-gray-200 bg-white hover:border-gray-300'
      }`}
      title={`${item.name} · ${catName} · ${scheduleLabel(item)}${cycle ? ` · ${cycle}` : ''}${item.vendor ? ` · ${item.vendor}` : ''}${item.note ? ` · ${item.note}` : ''}`}
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot}`} />

      {/* ชื่อ + รายละเอียด */}
      <div className="flex-1 min-w-0 flex items-baseline gap-2">
        <span className="text-sm font-semibold text-gray-800 truncate">{item.name}</span>
        {isYearly(item) && (
          <span className="text-[10px] font-medium px-1.5 rounded bg-violet-100 text-violet-700 flex-shrink-0">รายปี</span>
        )}
        {/* บอกว่าเหลืออีกกี่วันจะย้ายไปเป็นรอบเดือนหน้า — คนจะได้รู้ว่ามีเวลาไล่เช็คสลิปอีกเท่าไร */}
        {daysLeft != null && (
          <span className="text-[10px] font-medium px-1.5 py-px rounded bg-income-soft text-income flex-shrink-0 whitespace-nowrap">
            ย้ายออกอีก {daysLeft} วัน
          </span>
        )}
        {upcoming && (
          <span className="text-[10px] font-medium px-1.5 py-px rounded bg-paper text-muted flex-shrink-0 whitespace-nowrap">
            ครบกำหนด {entry.dueDate?.slice(8)} {['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][Number(entry.month?.slice(5)) - 1]}
          </span>
        )}
        {cycle && (
          <span className="text-[10px] font-medium px-1.5 py-px rounded bg-[#F4F3EF] text-[#5C6068] flex-shrink-0 whitespace-nowrap">
            {cycle}
          </span>
        )}
        <span className="hidden sm:inline text-xs text-gray-400 truncate">
          {catName} · {scheduleLabel(item, { short: true })}
        </span>
      </div>

      {/* สถานะ */}
      <span className={`hidden md:inline text-xs font-medium w-16 text-right flex-shrink-0 ${upcoming ? 'text-gray-400' : st.text}`}>
        {upcoming ? 'ยังไม่ถึงรอบ' : st.label}
      </span>

      {/* ยอด */}
      <span className={`text-sm font-bold tabular-nums w-24 text-right flex-shrink-0 ${
        isPaid ? 'text-emerald-600' : hasAmount ? 'text-gray-800' : 'text-gray-400 font-normal italic'
      }`}>
        {hasAmount ? entry.amount.toLocaleString('th-TH') : '—'}
      </span>

      {/* ปุ่ม */}
      <div className="flex gap-1 flex-shrink-0 w-[208px] justify-end whitespace-nowrap">
        {upcoming && (
          <button
            onClick={() => onPay(entry, item)}
            className="btn btn-secondary text-xs !h-7 px-2.5"
            title="จ่ายล่วงหน้าสำหรับรอบเดือนหน้า"
          >
            ✓ จ่ายล่วงหน้า
          </button>
        )}
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
              title="ข้ามเฉพาะเดือนนี้"
            >
              ⏭
            </button>
            <button
              onClick={() => onPause(item)}
              className="btn btn-secondary text-xs !h-7 px-2"
              title="พักการเรียกเก็บหลายเดือน"
            >
              ⏸
            </button>
          </>
        )}
        <button
          onClick={() => onEdit(item)}
          className="btn btn-secondary text-xs !h-7 px-2"
          title="แก้ไขรายการประจำ"
        >
          ✏️
        </button>
        <button
          onClick={() => onDelete(item)}
          className="btn btn-secondary text-xs !h-7 px-2 text-red-400 hover:bg-red-50"
          title="ลบรายการประจำนี้"
        >
          🗑
        </button>
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
