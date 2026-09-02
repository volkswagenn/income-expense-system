import useCreditCardStore from '../../store/useCreditCardStore'
import { clampedDate, formatIsoThai, toDateString } from '../../lib/cardCycle'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

/**
 * เลือกบิลที่จะจ่าย
 *
 * บิลจ่ายได้ก็ต่อเมื่อถูกตัดรอบแล้ว เพราะยอดถึงจะนิ่ง รอบที่ยังไม่ตัดยังมีรายการ
 * ไหลเข้ามาได้เรื่อยๆ ถ้าปิดรอบก่อนกำหนดเพื่อให้จ่ายได้ รายการที่รูดหลังจากนั้น
 * จะตกอยู่นอกใบแจ้งยอดทุกใบ แล้วยอดหนี้กับบิลจะไม่ตรงกันถาวร
 *
 * จึงแสดงทั้งสองแบบไว้ที่เดียว: ที่จ่ายได้กดจ่ายได้เลย ส่วนที่ยังไม่ตัดบิล
 * บอกวันตัดบิลให้รู้ว่าอีกกี่วันจะกดได้
 */
export default function PickBillPopup({ onPick, onClose }) {
  const getUnpaidStatements = useCreditCardStore((s) => s.getUnpaidStatements)
  const getUpcomingBills = useCreditCardStore((s) => s.getUpcomingBills)
  const getCardShortLabel = useCreditCardStore((s) => s.getCardShortLabel)
  const getCard = useCreditCardStore((s) => s.getCard)

  const today = toDateString(new Date())
  const payable = getUnpaidStatements()

  const upcoming = getUpcomingBills(2).rows
    .filter((r) => r.kind === 'projected')
    .map((r) => {
      const card = getCard(r.cardId)
      const [cy, cm] = r.cycle.split('-').map(Number)
      return { ...r, closingDate: card ? toDateString(clampedDate(cy, cm - 1, card.closingDay)) : null }
    })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[85vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-shrink-0">
          <h3 className="font-semibold text-base text-gray-900">💳 จ่ายบิลบัตรเครดิต</h3>
          <button type="button" className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onClose}>×</button>
        </div>

        <div className="p-4 space-y-2 overflow-y-auto flex-1">
          {payable.length === 0 && upcoming.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">ยังไม่มีบัตรหรือยังไม่มียอดค้าง</p>
          )}

          {payable.map((s) => {
            const remaining = Number(s.amount || 0) - Number(s.paidAmount || 0)
            const overdue = s.dueDate < today
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onPick(s)}
                className={`w-full text-left rounded-xl border-2 px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
                  overdue ? 'border-red-200 bg-red-50 hover:border-red-300' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{getCardShortLabel(s.cardId)}</p>
                  <p className={`text-xs ${overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                    รอบ {s.cycle} · ครบกำหนด {formatIsoThai(s.dueDate)}{overdue ? ' · เลยกำหนดแล้ว' : ''}
                  </p>
                </div>
                <span className="text-base font-bold tabular-nums text-gray-900 flex-shrink-0">{fmt(remaining)}</span>
              </button>
            )
          })}

          {upcoming.length > 0 && (
            <>
              <p className="text-xs text-gray-400 pt-2">ยังตัดบิลไม่ถึงรอบ — จ่ายได้เมื่อถึงวันตัดบิล</p>
              {upcoming.map((r) => (
                <div
                  key={r.key}
                  className="w-full rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-500 truncate">{getCardShortLabel(r.cardId)}</p>
                    <p className="text-xs text-gray-400">
                      รอบ {r.cycle}
                      {r.closingDate && ` · ตัดบิล ${formatIsoThai(r.closingDate)}`}
                      {' · ครบกำหนด '}{formatIsoThai(r.dueDate)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold tabular-nums text-gray-500">{fmt(r.amount)}</p>
                    <p className="text-[10px] text-gray-400">ประมาณการ</p>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0">
          <button type="button" className="btn btn-secondary w-full" onClick={onClose}>ปิด</button>
        </div>
      </div>
    </div>
  )
}
