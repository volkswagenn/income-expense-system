import { useNavigate } from 'react-router-dom'
import useWalletStore from '../../store/useWalletStore'
import usePendingStore from '../../store/usePendingStore'
import AmountDisplay from '../../components/shared/AmountDisplay'

function StatCard({ label, amount, sub, onClick, color = 'gray' }) {
  const colors = {
    gray: {
      box: 'bg-gray-50 border-gray-200',
      amount: 'text-gray-900',
      sub: 'text-gray-400',
    },
    slate: {
      box: 'bg-slate-50 border-slate-200',
      amount: 'text-slate-900',
      sub: 'text-slate-500',
    },
    green: {
      box: 'bg-teal-50 border-teal-200',
      amount: 'text-teal-700',
      sub: 'text-teal-500',
    },
    blue: {
      box: 'bg-blue-50 border-blue-200',
      amount: 'text-blue-700',
      sub: 'text-blue-500',
    },
    indigo: {
      box: 'bg-indigo-50 border-indigo-200',
      amount: 'text-indigo-700',
      sub: 'text-indigo-500',
    },
    red: {
      box: 'bg-red-50 border-red-200',
      amount: 'text-red-600',
      sub: 'text-red-400',
    },
    amber: {
      box: 'bg-orange-50 border-orange-200',
      amount: 'text-orange-700',
      sub: 'text-orange-500',
    },
  }
  const tone = colors[color] ?? colors.gray
  return (
    <div
      className={`rounded-xl border p-4 min-h-[106px] flex flex-col justify-between ${tone.box} ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={onClick}
    >
      <p className="text-xs text-gray-500 leading-tight min-h-[16px]">{label}</p>
      <div className={`mt-2 tabular-nums ${tone.amount}`}>
        <AmountDisplay amount={amount} size="lg" />
      </div>
      <p className={`text-xs mt-1 min-h-[16px] leading-tight ${sub ? tone.sub : 'text-transparent'}`}>
        {sub || 'ไม่มีรายละเอียด'}
      </p>
    </div>
  )
}

export default function FinancialStatus() {
  const { cash, transfer } = useWalletStore()
  const pendingTotal = usePendingStore((s) => s.getPendingTotal())
  const pendingIncomeTotal = usePendingStore((s) => s.getPendingIncomeTotal())
  const navigate = useNavigate()

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard
          label="ยอดเงินคงเหลือรวม"
          amount={cash + transfer}
          sub="เงินสด + เงินโอน"
          color="slate"
        />
        <StatCard
          label="กระเป๋าเงินสด"
          amount={cash}
          color={cash < 0 ? 'red' : 'green'}
        />
        <StatCard
          label="กระเป๋าเงินโอน"
          amount={transfer}
          color={transfer < 0 ? 'red' : 'indigo'}
        />
        <StatCard
          label="หนี้ค้างชำระ"
          amount={pendingTotal}
          color={pendingTotal > 0 ? 'amber' : 'gray'}
          onClick={() => navigate('/wallet?tab=payment')}
          sub={pendingTotal > 0 ? 'คลิกดูรายละเอียด' : undefined}
        />
        <StatCard
          label="รอรับเงิน"
          amount={pendingIncomeTotal}
          color={pendingIncomeTotal > 0 ? 'blue' : 'gray'}
          onClick={() => navigate('/wallet?tab=income')}
          sub={pendingIncomeTotal > 0 ? 'คลิกดูรายละเอียด' : undefined}
        />
    </div>
  )
}
