import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import useTransactionStore from '../../store/useTransactionStore'
import usePendingStore from '../../store/usePendingStore'
import useRecurringStore from '../../store/useRecurringStore'
import useCreditCardStore from '../../store/useCreditCardStore'
import useCategoryStore from '../../store/useCategoryStore'
import useNoteStore from '../../store/useNoteStore'
import Icon from '../../components/shared/Icon'
import { localDateStr, thaiShortDate, THAI_DOW } from '../../lib/dateUtils'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

/** แจ้งเตือนของวัน — สิ่งที่ครบกำหนดวันนั้นและยังไม่ได้ทำ */
function notisFor(date, { pendingPayments, pendingIncomes, taxInvoices, recurringEntries, recurringItems, statements, getCardShortLabel }) {
  const out = []
  for (const p of pendingPayments) {
    if (p.status === 'pending' && p.dueDate === date) {
      out.push({ icon: 'pending_actions', tint: 'bg-pending-soft', fg: 'text-pending', title: p.description || p.itemName || 'ค้างชำระ', meta: 'ครบกำหนดชำระ', amount: p.amount })
    }
  }
  for (const s of statements) {
    if (s.status !== 'paid' && s.dueDate === date) {
      out.push({ icon: 'credit_card', tint: 'bg-expense-soft', fg: 'text-expense', title: `บิลบัตร ${getCardShortLabel(s.cardId)}`, meta: `รอบ ${s.cycle}`, amount: Number(s.amount) - Number(s.paidAmount) })
    }
  }
  for (const e of recurringEntries) {
    if (e.status === 'pending' && e.dueDate === date) {
      const it = recurringItems.find((x) => x.id === e.recurringId)
      out.push({ icon: 'history', tint: 'bg-recurring-soft', fg: 'text-recurring', title: it?.name ?? 'รายการประจำ', meta: 'รายจ่ายประจำ', amount: e.amount })
    }
  }
  for (const t of taxInvoices) {
    if (t.status === 'waiting' && t.dueDate === date) {
      out.push({ icon: 'receipt_long', tint: 'bg-[#FBEFE4]', fg: 'text-[#B4571E]', title: t.itemName || 'รอใบกำกับภาษี', meta: 'คาดว่าจะได้รับใบกำกับภาษี', amount: null })
    }
  }
  for (const p of pendingIncomes) {
    if (p.status === 'pending' && p.date === date) {
      out.push({ icon: 'savings', tint: 'bg-transfer-soft', fg: 'text-transfer', title: p.description || 'รอรับเงิน', meta: 'รอรับเงินตามบิล', amount: p.amount })
    }
  }
  return out
}

/**
 * แผงรายละเอียดของวันที่เลือกบนปฏิทิน
 *
 * ของเดิมข้อมูลรายวันอยู่ใน tooltip ที่ต้องเอาเมาส์ไปค้างไว้เท่านั้น อ่านบนมือถือไม่ได้เลย
 * และหายทันทีที่เลื่อนเมาส์ ตอนนี้ยกมาเป็นแผงถาวรข้างปฏิทิน กดวันไหนก็เห็นของวันนั้น
 */
