import { useState, useEffect, useMemo } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import useTransactionStore from '../../store/useTransactionStore'
import usePendingStore from '../../store/usePendingStore'
import useCategoryStore from '../../store/useCategoryStore'
import useNoteStore from '../../store/useNoteStore'
import useRecurringStore from '../../store/useRecurringStore'
import useCreditCardStore from '../../store/useCreditCardStore'
import CalendarDayCell from './CalendarDayCell'
import CalendarNotePopup from './CalendarNotePopup'
import YearlyRecurringPopup from './YearlyRecurringPopup'
import { isYearly, pauseInfo } from '../../lib/recurringSchedule'
import { localMonthStr } from '../../lib/dateUtils'

const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]
const DAY_HEADERS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

// สิ่งที่เลือกแสดง/ซ่อนบนปฏิทินได้
const LAYERS = [
  { key: 'income',        label: 'รายรับ',        dot: 'bg-emerald-500' },
  { key: 'expense',       label: 'รายจ่าย',       dot: 'bg-red-500' },
  { key: 'pending',       label: 'ค้างชำระ',      dot: 'bg-amber-500' },
  { key: 'pendingIncome', label: 'รอรับเงิน',     dot: 'bg-blue-500' },
  { key: 'tax',           label: 'ใบกำกับภาษี',   dot: 'bg-orange-500' },
  { key: 'recurring',     label: 'รายการประจำ',   dot: 'bg-purple-500' },
  { key: 'cardBill',      label: 'บิลบัตรเครดิต', dot: 'bg-rose-500' },
  { key: 'note',          label: 'โน้ต',          dot: 'bg-gray-400' },
]

const ALL_ON = Object.fromEntries(LAYERS.map((l) => [l.key, true]))

function buildCells(year, month) {
  const firstDow = new Date(year, month, 1).getDay()
  const gridStart = new Date(year, month, 1 - firstDow)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    return d
  })
}

