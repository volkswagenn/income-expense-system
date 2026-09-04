import Icon from './Icon'

/**
 * การ์ดตัวเลขสรุปที่อยู่หัวทุกหน้า
 *
 * ทุกหน้าเคยเขียนกล่องสรุปของตัวเอง สี ขนาดตัวเลข และระยะขอบจึงไม่ตรงกัน
 * ทำให้เทียบตัวเลขข้ามหน้าไม่ได้ ตัวนี้กำหนดโทนไว้ 6 แบบตามความหมายของตัวเลข
 *
 * tone: 'dark' (ยอดรวมหลัก) | 'income' | 'expense' | 'pending' | 'transfer' | 'plain'
 */
const TONES = {
  dark: { box: 'bg-ink', label: 'text-[#9AA0A8]', value: 'text-white', sub: 'text-[#9AA0A8]' },
  income: { box: 'bg-income-soft border border-[#BFE0D2]', label: 'text-muted', value: 'text-income', sub: 'text-income' },
  expense: { box: 'bg-expense-soft border border-[#F5D3CE]', label: 'text-muted', value: 'text-expense', sub: 'text-[#A93A2E]' },
  pending: { box: 'bg-pending-soft border border-pending-line', label: 'text-muted', value: 'text-pending', sub: 'text-[#8A6A15]' },
  transfer: { box: 'bg-transfer-soft border border-[#D3D9F5]', label: 'text-muted', value: 'text-transfer', sub: 'text-transfer' },
  plain: { box: 'bg-white border border-hairline', label: 'text-muted', value: 'text-ink', sub: 'text-faint' },
}

export default function StatCard({ label, value, sub, tone = 'plain', icon, onClick, big = false, children }) {
  const t = TONES[tone] ?? TONES.plain
  const Tag = onClick ? 'button' : 'div'

  return (
    <Tag
      onClick={onClick}
      className={`rounded-panel px-4 py-3.5 text-left w-full ${t.box} ${onClick ? 'hover:brightness-[0.98] transition' : ''}`}
    >
      <div className="flex items-center gap-1.5">
        {icon && <Icon name={icon} size={16} className={t.value} />}
        <p className={`text-[11.5px] ${t.label}`}>{label}</p>
      </div>
      <p className={`tabular-nums font-semibold tracking-[-0.02em] mt-1 ${t.value} ${big ? 'text-[32px] leading-[1.1]' : 'text-2xl'}`}>
        {value}
      </p>
      {sub && <p className={`text-[11.5px] mt-0.5 ${t.sub}`}>{sub}</p>}
      {children}
    </Tag>
  )
}
