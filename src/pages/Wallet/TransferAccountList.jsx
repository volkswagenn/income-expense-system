import { useState } from 'react'
import useWalletStore from '../../store/useWalletStore'
import useLogStore from '../../store/useLogStore'
import { buildLogEntry } from '../../lib/logBuilder'
import { moveBetweenTransferAccounts } from '../../lib/walletEngine'
import { formatAccount } from '../../components/shared/TransferAccountPicker'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import AmountDisplay from '../../components/shared/AmountDisplay'
import BankSelect from '../../components/shared/BankSelect'
import BankLogo from '../../components/shared/BankLogo'
import { BANKS } from '../../lib/banks'

const BANK_NAMES = BANKS.map((b) => b.name)

function AccountFormPopup({ account, onSave, onClose }) {
  const isEdit = !!account
  const [bankName, setBankName] = useState(account?.bankName ?? '')
  const [customBank, setCustomBank] = useState(
    account?.bankName && !BANK_NAMES.includes(account.bankName) ? account.bankName : ''
  )
  const [useCustom, setUseCustom] = useState(!!account?.bankName && !BANK_NAMES.includes(account.bankName))
  const [name, setName] = useState(account?.name ?? '')
  const [initialBalance, setInitialBalance] = useState(
    account ? String(account.balance) : ''
  )
  const [error, setError] = useState('')

  const submit = () => {
    const bank = useCustom ? customBank.trim() : bankName
    if (!bank) return setError('เลือกหรือพิมพ์ชื่อธนาคาร')
    if (!name.trim()) return setError('กรอกชื่อบัญชี')
    onSave({ bankName: bank, name: name.trim(), initialBalance: Number(initialBalance) || 0 })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
          <h3 className="font-semibold text-base">🏦 {isEdit ? 'แก้ไขบัญชี' : 'สร้างบัญชีเงินโอน'}</h3>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onClose}>×</button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="label">ธนาคาร</label>
            {useCustom ? (
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  value={customBank}
                  onChange={(e) => { setCustomBank(e.target.value); setError('') }}
                  placeholder="พิมพ์ชื่อธนาคาร..."
                  autoFocus
                />
                <button className="btn btn-secondary text-xs px-2" onClick={() => setUseCustom(false)}>เลือกจากรายการ</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="flex-1 min-w-0">
                  <BankSelect value={bankName} onChange={(v) => { setBankName(v); setError('') }} />
                </div>
                <button className="btn btn-secondary text-xs px-2 shrink-0" onClick={() => setUseCustom(true)}>อื่นๆ</button>
              </div>
            )}
          </div>

          <div>
            <label className="label">ชื่อบัญชี / ชื่อเรียก</label>
            <input
              className="input"
              value={name}
              onChange={(e) => { setName(e.target.value); setError('') }}
              placeholder="เช่น บัญชีร้าน, บัญชีสำรอง"
            />
          </div>

          <div>
            <label className="label">{isEdit ? 'ยอดเงินคงเหลือ' : 'ยอดเงินเริ่มต้น'} (บาท)</label>
            <input
              className="input"
              type="number"
              value={initialBalance}
              onChange={(e) => { setInitialBalance(e.target.value); setError('') }}
              placeholder="0.00"
            />
            {isEdit && (
              <p className="text-xs text-amber-600 mt-1">
                ⚠️ การแก้ยอดตรงนี้เป็นการปรับยอดคงเหลือโดยตรง ไม่สร้างรายการรับ-จ่าย
              </p>
            )}
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">⚠️ {error}</p>}
        </div>

        <div className="px-5 py-4 border-t bg-gray-50 flex gap-2 justify-end">
          <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" onClick={submit}>{isEdit ? 'บันทึก' : 'สร้างบัญชี'}</button>
        </div>
      </div>
    </div>
  )
}

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 border-b bg-gray-50">
          <h3 className="font-semibold text-base">↔️ ย้ายเงินระหว่างบัญชี</h3>
        </div>
        <div className="p-5 space-y-4">
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
            <input className="input" type="number" min="0" value={amount}
              onChange={(e) => { setAmount(e.target.value); setError('') }} placeholder="0.00" autoFocus />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">⚠️ {error}</p>}
        </div>
        <div className="px-5 py-4 border-t bg-gray-50 flex gap-2 justify-end">
          <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" onClick={submit}>ย้ายเงิน</button>
        </div>
      </div>
    </div>
  )
}

