import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import useCreditCardStore from '../../store/useCreditCardStore'
import AppIcon from './AppIcon'
import { DEFAULT_ICONS } from '../../lib/defaultIcons'

export function formatCard(card) {
  if (!card) return 'ไม่ระบุบัตร'
  const base = card.bankName ? `${card.bankName} — ${card.name}` : card.name
  return card.last4 ? `${base} ···${card.last4}` : base
}

/**
 * ตัวเลือกบัตรเครดิต — โครงเดียวกับ TransferAccountPicker
 *   0 ใบ  → เตือนให้ไปสร้างที่หน้ากระเป๋าเงิน
 *   1 ใบ  → เลือกให้อัตโนมัติ แสดงเป็นข้อความ ไม่ต้องกดเพิ่ม
 *   2+ ใบ → ให้เลือกจาก dropdown
 *
 * แสดงหนี้คงค้าง ไม่ใช่ยอดเงินคงเหลือ — ตัวเลขยิ่งมากยิ่งไม่ดี จึงใช้สีแดง
 *
 * props: value, onChange(id), label, showOutstanding
 */
export default function CreditCardPicker({
  value,
  onChange,
  label = 'บัตรเครดิต',
  showOutstanding = true,
}) {
  const cards = useCreditCardStore((s) => s.cards)
  const active = cards.filter((c) => c.enabled)

  // มีใบเดียวหรือค่าที่เลือกไว้ใช้ไม่ได้แล้ว → ตั้งค่าให้อัตโนมัติ
  useEffect(() => {
    if (active.length === 1 && value !== active[0].id) {
      onChange(active[0].id)
    } else if (value && !active.some((c) => c.id === value)) {
      onChange(active.length === 1 ? active[0].id : '')
    }
  }, [cards, value]) // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

  if (active.length === 0) {
    return (
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
        ⚠️ ยังไม่มีบัตรเครดิต —{' '}
        <Link to="/wallet" className="underline font-medium hover:text-amber-900">
          เพิ่มบัตรที่หน้ากระเป๋าเงิน
        </Link>{' '}
        ก่อนจึงจะบันทึกด้วยบัตรเครดิตได้
      </div>
    )
  }

  if (active.length === 1) {
    const c = active[0]
    return (
      <div>
        <label className="label">{label}</label>
        <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-900 flex items-center gap-2">
          <span className="w-6 h-6 flex-none rounded-md bg-paper flex items-center justify-center"><AppIcon value={c.icon} size={15} fallback={DEFAULT_ICONS.card} /></span>
          <span className="truncate flex-1">{formatCard(c)}</span>
          {showOutstanding && (
            <span className="text-xs text-rose-600 tabular-nums shrink-0" title="ยอดหนี้คงค้าง">
              ค้าง {fmt(c.outstanding)}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <label className="label">{label}</label>
      <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">เลือกบัตร...</option>
        {active.map((c) => (
          <option key={c.id} value={c.id}>
            {formatCard(c)}
            {showOutstanding ? ` — ค้าง ${fmt(c.outstanding)}` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
