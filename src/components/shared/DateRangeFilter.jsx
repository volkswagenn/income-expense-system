import DateRangePicker from './DateRangePicker'

/**
 * ตัวห่อเพื่อความเข้ากันได้กับหน้าที่ยังส่ง props ชุดเดิม
 * ตัวจริงคือ DateRangePicker — ปฏิทิน 2 เดือน + ช่วงสำเร็จรูป
 *
 * ค่า filter ที่ส่งกลับใช้ key เดียวกับ preset ('today' | 'yesterday' | 'month' | 'custom' | ...)
 * หน้า Dashboard ยังอ่านค่านี้ไปไฮไลต์วันบนปฏิทินได้เหมือนเดิม
 */
export default function DateRangeFilter({
  filter, setFilter, startDate, endDate, setStartDate, setEndDate, compact,
}) {
  return (
    <DateRangePicker
      preset={filter}
      startDate={startDate}
      endDate={endDate}
      compact={compact}
      onChange={(start, end, presetKey) => {
        setStartDate(start)
        setEndDate(end)
        setFilter?.(presetKey)
      }}
    />
  )
}
