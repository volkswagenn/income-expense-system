import { useMemo, useState } from 'react'
import ReportSelector, { REPORT_TYPES } from './ReportSelector'
import ReportTable from './ReportTable'
import ReportChart from './ReportChart'
import ExportBar from './ExportBar'
import SectionCard from '../../components/shared/SectionCard'
import DateRangePicker from '../../components/shared/DateRangePicker'
import AmountDisplay from '../../components/shared/AmountDisplay'
import useTransactionStore from '../../store/useTransactionStore'
import { presetRange } from '../../lib/dateRangePresets'

function StatTile({ label, amount, tone = 'gray', sub }) {
  const tones = {
    gray: 'bg-gray-50 border-gray-200 text-gray-900',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    red: 'bg-red-50 border-red-200 text-red-600',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
  }
  return (
    <div className={`rounded-xl border p-3.5 ${tones[tone]}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <div className="mt-1">
        <AmountDisplay amount={amount} size="lg" />
      </div>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function ReportsPage() {
  const [type, setType] = useState('daily_income')
  const [preset, setPreset] = useState('month')
  const [[startDate, endDate], setRange] = useState(() => presetRange('month'))
  const [showChart, setShowChart] = useState(true)
  const [groupBy, setGroupBy] = useState('day')

  const { transactions } = useTransactionStore()

  const filtered = useMemo(
    () => transactions.filter((t) => t.date >= startDate && t.date <= endDate),
    [transactions, startDate, endDate]
  )

  const stats = useMemo(() => {
    let income = 0, expense = 0
    filtered.forEach((t) => {
      if (t.type === 'income') income += Number(t.amount) || 0
      else if (t.type === 'expense') expense += Number(t.amount) || 0
    })
    const days = new Set(filtered.map((t) => t.date)).size
    return { income, expense, net: income - expense, days }
  }, [filtered])

  const activeReport = REPORT_TYPES.find((r) => r.key === type)
  const isEmpty = filtered.length === 0

  return (
    <div className="space-y-5">
      {/* หัวเรื่อง + ช่วงวันที่ */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">รายงาน</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            เลือกประเภทรายงานและช่วงเวลา แล้วดูผลหรือส่งออกเป็นไฟล์
          </p>
        </div>
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          preset={preset}
          onChange={(s, e, p) => { setRange([s, e]); setPreset(p) }}
        />
      </div>

      {/* 1. เลือกประเภทรายงาน */}
      <SectionCard title="1 · เลือกประเภทรายงาน">
        <ReportSelector type={type} setType={setType} />
      </SectionCard>

      {/* 2. สรุปยอดในช่วงที่เลือก */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="รายรับรวม" amount={stats.income} tone="green" />
        <StatTile label="รายจ่ายรวม" amount={stats.expense} tone="red" />
        <StatTile
          label="คงเหลือ (รับ − จ่าย)"
          amount={stats.net}
          tone={stats.net >= 0 ? 'blue' : 'orange'}
        />
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3.5">
          <p className="text-xs text-gray-500">จำนวนรายการ</p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">
            {filtered.length.toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{stats.days} วันที่มีรายการ</p>
        </div>
      </div>

      {/* 3. ผลลัพธ์ */}
      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <span>{activeReport?.icon}</span>
            <span>{activeReport?.label}</span>
            <span className="text-xs font-normal text-gray-400">({filtered.length} รายการ)</span>
          </span>
        }
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              {[{ key: 'day', label: 'รายวัน' }, { key: 'month', label: 'รายเดือน' }].map((g) => (
                <button
                  key={g.key}
                  className={`text-xs px-2.5 py-1 rounded-md transition-all ${
                    groupBy === g.key ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => setGroupBy(g.key)}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <ExportBar type={type} transactions={filtered} startDate={startDate} endDate={endDate} />
          </div>
        }
      >
        {isEmpty ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-sm">ไม่มีข้อมูลในช่วงที่เลือก</p>
            <p className="text-xs mt-1">ลองขยายช่วงวันที่ด้านบน หรือเลือก "ทั้งหมด"</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <ReportTable type={type} transactions={filtered} groupBy={groupBy} />
          </div>
        )}
      </SectionCard>

      {/* 4. กราฟ */}
      {!isEmpty && (
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
      )}
    </div>
  )
}
