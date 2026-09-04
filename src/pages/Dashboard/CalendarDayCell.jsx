import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

/**
 * ยอดในช่องวัน — แสดงจำนวนเต็มเสมอ ไม่ย่อเป็น k/M
 * ตัวเลขย่อทำให้อ่านผิดง่าย (14k คือ 13,640 หรือ 14,400 ก็ได้) ซึ่งเป็นตัวเลขเงิน
 * จึงต้องเห็นเต็มจำนวน ตัดเศษสตางค์ออกเพื่อให้พอดีความกว้างช่อง
 */
function fmtAmt(n) {
  return Math.round(Math.abs(Number(n) || 0)).toLocaleString('th-TH')
}

/** สีของป้ายบอกงานที่ครบกำหนดวันนั้น — ชุดเดียวกับชั้นข้อมูลบนหัวปฏิทิน */
const MARK_STYLE = {
  recurring: { bg: 'bg-recurring-soft', fg: 'text-[#5A3C90]' },
  pending: { bg: 'bg-pending-soft', fg: 'text-[#8A6A15]' },
  card: { bg: 'bg-expense-soft', fg: 'text-[#A93A2E]' },
  income: { bg: 'bg-income-soft', fg: 'text-[#0F6A50]' },
  tax: { bg: 'bg-[#FBEFE4]', fg: 'text-[#B4571E]' },
}

const DOT_COLOR = {
  pending: '#A8760B',
  pendingIncome: '#3A55C4',
  tax: '#B4571E',
  recurring: '#6D4AA8',
  cardBill: '#B3335C',
}

// ── กล่องรายละเอียดตอนเอาเมาส์ค้าง ────────────────────────────────────────────

function TipRow({ label, value, tone = 'text-gray-300' }) {
  return (
    <div className="flex justify-between gap-3">
      <span className={`truncate ${tone}`}>{label}</span>
      <span className="font-semibold tabular-nums text-white flex-shrink-0">
        {Number(value).toLocaleString('th-TH')}
      </span>
    </div>
  )
}

function Tooltip({ dateStr, income, expense, pendingItems, pendingIncomeItems, taxItems, recurringItems, cardBills, note, getCategoryName, pos }) {
  const d = new Date(dateStr + 'T00:00:00')
  const dateLabel = `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`
  const totalIncome = income.reduce((s, t) => s + Number(t.amount || 0), 0)
  const recurringTotal = recurringItems.reduce((s, { entry }) => s + (entry.status === 'skipped' ? 0 : Number(entry.amount || 0)), 0)
  const normalExpense = expense.reduce((s, t) => s + (t.recurringEntryId ? 0 : Number(t.amount || 0)), 0)

  const expenseGroups = {}
  expense.forEach((t) => {
    const k = getCategoryName(t.category)
    expenseGroups[k] = (expenseGroups[k] || 0) + Number(t.amount || 0)
  })

  const style = {
    left: pos.left,
    top: pos.above ? pos.top - 8 : pos.bottom + 8,
    transform: pos.above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
  }

  return createPortal(
    <div
      className="fixed z-[60] w-[230px] rounded-xl bg-ink text-white shadow-pop px-3 py-2.5 text-[11px] space-y-1.5 pointer-events-none"
      style={style}
    >
      <p className="font-semibold text-[12px] text-white">{dateLabel}</p>

      {totalIncome > 0 && <TipRow label="รายรับ" value={totalIncome} tone="text-[#9FD9C0]" />}
      {Object.entries(expenseGroups).slice(0, 4).map(([k, v]) => <TipRow key={k} label={k} value={v} />)}
      {recurringTotal > 0 && <TipRow label="รายจ่ายประจำ" value={recurringTotal} tone="text-[#C7B6E8]" />}

      {(normalExpense > 0 || recurringTotal > 0) && (
        <div className="flex justify-between gap-3 border-t border-white/15 pt-1.5">
          <span className="text-gray-300">รวมจ่าย</span>
          <span className="font-bold tabular-nums text-[#F2A0A0]">
            {(normalExpense + recurringTotal).toLocaleString('th-TH')}
          </span>
        </div>
      )}

      {pendingItems.length > 0 && (
        <p className="text-[#E8C877]">ค้างชำระ {pendingItems.length} รายการ · {pendingItems.reduce((s, p) => s + Number(p.amount || 0), 0).toLocaleString('th-TH')}</p>
      )}
      {pendingIncomeItems.length > 0 && (
        <p className="text-[#A9BEF0]">รอรับเงิน {pendingIncomeItems.length} รายการ</p>
      )}
      {taxItems.length > 0 && <p className="text-[#E0A886]">รอใบกำกับภาษี {taxItems.length} รายการ</p>}
      {cardBills.length > 0 && (
        <p className="text-[#F0A9A0]">
          บิลบัตร {cardBills.map((b) => b.cardName).join(', ')}
        </p>
      )}
      {note && <p className="text-[#EBD98A] border-t border-white/15 pt-1.5">โน้ต: {note}</p>}
    </div>,
    document.body
  )
}

