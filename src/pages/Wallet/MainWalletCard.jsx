import { useState } from 'react'
import AmountInput from '../../components/shared/AmountInput'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import useWalletStore from '../../store/useWalletStore'
import AmountDisplay from '../../components/shared/AmountDisplay'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import TransferAccountPicker from '../../components/shared/TransferAccountPicker'
import DatePicker from '../../components/shared/DatePicker'
import { transferBetweenWallets, addToWallet } from '../../lib/walletEngine'
import { useNegativeConfirm } from '../../hooks/useNegativeConfirm'

function dateLabel(d) {
  try { return format(new Date(d + 'T00:00:00'), 'd MMM yyyy', { locale: th }) } catch { return d }
}

function WalletModal({ title, onClose, onConfirm, label, buttonLabel, buttonClass = 'btn-primary', needsAccount }) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [accountId, setAccountId] = useState('')
  const accountCount = useWalletStore((s) => s.transferAccounts.length)
  const blocked = needsAccount && accountCount === 0
  const missingAccount = needsAccount && !blocked && !accountId

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs mx-4 p-6 space-y-4">
        <h3 className="font-semibold text-base">{title}</h3>
        <div>
          <label className="label">วันที่</label>
          <DatePicker value={date} onChange={setDate} />
        </div>
        {needsAccount && (
          <TransferAccountPicker value={accountId} onChange={setAccountId} />
        )}
        <div>
          <label className="label">{label}</label>
          <AmountInput className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus />
        </div>
        <div className="flex gap-2 justify-end">
          <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button
            className={`btn ${buttonClass}`}
            disabled={blocked || missingAccount}
            onClick={() => { if (Number(amount) > 0) onConfirm(Number(amount), date, accountId) }}
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MainWalletCard() {
  const { cash, transfer } = useWalletStore()
  const total = cash + transfer
  const [modal, setModal] = useState(null)
  const { warning, check, proceed, cancel } = useNegativeConfirm()

  const handleAction = (amount, date, accountId) => {
    const dl = ` (${dateLabel(date)})`

    const execute = () => {
      if (modal === 'deposit_cash') {
        addToWallet('cash', amount, { activityType: 'CASH_DEPOSIT', description: `ฝากเงินสด ${amount.toLocaleString()} บาท${dl}` })
      } else if (modal === 'move_to_transfer') {
        transferBetweenWallets('cash', 'transfer', amount, {}, accountId)
      } else if (modal === 'deposit_transfer') {
        addToWallet('transfer', amount, { activityType: 'CASH_DEPOSIT', description: `รับเงินโอน ${amount.toLocaleString()} บาท${dl}` }, accountId)
      } else if (modal === 'move_to_cash') {
        transferBetweenWallets('transfer', 'cash', amount, {}, accountId)
      }
      setModal(null)
    }

    if (modal === 'move_to_transfer') {
      check({ method: 'cash', amount, onConfirm: execute })
    } else if (modal === 'move_to_cash') {
      check({ method: 'transfer', amount, accountId, onConfirm: execute })
    } else {
      execute()
    }
  }

  const MODAL_CONFIG = {
    deposit_cash:     { title: 'ฝากเงินสด',              label: 'จำนวนเงินสด (บาท)',  buttonLabel: 'ฝากเงิน',  buttonClass: 'btn-success' },
    move_to_transfer: { title: 'ย้ายเงินสด → เงินโอน',  label: 'จำนวนเงิน (บาท)',   buttonLabel: 'ย้ายเงิน', buttonClass: 'btn-primary', needsAccount: true },
    deposit_transfer: { title: 'รับเงินโอน',             label: 'จำนวนเงินโอน (บาท)', buttonLabel: 'รับเงิน',  buttonClass: 'btn-success', needsAccount: true },
    move_to_cash:     { title: 'ถอนเงินโอน → เงินสด',   label: 'จำนวนเงิน (บาท)',   buttonLabel: 'ถอนเงิน',  buttonClass: 'btn-warning', needsAccount: true },
  }

  return (
    <>
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">👛</span>
          <h2 className="section-title mb-0">กระเป๋าเงินหลัก</h2>
        </div>

        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-5 text-white">
          <p className="text-blue-200 text-sm">ยอดเงินคงเหลือรวม</p>
          <p className="text-3xl font-bold tabular-nums mt-1">
            {total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
            <span className="text-lg font-normal ml-1">บาท</span>
          </p>
          <p className="text-blue-200 text-xs mt-1">เงินสด + เงินโอน (แสดงเท่านั้น)</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className={`rounded-xl border p-4 ${cash < 0 ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <p className="text-xs text-gray-500 mb-1">💵 กระเป๋าเงินสด</p>
            <AmountDisplay amount={cash} size="lg" />
            <div className="flex gap-1 mt-3 flex-wrap">
              <button className="btn btn-success text-xs py-1 px-2" onClick={() => setModal('deposit_cash')}>+ ฝาก</button>
              <button className="btn btn-secondary text-xs py-1 px-2" onClick={() => setModal('move_to_transfer')}>→ โอน</button>
            </div>
          </div>

          <div className={`rounded-xl border p-4 ${transfer < 0 ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50'}`}>
            <p className="text-xs text-gray-500 mb-1">🏦 กระเป๋าเงินโอน</p>
            <AmountDisplay amount={transfer} size="lg" />
            <div className="flex gap-1 mt-3 flex-wrap">
              <button className="btn btn-success text-xs py-1 px-2" onClick={() => setModal('deposit_transfer')}>+ รับโอน</button>
              <button className="btn btn-secondary text-xs py-1 px-2" onClick={() => setModal('move_to_cash')}>← ถอน</button>
            </div>
          </div>
        </div>
      </div>

      {modal && (
        <WalletModal
          {...MODAL_CONFIG[modal]}
          onClose={() => setModal(null)}
          onConfirm={handleAction}
        />
      )}

      <ConfirmPopup
        open={!!warning}
        title="⚠️ ยอดเงินจะติดลบ"
        message={warning?.message ?? ''}
        onConfirm={proceed}
        onCancel={cancel}
        confirmLabel="ยืนยัน (ติดลบ)"
        danger
      />
    </>
  )
}
