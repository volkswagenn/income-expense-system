import { useEffect, useMemo, useRef, useState } from 'react'
import { addMonths, startOfMonth, getDaysInMonth } from 'date-fns'
import { localDateStr } from '../../lib/dateUtils'
import PopoverPanel from './PopoverPanel'

const DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
const MONTHS_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

function monthCells(year, month) {
  const first = new Date(year, month, 1)
  const cells = Array(first.getDay()).fill(null)
  for (let d = 1; d <= getDaysInMonth(first); d += 1) cells.push(new Date(year, month, d))
  return cells
}

/**
 * ปฏิทินเลือกวันเดียว หน้าตาชุดเดียวกับปฏิทินเลือกช่วง
 * ใช้แทน <input type="date"> ของเบราว์เซอร์เพื่อให้ทั้งระบบเป็นแบบเดียวกัน
 */
export function DateCalendar({ value, onPick, onClose }) {
  const [view, setView] = useState(() =>
    startOfMonth(value ? new Date(value + 'T00:00:00') : new Date())
  )
  const cells = useMemo(() => monthCells(view.getFullYear(), view.getMonth()), [view])
  const today = localDateStr()

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl p-3 w-[16.5rem]">
      <div className="flex items-center justify-between mb-2">
        <button type="button" className="w-7 h-7 rounded-lg hover:bg-gray-100 text-gray-500"
          onClick={() => setView((m) => addMonths(m, -1))}>‹</button>
        <span className="text-sm font-semibold text-gray-800">
          {MONTHS_TH[view.getMonth()]} {view.getFullYear() + 543}
        </span>
        <button type="button" className="w-7 h-7 rounded-lg hover:bg-gray-100 text-gray-500"
          onClick={() => setView((m) => addMonths(m, 1))}>›</button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {DOW.map((d, i) => (
          <div key={d} className={`text-center text-[11px] font-medium py-1 ${i === 0 ? 'text-red-400' : 'text-gray-400'}`}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((date, i) => {
          if (!date) return <div key={`x${i}`} />
          const str = localDateStr(date)
          const selected = str === value
          const isToday = str === today
          return (
            <button
              key={str}
              type="button"
              onClick={() => { onPick(str); onClose() }}
              className={`h-8 text-[13px] rounded-lg flex items-center justify-center relative transition-colors ${
                selected ? 'bg-blue-600 text-white font-semibold'
                  : date.getDay() === 0 ? 'text-red-500 hover:bg-blue-50' : 'text-gray-700 hover:bg-blue-50'
              }`}
            >
              {date.getDate()}
              {isToday && !selected && <span className="absolute bottom-1 w-1 h-1 rounded-full bg-blue-500" />}
            </button>
          )
        })}
      </div>

      <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100">
        <button type="button" className="text-xs text-blue-600 hover:text-blue-700"
          onClick={() => { onPick(today); onClose() }}>วันนี้</button>
        <button type="button" className="text-xs text-gray-400 hover:text-gray-600" onClick={onClose}>ปิด</button>
      </div>
    </div>
  )
}

/** ช่องเลือกวันที่พร้อมปฏิทินป๊อปอัป — ใช้แทน <input type="date"> */
export default function DatePicker({ value, onChange, className = 'input', placeholder = 'เลือกวันที่' }) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  const anchorRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const label = value
    ? (() => {
        const d = new Date(value + 'T00:00:00')
        const M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
        return `${d.getDate()} ${M[d.getMonth()]} ${d.getFullYear() + 543}`
      })()
    : ''

  return (
    <div ref={boxRef}>
      <button
        ref={anchorRef}
        type="button"
        className={`${className} w-full text-left flex items-center gap-2`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-gray-400">🗓</span>
        <span className={label ? 'text-gray-800' : 'text-gray-400'}>{label || placeholder}</span>
      </button>
      {open && (
        <PopoverPanel anchorRef={anchorRef}>
          <DateCalendar value={value} onPick={onChange} onClose={() => setOpen(false)} />
        </PopoverPanel>
      )}
    </div>
  )
}
