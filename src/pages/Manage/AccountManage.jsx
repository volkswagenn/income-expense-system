import { useState } from 'react'
import { Link } from 'react-router-dom'
import AmountInput from '../../components/shared/AmountInput'
import useWalletStore from '../../store/useWalletStore'
import useLogStore from '../../store/useLogStore'
import { buildLogEntry } from '../../lib/logBuilder'
import { formatAccount } from '../../components/shared/TransferAccountPicker'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import AmountDisplay from '../../components/shared/AmountDisplay'
import BankSelect from '../../components/shared/BankSelect'
import BankLogo from '../../components/shared/BankLogo'
import { BANKS } from '../../lib/banks'

const BANK_NAMES = BANKS.map((b) => b.name)

/** ประเภทบัญชี — ตรงกับ constraint ใน supabase/account.sql */
export const ACCOUNT_KINDS = [
  { value: 'savings', label: 'ออมทรัพย์' },
  { value: 'current', label: 'กระแสรายวัน' },
  { value: 'ewallet', label: 'e-Wallet' },
  { value: 'other',   label: 'อื่นๆ' },
]
export const kindLabel = (k) => ACCOUNT_KINDS.find((x) => x.value === k)?.label ?? ''

/**
 * ฟอร์มเพิ่ม/แก้ไขบัญชี — ย้ายมาจากหน้ากระเป๋าเงิน
 * เพิ่มประเภทบัญชีกับเลขบัญชีตามแบบ Wallet Story ไว้แยกบัญชีธนาคารเดียวกันหลายบัญชี
 */
