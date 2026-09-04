import Popup from '../../components/shared/Popup'
import { useState } from 'react'
import AmountInput from '../../components/shared/AmountInput'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import useWalletStore from '../../store/useWalletStore'
import AmountDisplay from '../../components/shared/AmountDisplay'
import Icon from '../../components/shared/Icon'
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
    <Popup
      title={title}
      icon="account_balance_wallet"
      width={400}
      onClose={onClose}
      onConfirm={() => { if (Number(amount) > 0) onConfirm(Number(amount), date, accountId) }}
      disabled={blocked || missingAccount || !(Number(amount) > 0)}
      confirmLabel={buttonLabel}
    >
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
      {blocked && (
        <p className="text-[11.5px] text-[#8A6A15] bg-pending-soft border border-pending-line rounded-ctl px-3 py-2">
          ยังไม่มีบัญชีเงินโอน — เพิ่มได้ที่ จัดการข้อมูล › บัญชีธนาคาร
        </p>
      )}
    </Popup>
  )
}

const fmtBaht = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function MainWalletCard() {
  const { cash, transfer } = useWalletStore()
  const subWallets = useWalletStore((s) => s.subWallets)
  const accountCount = useWalletStore((s) => s.transferAccounts.length)
  const [modal, setModal] = useState(null)

  // เงินในกระเป๋าย่อยถูกกันไว้ใช้เรื่องอื่นแล้ว จึงนับรวมในยอดรวม แต่ไม่นับใน "เหลือใช้ได้จริง"
  const subTotal = subWallets.reduce((s, w) => s + (Number(w.balance) || 0), 0)
  const free = cash + transfer
  const grandTotal = free + subTotal

  const SEGMENTS = [
    { icon: 'payments', label: 'เงินสด', value: cash },
    { icon: 'account_balance', label: `บัญชีธนาคาร · ${accountCount} บัญชี`, value: transfer },
    { icon: 'savings', label: `กระเป๋าตังค์ย่อย · ${subWallets.length} ใบ`, value: subTotal },
  ]
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
      {/* แถบยอดรวมแนวนอน — ตัวเลขรวมอยู่ซ้าย รายละเอียดว่าเงินอยู่ไหนเรียงต่อไปทางขวา
          แยก "เหลือใช้ได้จริง" ออกจากยอดรวมด้วยเส้นคั่น เพราะเงินในกระเป๋าย่อยถูกกันไว้
          ใช้เรื่องอื่นแล้ว ถ้ารวมอยู่ก้อนเดียวจะเข้าใจผิดว่าหยิบมาใช้ได้ทั้งหมด */}
      <div className="relative overflow-hidden rounded-panel bg-ink px-5 py-4 flex items-center gap-[26px] flex-wrap gap-y-3.5">
        <div className="absolute -right-[30px] -top-[46px] w-[130px] h-[130px] rounded-full bg-lime opacity-[0.13]" />

        <div className="relative flex-none">
          <p className="text-[12px] text-[#9AA0A8]">ยอดเงินคงเหลือรวม</p>
          <p className="tabular-nums text-[32px] font-semibold text-white tracking-[-0.025em] leading-[1.1] mt-0.5">
            {fmtBaht(grandTotal)}
          </p>
        </div>

        <div className="relative flex-1 min-w-0 flex gap-[22px] flex-wrap gap-y-2.5">
          {SEGMENTS.map((g) => (
            <span key={g.label} className="flex-none">
              <span className="flex items-center gap-1.5">
                <Icon name={g.icon} size={15} className="text-lime" />
                <span className="text-[11.5px] text-[#9AA0A8]">{g.label}</span>
              </span>
              <span className="tabular-nums block text-base font-semibold text-white mt-0.5">{fmtBaht(g.value)}</span>
            </span>
          ))}
          <span className="flex-none pl-[22px] border-l border-white/[0.14]">
            <span className="flex items-center gap-1.5">
              <Icon name="check_circle" size={15} className="text-lime" />
              <span className="text-[11.5px] text-[#9AA0A8]">เหลือใช้ได้จริงหลังกันเงิน</span>
            </span>
            <span className="tabular-nums block text-base font-semibold text-lime mt-0.5">{fmtBaht(free)}</span>
          </span>
        </div>

        <div className="relative flex-none flex gap-2 items-center">
          <button
            className="h-[34px] px-3.5 rounded-[10px] bg-lime text-ink text-[12.5px] font-semibold flex items-center gap-1.5 hover:bg-lime-dark"
            onClick={() => setModal('deposit_cash')}
          >
            <Icon name="add" size={16} />
            ฝากเงิน
          </button>
          <span className="self-center text-[11px] text-[#9AA0A8] leading-snug max-w-[150px]">
            ย้ายเงินได้ที่ปุ่ม ⋮ ท้ายแต่ละบัญชี
          </span>
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
