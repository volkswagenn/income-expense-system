import { useEffect, useMemo, useState } from 'react'
import IncomeForm from './IncomeForm'
import ExpenseForm from './ExpenseForm'
import RecurringPage from '../Recurring'
import useRecurringStore from '../../store/useRecurringStore'
import useAuthStore from '../../store/useAuthStore'
import useRoleStore from '../../store/useRoleStore'
import SectionCard from '../../components/shared/SectionCard'
import { checkPermission, P } from '../../lib/permissions'

const TABS = [
  { key: 'income', label: '📥 บันทึกรายรับ', permission: P.MANAGE_INCOME },
  { key: 'expense', label: '📤 บันทึกรายจ่าย', permission: P.MANAGE_EXPENSE },
  { key: 'recurring', label: '🔁 รายการประจำ', permission: P.MANAGE_RECURRING },
]

export default function TransactionsPage() {
  const [tab, setTab] = useState('income')
  const role = useAuthStore((s) => s.currentUser?.role)
  const roles = useRoleStore((s) => s.roles)
  const recurringPendingCount = useRecurringStore((s) => s.getPendingCountCurrentMonth())
  const visibleTabs = useMemo(
    () => TABS.filter((item) => checkPermission(roles, role, item.permission)),
    [roles, role]
  )

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some((item) => item.key === tab)) {
      setTab(visibleTabs[0].key)
    }
  }, [visibleTabs, tab])

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900">บันทึกรายรับ-รายจ่าย</h1>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {visibleTabs.map((t) => (
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

      {visibleTabs.length === 0 ? (
        <SectionCard>
          <div className="text-center py-10 text-gray-400 text-sm">
            บัญชีนี้ยังไม่มีสิทธิ์ย่อยสำหรับบันทึกรายรับ-รายจ่าย
          </div>
        </SectionCard>
      ) : (
        <SectionCard>
          {tab === 'income' && <IncomeForm />}
          {tab === 'expense' && <ExpenseForm />}
          {tab === 'recurring' && <RecurringPage />}
        </SectionCard>
      )}
    </div>
  )
}
