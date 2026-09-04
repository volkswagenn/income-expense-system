import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import useWalletStore from '../../store/useWalletStore'
import BankLogo from './BankLogo'
import Icon from './Icon'

export function formatAccount(account) {
  if (!account) return 'ไม่ระบุบัญชี'
  return account.bankName ? `${account.bankName} — ${account.name}` : account.name
}

const money = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

/**
 * ตัวเลือกบัญชีเงินโอน
 *   0 บัญชี  → เตือนให้ไปสร้างที่หน้ากระเป๋าเงิน
 *   1 บัญชี  → เลือกให้อัตโนมัติ แสดงเป็นข้อความ ไม่ต้องกดเพิ่ม
 *   2+ บัญชี → กดแล้วกางรายการให้เลือก แต่ละบรรทัดมีโลโก้ธนาคารนำหน้า
 *
 * ไม่ใช้ <select> เพราะ option ของเบราว์เซอร์ใส่รูปไม่ได้ เห็นแต่ตัวอักษร
 * ซึ่งทำให้ต้องอ่านชื่อธนาคารทีละบรรทัด ทั้งที่โลโก้บอกได้เร็วกว่ามาก
 *
 * รายการกางอยู่ในเนื้อหน้า (ไม่ได้ลอยทับ) เพราะตัวนี้ถูกใช้ในป๊อปอัปหลายที่
 * ซึ่งกล่องข้างในเลื่อนได้ ถ้าทำเป็นเมนูลอยจะถูกขอบกล่องตัดหายไปครึ่งหนึ่ง
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
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  // มีบัญชีเดียวหรือค่าที่เลือกไว้ใช้ไม่ได้แล้ว → ตั้งค่าให้อัตโนมัติ
  useEffect(() => {
    if (accounts.length === 1 && value !== accounts[0].id) {
      onChange(accounts[0].id)
    } else if (value && !accounts.some((a) => a.id === value)) {
      onChange(accounts.length === 1 ? accounts[0].id : '')
    }
  }, [accounts, value]) // eslint-disable-line react-hooks/exhaustive-deps

  // กด Esc ปิดรายการ — ปุ่มยังโฟกัสอยู่ที่เดิม
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    const el = boxRef.current
    el?.addEventListener('keydown', onKey)
    return () => el?.removeEventListener('keydown', onKey)
  }, [open])

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
            <span className="text-xs text-blue-600 tabular-nums shrink-0">{money(a.balance)}</span>
          )}
        </div>
      </div>
    )
  }

  const selected = accounts.find((a) => a.id === value) ?? null

  return (
    <div ref={boxRef}>
      <label className="label">{label}</label>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`w-full h-11 px-3 bg-white border rounded-ctl flex items-center gap-2.5 text-left transition ${
          open ? 'border-ink shadow-[0_0_0_1px_#16181D]' : 'border-hairline hover:border-[#C9C5BA]'
        }`}
      >
        {selected ? (
          <>
            <BankLogo bankName={selected.bankName} size="sm" />
            <span className="flex-1 min-w-0 truncate text-[13px]">{formatAccount(selected)}</span>
            {showBalance && (
              <span className="flex-none tabular-nums text-[12px] text-muted">{money(selected.balance)}</span>
            )}
          </>
        ) : (
          <>
            <span className="w-6 h-6 flex-none rounded-md bg-paper flex items-center justify-center">
              <Icon name="account_balance" size={15} className="text-faint" />
            </span>
            <span className="flex-1 min-w-0 text-[13px] text-faint">เลือกบัญชี...</span>
          </>
        )}
        <Icon
          name="expand_more"
          size={19}
          className={`flex-none text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="mt-1.5 border border-hairline rounded-ctl bg-white overflow-hidden max-h-[248px] overflow-y-auto">
          {accounts.map((a) => {
            const on = a.id === value
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => { onChange(a.id); setOpen(false) }}
                className={`w-full px-3 py-2.5 flex items-center gap-2.5 text-left border-b border-[#F2F0EA] last:border-0 transition ${
                  on ? 'bg-[#F2FAD9]' : 'hover:bg-paper'
                }`}
              >
                <BankLogo bankName={a.bankName} size="sm" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-medium truncate">{a.name}</span>
                  <span className="block text-[11px] text-faint truncate">
                    {a.bankName || 'ไม่ระบุธนาคาร'}
                    {a.accountNo ? ` · ${a.accountNo}` : ''}
                  </span>
                </span>
                {showBalance && (
                  <span className={`flex-none tabular-nums text-[12.5px] ${
                    Number(a.balance) < 0 ? 'text-expense' : 'text-muted'
                  }`}>
                    {money(a.balance)}
                  </span>
                )}
                {on && <Icon name="check" size={17} className="flex-none text-ink" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
