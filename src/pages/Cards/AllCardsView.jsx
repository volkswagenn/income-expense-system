import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import useCreditCardStore from '../../store/useCreditCardStore'
import BankLogo from '../../components/shared/BankLogo'
import Icon from '../../components/shared/Icon'
import { formatCard } from '../../components/shared/CreditCardPicker'
import { nextClosingDate, formatThaiDate, formatIsoThai, daysUntil } from '../../lib/cardCycle'
import { localDateStr } from '../../lib/dateUtils'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

const FILTERS = {
  billed: { label: 'ยอดเรียกเก็บ', desc: 'ยอดที่ธนาคารปิดรอบแล้วและต้องจ่ายตามกำหนด' },
  pending: { label: 'ยอดรอเรียกเก็บ', desc: 'ยอดที่ใช้หลังวันสรุปยอด จะถูกเรียกเก็บในรอบถัดไป' },
  overdue: { label: 'เกินกำหนดชำระ', desc: 'ยอดที่เลยวันครบกำหนดแล้วยังไม่จ่าย' },
}

/**
 * ภาพรวมทุกบัตร — ตอบว่าเงินก้อนไหนต้องจ่ายเมื่อไร
 *
 * แยก 3 ตะกร้าเพราะยอดหนี้บัตรก้อนเดียวมีสถานะต่างกันมาก:
 * ที่ปิดรอบแล้วต้องจ่ายตามกำหนด ที่ยังไม่ปิดรอบยังขยับได้ และที่เลยกำหนดคือของด่วน
 */