export default function DayPanel({ date, onOpenDetail }) {
  const navigate = useNavigate()
  const transactions = useTransactionStore((s) => s.transactions)
  const pendingPayments = usePendingStore((s) => s.pendingPayments)
  const pendingIncomes = usePendingStore((s) => s.pendingIncomes)
  const taxInvoices = usePendingStore((s) => s.taxInvoices)
  const recurringEntries = useRecurringStore((s) => s.entries)
  const recurringItems = useRecurringStore((s) => s.items)
  const statements = useCreditCardStore((s) => s.statements)
  const getCardShortLabel = useCreditCardStore((s) => s.getCardShortLabel)
  const getCategoryName = useCategoryStore((s) => s.getCategoryName)
  const note = useNoteStore((s) => s.notes[date])

  const dayTx = useMemo(() => transactions.filter((t) => t.date === date), [transactions, date])
  const income = dayTx.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount || 0), 0)
  const expense = dayTx.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount || 0), 0)

  const notis = useMemo(
    () => notisFor(date, { pendingPayments, pendingIncomes, taxInvoices, recurringEntries, recurringItems, statements, getCardShortLabel }),
    [date, pendingPayments, pendingIncomes, taxInvoices, recurringEntries, recurringItems, statements, getCardShortLabel]
  )

  const d = new Date(date + 'T00:00:00')
  const isToday = date === localDateStr()
  const title = Number.isNaN(d.getTime()) ? date : `${THAI_DOW[d.getDay()]} ${d.getDate()}`

  return (
    <aside className="card px-4 py-4 flex flex-col min-h-0">
      {/* มือถือ: หัวย่อบรรทัดเดียว ชื่อวัน + สุทธิ แล้วบรรทัดใต้บอก รับ · จ่าย · จำนวน */}
      <div className="lg:hidden">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[15px] font-semibold truncate">
            {title}{isToday && <span className="text-[11px] font-bold text-[#5C7A0F] ml-1.5">วันนี้</span>}
          </span>
          <span className={`tabular-nums text-[17px] font-bold flex-none ${income - expense >= 0 ? 'text-ink' : 'text-expense'}`}>
            {fmt(income - expense)}
          </span>
        </div>
        <div className="text-[11.5px] text-faint mt-0.5">
          รับ {fmt(income)} · จ่าย {fmt(expense)} · {dayTx.length} รายการ
        </div>
      </div>

      <div className="hidden lg:flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] tracking-[0.1em] uppercase text-faint">วันที่เลือก</div>
          <div className="text-[19px] font-semibold tracking-[-0.01em] truncate">{title}</div>
          <div className="text-[11.5px] text-faint">{thaiShortDate(d)}</div>
        </div>
        {isToday && (
          <span className="text-[10.5px] font-bold bg-income-soft text-[#5C7A0F] rounded-md px-2 py-0.5 flex-none">วันนี้</span>
        )}
      </div>

      <div className="hidden lg:block bg-paper rounded-ctl px-3.5 py-3 mt-3">
        <div className="flex justify-between py-0.5 text-[12.5px]">
          <span className="text-muted">รายรับ</span>
          <span className="tabular-nums font-semibold text-income">{fmt(income)}</span>
        </div>
        <div className="flex justify-between py-0.5 text-[12.5px]">
          <span className="text-muted">รายจ่าย</span>
          <span className="tabular-nums font-semibold text-expense">{fmt(expense)}</span>
        </div>
        <div className="flex justify-between items-baseline pt-2 mt-1.5 border-t border-hairline">
          <span className="font-semibold text-[12.5px]">สุทธิ</span>
          <span className={`tabular-nums text-[17px] font-bold ${income - expense >= 0 ? 'text-ink' : 'text-expense'}`}>
            {fmt(income - expense)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-3.5 mb-1.5">
        <Icon name="notifications" size={16} fill className="text-pending" />
        <span className="text-[11px] tracking-[0.1em] uppercase text-faint">แจ้งเตือนของวัน</span>
        {notis.length > 0 && (
          <span className="tabular-nums text-[10.5px] font-bold bg-expense text-white rounded-full px-1.5">{notis.length}</span>
        )}
        {/* บอกไว้เพราะรายการนี้ถูกกรองด้วยชั้นข้อมูลบนปฏิทิน ปิดชั้นไหนแจ้งเตือนนั้นก็หายไปด้วย */}
        <span className="ml-auto text-[10.5px] text-[#A5A199]">ตามชั้นข้อมูลที่เปิดอยู่</span>
      </div>

      {notis.length === 0 ? (
        <div className="border border-dashed border-hairline rounded-ctl px-3 py-2.5 text-[11.5px] text-[#A5A199] text-center">
          ไม่มีแจ้งเตือนของวันนี้
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {notis.map((n, i) => (
            <div key={i} className="flex items-center gap-2.5 border border-[#EFEDE7] rounded-[11px] px-2.5 py-2 bg-[#FAF9F6]">
              <span className={`w-[26px] h-[26px] flex-none rounded-lg flex items-center justify-center ${n.tint} ${n.fg}`}>
                <Icon name={n.icon} size={15} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[12px] font-semibold truncate">{n.title}</span>
                <span className="block text-[10.5px] text-faint truncate">{n.meta}</span>
              </span>
              {n.amount != null && (
                <span className={`tabular-nums flex-none text-[12.5px] font-bold ${n.fg}`}>{fmt(n.amount)}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {note && (
        <div className="mt-3 bg-[#FBF6DC] border border-[#EFE3B4] rounded-ctl px-3 py-2 text-[11.5px] leading-relaxed">
          <span className="font-semibold">โน้ต · </span>{note}
        </div>
      )}

      <div className="flex items-baseline gap-2 mt-3.5 mb-0.5">
        <span className="text-[11px] tracking-[0.1em] uppercase text-faint">
          รายการของวัน · {dayTx.length}
        </span>
        <button onClick={() => onOpenDetail(date)} className="ml-auto text-[11.5px] font-semibold text-income hover:underline">
          รายละเอียด · โน้ต
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
        {dayTx.length === 0 ? (
          <p className="text-[11.5px] text-[#A5A199] py-3">ยังไม่มีรายการของวันนี้</p>
        ) : dayTx.map((t) => {
          const inc = t.type === 'income'
          return (
            <div key={t.id} className="flex items-center gap-2.5 py-2 border-b border-[#F2F0EA] last:border-0">
              <span className={`w-7 h-7 flex-none rounded-[9px] flex items-center justify-center ${
                inc ? 'bg-income-soft text-income' : 'bg-expense-soft text-expense'
              }`}>
                <Icon name={inc ? 'arrow_downward' : 'arrow_upward'} size={16} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-medium truncate">{t.itemName || '(ไม่ระบุชื่อ)'}</span>
                <span className="block text-[11px] text-faint truncate">{getCategoryName(t.category)}</span>
              </span>
              <span className={`tabular-nums text-[13px] font-semibold ${inc ? 'text-income' : 'text-expense'}`}>
                {inc ? '+' : '-'}{Number(t.amount).toLocaleString('th-TH')}
              </span>
            </div>
          )
        })}
      </div>

      <button
        onClick={() => navigate('/transactions')}
        className="mt-3 h-[38px] rounded-[11px] bg-lime text-ink text-[13px] font-semibold flex items-center justify-center gap-1.5 hover:bg-lime-dark"
      >
        <Icon name="add" size={18} />
        บันทึกรายการวันนี้
      </button>
    </aside>
  )
}
