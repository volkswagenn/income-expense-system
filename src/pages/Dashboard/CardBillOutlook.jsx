import { useNavigate } from 'react-router-dom'
import useCreditCardStore from '../../store/useCreditCardStore'
import { formatIsoThai, formatThaiDate, daysUntil } from '../../lib/cardCycle'
import AppIcon from '../../components/shared/AppIcon'
import { DEFAULT_ICONS } from '../../lib/defaultIcons'
import SectionCard from '../../components/shared/SectionCard'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

function monthLabel(date) {
  return `${THAI_MONTHS[date.getMonth()]} ${date.getFullYear() + 543}`
}

function BillRow({ row, cardLabel, cardIcon }) {
  const left = daysUntil(row.due)
  const isClosed = row.kind === 'closed'

  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="w-6 h-6 flex-none rounded-md bg-white border border-hairline flex items-center justify-center">
        <AppIcon value={cardIcon} size={15} fallback={DEFAULT_ICONS.card} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] text-ink truncate">{cardLabel}</span>
          <span
            className={`text-[10.5px] rounded-full px-2 py-0.5 border ${
              isClosed
                ? 'bg-expense-soft text-expense border-transparent'
                : 'bg-white text-muted border-hairline'
            }`}
          >
            {isClosed ? 'ปิดรอบแล้ว' : 'ประมาณการ'}
          </span>
        </div>
        <p className="text-[11.5px] text-faint mt-0.5">
          รอบ {row.cycle} · ครบกำหนด {formatIsoThai(row.dueDate)}
          {row.overdue
            ? <span className="text-expense"> · เกินกำหนด {Math.abs(left)} วัน</span>
            : <span> · อีก {left} วัน</span>}
          {row.installment > 0 && ` · รวมงวดผ่อน ${fmt(row.installment)}`}
        </p>
      </div>

      <span
        className={`text-[14px] font-semibold tabular-nums shrink-0 ${isClosed ? 'text-expense' : 'text-ink-2'}`}
      >
        {fmt(row.amount)}
      </span>
    </div>
  )
}

/**
 * บิลบัตรเครดิตที่ต้องจ่ายในอีก 2 เดือนข้างหน้า
 *
 * แยกออกจาก "หนี้ค้างชำระ" โดยเจตนา สองอย่างนี้เป็นคนละเรื่องกัน
 *   • หนี้ค้างชำระ = บิลที่เปิดไว้แล้วยังไม่ได้จ่าย เงินยังไม่ออกจากกระเป๋า
 *   • บิลบัตร = ของที่รูดไปแล้ว รายจ่ายถูกบันทึกไปแล้ว เหลือแค่ย้ายเงินไปปิดหนี้
 * ถ้าเอามารวมเป็นตัวเลขเดียว ผู้ใช้จะแยกไม่ออกว่าอันไหนยังไม่ได้ใช้เงินจริง
 */
export default function CardBillOutlook({ months = 2 }) {
  const cards = useCreditCardStore((s) => s.cards)
  const outlook = useCreditCardStore((s) => s.getUpcomingBills(months))
  const getCardLabel = useCreditCardStore((s) => s.getCardLabel)
  const navigate = useNavigate()

  // ไม่มีบัตรเลย → ไม่ต้องแสดงอะไร หน้าแรกของคนที่ไม่ใช้บัตรจะได้ไม่รกขึ้น
  if (cards.length === 0) return null

  const { rows, closedTotal, projectedTotal, total, horizon } = outlook

  // จัดกลุ่มตามเดือนที่ครบกำหนด เพื่อให้เห็นว่าเดือนไหนหนักกว่า
  const groups = []
  for (const row of rows) {
    const key = `${row.due.getFullYear()}-${row.due.getMonth()}`
    let g = groups.find((x) => x.key === key)
    if (!g) {
      g = { key, label: monthLabel(row.due), rows: [], total: 0 }
      groups.push(g)
    }
    g.rows.push(row)
    g.total += row.amount
  }

  return (
    <SectionCard title="💳 บิลบัตรเครดิตที่ต้องจ่าย">
    <div className="space-y-4">
      <div className="rounded-card bg-expense-soft border border-transparent p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[12.5px] text-expense">
              ต้องจ่ายบัตรเครดิตใน {months} เดือนข้างหน้า
            </p>
            <p className="text-[11px] text-muted">ครบกำหนดถึง {formatThaiDate(horizon)}</p>
            <p className="text-[30px] font-semibold text-expense tabular-nums tracking-[-0.02em] mt-0.5">
              {fmt(total)}
              <span className="text-[14px] font-normal ml-1.5">บาท</span>
            </p>
          </div>
          <button
            className="btn btn-secondary text-xs shrink-0"
            onClick={() => navigate('/wallet')}
          >
            ไปจ่ายบิล
          </button>
        </div>

        <div className="flex gap-5 mt-3 flex-wrap">
          <div>
            <p className="text-[11.5px] text-muted">ปิดรอบแล้ว ยอดนิ่ง</p>
            <p className="text-[14px] font-semibold text-expense tabular-nums">{fmt(closedTotal)}</p>
          </div>
          <div>
            <p className="text-[11.5px] text-muted">ประมาณการ ยอดยังขยับได้</p>
            <p className="text-[14px] font-semibold text-ink-2 tabular-nums">{fmt(projectedTotal)}</p>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-center text-[13px] text-faint py-4">
          ไม่มีบิลบัตรที่ต้องจ่ายใน {months} เดือนข้างหน้า
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="flex items-center justify-between border-b border-hairline pb-1.5 mb-1">
                <span className="text-[12.5px] font-medium text-ink-2">{g.label}</span>
                <span className="text-[12.5px] font-semibold tabular-nums text-ink-2">
                  {fmt(g.total)}
                </span>
              </div>
              <div className="divide-y divide-hairline">
                {g.rows.map((row) => {
                  const card = cards.find((c) => c.id === row.cardId)
                  return (
                    <BillRow
                      key={row.key}
                      row={row}
                      cardLabel={getCardLabel(row.cardId)}
                      cardIcon={card?.icon}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11.5px] text-faint leading-relaxed">
        ยอดนี้แยกจาก "หนี้ค้างชำระ" ด้านบน เพราะของที่รูดบัตรถูกบันทึกเป็นรายจ่ายไปแล้ว
        เหลือแค่ย้ายเงินไปปิดหนี้ ส่วนหนี้ค้างชำระคือบิลที่ยังไม่ได้จ่ายและเงินยังไม่ออกจากกระเป๋า
        {projectedTotal > 0 && ' ยอดประมาณการยังเปลี่ยนได้ทุกครั้งที่รูดเพิ่ม เพราะรอบยังไม่ปิด'}
      </p>
    </div>
    </SectionCard>
  )
}
