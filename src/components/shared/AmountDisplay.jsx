/**
 * แสดงจำนวนเงิน — ตัวเลข tabular เสมอ ยอดใหญ่ตาม spec ใช้ w600 tracking -.02em
 */
const SIZES = {
  sm: 'text-[13.5px] font-medium',
  md: 'text-base font-semibold',
  lg: 'text-[26px] font-semibold tracking-[-0.02em]',
  xl: 'text-[34px] font-semibold tracking-[-0.02em]',
}

export default function AmountDisplay({
  amount,
  suffix = 'บาท',
  size = 'md',
  showSign = false,
  tone,
}) {
  const negative = amount < 0
  const colorClass =
    tone === 'income' ? 'text-income'
    : tone === 'expense' ? 'text-expense'
    : tone === 'invert' ? 'text-white'
    : negative ? 'text-expense' : 'text-ink'

  return (
    <span className={`${SIZES[size] ?? SIZES.md} tabular-nums ${colorClass}`}>
      {showSign && amount > 0 ? '+' : ''}
      {amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      {suffix && <span className="text-[12.5px] font-normal text-muted ml-1">{suffix}</span>}
    </span>
  )
}
