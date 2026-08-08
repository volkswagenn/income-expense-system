import { useMemo, useState } from 'react'
import { addMonths, startOfMonth, getDaysInMonth } from 'date-fns'
import { localDateStr } from '../../lib/dateUtils'

const DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
const MONTHS_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

/** ช่องทั้งหมดของเดือน — เติม null หน้าเดือนให้ตรงวันในสัปดาห์ */
function monthCells(year, month) {
  const first = new Date(year, month, 1)
  const lead = first.getDay()
  const days = getDaysInMonth(first)
  const cells = Array(lead).fill(null)
  for (let d = 1; d <= days; d += 1) cells.push(new Date(year, month, d))
  return cells
}

function MonthGrid({ base, from, to, hover, onPick, onHover }) {
  const year = base.getFullYear()
  const month = base.getMonth()
  const cells = useMemo(() => monthCells(year, month), [year, month])
  const today = localDateStr()

  // ปลายช่วงชั่วคราวขณะลากเมาส์ ทำให้เห็นช่วงก่อนคลิกจริง
  const previewEnd = to || (from && hover && hover > from ? hover : null)

  return (
    <div className="w-[15.5rem] shrink-0">
      <p className="text-center text-sm font-semibold text-gray-800 mb-2">
        {MONTHS_TH[month]} {year + 543}
      </p>
      <div className="grid grid-cols-7 mb-1">
        {DOW.map((d, i) => (
          <div key={d} className={`text-center text-[11px] font-medium py-1 ${i === 0 ? 'text-red-400' : 'text-gray-400'}`}>
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((date, i) => {
          if (!date) return <div key={`x${i}`} />
          const str = localDateStr(date)
          const isFrom = str === from
          const isTo = str === previewEnd
          const inRange = from && previewEnd && str > from && str < previewEnd
          const isToday = str === today
          const isSunday = date.getDay() === 0

          const base =
            'h-8 text-[13px] flex items-center justify-center transition-colors relative'
          let cls = 'rounded-lg hover:bg-blue-50 text-gray-700'
          if (isSunday && !isFrom && !isTo && !inRange) cls = 'rounded-lg hover:bg-blue-50 text-red-500'
          if (inRange) cls = 'bg-blue-50 text-blue-800 rounded-none'
          if (isFrom || isTo) cls = 'bg-blue-600 text-white font-semibold rounded-lg'
          if (isFrom && previewEnd && !isTo) cls = 'bg-blue-600 text-white font-semibold rounded-l-lg rounded-r-none'
          if (isTo && from && !isFrom) cls = 'bg-blue-600 text-white font-semibold rounded-r-lg rounded-l-none'

          return (
            <button
              key={str}
              type="button"
              className={`${base} ${cls}`}
              onClick={() => onPick(str)}
              onMouseEnter={() => onHover(str)}
            >
              {date.getDate()}
              {isToday && !isFrom && !isTo && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-blue-500" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * ปฏิทินเลือกช่วงวันที่ แสดง 2 เดือนคู่กัน
 * คลิกครั้งแรก = วันเริ่ม, คลิกครั้งที่สอง = วันสิ้นสุด (คลิกย้อนหลังจะเริ่มนับใหม่)
 */
export default function RangeCalendar({ startDate, endDate, onApply, onCancel }) {
  const [from, setFrom] = useState(startDate || '')
  const [to, setTo] = useState(endDate || '')
  const [hover, setHover] = useState('')
  const [leftMonth, setLeftMonth] = useState(() =>
    startOfMonth(startDate ? new Date(startDate + 'T00:00:00') : new Date())
  )

  const pick = (str) => {
    if (!from || (from && to)) { setFrom(str); setTo(''); return }
    if (str < from) { setFrom(str); setTo(''); return }
    setTo(str)
  }

  const shift = (delta) => setLeftMonth((m) => addMonths(m, delta))

  const ready = from && to
  const label = ready
    ? `${thaiShort(from)} – ${thaiShort(to)}`
    : from ? `${thaiShort(from)} – เลือกวันสิ้นสุด` : 'เลือกวันเริ่มต้น'

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl p-4 w-fit max-w-[calc(100vw-1rem)]">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          className="w-7 h-7 rounded-lg hover:bg-gray-100 text-gray-500 flex items-center justify-center"
          onClick={() => shift(-1)}
        >
          ‹
        </button>
        <span className="text-xs text-gray-500">{label}</span>
        <button
          type="button"
          className="w-7 h-7 rounded-lg hover:bg-gray-100 text-gray-500 flex items-center justify-center"
          onClick={() => shift(1)}
        >
          ›
        </button>
      </div>

      {/* จอแคบให้ซ้อนแนวตั้ง ไม่งั้น 2 เดือนคู่กันจะกว้างเกินจอ */}
      <div className="flex flex-col sm:flex-row gap-4 sm:gap-5" onMouseLeave={() => setHover('')}>
        <MonthGrid base={leftMonth} from={from} to={to} hover={hover} onPick={pick} onHover={setHover} />
        <MonthGrid base={addMonths(leftMonth, 1)} from={from} to={to} hover={hover} onPick={pick} onHover={setHover} />
      </div>

      <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-gray-100">
        <button type="button" className="btn btn-secondary text-sm" onClick={onCancel}>ยกเลิก</button>
        <button
          type="button"
          className="btn btn-primary text-sm disabled:opacity-40"
          disabled={!ready}
          onClick={() => onApply(from, to)}
        >
          เลือก
        </button>
      </div>
    </div>
  )
}

export function thaiShort(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return dateStr
  const M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
  return `${d.getDate()} ${M[d.getMonth()]} ${(d.getFullYear() + 543) % 100}`
}
