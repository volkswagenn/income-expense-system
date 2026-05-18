import { useRef } from 'react'
import { format, addDays, parseISO } from 'date-fns'
import { th } from 'date-fns/locale'

export default function DateNavigator({ date, onChange }) {
  const inputRef = useRef()
  const d = parseISO(date)
  const label = format(d, 'EEEE d MMMM yyyy', { locale: th })

  const openPicker = () => {
    const el = inputRef.current
    if (!el) return
    // Chrome 99+ / Electron Chromium — ใช้ showPicker()
    if (typeof el.showPicker === 'function') {
      el.showPicker()
    } else {
      el.focus()
      el.click()
    }
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className="btn btn-ghost w-8 h-8 flex items-center justify-center rounded-full p-0 text-lg"
        onClick={() => onChange(format(addDays(d, -1), 'yyyy-MM-dd'))}
        title="วันก่อนหน้า"
      >
        ‹
      </button>

      {/* คลิกวันที่เพื่อเปิด calendar */}
      <div className="relative">
        <button
          type="button"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-blue-600 transition-colors min-w-52 justify-center"
          onClick={openPicker}
          title="คลิกเพื่อเลือกวันที่"
        >
          <span className="text-base">📅</span>
          {label}
        </button>

        {/* hidden date input — trigger ด้วย openPicker() */}
        <input
          ref={inputRef}
          type="date"
          value={date}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="absolute opacity-0 pointer-events-none w-0 h-0 top-0 left-1/2"
          tabIndex={-1}
        />
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
