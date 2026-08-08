import { useState } from 'react'
import IncomeForm from './IncomeForm'
import ExpenseForm from './ExpenseForm'
import RecurringPage from '../Recurring'
import TransactionHistoryPanel from './TransactionHistoryPanel'
import useRecurringStore from '../../store/useRecurringStore'
import SectionCard from '../../components/shared/SectionCard'

const TABS = [
  { key: 'income', label: '📥 บันทึกรายรับ' },
  { key: 'expense', label: '📤 บันทึกรายจ่าย' },
  { key: 'recurring', label: '🔁 รายการประจำ' },
  { key: 'history', label: '🔍 ค้นหารายการ' },
]

export default function TransactionsPage() {
  const [tab, setTab] = useState('income')
  const recurringPendingCount = useRecurringStore((s) => s.getPendingCountCurrentMonth())

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900">บันทึกรายรับ-รายจ่าย</h1>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`btn text-sm px-4 py-2 rounded-lg transition-all ${tab === t.key ? 'bg-white shadow-sm text-gray-900 font-semibold' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.key === 'recurring' && recurringPendingCount > 0 && (
              <span className="ml-1.5 badge badge-red">{recurringPendingCount}</span>
            )}
          </button>
        ))}
      </div>

      <SectionCard>
        {tab === 'income' && <IncomeForm />}
        {tab === 'expense' && <ExpenseForm />}
        {tab === 'recurring' && <RecurringPage />}
        {tab === 'history' && <TransactionHistoryPanel />}
      </SectionCard>
    </div>
  )
}
