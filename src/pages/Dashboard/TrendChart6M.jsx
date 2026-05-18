import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { subMonths, startOfMonth, endOfMonth, format } from 'date-fns'
import { th } from 'date-fns/locale'
import useTransactionStore from '../../store/useTransactionStore'

const fmt = (v) => v.toLocaleString()

export default function TrendChart6M() {
  const { transactions } = useTransactionStore()

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(new Date(), 5 - i)
    return {
      start: format(startOfMonth(d), 'yyyy-MM-dd'),
      end: format(endOfMonth(d), 'yyyy-MM-dd'),
      label: format(d, 'MMM yy', { locale: th }),
    }
  })

  const data = months.map(({ start, end, label }) => {
    const txs = transactions.filter((t) => t.date >= start && t.date <= end)
    const income = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    return {
      name: label,
      รายรับ: income,
      รายจ่าย: expense,
      กำไร: income - expense,
    }
  })

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
        <YAxis tickFormatter={fmt} tick={{ fontSize: 10 }} width={55} />
        <Tooltip formatter={(v) => v.toLocaleString('th-TH') + ' บาท'} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="รายรับ" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        <Line type="monotone" dataKey="รายจ่าย" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        <Line type="monotone" dataKey="กำไร" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2 }} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
