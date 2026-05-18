import { useRef } from 'react'
import { eachDayOfInterval, parseISO, format } from 'date-fns'
import { th } from 'date-fns/locale'
import TooltipBreakdown from '../../components/shared/TooltipBreakdown'
import useTransactionStore from '../../store/useTransactionStore'
import useCategoryStore from '../../store/useCategoryStore'

function DayCard({ date, transactions }) {
  const income = transactions.filter((t) => t.type === 'income')
  const expense = transactions.filter((t) => t.type === 'expense')

  const totalIncome = income.reduce((s, t) => s + t.amount, 0)
  const totalExpense = expense.reduce((s, t) => s + t.amount, 0)

  const { getCategoryName } = useCategoryStore()

  const incomeBreakdown = [
    { label: 'เงินสด', value: income.filter((t) => t.method === 'cash').reduce((s, t) => s + t.amount, 0) },
    { label: 'เงินโอน', value: income.filter((t) => t.method === 'transfer').reduce((s, t) => s + t.amount, 0) },
    ...Object.entries(
      income
        .filter((t) => !['cash', 'transfer'].includes(t.method))
        .reduce((acc, t) => {
          const k = t.otherIncomeType || 'อื่นๆ'
          acc[k] = (acc[k] || 0) + t.amount
          return acc
        }, {})
    ).map(([label, value]) => ({ label, value })),
  ]

  const expenseBreakdown = Object.entries(
    expense.reduce((acc, t) => {
      const k = getCategoryName(t.category)
      acc[k] = (acc[k] || 0) + t.amount
      return acc
    }, {})
  ).map(([label, value]) => ({ label, value }))

  const dayLabel = format(parseISO(date), 'EEE', { locale: th })
  const dayNum = format(parseISO(date), 'd')

  return (
    <div className="min-w-32 flex-shrink-0 bg-white border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="text-center">
        <p className="text-xs text-gray-400">{dayLabel}</p>
        <p className="text-lg font-bold text-gray-800">{dayNum}</p>
      </div>
      <div className="space-y-1">
        <div className="text-xs text-emerald-600">
          <p className="text-gray-500 text-xs">รายรับ</p>
          <TooltipBreakdown items={incomeBreakdown}>
            <span className="font-semibold text-emerald-600">
              {totalIncome.toLocaleString()}
            </span>
          </TooltipBreakdown>
        </div>
        <div className="text-xs">
          <p className="text-gray-500 text-xs">รายจ่าย</p>
          <TooltipBreakdown items={expenseBreakdown}>
            <span className="font-semibold text-red-500">
              {totalExpense.toLocaleString()}
            </span>
          </TooltipBreakdown>
        </div>
      </div>
    </div>
  )
}

export default function IncomeExpenseScroll({ startDate, endDate }) {
  const scrollRef = useRef()
  const { transactions } = useTransactionStore()

  const days = eachDayOfInterval({
    start: parseISO(startDate),
    end: parseISO(endDate),
  })

  const scroll = (dir) => {
    scrollRef.current?.scrollBy({ left: dir * 140, behavior: 'smooth' })
  }

  return (
    <div className="relative">
      <button
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 btn btn-secondary w-8 h-8 p-0 flex items-center justify-center shadow"
        onClick={() => scroll(-1)}
      >‹</button>
      <div
        ref={scrollRef}
        className="overflow-x-auto flex gap-3 px-10 pb-2 scroll-smooth"
      >
        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd')
          const txs = transactions.filter((t) => t.date === dateStr)
          return <DayCard key={dateStr} date={dateStr} transactions={txs} />
        })}
      </div>
      <button
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 btn btn-secondary w-8 h-8 p-0 flex items-center justify-center shadow"
        onClick={() => scroll(1)}
      >›</button>
    </div>
  )
}
