import { useSearchParams } from 'react-router-dom'
import PendingPaymentSummary from '../Wallet/PendingPaymentSummary'
import PendingIncomeSummary from '../Wallet/PendingIncomeSummary'
import SectionCard from '../../components/shared/SectionCard'
import usePendingStore from '../../store/usePendingStore'
import ObligationsTab from './ObligationsTab'

const TABS = [
  { key: 'all', label: '💸 สิ่งที่ต้องจ่าย' },
  { key: 'payment', label: 'ค้างจ่าย' },
  { key: 'income', label: 'รอรับเงิน' },
]

const TAB_KEYS = TABS.map((t) => t.key)

function TabBadge({ count, tone = 'red' }) {
  if (!count) return null
  const cls = tone === 'green' ? 'badge-green' : 'badge-red'
  return <span className={`ml-1.5 badge ${cls}`}>{count > 99 ? '99+' : count}</span>
}

export default function PendingTasksPage() {
  // แท็บผูกกับ URL โดยตรง — การ์ดหน้า Dashboard ลิงก์มาที่ ?tab=payment / ?tab=income
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab = TAB_KEYS.includes(tabParam) ? tabParam : 'payment'

  const selectTab = (key) =>
    setSearchParams(key === 'payment' ? {} : { tab: key }, { replace: true })
  const pendingCount = usePendingStore((s) =>
    s.pendingPayments.reduce((n, p) => n + (p.status === 'pending' ? 1 : 0), 0)
  )
  const incomeCount = usePendingStore((s) =>
    s.pendingIncomes.reduce((n, p) => n + (p.status === 'pending' ? 1 : 0), 0)
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">รายการรอดำเนินการ</h1>
        <p className="text-sm text-gray-500 mt-0.5">ติดตามรายการที่ยังต้องรับเงิน จ่ายเงิน หรือจัดการตามรอบ</p>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`btn text-sm px-4 py-2 rounded-lg transition-all ${tab === t.key ? 'bg-white shadow-sm text-gray-900 font-semibold' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => selectTab(t.key)}
          >
            {t.label}
            {t.key === 'payment' && <TabBadge count={pendingCount} />}
            {t.key === 'income' && <TabBadge count={incomeCount} tone="green" />}
          </button>
        ))}
      </div>

      {tab === 'all' && (
        <SectionCard title="รวมทุกอย่างที่ต้องจ่าย เรียงตามวันครบกำหนด">
          <ObligationsTab />
        </SectionCard>
      )}
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
    </div>
  )
}
