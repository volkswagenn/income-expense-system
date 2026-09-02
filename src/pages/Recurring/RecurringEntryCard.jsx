import useCategoryStore from '../../store/useCategoryStore'
import { isYearly, scheduleLabel } from '../../lib/recurringSchedule'

const METHOD_LABELS = { cash: 'เงินสด', transfer: 'โอนเงิน', card: 'บัตรเครดิต', pending: 'ค้างชำระ' }

function StatusBadge({ status }) {
  if (status === 'paid') return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">✅ จ่ายแล้ว</span>
  if (status === 'skipped') return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">⏭ ข้ามแล้ว</span>
  return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">⏳ รอจ่าย</span>
}

export default function RecurringEntryCard({ entry, item, onPay, onUndoPay, onSkip, onEdit, onDelete, onPause }) {
  const { getCategoryName, getCategories } = useCategoryStore()
  const categories = getCategories('expense')
  const cat = categories.find((c) => c.id === item.category)
  const catName = cat ? cat.name : getCategoryName(item.category) || 'หมวดหมู่ถูกลบ'
  const catDeleted = cat && cat.deleted

  const isVariable = item.amountType === 'variable'
  const hasAmount = entry.amount > 0
  const isPaid = entry.status === 'paid'
  const isSkipped = entry.status === 'skipped'
  const isPending = entry.status === 'pending'

  return (
    <div className={`rounded-xl border bg-white p-4 transition-colors ${
      isPaid ? 'border-emerald-200 bg-emerald-50/30' :
      isSkipped ? 'border-gray-200 opacity-60' :
      'border-gray-200 hover:border-gray-300'
    }`}>
      <div className="flex items-start gap-3">
        {/* Left: info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold text-gray-800">{item.name}</span>
            <StatusBadge status={entry.status} />
            {isYearly(item) && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">📆 รายปี</span>
            )}
            {catDeleted && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600">หมวดหมู่ถูกลบ</span>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
            <span>📁 {catName}</span>
            <span>📅 {scheduleLabel(item, { short: true })}</span>
            {item.vendor && <span>🏢 {item.vendor}</span>}
          </div>

          {isPaid && entry.paidMethod && (
            <p className="text-xs text-emerald-600 mt-1">
              จ่ายด้วย: {METHOD_LABELS[entry.paidMethod] ?? entry.paidMethod}
            </p>
          )}
          {item.note && <p className="text-xs text-gray-400 mt-0.5">📝 {item.note}</p>}
        </div>

        {/* Right: amount + actions */}
        <div className="flex-shrink-0 text-right">
          {hasAmount ? (
            <p className={`text-base font-bold tabular-nums ${isPaid ? 'text-emerald-600' : 'text-gray-800'}`}>
              {entry.amount.toLocaleString('th-TH')}
              <span className="text-xs font-normal text-gray-400"> บาท</span>
            </p>
          ) : (
            <p className="text-sm text-gray-400 italic">— ยังไม่ระบุยอด</p>
          )}

          {/* Actions */}
          <div className="flex gap-1.5 mt-2 justify-end flex-wrap">
            {isPending && (
              <>
                <button
                  onClick={() => onPay(entry, item)}
                  className="btn btn-primary text-xs py-1 px-3"
                >
                  {isVariable && !hasAmount ? '📝 กรอกยอด' : '✓ จ่ายแล้ว'}
                </button>
                {isVariable && hasAmount && (
                  <button
                    onClick={() => onPay(entry, item)}
                    className="btn btn-secondary text-xs py-1 px-2"
                    title="แก้ไขยอดก่อนจ่าย"
                  >
                    แก้ยอด
                  </button>
                )}
                <button
                  onClick={() => onSkip(entry.id)}
                  className="btn btn-secondary text-xs py-1 px-2"
                  title="ข้ามเฉพาะเดือนนี้"
                >
                  ⏭
                </button>
                <button
                  onClick={() => onPause(item)}
                  className="btn btn-secondary text-xs py-1 px-2"
                  title="พักการเรียกเก็บหลายเดือน"
                >
                  ⏸
                </button>
                <button
                  onClick={() => onEdit(item)}
                  className="btn btn-secondary text-xs py-1 px-2"
                  title="แก้ไขรายการประจำ"
                >
                  ✏️
                </button>
                <button
                  onClick={() => onDelete(item)}
                  className="btn btn-secondary text-xs py-1 px-2 text-red-400 hover:bg-red-50"
                  title="ลบรายการประจำนี้"
                >
                  🗑
                </button>
              </>
            )}
            {isSkipped && (
              <button
                onClick={() => onSkip(entry.id)}
                className="btn btn-secondary text-xs py-1 px-2"
                title="เปลี่ยนกลับเป็นรอจ่าย"
              >
                ↩ คืนสถานะ
              </button>
            )}
            {isPaid && (
              <button
                onClick={() => onUndoPay(entry)}
                className="btn btn-secondary text-xs py-1 px-2 text-orange-500"
                title="ยกเลิกการจ่าย"
              >
                ↩ ยกเลิก
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
