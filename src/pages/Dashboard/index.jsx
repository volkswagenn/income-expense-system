import { useState } from 'react'
import FinancialStatus from './FinancialStatus'
import CalendarView from './CalendarView'
import DayPanel from './DayPanel'
import UpcomingStrip from './UpcomingStrip'
import { localDateStr } from '../../lib/dateUtils'

/**
 * ภาพรวม — ตัวเลขสรุป · ปฏิทิน + รายละเอียดของวันที่เลือก · แถบครบกำหนดถัดไป
 *
 * ปฏิทินกับแผงรายละเอียดอยู่ระดับสายตาเดียวกัน กดวันไหนแผงขวาเปลี่ยนตาม
 * (ของเดิมกดวันแล้วเด้งไปหน้าบันทึกรายการ ดูของวันเก่าไม่ได้เลย)
 *
 * จอกว้าง (เนื้อหา ≥ 1300px) ไม่ได้แค่ยืดออก แต่จัดคอลัมน์ใหม่
 *   ซ้าย 304px  = การ์ดตัวเลข แล้วต่อด้วยแถบครบกำหนดถัดไป
 *   ขวา        = ปฏิทิน + แผงวันที่เลือก ได้ความสูงเต็มจอ
 * จอแคบเรียงลงมาเป็น ตัวเลข → ปฏิทิน+แผง → ครบกำหนดถัดไป
 */
export default function Dashboard() {
  const [selectedDate, setSelectedDate] = useState(() => localDateStr())
  const [openDayDate, setOpenDayDate] = useState(null)

  return (
    <div
      className="grid gap-3.5 min-h-0
        grid-cols-1 [grid-template-areas:'kpi''main''up']
        wide:grid-cols-[304px_minmax(0,1fr)] wide:grid-rows-[auto_1fr] wide:[grid-template-areas:'kpi_main''up_main']"
    >
      <div className="[grid-area:kpi] min-w-0">
        <FinancialStatus />
      </div>

      <div className="[grid-area:main] grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_328px] wide:grid-cols-[minmax(0,1fr)_380px] gap-3.5 items-start min-h-0">
        <CalendarView
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          openDayDate={openDayDate}
          onCloseDay={() => setOpenDayDate(null)}
        />
        <DayPanel date={selectedDate} onOpenDetail={setOpenDayDate} />
      </div>

      <div className="[grid-area:up] min-w-0">
        <UpcomingStrip />
      </div>
    </div>
  )
}
