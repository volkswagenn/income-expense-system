import { useState } from 'react'
import IncomeForm from './IncomeForm'
import ExpenseForm from './ExpenseForm'
import RecurringPage from '../Recurring'
import DebtHub from './DebtHub'
import TransactionHistoryPanel from './TransactionHistoryPanel'
import useRecurringStore from '../../store/useRecurringStore'
import useCreditCardStore from '../../store/useCreditCardStore'
import useDebtStore from '../../store/useDebtStore'
import usePendingStore from '../../store/usePendingStore'
import SectionCard from '../../components/shared/SectionCard'

/**
 * ผ่อนชำระอยู่คนละแท็บกับรายจ่ายประจำโดยตั้งใจ
 *
 * ทั้งสองอย่างเป็นเรื่อง "สิ่งที่เรียกเก็บทุกเดือน" เหมือนกัน แต่ต่างกันสามข้อ
 * คือมีจุดจบแน่นอน ยอดคงที่ และ **ไม่มีปุ่มจ่าย** เพราะถูกเรียกเก็บผ่านบิลบัตรเอง
 * ถ้าเอาไปวางปนในลิสต์เดียว ผู้ใช้จะเจอแถวที่กดจ่ายไม่ได้แล้วไม่เข้าใจว่าทำไม
 */
const TABS = [
  { key: 'income', label: '📥 บันทึกรายรับ' },
  { key: 'expense', label: '📤 บันทึกรายจ่าย' },
  { key: 'recurring', label: '🔁 รายการประจำ' },
  { key: 'installment', label: '💳 ผ่อนชำระ/หนี้สิน' },
  { key: 'history', label: '🔍 ค้นหารายการ' },
]

export default function TransactionsPage() {
  const [tab, setTab] = useState('income')
  const recurringPendingCount = useRecurringStore((s) => s.getPendingCountCurrentMonth())
  // นับรวมทุกแหล่งที่ยังเป็นหนี้อยู่ ไม่ใช่แค่ผ่อนบัตร เพราะแท็บนี้รวมมาหมดแล้ว
  const installmentCount = useCreditCardStore((s) => s.getActiveInstallments().length)
  const debtCount = useDebtStore((s) => s.debts.filter((d) => d.status === 'active').length)
  const pendingCount = usePendingStore((s) =>
    s.pendingPayments.reduce((n, p) => n + (p.status === 'pending' ? 1 : 0), 0)
  )
  const obligationCount = installmentCount + debtCount + pendingCount

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
            {t.key === 'installment' && obligationCount > 0 && (
              <span className="ml-1.5 badge badge-red">{obligationCount}</span>
            )}
          </button>
        ))}
      </div>

      <SectionCard>
        {tab === 'income' && <IncomeForm />}
        {tab === 'expense' && <ExpenseForm />}
        {tab === 'recurring' && <RecurringPage />}
        {tab === 'installment' && <DebtHub />}
        {tab === 'history' && <TransactionHistoryPanel />}
      </SectionCard>
    </div>
  )
}