export default function AllCardsView({ onOpenCard }) {
  const cards = useCreditCardStore((s) => s.cards)
  const statements = useCreditCardStore((s) => s.statements)
  const getCurrentCycle = useCreditCardStore((s) => s.getCurrentCycle)
  const getUnbilledInstallmentTotal = useCreditCardStore((s) => s.getUnbilledInstallmentTotal)
  const getCardLimitUsage = useCreditCardStore((s) => s.getCardLimitUsage)
  const [filter, setFilter] = useState('billed')

  const rows = useMemo(() => {
    const today = localDateStr()
    return cards.map((c) => {
      const unpaid = statements
        .filter((s) => s.cardId === c.id && s.status !== 'paid')
        .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
      const left = (s) => Number(s.amount) - Number(s.paidAmount)
      const billed = unpaid.reduce((n, s) => n + left(s), 0)
      const overdue = unpaid.filter((s) => s.dueDate < today).reduce((n, s) => n + left(s), 0)
      const cycle = getCurrentCycle(c.id)
      const usage = getCardLimitUsage(c.id)
      const nextBill = unpaid[0] ?? null
      return {
        card: c,
        billed,
        overdue,
        pending: Math.max(0, cycle?.net ?? 0),
        total: Number(c.outstanding) || 0,
        insReserved: getUnbilledInstallmentTotal(c.id),
        billedDue: nextBill ? `ครบกำหนด ${formatIsoThai(nextBill.dueDate)}` : 'ไม่มีบิลค้าง',
        billedMeta: nextBill
          ? `รอบ ${nextBill.cycle} · ขั้นต่ำ ${fmt(nextBill.minimumAmount)}`
          : '',
        pendingDue: cycle ? `ครบกำหนด ${formatThaiDate(cycle.due)}` : '—',
        pendingMeta: cycle ? `${cycle.count} รายการในรอบนี้` : '',
        cutTxt: `สรุปยอดทุกวันที่ ${c.closingDay} · ครบกำหนดทุกวันที่ ${c.dueDay}`,
        countTxt: unpaid.length > 1 ? `มีบิลค้าง ${unpaid.length} รอบ` : `บิลค้าง ${unpaid.length} รอบ`,
        limitTxt: usage?.limit
          ? `วงเงิน ${fmt(usage.limit)} · ใช้ไป ${fmt(Math.max(0, usage.used))}`
          : 'ไม่ได้ตั้งวงเงิน',
        overdueDays: nextBill && nextBill.dueDate < today ? -daysUntil(new Date(nextBill.dueDate + 'T00:00:00')) : 0,
      }
    })
  }, [cards, statements, getCurrentCycle, getCardLimitUsage, getUnbilledInstallmentTotal])

  const pick = (r) => (filter === 'billed' ? r.billed : filter === 'pending' ? r.pending : r.overdue)
  const shown = rows.filter((r) => pick(r) > 0)
  const total = rows.reduce((n, r) => n + pick(r), 0)

  const debtTotal = rows.reduce((n, r) => n + r.total, 0)
  const billedTotal = rows.reduce((n, r) => n + r.billed, 0)
  const pendingTotal = rows.reduce((n, r) => n + r.pending, 0)
  const insTotal = rows.reduce((n, r) => n + r.insReserved, 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="bg-ink rounded-panel px-4 py-3.5">
          <div className="text-[11.5px] text-[#9AA0A8]">ยอดหนี้บัตรรวมทุกบัตร</div>
          <div className="tabular-nums text-[26px] font-semibold text-white tracking-[-0.02em] mt-0.5">{fmt(debtTotal)}</div>
        </div>
        <div className="card px-4 py-3.5">
          <div className="text-[11.5px] text-muted">ยอดเรียกเก็บแล้ว</div>
          <div className="tabular-nums text-[22px] font-semibold text-[#C03A2D] mt-0.5">{fmt(billedTotal)}</div>
        </div>
        <div className="card px-4 py-3.5">
          <div className="text-[11.5px] text-muted">ยอดรอเรียกเก็บ</div>
          <div className="tabular-nums text-[22px] font-semibold text-[#3F444C] mt-0.5">{fmt(pendingTotal)}</div>
        </div>
        <div className="card px-4 py-3.5">
          <div className="text-[11.5px] text-muted">ยอดผ่อนที่ธนาคารกันวงเงินไว้</div>
          <div className="tabular-nums text-[22px] font-semibold text-[#3F444C] mt-0.5">{fmt(insTotal)}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {Object.entries(FILTERS).map(([key, f]) => {
          const on = key === filter
          const amt = rows.reduce((n, r) => n + (key === 'billed' ? r.billed : key === 'pending' ? r.pending : r.overdue), 0)
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`h-[38px] px-3.5 rounded-ctl border flex items-center gap-2.5 transition ${
                on ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-hairline hover:border-ink'
              }`}
            >
              <span className="text-[12.5px] font-semibold">{f.label}</span>
              <span className={`tabular-nums text-[12.5px] font-bold ${on ? 'text-[#B9BEC6]' : 'text-faint'}`}>{fmt(amt)}</span>
            </button>
          )
        })}
        <span className="flex-1 min-w-[200px] text-[11.5px] text-faint leading-relaxed ml-1">{FILTERS[filter].desc}</span>
      </div>

      <div className="card flex flex-col overflow-hidden">
        <div className="flex items-center gap-2.5 px-[18px] pt-3 pb-2.5 border-b border-[#F2F0EA] flex-none">
          <span className="text-sm font-semibold">{FILTERS[filter].label}รวมทุกบัตร</span>
          <span className="tabular-nums ml-auto text-[19px] font-bold">{fmt(total)}</span>
        </div>

        <div className="px-[18px] py-2.5 flex flex-col gap-2.5">
          {cards.length === 0 ? (
            <div className="border border-dashed border-[#D8D4C9] rounded-[13px] p-7 text-center">
              <div className="text-[12.5px] text-muted">
                ยังไม่มีบัตรเครดิต — เพิ่มได้ที่{' '}
                <Link to="/manage/cards" className="text-income hover:underline">จัดการข้อมูล → บัตรเครดิต</Link>
              </div>
            </div>
          ) : shown.length === 0 ? (
            <div className="border border-dashed border-[#D8D4C9] rounded-[13px] p-7 text-center">
              <div className="text-[12.5px] text-muted">
                {filter === 'overdue' ? 'ไม่มียอดที่เลยกำหนดชำระ' : filter === 'billed' ? 'ไม่มีบิลที่ปิดรอบรอจ่าย' : 'ยังไม่มียอดสะสมในรอบถัดไป'}
              </div>
            </div>
          ) : shown.map((r) => (
            <button
              key={r.card.id}
              onClick={() => onOpenCard(r.card.id)}
              className="flex items-center gap-3.5 border border-hairline rounded-[13px] px-3.5 py-3 bg-white text-left hover:bg-[#FAF9F6] hover:border-ink transition"
            >
              <span className="w-[38px] h-[38px] flex-none rounded-[11px] bg-paper flex items-center justify-center">
                <BankLogo bankName={r.card.bankName} size="md" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-semibold truncate">{formatCard(r.card)}</span>
                <span className="block text-[11.5px] text-faint">
                  {filter === 'billed' ? r.billedDue : filter === 'pending' ? r.pendingDue : `เลยกำหนดแล้ว ${r.overdueDays} วัน`}
                </span>
                <span className="block text-[11px] text-[#A5A199] mt-px">
                  {filter === 'billed' ? r.billedMeta : filter === 'pending' ? r.pendingMeta : ''}
                </span>
              </span>
              <span className="flex-none w-[210px] text-[11px] text-faint leading-[1.55] hidden lg:block">
                <span className="block">{r.cutTxt}</span>
                <span className="block">หนี้รวมบัตรนี้ {fmt(r.total)} · ผ่อนค้าง {fmt(r.insReserved)}</span>
                <span className="block">{r.countTxt}</span>
                <span className="block">{r.limitTxt}</span>
              </span>
              <span className={`tabular-nums flex-none text-xl font-bold text-right w-[124px] ${
                filter === 'overdue' ? 'text-[#C0392B]' : filter === 'billed' ? 'text-[#C03A2D]' : 'text-[#3F444C]'
              }`}>
                {fmt(pick(r))}
              </span>
              <Icon name="chevron_right" size={20} className="flex-none text-[#A5A199]" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
