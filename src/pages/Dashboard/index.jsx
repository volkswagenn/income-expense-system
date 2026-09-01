import { lazy, Suspense, useState } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import FilterBar from './FilterBar'
import FinancialStatus from './FinancialStatus'
import CalendarView from './CalendarView'
import SectionCard from '../../components/shared/SectionCard'

// กราฟสองตัวนี้ลาก recharts (383 KB) มาด้วย ซึ่งไม่จำเป็นต้องมีตอนวาดหน้าแรก
// แยกออกไปโหลดทีหลัง ตัวเลขและปฏิทินจึงขึ้นให้เห็นก่อนโดยไม่ต้องรอ
const ChartFiltered = lazy(() => import('./ChartFiltered'))
const TrendChart6M = lazy(() => import('./TrendChart6M'))

function ChartSkeleton() {
  return <div className="h-52 rounded-panel bg-[#F1F0EC] animate-pulse" />
}

export default function Dashboard() {
  const [filter, setFilter] = useState('month')
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <FilterBar
          filter={filter} setFilter={setFilter}
          startDate={startDate} endDate={endDate}
          setStartDate={setStartDate} setEndDate={setEndDate}
        />
      </div>

      <SectionCard title="สถานะการเงินปัจจุบัน">
        <FinancialStatus />
      </SectionCard>

      {/* Calendar + Sidebar */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        <div className="xl:col-span-2">
          <CalendarView
            filter={filter} setFilter={setFilter}
            startDate={startDate} endDate={endDate}
            setStartDate={setStartDate} setEndDate={setEndDate}
          />
        </div>

        <div className="space-y-5">
          <SectionCard title="รายรับ-รายจ่ายตามช่วงเวลา">
            <Suspense fallback={<ChartSkeleton />}>
              <ChartFiltered startDate={startDate} endDate={endDate} />
            </Suspense>
          </SectionCard>
          <SectionCard title="แนวโน้ม 6 เดือนย้อนหลัง">
            <Suspense fallback={<ChartSkeleton />}>
              <TrendChart6M />
            </Suspense>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
