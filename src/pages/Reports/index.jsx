import { useState } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import ReportSelector from './ReportSelector'
import ReportTable from './ReportTable'
import ReportChart from './ReportChart'
import ExportBar from './ExportBar'
import SectionCard from '../../components/shared/SectionCard'
import useTransactionStore from '../../store/useTransactionStore'

export default function ReportsPage() {
  const [type, setType] = useState('daily_income')
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [showChart, setShowChart] = useState(false)
  const [groupBy, setGroupBy] = useState('day')

  const { transactions } = useTransactionStore()
  const filtered = transactions.filter((t) => t.date >= startDate && t.date <= endDate)

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900">รายงาน</h1>

      <SectionCard title="เลือกรายงาน">
        <ReportSelector
          type={type} setType={setType}
          startDate={startDate} endDate={endDate}
          setStartDate={setStartDate} setEndDate={setEndDate}
          groupBy={groupBy} setGroupBy={setGroupBy}
        />
      </SectionCard>

      <SectionCard
        title={`ผลลัพธ์ (${filtered.length} รายการ)`}
        action={<ExportBar type={type} transactions={filtered} startDate={startDate} endDate={endDate} />}
      >
        <div className="overflow-x-auto">
          <ReportTable type={type} transactions={filtered} groupBy={groupBy} />
        </div>
      </SectionCard>

      <SectionCard
        title="กราฟ"
        action={
          <button className="btn btn-secondary text-sm" onClick={() => setShowChart((s) => !s)}>
            {showChart ? 'ซ่อนกราฟ' : 'แสดงกราฟ'}
          </button>
        }
      >
        {showChart ? (
          <ReportChart transactions={filtered} startDate={startDate} endDate={endDate} />
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">กดปุ่ม "แสดงกราฟ" เพื่อดูกราฟ</p>
        )}
      </SectionCard>
    </div>
  )
}
