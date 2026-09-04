import { useState } from 'react'
import Popup from '../../components/shared/Popup'
import { Link } from 'react-router-dom'
import AmountInput from '../../components/shared/AmountInput'
import useWalletStore from '../../store/useWalletStore'
import { moveBetweenTransferAccounts } from '../../lib/walletEngine'
import { formatAccount } from '../../components/shared/TransferAccountPicker'
import AmountDisplay from '../../components/shared/AmountDisplay'
import BankLogo from '../../components/shared/BankLogo'
import Icon from '../../components/shared/Icon'
import AccountMenuPopup from './AccountMenuPopup'
import { kindLabel } from '../Manage/AccountManage'

/**
 * บัญชีเงินโอนบนหน้ากระเป๋าเงิน — มีไว้ "ดูยอดและย้ายเงิน" เท่านั้น
 * การเพิ่ม แก้ไข ลบ ย้ายไปอยู่ที่ จัดการข้อมูล → บัญชีธนาคาร (AccountManage)
 * เพื่อให้หน้านี้เหลือแต่งานประจำวัน ไม่มีปุ่มแก้ไขปนกับตัวเลข
 */
function MovePopup({ accounts, onConfirm, onClose }) {
  const [fromId, setFromId] = useState(accounts[0]?.id ?? '')
  const [toId, setToId] = useState(accounts[1]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    const amt = Number(amount)
    if (!fromId || !toId) return setError('เลือกบัญชีต้นทางและปลายทาง')
    if (fromId === toId) return setError('ต้องเป็นคนละบัญชี')
    if (!amt || amt <= 0) return setError('กรอกจำนวนเงิน')
    onConfirm(fromId, toId, amt)
  }

  return (
    <Popup
      title="ย้ายเงินระหว่างบัญชี"
      icon="swap_horiz"
      width={420}
      onClose={onClose}
      onConfirm={submit}
      confirmLabel="ย้ายเงิน"
    >
        <div>
          <label className="label">จากบัญชี</label>
          <select className="input" value={fromId} onChange={(e) => { setFromId(e.target.value); setError('') }}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{formatAccount(a)} — {a.balance.toLocaleString()}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">ไปบัญชี</label>
          <select className="input" value={toId} onChange={(e) => { setToId(e.target.value); setError('') }}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{formatAccount(a)} — {a.balance.toLocaleString()}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">จำนวนเงิน (บาท)</label>
          <AmountInput className="input" value={amount}
            onChange={(e) => { setAmount(e.target.value); setError('') }} placeholder="0.00" autoFocus />
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">⚠️ {error}</p>}
    </Popup>
  )
}

export default function TransferAccountList() {
  const accounts = useWalletStore((s) => s.transferAccounts)
  const [moveOpen, setMoveOpen] = useState(false)
  const [menuAccount, setMenuAccount] = useState(null)

  const handleMove = async (fromId, toId, amount) => {
    await moveBetweenTransferAccounts(fromId, toId, amount)
    setMoveOpen(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-gray-500">
          ยอดรวมของทุกบัญชีคือยอด "กระเป๋าเงินโอน" ที่แสดงด้านบนและบนหน้า Dashboard
        </p>
        <div className="flex gap-2">
          {accounts.length > 1 && (
            <button className="btn btn-primary text-xs" onClick={() => setMoveOpen(true)}>↔️ ย้ายเงิน</button>
          )}
          <Link to="/manage/accounts" className="btn btn-secondary text-xs">จัดการบัญชี</Link>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <p className="text-4xl mb-3">🏦</p>
          <p className="text-sm">ยังไม่มีบัญชีเงินโอน</p>
          <p className="text-xs mt-1">
            เพิ่มบัญชีได้ที่{' '}
            <Link to="/manage/accounts" className="text-blue-600 hover:underline">จัดการข้อมูล → บัญชีธนาคาร</Link>
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map((a) => (
            <div
              key={a.id}
              className={`rounded-xl border p-3.5 flex items-center gap-3 ${
                a.balance < 0 ? 'border-red-200 bg-red-50' : 'border-blue-100 bg-blue-50/50'
              }`}
            >
              <BankLogo bankName={a.bankName} size="lg" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{a.name}</p>
                <p className="text-xs text-gray-500 truncate">
                  {a.bankName}
                  {a.kind && ` · ${kindLabel(a.kind)}`}
                  {a.accountNo && ` · ${a.accountNo}`}
                </p>
              </div>
              <div className="text-right shrink-0">
                <AmountDisplay amount={a.balance} size="md" />
              </div>
              <button
                onClick={() => setMenuAccount(a)}
                title="ดูความเคลื่อนไหวและแก้ไขบัญชี"
                className="shrink-0 w-9 h-9 rounded-ctl border border-hairline bg-white flex items-center justify-center text-muted hover:text-ink hover:bg-paper"
              >
                <Icon name="more_vert" size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      {moveOpen && (
        <MovePopup accounts={accounts} onConfirm={handleMove} onClose={() => setMoveOpen(false)} />
      )}
      {menuAccount && (
        <AccountMenuPopup account={menuAccount} onClose={() => setMenuAccount(null)} />
      )}
    </div>
  )
}
