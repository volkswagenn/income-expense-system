import { useState, useEffect, useMemo } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import useTransactionStore from '../../store/useTransactionStore'
import usePendingStore from '../../store/usePendingStore'
import useCategoryStore from '../../store/useCategoryStore'
import useNoteStore from '../../store/useNoteStore'
import useRecurringStore from '../../store/useRecurringStore'
import CalendarDayCell from './CalendarDayCell'
import CalendarNotePopup from './CalendarNotePopup'

const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]
const DAY_HEADERS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

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

  const { transactions } = useTransactionStore()
  const { pendingPayments, taxInvoices, pendingIncomes } = usePendingStore()
  const { getCategoryName } = useCategoryStore()
  const { notes } = useNoteStore()
  const { entries: recurringEntries, items: recurringItems, generateEntries } = useRecurringStore()
  const navigate = useNavigate()

  // Sync view when FilterBar changes startDate
  useEffect(() => {
    if (!startDate) return
    const d = new Date(startDate + 'T00:00:00')
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }, [startDate])

  // Generate recurring entries when calendar month changes
  useEffect(() => {
    const month = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`
    generateEntries(month)
  }, [viewYear, viewMonth])

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
        <button className="btn btn-secondary text-sm" onClick={goToToday}>วันนี้</button>
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
          return (
            <CalendarDayCell
              key={dateStr}
              date={date}
              dateStr={dateStr}
              isCurrentMonth={date.getMonth() === viewMonth}
              isToday={dateStr === todayStr}
              isHighlighted={isHighlighted(dateStr)}
              isInCustomRange={isInCustomRange(dateStr)}
              transactions={txByDate[dateStr] || []}
              pendingItems={pendingByDate[dateStr] || []}
              pendingIncomeItems={pendingIncomeByDate[dateStr] || []}
              taxItems={taxByDate[dateStr] || []}
              recurringItems={recurringByDate[dateStr] || []}
              note={notes[dateStr] || ''}
              onContextMenu={setNoteDate}
              onClick={() => navigate('/transactions')}
              getCategoryName={getCategoryName}
              todayStr={todayStr}
            />
          )
        })}
      </div>

      {noteDate && (
        <CalendarNotePopup date={noteDate} onClose={() => setNoteDate(null)} />
      )}
    </div>
  )
}
