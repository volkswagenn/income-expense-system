export default function AmountDisplay({ amount, suffix = 'บาท', size = 'md', showSign = false }) {
  const negative = amount < 0
  const sizeClass = size === 'lg' ? 'text-2xl' : size === 'xl' ? 'text-3xl' : 'text-base'
  return (
    <span className={`${sizeClass} font-bold tabular-nums ${negative ? 'text-red-500' : 'text-gray-900'}`}>
      {showSign && amount > 0 ? '+' : ''}
      {amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      {suffix && <span className="text-sm font-normal text-gray-500 ml-1">{suffix}</span>}
    </span>
  )
}
