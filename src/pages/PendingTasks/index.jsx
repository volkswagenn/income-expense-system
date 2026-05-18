import { useEffect, useMemo, useState } from 'react'
import PendingPaymentSummary from '../Wallet/PendingPaymentSummary'
import PendingIncomeSummary from '../Wallet/PendingIncomeSummary'
import SectionCard from '../../components/shared/SectionCard'
import usePendingStore from '../../store/usePendingStore'
import useAuthStore from '../../store/useAuthStore'
import useRoleStore from '../../store/useRoleStore'
import { checkPermission, P } from '../../lib/permissions'

const TABS = [
  { key: 'payment', label: 'ค้างจ่าย', permission: P.VIEW_PENDING_PAYMENT },
  { key: 'income', label: 'รอรับเงิน', permission: P.VIEW_PENDING_INCOME },
]

function TabBadge({ count, tone = 'red' }) {
  if (!count) return null
  const cls = tone === 'green' ? 'badge-green' : 'badge-red'
  return <span className={`ml-1.5 badge ${cls}`}>{count > 99 ? '99+' : count}</span>
}

export default function PendingTasksPage() {
  const [tab, setTab] = useState('payment')
  const role = useAuthStore((s) => s.currentUser?.role)
  const roles = useRoleStore((s) => s.roles)
  const pendingCount = usePendingStore((s) =>
    s.pendingPayments.reduce((n, p) => n + (p.status === 'pending' ? 1 : 0), 0)
  )
  const incomeCount = usePendingStore((s) =>
    s.pendingIncomes.reduce((n, p) => n + (p.status === 'pending' ? 1 : 0), 0)
  )

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
      <div>
        <h1 className="text-xl font-bold text-gray-900">รายการรอดำเนินการ</h1>
        <p className="text-sm text-gray-500 mt-0.5">ติดตามรายการที่ยังต้องรับเงิน จ่ายเงิน หรือจัดการตามรอบ</p>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            className={`btn text-sm px-4 py-2 rounded-lg transition-all ${tab === t.key ? 'bg-white shadow-sm text-gray-900 font-semibold' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.key === 'payment' && <TabBadge count={pendingCount} />}
            {t.key === 'income' && <TabBadge count={incomeCount} tone="green" />}
          </button>
        ))}
      </div>

      {visibleTabs.length === 0 ? (
        <SectionCard>
          <div className="text-center py-10 text-gray-400 text-sm">
            บัญชีนี้ยังไม่มีสิทธิ์สำหรับดูรายการรอดำเนินการ
          </div>
        </SectionCard>
      ) : (
        <>
          {tab === 'payment' && (
            <SectionCard title="รายการค้างจ่าย">
              <PendingPaymentSummary fullPage />
            </SectionCard>
          )}
          {tab === 'income' && (
            <SectionCard title="รายการรอรับเงิน">
              <PendingIncomeSummary fullPage />
            </SectionCard>
          )}
        </>
      )}
    </div>
  )
}