export default function CalendarView({ filter, setFilter, startDate, endDate, setStartDate, setEndDate }) {
  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')

  const [viewYear, setViewYear] = useState(() =>
    startDate ? new Date(startDate + 'T00:00:00').getFullYear() : today.getFullYear()
  )
  const [viewMonth, setViewMonth] = useState(() =>
    startDate ? new Date(startDate + 'T00:00:00').getMonth() : today.getMonth()
  )
  const [noteDate, setNoteDate] = useState(null)
  const [showYearly, setShowYearly] = useState(false)
  const [show, setShow] = useState(ALL_ON)

  const toggleLayer = (key) => setShow((s) => ({ ...s, [key]: !s[key] }))
  const activeCount = LAYERS.filter((l) => show[l.key]).length

  const { transactions } = useTransactionStore()
  const { pendingPayments, taxInvoices, pendingIncomes } = usePendingStore()
  const { getCategoryName } = useCategoryStore()
  const { notes } = useNoteStore()
  const { entries: recurringEntries, items: recurringItems, generateEntries } = useRecurringStore()
  const cards = useCreditCardStore((s) => s.cards)
  const cardStatements = useCreditCardStore((s) => s.statements)
  const cardInstallmentEntries = useCreditCardStore((s) => s.entries)
  const getCardLabel = useCreditCardStore((s) => s.getCardLabel)
  const getUpcomingBills = useCreditCardStore((s) => s.getUpcomingBills)
  const navigate = useNavigate()

  // Sync view when FilterBar changes startDate
  useEffect(() => {
    if (!startDate) return
    const d = new Date(startDate + 'T00:00:00')
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }, [startDate])

  // Generate recurring entries when calendar month changes (หรือเมื่อรายการประจำเปลี่ยน)
  useEffect(() => {
    const month = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`
    generateEntries(month)
  }, [viewYear, viewMonth, recurringItems])

  const cells = useMemo(() => buildCells(viewYear, viewMonth), [viewYear, viewMonth])

  const txByDate = useMemo(() => {
    const map = {}
    transactions.forEach((tx) => {
      if (!map[tx.date]) map[tx.date] = []
      map[tx.date].push(tx)
    })
    return map
  }, [transactions])

  const pendingByDate = useMemo(() => {
    const map = {}
    pendingPayments
      .filter((p) => p.status === 'pending' && p.dueDate)
      .forEach((p) => {
        if (!map[p.dueDate]) map[p.dueDate] = []
        map[p.dueDate].push(p)
      })
    return map
  }, [pendingPayments])

  const pendingIncomeByDate = useMemo(() => {
    const map = {}
    ;(pendingIncomes ?? [])
      .filter((p) => p.status === 'pending' && p.date)
      .forEach((p) => {
        if (!map[p.date]) map[p.date] = []
        map[p.date].push(p)
      })
    return map
  }, [pendingIncomes])

  const taxByDate = useMemo(() => {
    const map = {}
    taxInvoices
      .filter((t) => t.status === 'waiting' && t.dueDate)
      .forEach((t) => {
        if (!map[t.dueDate]) map[t.dueDate] = []
        map[t.dueDate].push(t)
      })
    return map
  }, [taxInvoices])

  // รายปีโผล่ในปฏิทินแค่เดือนเดียวจาก 12 เดือน จึงต้องมีทางเห็นได้ทุกเดือน
  // (ปุ่มบนหัวปฏิทิน + ป้ายบนวันที่ 1 ของทุกเดือน)
  const yearlyItems = useMemo(
    () => recurringItems.filter((it) => it.enabled && !it.deleted && isYearly(it)),
    [recurringItems]
  )

  const yearlyDueThisMonth = useMemo(() => {
    const mon = viewMonth + 1
    return yearlyItems.filter((it) => Number(it.billingMonth) === mon && !pauseInfo(it, localMonthStr()))
  }, [yearlyItems, viewMonth])

  /**
   * บิลบัตรเครดิตตามวันครบกำหนด
   *
   * มีสองแบบและต้องแสดงคนละความหมาย
   *   ปิดรอบแล้ว  = ใบแจ้งยอดที่มีอยู่จริงในฐานข้อมูล ยอดแน่นอน รวมใบที่จ่ายแล้วด้วย
   *                 เพื่อให้ย้อนดูเดือนเก่าแล้วยังเห็นว่าเคยมีบิลวันไหน
   *   ประมาณการ   = รอบที่ยังไม่ปิด คำนวณสดจากรายการที่รูดไว้ ยอดยังขยับได้
   *
   * getUpcomingBills มองไปข้างหน้าจากวันนี้เท่านั้น เวลาเลื่อนปฏิทินไปเดือนถัดๆ ไป
   * จึงต้องขยายช่วงให้ครอบคลุมเดือนที่กำลังดู ไม่งั้นบิลของเดือนนั้นจะหายไปเฉยๆ
   */
  const cardBillsByDate = useMemo(() => {
    const map = {}
    const push = (date, row) => {
      if (!date) return
      if (!map[date]) map[date] = []
      map[date].push(row)
    }

    for (const s of cardStatements) {
      const remaining = Number(s.amount || 0) - Number(s.paidAmount || 0)
      push(s.dueDate, {
        key: `s-${s.id}`,
        cardName: getCardLabel(s.cardId),
        amount: s.status === 'paid' ? Number(s.amount || 0) : remaining,
        paid: s.status === 'paid',
        projected: false,
        overdue: s.status !== 'paid' && s.dueDate < todayStr,
      })
    }

    const monthsAhead = Math.max(
      2,
      (viewYear - today.getFullYear()) * 12 + (viewMonth - today.getMonth()) + 1
    )
    const closedKeys = new Set(cardStatements.map((s) => `${s.cardId}|${s.cycle}`))
    for (const r of getUpcomingBills(monthsAhead).rows) {
      if (r.kind !== 'projected') continue
      if (closedKeys.has(`${r.cardId}|${r.cycle}`)) continue
      push(r.dueDate, {
        key: r.key,
        cardName: getCardLabel(r.cardId),
        amount: r.amount,
        paid: false,
        projected: true,
        overdue: false,
      })
    }
    return map
  }, [cardStatements, cards, transactions, cardInstallmentEntries, viewYear, viewMonth, todayStr])

  const recurringByDate = useMemo(() => {
    const map = {}
    recurringEntries.forEach((entry) => {
      if (!entry.dueDate) return
      const item = recurringItems.find((it) => it.id === entry.recurringId)
      if (!item) return
      if (!map[entry.dueDate]) map[entry.dueDate] = []
      map[entry.dueDate].push({ entry, item })
    })
    return map
  }, [recurringEntries, recurringItems])

  const navigateMonth = (delta) => {
    let m = viewMonth + delta
    let y = viewYear
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setViewMonth(m)
    setViewYear(y)
    // sync FilterBar (ยกเว้น custom ซึ่งยืด range ข้ามเดือน)
    if (filter !== 'custom') {
      const d = new Date(y, m, 1)
      setFilter('month')
      setStartDate(format(startOfMonth(d), 'yyyy-MM-dd'))
      setEndDate(format(endOfMonth(d), 'yyyy-MM-dd'))
    }
  }

  const goToToday = () => {
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
    setFilter('month')
    setStartDate(format(startOfMonth(today), 'yyyy-MM-dd'))
    setEndDate(format(endOfMonth(today), 'yyyy-MM-dd'))
  }

  const isHighlighted = (dateStr) => {
    if (filter === 'today' || filter === 'yesterday') return dateStr === startDate
    if (filter === 'custom' && startDate === endDate) return dateStr === startDate
    return false
  }

  const isInCustomRange = (dateStr) =>
    filter === 'custom' && startDate !== endDate && dateStr >= startDate && dateStr <= endDate

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-1">
          <button
            className="btn btn-secondary w-8 h-8 p-0 flex items-center justify-center text-base"
            onClick={() => navigateMonth(-1)}
          >
            ‹
          </button>
          <h2 className="text-sm font-semibold text-gray-800 min-w-[140px] text-center">
            {THAI_MONTHS_FULL[viewMonth]} {viewYear + 543}
          </h2>
          <button
            className="btn btn-secondary w-8 h-8 p-0 flex items-center justify-center text-base"
            onClick={() => navigateMonth(1)}
          >
            ›
          </button>
        </div>
        <div className="flex items-center gap-2">
          {yearlyItems.length > 0 && (
            <button
              className="btn btn-secondary text-sm gap-1"
              onClick={() => setShowYearly(true)}
              title="ดูรายจ่ายประจำแบบรายปีทั้งหมด"
            >
              📆 รายปี
              <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-violet-100 text-violet-700 text-[11px] font-bold inline-flex items-center justify-center">
                {yearlyItems.length}
              </span>
            </button>
          )}
          <button className="btn btn-secondary text-sm" onClick={goToToday}>วันนี้</button>
        </div>
      </div>

      {/* ตัวกรองสิ่งที่แสดงบนปฏิทิน */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
        <span className="text-xs text-gray-400 mr-0.5">แสดง:</span>
        {LAYERS.map((l) => (
          <button
            key={l.key}
            onClick={() => toggleLayer(l.key)}
            className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border transition-colors ${
              show[l.key]
                ? 'bg-white border-gray-300 text-gray-700 shadow-sm'
                : 'bg-transparent border-gray-200 text-gray-300 line-through'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${show[l.key] ? l.dot : 'bg-gray-300'}`} />
            {l.label}
          </button>
        ))}
        <button
          className="text-xs text-blue-500 hover:text-blue-700 ml-auto"
          onClick={() => setShow(activeCount === LAYERS.length ? {} : ALL_ON)}
        >
          {activeCount === LAYERS.length ? 'ซ่อนทั้งหมด' : 'แสดงทั้งหมด'}
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-500 py-2">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5 p-1">
        {cells.map((date) => {
          const dateStr = format(date, 'yyyy-MM-dd')
          // ซ่อนตามตัวกรองด้านบน — ส่งเฉพาะชั้นข้อมูลที่เปิดอยู่
          const dayTx = (txByDate[dateStr] || []).filter(
            (t) => (t.type === 'income' ? show.income : show.expense)
          )
          return (
            <CalendarDayCell
              key={dateStr}
              date={date}
              dateStr={dateStr}
              isCurrentMonth={date.getMonth() === viewMonth}
              isToday={dateStr === todayStr}
              isHighlighted={isHighlighted(dateStr)}
              isInCustomRange={isInCustomRange(dateStr)}
              transactions={dayTx}
              pendingItems={show.pending ? (pendingByDate[dateStr] || []) : []}
              pendingIncomeItems={show.pendingIncome ? (pendingIncomeByDate[dateStr] || []) : []}
              taxItems={show.tax ? (taxByDate[dateStr] || []) : []}
              recurringItems={show.recurring ? (recurringByDate[dateStr] || []) : []}
              cardBills={show.cardBill ? (cardBillsByDate[dateStr] || []) : []}
              note={show.note ? (notes[dateStr] || '') : ''}
              onContextMenu={setNoteDate}
              onClick={() => navigate('/transactions')}
              getCategoryName={getCategoryName}
              todayStr={todayStr}
              yearlyItems={date.getDate() === 1 && date.getMonth() === viewMonth ? yearlyItems : []}
              yearlyDueThisMonth={yearlyDueThisMonth}
              onYearlyClick={() => setShowYearly(true)}
            />
          )
        })}
      </div>

      {noteDate && (
        <CalendarNotePopup date={noteDate} onClose={() => setNoteDate(null)} />
      )}
      {showYearly && (
        <YearlyRecurringPopup
          items={yearlyItems}
          entries={recurringEntries}
          onClose={() => setShowYearly(false)}
        />
      )}
    </div>
  )
}
