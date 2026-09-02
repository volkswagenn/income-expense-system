import useCategoryStore from '../../store/useCategoryStore'
import { billedAmount, hasVat, isYearly, pauseLabel, scheduleLabel } from '../../lib/recurringSchedule'

/**
 * รายการที่ถูกพักการเรียกเก็บในเดือนที่กำลังดู
 *
 * เดือนที่พักไม่มี entry ในฐานข้อมูล (ไม่ได้ออกบิล) การ์ดนี้จึงวาดจากตัวแม่แบบตรงๆ
 * ตั้งใจให้ยังเห็นอยู่ เพราะผู้ใช้ต้องรู้ว่ารายการนี้ยังมีอยู่และจะกลับมาเมื่อไหร่
 * ต่างจากรายการที่ปิดใช้งาน ซึ่งหายไปจากหน้านี้ทั้งหมด
 */
export default function RecurringPausedCard({ item, info, compact = false, onResume, onEdit }) {
  const { getCategoryName, getCategories } = useCategoryStore()
  const cat = getCategories('expense').find((c) => c.id === item.category)
  const catName = cat ? cat.name : getCategoryName(item.category) || 'หมวดหมู่ถูกลบ'
  const amount = item.amountType === 'fixed' ? billedAmount(item) : null

  if (compact) {
    return (
      <div
        className="flex items-center gap-2 px-3 h-11 rounded-lg border border-dashed border-gray-300 bg-gray-50"
        title={`${item.name} · ${pauseLabel(info)}`}
      >
        <span className="w-2 h-2 rounded-full flex-shrink-0 bg-gray-300" />
        <div className="flex-1 min-w-0 flex items-baseline gap-2">
          <span className="text-sm font-medium text-gray-500 truncate">{item.name}</span>
          <span className="text-[10px] font-medium px-1.5 rounded bg-gray-200 text-gray-600 flex-shrink-0">⏸ พัก</span>
          <span className="hidden sm:inline text-xs text-gray-400 truncate">
            เหลืออีก {info.monthsLeft} เดือน
          </span>
        </div>
        <span className="text-sm tabular-nums w-24 text-right flex-shrink-0 text-gray-400">
          {amount != null ? amount.toLocaleString('th-TH') : '—'}
        </span>
        <div className="flex gap-1 flex-shrink-0 w-[172px] justify-end whitespace-nowrap">
          <button onClick={() => onResume(item)} className="btn btn-secondary text-xs !h-7 px-2" title="ยกเลิกการพัก">
            ▶ เรียกเก็บต่อ
          </button>
          <button onClick={() => onEdit(item)} className="btn btn-secondary text-xs !h-7 px-2" title="แก้ไขรายการประจำ">
            ✏️
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold text-gray-500">{item.name}</span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">⏸ พักการเรียกเก็บ</span>
            {isYearly(item) && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">📆 รายปี</span>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
            <span>📁 {catName}</span>
            <span>📅 {scheduleLabel(item, { short: true })}</span>
          </div>

          <p className="text-xs text-gray-500 mt-1">{pauseLabel(info)}</p>
        </div>

        <div className="flex-shrink-0 text-right">
          {amount != null ? (
            <p className="text-base font-bold tabular-nums text-gray-400 line-through">
              {amount.toLocaleString('th-TH')}
              <span className="text-xs font-normal"> บาท</span>
            </p>
          ) : (
            <p className="text-sm text-gray-400 italic">— ยอดเปลี่ยนแปลง</p>
          )}
          {hasVat(item) && <p className="text-[11px] text-gray-400">รวม VAT {Number(item.vatRate)}%</p>}

          <div className="flex gap-1.5 mt-2 justify-end flex-wrap">
            <button onClick={() => onResume(item)} className="btn btn-secondary text-xs py-1 px-3" title="ยกเลิกการพัก">
              ▶ เรียกเก็บต่อ
            </button>
            <button onClick={() => onEdit(item)} className="btn btn-secondary text-xs py-1 px-2" title="แก้ไขรายการประจำ">
              ✏️
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
