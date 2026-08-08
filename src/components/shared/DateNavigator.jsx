import { useEffect, useRef, useState } from 'react'
import { format, addDays, parseISO } from 'date-fns'
import { th } from 'date-fns/locale'
import { DateCalendar } from './DatePicker'
import PopoverPanel from './PopoverPanel'

/** เลือกวันเดียวพร้อมปุ่มเลื่อนวัน — ใช้ปฏิทินชุดเดียวกับทั้งระบบ */
export default function DateNavigator({ date, onChange }) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  const anchorRef = useRef(null)
  const d = parseISO(date)
  const label = format(d, 'EEEE d MMMM yyyy', { locale: th })

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

  return (
    <div className="flex items-center gap-1" ref={boxRef}>
      <button
        type="button"
        className="btn btn-ghost w-8 h-8 flex items-center justify-center rounded-full p-0 text-lg"
        onClick={() => onChange(format(addDays(d, -1), 'yyyy-MM-dd'))}
        title="วันก่อนหน้า"
      >
        ‹
      </button>

      <div>
        <button
          ref={anchorRef}
          type="button"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-blue-600 transition-colors min-w-52 justify-center"
          onClick={() => setOpen((o) => !o)}
          title="คลิกเพื่อเลือกวันที่"
        >
          <span className="text-base">📅</span>
          {label}
        </button>

        {open && (
          <PopoverPanel anchorRef={anchorRef}>
            <DateCalendar value={date} onPick={onChange} onClose={() => setOpen(false)} />
          </PopoverPanel>
        )}
      </div>

      <button
        type="button"
        className="btn btn-ghost w-8 h-8 flex items-center justify-center rounded-full p-0 text-lg"
        onClick={() => onChange(format(addDays(d, 1), 'yyyy-MM-dd'))}
        title="วันถัดไป"
      >
        ›
      </button>
    </div>
  )
}
