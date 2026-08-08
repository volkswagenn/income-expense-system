import { useEffect, useRef, useState } from 'react'
import { addDays, differenceInCalendarDays } from 'date-fns'
import { localDateStr } from '../../lib/dateUtils'
import { DATE_PRESETS, presetRange, detectPreset, ALL_TIME_START } from '../../lib/dateRangePresets'
import RangeCalendar, { thaiShort } from './RangeCalendar'
import PopoverPanel from './PopoverPanel'

/**
 * แถบเลือกช่วงวันที่ที่ใช้ร่วมกันทั้งระบบ
 *
 * props:
 *   startDate, endDate   – 'yyyy-MM-dd'
 *   onChange(start, end, presetKey)
 *   preset               – key ที่เลือกอยู่ (ไม่ส่งมาก็ได้ ระบบจะเดาจากช่วง)
 *   compact              – ย่อขนาดให้พอดีในแผงเล็ก
 */
export default function DateRangePicker({
  startDate,
  endDate,
  onChange,
  preset,
  compact = false,
}) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  const anchorRef = useRef(null)

  const activePreset = preset ?? detectPreset(startDate, endDate)
  const isAllTime = startDate === ALL_TIME_START

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

  const choosePreset = (key) => {
    if (key === 'custom') { setOpen(true); return }
    const r = presetRange(key)
    if (r) onChange(r[0], r[1], key)
  }

  // เลื่อนช่วงไปข้างหน้า/ถอยหลังเป็นก้อนเท่าความยาวช่วงเดิม
  const shiftRange = (dir) => {
    if (isAllTime) return
    const s = new Date(startDate + 'T00:00:00')
    const e = new Date(endDate + 'T00:00:00')
    const span = differenceInCalendarDays(e, s) + 1
    onChange(
      localDateStr(addDays(s, dir * span)),
      localDateStr(addDays(e, dir * span)),
      'custom'
    )
  }

  const rangeLabel = isAllTime
    ? 'ทุกช่วงเวลา'
    : startDate === endDate
      ? thaiShort(startDate)
      : `${thaiShort(startDate)} – ${thaiShort(endDate)}`

  const dayCount = isAllTime
    ? null
    : differenceInCalendarDays(new Date(endDate + 'T00:00:00'), new Date(startDate + 'T00:00:00')) + 1

  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? 'text-sm' : ''}`} ref={boxRef}>
      {/* preset */}
      <select
        className="input py-1.5 text-sm w-36 shrink-0"
        value={activePreset}
        onChange={(e) => choosePreset(e.target.value)}
      >
        {DATE_PRESETS.map((p) => (
          <option key={p.key} value={p.key}>{p.label}</option>
        ))}
      </select>

      {/* แถบช่วงวันที่ + ลูกศรเลื่อน */}
      <div ref={anchorRef} className="flex items-stretch rounded-xl border border-gray-200 bg-white overflow-hidden">
        <button
          type="button"
          title="ช่วงก่อนหน้า"
          className="px-2 text-gray-400 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
          onClick={() => shiftRange(-1)}
          disabled={isAllTime}
        >
          ‹
        </button>
        <button
          type="button"
          className="px-3 py-1.5 flex items-center gap-2 hover:bg-gray-50 border-x border-gray-100"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="text-gray-400">🗓</span>
          <span className="text-sm text-gray-800 whitespace-nowrap">{rangeLabel}</span>
          {dayCount != null && (
            <span className="text-[11px] text-gray-400 whitespace-nowrap">({dayCount} วัน)</span>
          )}
        </button>
        <button
          type="button"
          title="ช่วงถัดไป"
          className="px-2 text-gray-400 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
          onClick={() => shiftRange(1)}
          disabled={isAllTime}
        >
          ›
        </button>
      </div>

      {/* ปฏิทินเลือกช่วง — ลอยผ่าน portal เพื่อไม่ให้ตกขอบจอหรือโดนป๊อปอัปแม่ตัด */}
      {open && (
        <PopoverPanel anchorRef={anchorRef}>
          <RangeCalendar
            startDate={isAllTime ? localDateStr() : startDate}
            endDate={isAllTime ? localDateStr() : endDate}
            onApply={(s, e) => { onChange(s, e, 'custom'); setOpen(false) }}
            onCancel={() => setOpen(false)}
          />
        </PopoverPanel>
      )}
    </div>
  )
}
