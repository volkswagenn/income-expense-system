import { format } from 'date-fns'
import DatePicker from './DatePicker'

/**
 * เลือกวันและเวลาที่จ่าย/รับเงิน
 *
 * ทำไมต้องมีเวลา: บันทึกย้อนหลังแล้วเรียงตามวันอย่างเดียว รายการในวันเดียวกัน
 * จะเรียงมั่ว ดูไม่ออกว่าอะไรเกิดก่อน โดยเฉพาะวันที่มีหลายรายการ
 *
 * กติกาของเวลา
 *   กดปุ่ม "วันนี้"  → ใส่วันและเวลาปัจจุบันให้เลย (กรณีจ่ายอยู่ตอนนี้จริงๆ)
 *   เลือกวันเอง แต่ไม่ใส่เวลา → ถือเป็นเที่ยงตรงของวันนั้น
 *
 * เที่ยงตรงเป็นค่ากลางที่ปลอดภัยที่สุดสำหรับ "รู้แค่วัน ไม่รู้เวลา" เพราะไม่ว่า
 * เครื่องจะอยู่โซนเวลาไหน วันที่ก็ยังไม่เพี้ยนไปวันข้างเคียง ต่างจากเที่ยงคืน
 * ที่ขยับนิดเดียวก็กลายเป็นคนละวัน
 */

/** รวมวัน + เวลาเป็น ISO string — ไม่ใส่เวลา = เที่ยงตรงของวันนั้น */
export function toTimestamp(date, time) {
  if (!date) return null
  const t = time && /^\d{2}:\d{2}$/.test(time) ? time : '12:00'
  return new Date(`${date}T${t}:00`).toISOString()
}

export const todayDate = () => format(new Date(), 'yyyy-MM-dd')
export const nowTime = () => format(new Date(), 'HH:mm')

export default function DateTimeField({
  date, time, onChange,
  label = 'วันที่จ่าย', hint = 'ไม่ใส่เวลา = เที่ยงตรงของวันที่เลือก',
}) {
  const setNow = () => onChange({ date: todayDate(), time: nowTime() })

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="label mb-0">{label}</label>
        {/* ปุ่มลัดสำหรับกรณีที่พบบ่อยที่สุด คือกำลังจ่ายอยู่ตอนนี้ */}
        <button
          type="button"
          onClick={setNow}
          className="text-xs px-2 py-0.5 rounded-md border border-hairline text-gray-600 hover:bg-[#F6F5F1]"
        >
          วันนี้ ตอนนี้
        </button>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 min-w-0">
          <DatePicker value={date} onChange={(v) => onChange({ date: v, time })} />
        </div>
        <input
          type="time"
          className="input w-[116px] flex-shrink-0 text-center"
          value={time ?? ''}
          onChange={(e) => onChange({ date, time: e.target.value })}
        />
      </div>

      <p className="text-xs text-gray-400 mt-1">
        {time ? `บันทึกเวลา ${time} น.` : hint}
      </p>
    </div>
  )
}
