import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { eachDayOfInterval, parseISO, format } from 'date-fns'
import { th } from 'date-fns/locale'
import useTransactionStore from '../../store/useTransactionStore'

const fmt = (v) => v.toLocaleString()

export default function ChartFiltered({ startDate, endDate }) {
  const { transactions } = useTransactionStore()

  const days = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) })
  const data = days.map((day) => {
    const d = format(day, 'yyyy-MM-dd')
    const txs = transactions.filter((t) => t.date === d)
    return {
      name: format(day, days.length <= 7 ? 'EEE d' : 'd', { locale: th }),
      รายรับ: txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0),
      รายจ่าย: txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
    }
  })

  const hasData = data.some((d) => d.รายรับ > 0 || d.รายจ่าย > 0)

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400">
        ไม่มีข้อมูลในช่วงเวลานี้
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
        <YAxis tickFormatter={fmt} tick={{ fontSize: 10 }} width={55} />
        <Tooltip formatter={(v) => v.toLocaleString('th-TH') + ' บาท'} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="รายรับ" stroke="#10b981" strokeWidth={2} dot={days.length <= 14 ? { r: 3 } : false} activeDot={{ r: 4 }} />
        <Line type="monotone" dataKey="รายจ่าย" stroke="#ef4444" strokeWidth={2} dot={days.length <= 14 ? { r: 3 } : false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