function AccountFormPopup({ account, onSave, onClose, busy }) {
  const isEdit = !!account
  const [bankName, setBankName] = useState(account?.bankName ?? '')
  const [customBank, setCustomBank] = useState(
    account?.bankName && !BANK_NAMES.includes(account.bankName) ? account.bankName : ''
  )
  const [useCustom, setUseCustom] = useState(!!account?.bankName && !BANK_NAMES.includes(account.bankName))
  const [name, setName] = useState(account?.name ?? '')
  const [kind, setKind] = useState(account?.kind ?? 'savings')
  const [accountNo, setAccountNo] = useState(account?.accountNo ?? '')
  const [initialBalance, setInitialBalance] = useState(account ? String(account.balance) : '')
  const [error, setError] = useState('')

  const submit = () => {
    if (busy) return
    const bank = useCustom ? customBank.trim() : bankName
    if (!bank) return setError('เลือกหรือพิมพ์ชื่อธนาคาร')
    if (!name.trim()) return setError('กรอกชื่อบัญชี')
    onSave({
      bankName: bank,
      name: name.trim(),
      kind,
      accountNo: accountNo.trim(),
      initialBalance: Number(initialBalance) || 0,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
          <h3 className="font-semibold text-base">🏦 {isEdit ? 'แก้ไขบัญชี' : 'เพิ่มบัญชีธนาคาร'}</h3>
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
            <label className="label">ประเภทบัญชี</label>
            <div className="grid grid-cols-4 gap-1.5">
              {ACCOUNT_KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  className={`btn text-xs py-1.5 px-1 ${kind === k.value ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setKind(k.value)}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">เลขบัญชี (ไม่บังคับ)</label>
            <input
              className="input"
              value={accountNo}
              onChange={(e) => setAccountNo(e.target.value)}
              placeholder="ใส่แค่ 4 ตัวท้ายก็พอ เช่น x1234"
            />
            <p className="text-xs text-gray-400 mt-1">ไว้แยกบัญชีธนาคารเดียวกันหลายบัญชี ไม่ต้องใส่เลขเต็ม</p>
          </div>

          <div>
            <label className="label">{isEdit ? 'ยอดเงินคงเหลือ' : 'ยอดเงินเริ่มต้น'} (บาท)</label>
            <AmountInput
              className="input"
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
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? '⏳' : isEdit ? 'บันทึก' : 'เพิ่มบัญชี'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AccountManage() {
  const accounts = useWalletStore((s) => s.transferAccounts)
  const { createTransferAccount, updateTransferAccount, deleteTransferAccount, adjustTransferAccount } = useWalletStore()
  const { addLog } = useLogStore()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async (fn) => {
    if (busy) return
    setBusy(true); setError('')
    try { await fn() } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  // ทุก action รอเซิร์ฟเวอร์ตอบก่อนปิดฟอร์ม ยอดขยับผ่าน RPC แบบ balance + delta เท่านั้น
  const handleSave = (data) => run(async () => {
    if (editing) {
      const before = { ...editing }
      const newBalance = Number(data.initialBalance) || 0
      const delta = newBalance - (Number(before.balance) || 0)
      await updateTransferAccount(editing.id, {
        bankName: data.bankName, name: data.name, kind: data.kind, accountNo: data.accountNo || null,
      })
      if (delta !== 0) await adjustTransferAccount(editing.id, delta)
      addLog(buildLogEntry({
        activityType: 'TRANSFER_ACCOUNT_UPDATE',
        description: `แก้ไขบัญชีเงินโอน "${formatAccount(before)}" → "${data.bankName} — ${data.name}"`
          + (delta !== 0
            ? ` (ปรับยอด ${Number(before.balance).toLocaleString()} → ${newBalance.toLocaleString()} บาท)` : ''),
        oldValue: before,
        newValue: { ...data, balance: newBalance },
        walletEffect: delta !== 0 ? { target: 'transfer', delta, transferAccountId: editing.id } : null,
      }))
      setEditing(null)
    } else {
      const account = await createTransferAccount(data)
      addLog(buildLogEntry({
        activityType: 'TRANSFER_ACCOUNT_CREATE',
        description: `สร้างบัญชีเงินโอน "${formatAccount(account)}" ยอดเริ่มต้น ${Number(account.balance).toLocaleString()} บาท`,
        newValue: account,
      }))
      setFormOpen(false)
    }
  })

  const handleDelete = () => run(async () => {
    const target = deleting
    await deleteTransferAccount(target.id)
    addLog(buildLogEntry({
      activityType: 'TRANSFER_ACCOUNT_DELETE',
      description: `ลบบัญชีเงินโอน "${formatAccount(target)}"`,
      oldValue: target,
    }))
    setDeleting(null)
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-semibold text-gray-900">🏦 บัญชีธนาคาร</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            ยอดรวมทุกบัญชีคือ "กระเป๋าเงินโอน" — ดูยอดและย้ายเงินได้ที่{' '}
            <Link to="/wallet" className="text-blue-600 hover:underline">หน้ากระเป๋าเงิน</Link>
          </p>
        </div>
        <button className="btn btn-primary text-xs" onClick={() => { setEditing(null); setFormOpen(true) }}>
          + เพิ่มบัญชี
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">⚠️ {error}</p>}

      {accounts.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <p className="text-4xl mb-3">🏦</p>
          <p className="text-sm">ยังไม่มีบัญชีธนาคาร</p>
          <p className="text-xs mt-1">กด "เพิ่มบัญชี" เพื่อเพิ่มบัญชีแรก</p>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map((a) => (
            <div key={a.id} className="rounded-xl border border-gray-200 p-3.5 flex items-center gap-3">
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
              <div className="flex gap-1 shrink-0">
                <button className="text-xs text-blue-500 hover:text-blue-700 px-1.5 py-1" onClick={() => setEditing(a)}>แก้ไข</button>
                <button className="text-xs text-red-400 hover:text-red-600 px-1.5 py-1" onClick={() => setDeleting(a)}>ลบ</button>
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
          busy={busy}
        />
      )}

      <ConfirmPopup
        open={!!deleting}
        title="ลบบัญชีธนาคาร"
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
