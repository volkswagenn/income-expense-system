import { useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

function fmtAmt(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'M'
  return n.toLocaleString('th-TH')
}

function TooltipRow({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-300 truncate">{label}</span>
      <span className="font-semibold tabular-nums text-white flex-shrink-0">{value.toLocaleString('th-TH')}</span>
    </div>
  )
}

function ReminderRow({ marker, markerClass, label, value, valueSuffix = 'บาท' }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-gray-200 min-w-0 flex items-start gap-1.5">
        <span className={`leading-4 ${markerClass}`}>{marker}</span>
        <span className="truncate">{label}</span>
      </span>
      {value != null && (
        <span className="font-semibold tabular-nums text-gray-100 flex-shrink-0">
          {value.toLocaleString('th-TH')} {valueSuffix}
        </span>
      )}
    </div>
  )
}

function CalendarTooltip({ dateStr, income, expense, totalIncome, totalExpense, pendingItems, pendingIncomeItems, taxItems, recurringItems, cardBills = [], note, getCategoryName, pos }) {
  const d = new Date(dateStr + 'T00:00:00')
  const dateLabel = `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`
  const pendingIncomeTotal = pendingIncomeItems.reduce((sum, item) => sum + (item.amount || 0), 0)
  const pendingPaymentTotal = pendingItems.reduce((sum, item) => sum + (item.amount || 0), 0)

  // สรุปยอด: รายจ่ายประจำนับจาก entry ที่ไม่ถูกข้าม, รายจ่ายทั่วไปตัดรายการที่จ่ายจากรายการประจำออก (กันนับซ้ำ)
  const recurringTotal = recurringItems.reduce((sum, { entry }) => sum + (entry.status === 'skipped' ? 0 : (entry.amount || 0)), 0)
  const normalExpenseTotal = expense.reduce((sum, t) => sum + (t.recurringEntryId ? 0 : t.amount), 0)
  const paidTotal = recurringTotal + normalExpenseTotal
  const hasSummary = recurringTotal > 0 || normalExpenseTotal > 0 || totalIncome > 0

  const incomeGroups = {}
  income.forEach((t) => {
    const k = t.method === 'cash' ? 'เงินสด' : t.method === 'transfer' ? 'เงินโอน' : (t.otherIncomeType || 'อื่นๆ')
    incomeGroups[k] = (incomeGroups[k] || 0) + t.amount
  })

  const expenseGroups = {}
  expense.forEach((t) => {
    const k = getCategoryName(t.category)
    expenseGroups[k] = (expenseGroups[k] || 0) + t.amount
  })

  const style = {
    position: 'fixed',
    left: pos.left,
    top: pos.above ? pos.top : pos.bottom,
    transform: pos.above ? 'translate(-50%, calc(-100% - 8px))' : 'translate(-50%, 8px)',
    zIndex: 9999,
    width: '210px',
    maxHeight: '400px',
    overflowY: 'auto',
    pointerEvents: 'none',
  }

  return (
    <div style={style} className="bg-gray-900 rounded-xl shadow-2xl p-3 text-xs">
      <p className="text-gray-300 font-semibold mb-2 pb-1.5 border-b border-gray-700">{dateLabel}</p>

      {totalIncome > 0 && (
        <div className="mb-2">
          <p className="text-emerald-400 font-semibold mb-1">รายรับ {fmtAmt(totalIncome)} บาท</p>
          <div className="space-y-1 pl-2">
            {Object.entries(incomeGroups).map(([k, v]) => (
              <TooltipRow key={k} label={k} value={v} />
            ))}
          </div>
        </div>
      )}

      {totalExpense > 0 && (
        <div className="mb-2">
          <p className="text-red-400 font-semibold mb-1">รายจ่าย {fmtAmt(totalExpense)} บาท</p>
          <div className="space-y-1 pl-2">
            {Object.entries(expenseGroups).map(([k, v]) => (
              <TooltipRow key={k} label={k} value={v} />
            ))}
          </div>
        </div>
      )}

      {pendingIncomeItems.length > 0 && (
        <div className="mb-2 pt-1.5 border-t border-gray-700">
          <p className="text-blue-400 font-semibold mb-1">
            รอรับเงิน {fmtAmt(pendingIncomeTotal)} บาท
          </p>
          <div className="space-y-1.5 pl-2">
            {pendingIncomeItems.map((p) => (
              <ReminderRow
                key={p.id}
                marker="●"
                markerClass="text-blue-300"
                label={p.description || 'บิลรอรับเงิน'}
                value={p.amount}
              />
            ))}
          </div>
        </div>
      )}

      {(pendingItems.length > 0 || taxItems.length > 0) && (
        <div className="mb-2 pt-1.5 border-t border-gray-700">
          <p className="text-orange-400 font-semibold mb-1">
            รอจ่ายเงิน / แจ้งเตือน{pendingPaymentTotal > 0 ? ` ${fmtAmt(pendingPaymentTotal)} บาท` : ''}
          </p>
          <div className="space-y-1.5 pl-2">
            {pendingItems.map((p) => (
              <ReminderRow
                key={p.id}
                marker="●"
                markerClass="text-orange-300"
                label={p.itemName || p.description || 'รอจ่ายเงิน'}
                value={p.amount}
              />
            ))}
            {taxItems.map((t) => (
              <ReminderRow
                key={t.id}
                marker="◆"
                markerClass="text-purple-300"
                label={`${t.itemName || 'ใบกำกับภาษี'}${t.receiptNo ? ` #${t.receiptNo}` : ''}`}
                value={t.amount}
              />
            ))}
          </div>
        </div>
      )}

      {recurringItems.length > 0 && (
        <div className="mb-2 pt-1.5 border-t border-gray-700">
          <p className="text-purple-400 font-semibold mb-1">🔁 รายการประจำ</p>
          <div className="space-y-1 pl-2">
            {recurringItems.map(({ entry, item }) => (
              <div key={entry.id} className="flex items-center justify-between gap-2">
                <span className={entry.status === 'paid' ? 'text-emerald-400' : entry.status === 'skipped' ? 'text-gray-500 line-through' : 'text-purple-300'}>
                  {entry.status === 'paid' ? '✅' : entry.status === 'skipped' ? '⏭' : '⏳'} {item.name}
                </span>
                {entry.amount > 0 && (
                  <span className="text-gray-400 tabular-nums flex-shrink-0">{entry.amount.toLocaleString('th-TH')}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {cardBills.length > 0 && (
        <div className="mb-2 pt-1.5 border-t border-gray-700">
          <p className="text-rose-400 font-semibold mb-1">💳 บิลบัตรเครดิต</p>
          <div className="space-y-1 pl-2">
            {cardBills.map((b) => (
              <div key={b.key} className="flex items-start justify-between gap-2">
                <span className={b.paid ? 'text-emerald-400' : b.overdue ? 'text-rose-300' : 'text-gray-200'}>
                  {b.paid ? '✅' : b.overdue ? '⚠' : b.projected ? '~' : '⏳'} {b.cardName}
                  {b.projected && <span className="text-gray-500"> (ประมาณการ)</span>}
                </span>
                <span className="text-gray-300 tabular-nums flex-shrink-0">{b.amount.toLocaleString('th-TH')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasSummary && (
        <div className="mb-2 pt-1.5 border-t border-gray-700">
          <p className="text-gray-300 font-semibold mb-1">สรุปยอด</p>
          <div className="space-y-1 pl-2">
            <TooltipRow label="รายจ่ายประจำ" value={recurringTotal} />
            <TooltipRow label="รายจ่าย" value={normalExpenseTotal} />
            <div className="flex justify-between gap-3 pt-1 border-t border-gray-700/60">
              <span className="text-red-400 font-semibold">รวมจ่าย</span>
              <span className="font-bold tabular-nums text-red-400 flex-shrink-0">{paidTotal.toLocaleString('th-TH')}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-emerald-400 font-semibold">รวมรับ</span>
              <span className="font-bold tabular-nums text-emerald-400 flex-shrink-0">{totalIncome.toLocaleString('th-TH')}</span>
            </div>
          </div>
        </div>
      )}

      {note && (
        <div className="pt-1.5 border-t border-gray-700">
          <p className="text-yellow-400 font-semibold mb-1">📝 โน้ต</p>
          <p className="text-gray-200 leading-relaxed whitespace-pre-wrap">{note}</p>
        </div>
      )}
    </div>
  )
}

export default function CalendarDayCell({
  date, dateStr, isCurrentMonth, isToday, isHighlighted, isInCustomRange,
  transactions, pendingItems, pendingIncomeItems = [], taxItems, recurringItems = [], cardBills = [], note,
  onContextMenu, onClick, getCategoryName, todayStr,
  yearlyItems = [], yearlyDueThisMonth = [], onYearlyClick,
}) {
  const cellRef = useRef(null)
  const [tooltipPos, setTooltipPos] = useState(null)
  const timerRef = useRef(null)

  const income = transactions.filter((t) => t.type === 'income')
  const expense = transactions.filter((t) => t.type === 'expense')
  const totalIncome = income.reduce((s, t) => s + t.amount, 0)
  const totalExpense = expense.reduce((s, t) => s + t.amount, 0)

  const recurringPending = recurringItems.filter(({ entry }) => entry.status === 'pending')
  const recurringPaid = recurringItems.filter(({ entry }) => entry.status === 'paid')

  const cardBillsUnpaid = cardBills.filter((b) => !b.paid)
  const hasContent = totalIncome > 0 || totalExpense > 0 || pendingItems.length > 0 || pendingIncomeItems.length > 0 || taxItems.length > 0 || recurringItems.length > 0 || cardBills.length > 0 || note
  const isOverdue = dateStr < todayStr && (pendingItems.length > 0 || recurringPending.length > 0)
  const hasPendingPayment = pendingItems.length > 0
  const hasNote = !!note

  // bg priority: note > overdue > custom-range > highlighted > white
  let bgClass = 'bg-white'
  if (isInCustomRange && !hasNote && !isOverdue) bgClass = 'bg-blue-50'
  if (isHighlighted && !isToday && !hasNote && !isOverdue) bgClass = 'bg-blue-50'
  if (hasPendingPayment && !hasNote) bgClass = 'bg-orange-50'
  if (isOverdue && !hasNote) bgClass = 'bg-orange-50'
  if (hasNote) bgClass = 'bg-yellow-100'

  // border
  const borderClass = isToday
    ? 'border-2 border-blue-400'
    : isHighlighted && !isToday
    ? 'border-2 border-blue-200'
    : 'border border-gray-200'

  const handleMouseEnter = useCallback(() => {
    if (!hasContent) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (!cellRef.current) return
      const rect = cellRef.current.getBoundingClientRect()
      const centeredLeft = rect.left + rect.width / 2
      setTooltipPos({
        left: Math.min(Math.max(centeredLeft, 110), window.innerWidth - 110),
        top: rect.top,
        bottom: rect.bottom,
        above: rect.top > 260,
      })
    }, 250)
  }, [hasContent])

  const handleMouseLeave = useCallback(() => {
    clearTimeout(timerRef.current)
    setTooltipPos(null)
  }, [])

  const dotCount = pendingItems.length + pendingIncomeItems.length + taxItems.length + recurringPending.length + cardBillsUnpaid.length
  const visiblePending = pendingItems.slice(0, 3)
  const visiblePendingIncome = pendingIncomeItems.slice(0, Math.max(0, 3 - pendingItems.length))
  const visibleTax = taxItems.slice(0, Math.max(0, 3 - pendingItems.length - pendingIncomeItems.length))
  const visibleRecurring = recurringPending.slice(0, Math.max(0, 3 - pendingItems.length - pendingIncomeItems.length - taxItems.length))
  const visibleCardBills = cardBillsUnpaid.slice(0, Math.max(0, 3 - pendingItems.length - pendingIncomeItems.length - taxItems.length - recurringPending.length))
  const extraDots = dotCount > 3 ? dotCount - 3 : 0

  return (
    <>
      <div
        ref={cellRef}
        className={`relative p-1.5 rounded-lg cursor-pointer select-none flex flex-col
          min-h-[80px] transition-all
          ${bgClass} ${borderClass}
          ${isCurrentMonth ? '' : 'opacity-40'}
          hover:brightness-95`}
        onClick={() => onClick(dateStr)}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(dateStr) }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Header: note icon + day number */}
        <div className="flex items-center justify-between mb-0.5">
          {hasNote
            ? <span className="text-yellow-500 text-xs leading-none">✎</span>
            : <span className="w-3" />}
          <span className={`text-xs font-bold leading-none ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>
            {date.getDate()}
          </span>
        </div>

        {/* ป้ายรายปี — ติดไว้ที่วันที่ 1 ของทุกเดือน เพื่อให้เห็นทุกเดือนว่ามีรายจ่ายรายปีอยู่
            ไม่ใช่โผล่ปีละครั้งแล้วหายไปจากสายตาอีก 11 เดือน */}
        {yearlyItems.length > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onYearlyClick?.() }}
            className={`w-full text-[10px] leading-tight rounded px-1 py-0.5 mb-0.5 font-medium truncate transition-colors ${
              yearlyDueThisMonth.length > 0
                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                : 'bg-violet-100 text-violet-700 hover:bg-violet-200'
            }`}
            title={
              yearlyDueThisMonth.length > 0
                ? `เดือนนี้มีรายจ่ายรายปีครบกำหนด ${yearlyDueThisMonth.length} รายการ`
                : `มีรายจ่ายประจำรายปี ${yearlyItems.length} รายการ กดเพื่อดูทั้งหมด`
            }
          >
            📆 {yearlyDueThisMonth.length > 0 ? `ครบ ${yearlyDueThisMonth.length}` : `รายปี ${yearlyItems.length}`}
          </button>
        )}

        {/* Amounts */}
        <div className="flex-1 space-y-0.5 mt-0.5">
          {totalIncome > 0 && (
            <p className="text-[11px] font-semibold text-emerald-600 leading-tight tabular-nums">
              {fmtAmt(totalIncome)}
            </p>
          )}
          {totalExpense > 0 && (
            <p className="text-[11px] font-semibold text-red-500 leading-tight tabular-nums">
              -{fmtAmt(totalExpense)}
            </p>
          )}
        </div>

        {/* Recurring paid indicator */}
        {recurringPaid.length > 0 && recurringPending.length === 0 && (
          <div className="flex gap-0.5 mt-0.5">
            {recurringPaid.slice(0, 3).map((_, i) => (
              <span key={'rp' + i} className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-purple-300" />
            ))}
          </div>
        )}

        {/* Notification dots */}
        {dotCount > 0 && (
          <div className="flex gap-0.5 flex-wrap mt-1 items-center">
            {visiblePending.map((_, i) => (
              <span
                key={'p' + i}
                className={`w-2 h-2 rounded-full flex-shrink-0 ${isOverdue ? 'bg-orange-600' : 'bg-orange-400'}`}
              />
            ))}
            {visiblePendingIncome.map((_, i) => (
              <span key={'pi' + i} className="w-2 h-2 rounded-full flex-shrink-0 bg-blue-400" />
            ))}
            {visibleTax.map((_, i) => (
              <span key={'t' + i} className="w-2 h-2 rounded-full flex-shrink-0 bg-purple-500" />
            ))}
            {visibleRecurring.map((_, i) => (
              <span key={'r' + i} className={`w-2 h-2 rounded-full flex-shrink-0 ${isOverdue ? 'bg-purple-700' : 'bg-purple-400'}`} />
            ))}
            {visibleCardBills.map((b, i) => (
              <span key={'cb' + i} className={`w-2 h-2 rounded-full flex-shrink-0 ${b.overdue ? 'bg-rose-600' : 'bg-rose-400'}`} />
            ))}
            {extraDots > 0 && (
              <span className="text-gray-400 text-[9px] leading-none">+{extraDots}</span>
            )}
          </div>
        )}
      </div>

      {tooltipPos && hasContent && createPortal(
        <CalendarTooltip
          dateStr={dateStr}
          income={income}
          expense={expense}
          totalIncome={totalIncome}
          totalExpense={totalExpense}
          pendingItems={pendingItems}
          pendingIncomeItems={pendingIncomeItems}
          taxItems={taxItems}
          recurringItems={recurringItems}
          cardBills={cardBills}
          note={note}
          getCategoryName={getCategoryName}
          pos={tooltipPos}
        />,
        document.body
      )}
    </>
  )
}
