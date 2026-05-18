import { useState, useEffect } from 'react'
import { format, startOfMonth, endOfMonth, subDays } from 'date-fns'

const THAI_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

function getYearOptions(count = 6) {
  const y = new Date().getFullYear()
  return Array.from({ length: count }, (_, i) => y - i)
}

const YEARS = getYearOptions(6)

function initFromDate(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date()
  return { month: d.getMonth() + 1, year: d.getFullYear() }
}

export default function DateRangeFilter({ filter, setFilter, startDate, endDate, setStartDate, setEndDate }) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')

  const init = initFromDate(startDate)
  const [selMonth, setSelMonth] = useState(init.month)
  const [selYear, setSelYear] = useState(init.year)

  // Sync dropdowns when CalendarView navigates months
  useEffect(() => {
    if (filter === 'month' && startDate) {
      const d = new Date(startDate + 'T00:00:00')
      setSelMonth(d.getMonth() + 1)
      setSelYear(d.getFullYear())
    }
  }, [startDate, filter])

  const applyPreset = (type) => {
    setFilter(type)
    if (type === 'today') { setStartDate(today); setEndDate(today) }
    if (type === 'yesterday') { setStartDate(yesterday); setEndDate(yesterday) }
  }

  const applyMonth = (month, year) => {
    setFilter('month')
    const d = new Date(year, month - 1, 1)
    setStartDate(format(startOfMonth(d), 'yyyy-MM-dd'))
    setEndDate(format(endOfMonth(d), 'yyyy-MM-dd'))
  }

  const handleMonthChange = (m) => {
    const month = Number(m)
    setSelMonth(month)
    applyMonth(month, selYear)
  }

  const handleYearChange = (y) => {
    const year = Number(y)
    setSelYear(year)
    applyMonth(selMonth, year)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {[
        { key: 'today', label: 'วันนี้' },
        { key: 'yesterday', label: 'เมื่อวาน' },
      ].map((opt) => (
        <button
          key={opt.key}
          className={`btn text-sm ${filter === opt.key ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => applyPreset(opt.key)}
        >
          {opt.label}
        </button>
      ))}

      {/* Month + Year dropdowns — clicking either activates "month" filter */}
      <div className={`flex items-center gap-1 rounded-lg ${filter === 'month' ? 'ring-2 ring-blue-300' : ''}`}>
        <select
          className="input text-sm py-1.5 rounded-r-none border-r-0"
          style={{ width: '5.5rem' }}
          value={selMonth}
          onChange={(e) => handleMonthChange(e.target.value)}
        >
          {THAI_MONTHS.map((label, i) => (
            <option key={i + 1} value={i + 1}>{label}</option>
          ))}
        </select>
        <select
          className="input text-sm py-1.5 rounded-l-none"
          style={{ width: '5.5rem' }}
          value={selYear}
          onChange={(e) => handleYearChange(e.target.value)}
        >
          {YEARS.map((y) => (
            <option key={y} value={y}>{y + 543}</option>
          ))}
        </select>
      </div>

      <button
        className={`btn text-sm ${filter === 'custom' ? 'btn-primary' : 'btn-secondary'}`}
        onClick={() => setFilter('custom')}
      >
        กำหนดเอง
      </button>

      {filter === 'custom' && (
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" className="input w-36 text-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <span className="text-gray-500 text-sm">ถึง</span>
          <input type="date" className="input w-36 text-sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      )}
    </div>
  )
}