/**
 * ช่องวันหนึ่งช่องบนปฏิทิน — ตามแบบใหม่
 *
 * ลำดับข้อมูลในช่อง: ป้าย (วันนี้/โน้ต) + เลขวัน → ยอดรับ/จ่าย → ป้ายงานที่ครบกำหนด → จุดสี
 * สีพื้นบอกสถานะ: ขาว = ปกติ, ครีม = มีของค้างจ่าย, เหลืองอ่อน = มีโน้ต, เขียวอ่อน = วันที่เลือก
 * ขอบเป็นเงาด้านใน (inset ring) แทน border จะได้ไม่ทำให้ช่องขยับตอนเปลี่ยนสถานะ
 */
export default function CalendarDayCell({
  date, dateStr, isCurrentMonth, isToday, isHighlighted, isInCustomRange,
  transactions, pendingItems, pendingIncomeItems = [], taxItems, recurringItems = [], cardBills = [], note,
  onContextMenu, onClick, getCategoryName, todayStr,
  yearlyItems = [], yearlyDueThisMonth = [], onYearlyClick,
}) {
  const cellRef = useRef(null)
  const timerRef = useRef(null)
  const [tooltipPos, setTooltipPos] = useState(null)

  const income = transactions.filter((t) => t.type === 'income')
  const expense = transactions.filter((t) => t.type === 'expense')
  const totalIncome = income.reduce((s, t) => s + Number(t.amount || 0), 0)
  const totalExpense = expense.reduce((s, t) => s + Number(t.amount || 0), 0)

  const recurringPending = recurringItems.filter(({ entry }) => entry.status === 'pending')
  const cardBillsUnpaid = cardBills.filter((b) => !b.paid)
  const hasNote = !!note
  const isOverdue = dateStr < todayStr && (pendingItems.length > 0 || recurringPending.length > 0)

  const hasContent = totalIncome > 0 || totalExpense > 0 || pendingItems.length > 0
    || pendingIncomeItems.length > 0 || taxItems.length > 0 || recurringItems.length > 0
    || cardBills.length > 0 || hasNote

  // ── ป้ายงานที่ครบกำหนดวันนี้ — เลือกอันที่ "ต้องทำ" ก่อนเสมอ ────────────────
  let mark = null
  if (cardBillsUnpaid.length > 0) {
    mark = { kind: 'card', label: `บิล ${cardBillsUnpaid[0].cardName}` }
  } else if (pendingItems.length > 0) {
    mark = { kind: 'pending', label: pendingItems[0].description || pendingItems[0].itemName || 'ค้างชำระ' }
  } else if (recurringPending.length > 0) {
    mark = { kind: 'recurring', label: recurringPending[0].item?.name ?? 'รายการประจำ' }
  } else if (pendingIncomeItems.length > 0) {
    mark = { kind: 'income', label: pendingIncomeItems[0].description || 'รอรับเงิน' }
  } else if (taxItems.length > 0) {
    mark = { kind: 'tax', label: taxItems[0].itemName || 'ใบกำกับภาษี' }
  }
  const markStyle = mark ? MARK_STYLE[mark.kind] : null

  // จุดสีบอกว่ายังมีงานชนิดอื่นอีก (ชนิดที่ถูกใช้เป็นป้ายไปแล้วไม่ต้องนับซ้ำ)
  const dots = []
  if (pendingItems.length > 0 && mark?.kind !== 'pending') dots.push(DOT_COLOR.pending)
  if (recurringPending.length > 0 && mark?.kind !== 'recurring') dots.push(DOT_COLOR.recurring)
  if (cardBillsUnpaid.length > 0 && mark?.kind !== 'card') dots.push(DOT_COLOR.cardBill)
  if (pendingIncomeItems.length > 0 && mark?.kind !== 'income') dots.push(DOT_COLOR.pendingIncome)
  if (taxItems.length > 0 && mark?.kind !== 'tax') dots.push(DOT_COLOR.tax)
  const shownDots = dots.slice(0, 3)
  const extraDots = dots.length - shownDots.length

  // พื้นหลัง: เลือกอยู่ > โน้ต > มีของค้าง/เกินกำหนด > อยู่ในช่วงที่กรอง > ปกติ
  let bg = 'bg-white'
  if (isInCustomRange) bg = 'bg-[#F7F8FC]'
  if (pendingItems.length > 0 || isOverdue) bg = 'bg-[#FDFAF2]'
  if (hasNote) bg = 'bg-[#FBF6DC]'
  if (isHighlighted) bg = 'bg-[#F2FAD9]'

  const ring = isHighlighted
    ? 'shadow-[0_0_0_2px_#16181D_inset]'
    : isToday
      ? 'shadow-[0_0_0_1.5px_#C7F250_inset,0_0_0_1px_#E4E2DC_inset]'
      : 'shadow-[0_0_0_1px_#EFEDE7_inset]'

  const handleMouseEnter = useCallback(() => {
    if (!hasContent) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (!cellRef.current) return
      const rect = cellRef.current.getBoundingClientRect()
      setTooltipPos({
        left: Math.min(Math.max(rect.left + rect.width / 2, 120), window.innerWidth - 120),
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

  const showYearlyFlag = yearlyItems.length > 0 && date.getDate() === 1

  return (
    <>
      <div
        ref={cellRef}
        role="button"
        tabIndex={0}
        className={`relative px-1 lg:px-[7px] py-1 lg:py-1.5 rounded-[10px] cursor-pointer select-none flex flex-col
          min-h-[58px] lg:min-h-[76px] overflow-hidden transition-shadow ${bg} ${ring}
          ${isCurrentMonth ? '' : 'opacity-[0.42]'}
          hover:shadow-[0_0_0_2px_#D8D4C9_inset]`}
        onClick={() => onClick(dateStr)}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(dateStr) }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex items-center justify-between gap-1">
          {/* ป้ายคำซ่อนบนมือถือ — ช่องแคบจนคำหัก วงกรอบ lime กับพื้นเหลืองบอกแทนอยู่แล้ว */}
          {(isToday || hasNote) && (
            <span className={`hidden sm:inline text-[9.5px] font-bold rounded-[5px] px-1.5 py-px whitespace-nowrap ${
              hasNote ? 'bg-[#F3E7B5] text-[#7A6412]' : 'bg-lime text-ink'
            }`}>
              {hasNote ? 'โน้ต' : 'วันนี้'}
            </span>
          )}
          <span className={`tabular-nums ml-auto text-[12.5px] ${
            isHighlighted ? 'font-bold text-ink' : isToday ? 'font-bold text-[#5C7A0F]' : 'font-medium text-muted'
          }`}>
            {date.getDate()}
          </span>
        </div>

        <div className="flex-1 mt-[3px] min-h-0">
          {totalIncome > 0 && (
            <p className="tabular-nums text-[10.5px] lg:text-xs font-semibold text-income leading-[1.15]">{fmtAmt(totalIncome)}</p>
          )}
          {totalExpense > 0 && (
            <p className="tabular-nums text-[10.5px] lg:text-xs font-semibold text-expense leading-[1.15]">−{fmtAmt(totalExpense)}</p>
          )}
        </div>

        {/* ป้ายรายปี — ติดที่วันที่ 1 ของทุกเดือนเพื่อให้เห็นได้ทุกเดือน ไม่ใช่เฉพาะเดือนที่เรียกเก็บ */}
        {showYearlyFlag && (
          <button
            onClick={(e) => { e.stopPropagation(); onYearlyClick?.() }}
            className={`mt-auto rounded-md px-1.5 py-px text-[10px] font-semibold truncate text-left ${
              yearlyDueThisMonth.length > 0 ? 'bg-recurring-soft text-[#5A3C90]' : 'bg-paper text-muted'
            }`}
            title="ดูรายจ่ายประจำแบบรายปีทั้งหมด"
          >
            รายปี {yearlyItems.length}
          </button>
        )}

        {/* ช่องบนมือถือแคบเกินกว่าจะใส่ป้ายชื่อ — เหลือจุดสีบอกว่ามีงาน กดวันแล้วดูในแผงข้างล่าง */}
        {mark && (
          <div className={`hidden sm:block mt-auto rounded-md px-1.5 py-px text-[10px] font-semibold truncate ${markStyle.bg} ${markStyle.fg}`}>
            {mark.label}
          </div>
        )}

        {shownDots.length > 0 && (
          <div className="flex gap-[3px] items-center mt-[3px]">
            {shownDots.map((c, i) => (
              <span key={i} className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: c }} />
            ))}
            {extraDots > 0 && <span className="tabular-nums text-[9.5px] text-faint">+{extraDots}</span>}
          </div>
        )}
      </div>

      {tooltipPos && (
        <Tooltip
          dateStr={dateStr}
          income={income}
          expense={expense}
          pendingItems={pendingItems}
          pendingIncomeItems={pendingIncomeItems}
          taxItems={taxItems}
          recurringItems={recurringItems}
          cardBills={cardBills}
          note={note}
          getCategoryName={getCategoryName}
          pos={tooltipPos}
        />
      )}
    </>
  )
}