export default function TransferAccountList() {
  const accounts = useWalletStore((s) => s.transferAccounts)
  const { createTransferAccount, updateTransferAccount, deleteTransferAccount } = useWalletStore()
  const { addLog } = useLogStore()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [moveOpen, setMoveOpen] = useState(false)

  const handleSave = (data) => {
    if (editing) {
      const before = { ...editing }
      updateTransferAccount(editing.id, {
        bankName: data.bankName,
        name: data.name,
        balance: data.initialBalance,
      })
      addLog(buildLogEntry({
        activityType: 'TRANSFER_ACCOUNT_UPDATE',
        description: `แก้ไขบัญชีเงินโอน "${formatAccount(before)}" → "${data.bankName} — ${data.name}"`
          + (before.balance !== data.initialBalance
            ? ` (ปรับยอด ${before.balance.toLocaleString()} → ${data.initialBalance.toLocaleString()} บาท)` : ''),
        oldValue: before,
        newValue: data,
      }))
      setEditing(null)
    } else {
      const account = createTransferAccount(data)
      addLog(buildLogEntry({
        activityType: 'TRANSFER_ACCOUNT_CREATE',
        description: `สร้างบัญชีเงินโอน "${formatAccount(account)}" ยอดเริ่มต้น ${account.balance.toLocaleString()} บาท`,
        newValue: account,
      }))
      setFormOpen(false)
    }
  }

  const handleDelete = () => {
    deleteTransferAccount(deleting.id)
    addLog(buildLogEntry({
      activityType: 'TRANSFER_ACCOUNT_DELETE',
      description: `ลบบัญชีเงินโอน "${formatAccount(deleting)}"`,
      oldValue: deleting,
    }))
    setDeleting(null)
  }

  const handleMove = (fromId, toId, amount) => {
    moveBetweenTransferAccounts(fromId, toId, amount)
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
            <button className="btn btn-secondary text-xs" onClick={() => setMoveOpen(true)}>↔️ ย้ายเงิน</button>
          )}
          <button className="btn btn-primary text-xs" onClick={() => setFormOpen(true)}>+ สร้างบัญชี</button>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <p className="text-4xl mb-3">🏦</p>
          <p className="text-sm">ยังไม่มีบัญชีเงินโอน</p>
          <p className="text-xs mt-1">กด "สร้างบัญชี" เพื่อเพิ่มบัญชีธนาคารแรก</p>
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
                <p className="text-xs text-gray-500 truncate">{a.bankName}</p>
              </div>
              <div className="text-right shrink-0">
                <AmountDisplay amount={a.balance} size="md" />
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  className="text-xs text-blue-500 hover:text-blue-700 px-1.5 py-1"
                  onClick={() => setEditing(a)}
                >แก้ไข</button>
                <button
                  className="text-xs text-red-400 hover:text-red-600 px-1.5 py-1"
                  onClick={() => setDeleting(a)}
                >ลบ</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(formOpen || editing) && (
        <AccountFormPopup
          account={editing}
          onSave={handleSave}
          onClose={() => { setFormOpen(false); setEditing(null) }}
        />
      )}

      {moveOpen && (
        <MovePopup accounts={accounts} onConfirm={handleMove} onClose={() => setMoveOpen(false)} />
      )}

      <ConfirmPopup
        open={!!deleting}
        title="ลบบัญชีเงินโอน"
        message={deleting
          ? `ลบบัญชี "${formatAccount(deleting)}"?\n\n`
            + (deleting.balance !== 0
              ? `• บัญชีนี้มียอดคงเหลือ ${deleting.balance.toLocaleString()} บาท — ยอดนี้จะหายไปจากยอดรวมเงินโอน\n`
              : '• บัญชีนี้ยอดเป็น 0\n')
            + '• รายการเก่าที่ผูกกับบัญชีนี้ยังอยู่ครบ แต่จะแสดงว่า "ไม่ระบุบัญชี"'
          : ''}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
        confirmLabel="ลบบัญชี"
        danger
      />
    </div>
  )
}
