import { useRef, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { eachDayOfInterval, parseISO, format } from 'date-fns'
import { th } from 'date-fns/locale'
import { exportChartAsPng } from '../../lib/chartExporter'

const CHART_TYPES = [
  { key: 'income', label: 'กราฟรายรับ' },
  { key: 'expense', label: 'กราฟรายจ่าย' },
  { key: 'both', label: 'กราฟรายรับ-รายจ่าย' },
]

export default function ReportChart({ transactions, startDate, endDate }) {
  const [chartType, setChartType] = useState('both')
  const chartRef = useRef()

  const days = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) })
  const data = days.map((day) => {
    const d = format(day, 'yyyy-MM-dd')
    const txs = transactions.filter((t) => t.date === d)
    return {
      name: format(day, days.length <= 14 ? 'd MMM' : 'd', { locale: th }),
      รายรับ: txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0),
      รายจ่าย: txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
    }
  })

  const fmt = (v) => v.toLocaleString()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {CHART_TYPES.map((ct) => (
            <button key={ct.key} className={`btn text-sm ${chartType === ct.key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setChartType(ct.key)}>
              {ct.label}
            </button>
          ))}
        </div>
        <button
          className="btn btn-secondary text-sm"
          onClick={() => exportChartAsPng(chartRef.current, `chart_${chartType}_${startDate}_${endDate}.png`)}
        >
          📷 บันทึกรูป
        </button>
      </div>
      <div ref={chartRef} className="bg-white p-4 rounded-xl">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => v.toLocaleString('th-TH') + ' บาท'} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {(chartType === 'income' || chartType === 'both') && (
              <Bar dataKey="รายรับ" fill="#10b981" radius={[3, 3, 0, 0]} />
            )}
            {(chartType === 'expense' || chartType === 'both') && (
              <Bar dataKey="รายจ่าย" fill="#ef4444" radius={[3, 3, 0, 0]} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
