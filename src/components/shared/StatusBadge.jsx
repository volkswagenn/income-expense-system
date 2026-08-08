const VARIANTS = {
  pending:  'bg-pending-soft text-pending border-pending-line',
  paid:     'bg-income-soft text-income border-transparent',
  waiting:  'bg-pending-soft text-pending border-pending-line',
  received: 'bg-transfer-soft text-transfer border-transparent',
  success:  'bg-income-soft text-income border-transparent',
  failed:   'bg-expense-soft text-expense border-transparent',
}

const LABELS = {
  pending: 'ค้างชำระ',
  paid: 'ชำระแล้ว',
  waiting: 'รอใบกำกับภาษี',
  received: 'ได้รับแล้ว',
  success: 'สำเร็จ',
  failed: 'ล้มเหลว',
}

export default function StatusBadge({ status, label }) {
  const cls = VARIANTS[status] ?? 'bg-[#F1F0EC] text-muted border-hairline'
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {label ?? LABELS[status] ?? status}
    </span>
  )
}
