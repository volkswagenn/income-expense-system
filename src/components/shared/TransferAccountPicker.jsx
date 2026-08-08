import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import useWalletStore from '../../store/useWalletStore'
import BankLogo from './BankLogo'

export function formatAccount(account) {
  if (!account) return 'ไม่ระบุบัญชี'
  return account.bankName ? `${account.bankName} — ${account.name}` : account.name
}

/**
 * ตัวเลือกบัญชีเงินโอน
 *   0 บัญชี  → เตือนให้ไปสร้างที่หน้ากระเป๋าเงิน
 *   1 บัญชี  → เลือกให้อัตโนมัติ แสดงเป็นข้อความ ไม่ต้องกดเพิ่ม
 *   2+ บัญชี → ให้เลือกจาก dropdown
 *
 * props: value, onChange(id), label, showBalance
 */
export default function TransferAccountPicker({
  value,
  onChange,
  label = 'บัญชีเงินโอน',
  showBalance = true,
}) {
  const accounts = useWalletStore((s) => s.transferAccounts)

  // มีบัญชีเดียวหรือค่าที่เลือกไว้ใช้ไม่ได้แล้ว → ตั้งค่าให้อัตโนมัติ
  useEffect(() => {
    if (accounts.length === 1 && value !== accounts[0].id) {
      onChange(accounts[0].id)
    } else if (value && !accounts.some((a) => a.id === value)) {
      onChange(accounts.length === 1 ? accounts[0].id : '')
    }
  }, [accounts, value]) // eslint-disable-line react-hooks/exhaustive-deps

  if (accounts.length === 0) {
    return (
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
        ⚠️ ยังไม่มีบัญชีเงินโอน —{' '}
        <Link to="/wallet" className="underline font-medium hover:text-amber-900">
          สร้างบัญชีที่หน้ากระเป๋าเงิน
        </Link>{' '}
        ก่อนจึงจะบันทึกด้วยเงินโอนได้
      </div>
    )
  }

  if (accounts.length === 1) {
    const a = accounts[0]
    return (
      <div>
        <label className="label">{label}</label>
        <div className="px-3 py-2 rounded-xl bg-blue-50 border border-blue-100 text-sm text-blue-900 flex items-center gap-2">
          <BankLogo bankName={a.bankName} size="sm" />
          <span className="truncate flex-1">{formatAccount(a)}</span>
          {showBalance && (
            <span className="text-xs text-blue-600 tabular-nums shrink-0">
              {a.balance.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
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
        <option value="">เลือกบัญชี...</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {formatAccount(a)}
            {showBalance ? ` — ${a.balance.toLocaleString('th-TH', { minimumFractionDigits: 2 })}` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
