import { useState } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'

export const REPORT_TYPES = [
  { key: 'daily_income', label: 'รายรับรวมตามรายวัน', importable: true },
  { key: 'income_by_type', label: 'รายรับแยกประเภท', importable: true },
  { key: 'expense', label: 'รายจ่าย', importable: false },
  { key: 'expense_by_cat', label: 'รายจ่ายแยกประเภท', importable: false },
  { key: 'summary', label: 'รายรับ-รายจ่ายรวม', importable: true },
]

const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

function isFullMonth(start, end) {
  try {
    const d = new Date(start + 'T00:00:00')
    return (
      start === format(startOfMonth(d), 'yyyy-MM-dd') &&
      end === format(endOfMonth(d), 'yyyy-MM-dd')
    )
  } catch { return false }
}

export default function ReportSelector({ type, setType, startDate, endDate, setStartDate, setEndDate, groupBy, setGroupBy }) {
  const currentYear = new Date().getFullYear()
  const [yearView, setYearView] = useState(currentYear)

  const selectedYearNum = parseInt(startDate.substring(0, 4))
  const selectedMonthNum = isFullMonth(startDate, endDate) && selectedYearNum === yearView
    ? parseInt(startDate.substring(5, 7))
    : null

  const selectMonth = (year, month) => {
    const d = new Date(year, month - 1, 1)
    setStartDate(format(startOfMonth(d), 'yyyy-MM-dd'))
    setEndDate(format(endOfMonth(d), 'yyyy-MM-dd'))
    setGroupBy('day')
  }

  const selectYear = (year) => {
    setStartDate(`${year}-01-01`)
    setEndDate(`${year}-12-31`)
    setGroupBy('month')
  }

  return (
    <div className="space-y-4">
      {/* Report type */}
      <div>
        <label className="label">ประเภทรายงาน</label>
        <div className="flex flex-wrap gap-2">
          {REPORT_TYPES.map((r) => (
            <button
              key={r.key}
              className={`btn text-sm ${type === r.key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setType(r.key)}
            >
              {r.label}
              {r.importable && <span className="ml-1 text-xs opacity-70">(import)</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Year selector */}
      <div>
        <label className="label">ปี</label>
        <div className="flex gap-2 flex-wrap items-center">
          {[currentYear - 1, currentYear].map((y) => (
            <button
              key={y}
              className={`btn text-sm ${yearView === y ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setYearView(y)}
            >
              {y + 543}
            </button>
          ))}
          <button
            className="btn btn-secondary text-sm font-semibold"
            onClick={() => selectYear(yearView)}
          >
            ทั้งปี {yearView + 543}
          </button>
        </div>
      </div>

      {/* Month quick-select */}
      <div>
        <label className="label">เดือน</label>
        <div className="flex gap-1.5 flex-wrap">
          {MONTHS_TH.map((name, i) => (
            <button
              key={i}
              className={`btn text-xs py-1 px-2.5 ${selectedMonthNum === i + 1 ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => selectMonth(yearView, i + 1)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* groupBy toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <label className="label mb-0 mr-1">แสดงแบบ</label>
        {[{ key: 'day', label: 'รายวัน' }, { key: 'month', label: 'รายเดือน' }].map(({ key, label }) => (
          <button
            key={key}
            className={`btn text-sm ${groupBy === key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setGroupBy(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Custom date range */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <label className="label">ตั้งแต่</label>
          <input type="date" className="input w-40" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className="label">ถึง</label>
          <input type="date" className="input w-40" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>
    </div>
  )
}
