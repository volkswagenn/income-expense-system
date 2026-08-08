import { useState } from 'react'
import { format } from 'date-fns'
import MainWalletCard from './MainWalletCard'
import LoanSummary from './LoanSummary'
import SubWalletList from './SubWalletList'
import TransferAccountList from './TransferAccountList'
import SectionCard from '../../components/shared/SectionCard'
import useWalletStore from '../../store/useWalletStore'
import useRecurringStore from '../../store/useRecurringStore'

function CollapseBtn({ collapsed, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
    >
      {collapsed ? '▼ ขยาย' : '▲ ย่อ'}
    </button>
  )
}

function CountBadge({ count }) {
  if (!count) return null
  return (
    <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5 font-normal">
      {count}
    </span>
  )
}

function RecurringSummaryCard() {
  const month = format(new Date(), 'yyyy-MM')
  const summary = useRecurringStore((s) => s.getSummaryByMonth(month))

  if (summary.paidCount === 0 && summary.pendingCount === 0) {
    return <div className="text-center py-4 text-gray-400 text-sm">ไม่มีรายการจ่ายประจำเดือนนี้</div>
  }

  return (
    <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
      <p className="text-xs text-gray-500 mb-2">รายจ่ายประจำเดือนนี้</p>
      <div className="space-y-2">
        {summary.paidCount > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-emerald-600">จ่ายแล้ว {summary.paidCount} รายการ</span>
            <span className="font-semibold tabular-nums text-emerald-700">{summary.paidTotal.toLocaleString('th-TH')} บาท</span>
          </div>
        )}
        {summary.pendingCount > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-amber-600">รอจ่าย {summary.pendingCount} รายการ</span>
            <span className="font-semibold tabular-nums text-amber-700">{summary.pendingTotal.toLocaleString('th-TH')} บาท</span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm border-t border-purple-200 pt-2 mt-2">
          <span className="text-purple-600 font-medium">รวม</span>
          <span className="font-bold tabular-nums text-purple-700">{summary.total.toLocaleString('th-TH')} บาท</span>
        </div>
      </div>
    </div>
  )
}

export default function WalletPage() {
  const [collapsed, setCollapsed] = useState({
    accounts: false,
    recurring: false,
    loans: false,
    sub: false,
  })

  const toggle = (key) => setCollapsed((s) => ({ ...s, [key]: !s[key] }))

  const recurringPendingCount = useRecurringStore((s) => s.getPendingCountCurrentMonth())
  const loansCount = useWalletStore((s) => s.loans.filter((l) => !l.returned).length)
  const subCount = useWalletStore((s) => s.subWallets.length)
  const accountCount = useWalletStore((s) => s.transferAccounts.length)

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900">กระเป๋าเงินหลัก</h1>
      <MainWalletCard />

      <SectionCard
        title={<>🏦 บัญชีเงินโอน{collapsed.accounts && <CountBadge count={accountCount} />}</>}
        action={<CollapseBtn collapsed={collapsed.accounts} onToggle={() => toggle('accounts')} />}
      >
        {!collapsed.accounts && <TransferAccountList />}
      </SectionCard>

      <SectionCard
        title={<>รายจ่ายประจำ{collapsed.recurring && <CountBadge count={recurringPendingCount} />}</>}
        action={<CollapseBtn collapsed={collapsed.recurring} onToggle={() => toggle('recurring')} />}
      >
        {!collapsed.recurring && <RecurringSummaryCard />}
      </SectionCard>

      <SectionCard
        title={<>การยืมเงินจากกระเป๋าตังค์{collapsed.loans && <CountBadge count={loansCount} />}</>}
        action={<CollapseBtn collapsed={collapsed.loans} onToggle={() => toggle('loans')} />}
      >
        {!collapsed.loans && <LoanSummary />}
      </SectionCard>

      <SectionCard
        title={<>กระเป๋าตังค์{collapsed.sub && <CountBadge count={subCount} />}</>}
        action={<CollapseBtn collapsed={collapsed.sub} onToggle={() => toggle('sub')} />}
      >
        {!collapsed.sub && <SubWalletList />}
      </SectionCard>
    </div>
  )
}
