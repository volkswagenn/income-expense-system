import { useState } from 'react'
import Popup from '../../components/shared/Popup'
import { Link } from 'react-router-dom'
import AmountInput from '../../components/shared/AmountInput'
import useWalletStore from '../../store/useWalletStore'
import { moveBetweenTransferAccounts } from '../../lib/walletEngine'
import TransferAccountPicker, { formatAccount } from '../../components/shared/TransferAccountPicker'
import AmountDisplay from '../../components/shared/AmountDisplay'
import AppIcon from '../../components/shared/AppIcon'
import { DEFAULT_ICONS } from '../../lib/defaultIcons'
import Icon from '../../components/shared/Icon'
import WalletItemPopup from './WalletItemPopup'
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

  const from = accounts.find((a) => a.id === fromId)
  const to = accounts.find((a) => a.id === toId)
  const amt = Number(amount) || 0

  return (
    <Popup
      title="ย้ายเงินระหว่างบัญชี"
      sub="ยอดรวมเงินโอนไม่เปลี่ยน แค่ย้ายจากบัญชีหนึ่งไปอีกบัญชี"
      icon="swap_horiz"
      width={440}
      onClose={onClose}
      onConfirm={submit}
      confirmLabel={amt > 0 ? `ย้าย ${amt.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท` : 'ย้ายเงิน'}
      error={error}
    >
        {/* ตัวเลือกบัญชีชุดเดียวกับที่อื่นในแอป (มีโลโก้ + ยอด) ไม่ใช้ <select> ของเบราว์เซอร์ */}
        <TransferAccountPicker
          value={fromId}
          onChange={(id) => { setFromId(id); if (id === toId) setToId(''); setError('') }}
          label="จากบัญชี"
        />
        <TransferAccountPicker
          value={toId}
          onChange={(id) => { setToId(id); setError('') }}
          label="ไปบัญชี"
          exclude={fromId ? [fromId] : []}
        />
        <div>
          <label className="label">จำนวนเงิน (บาท)</label>
          <AmountInput className="input text-right text-[19px] font-semibold tabular-nums" value={amount}
            onChange={(e) => { setAmount(e.target.value); setError('') }} placeholder="0.00" autoFocus />
        </div>
        {from && to && amt > 0 && (
          <div className="grid grid-cols-2 gap-2 text-[11.5px]">
            <div className="bg-[#FAF9F6] border border-[#EFEDE7] rounded-ctl px-3 py-2">
              <span className="block text-faint truncate">{formatAccount(from)}</span>
              <b className={`tabular-nums ${Number(from.balance) - amt < 0 ? 'text-expense' : 'text-ink'}`}>
                {(Number(from.balance) - amt).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </b>
            </div>
            <div className="bg-[#FAF9F6] border border-[#EFEDE7] rounded-ctl px-3 py-2">
              <span className="block text-faint truncate">{formatAccount(to)}</span>
              <b className="tabular-nums text-ink">
                {(Number(to.balance) + amt).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </b>
            </div>
          </div>
        )}
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
              <span className="w-10 h-10 flex-none rounded-lg bg-white border border-hairline flex items-center justify-center">
                <AppIcon value={a.icon} size={22} fallback={DEFAULT_ICONS.account} />
              </span>
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
                title="ฝาก ถอน โอนไปบัญชีอื่น หรือดูรายการเดินบัญชี"
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
        <WalletItemPopup kind="bank" item={menuAccount} onClose={() => setMenuAccount(null)} />
      )}
    </div>
  )
}
