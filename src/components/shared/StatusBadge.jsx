const VARIANTS = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  paid: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  waiting: 'bg-orange-100 text-orange-700 border-orange-200',
  received: 'bg-blue-100 text-blue-700 border-blue-200',
  success: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  failed: 'bg-red-100 text-red-700 border-red-200',
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
  const cls = VARIANTS[status] ?? 'bg-gray-100 text-gray-600 border-gray-200'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {label ?? LABELS[status] ?? status}
    </span>
  )
}
