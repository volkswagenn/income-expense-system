import { useState } from 'react'
import { format } from 'date-fns'
import useWalletStore from '../../store/useWalletStore'
import DatePicker from './DatePicker'
import TransferAccountPicker from './TransferAccountPicker'
import { formatIsoThai } from '../../lib/cardCycle'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

/**
 * จ่ายงวดหนี้ / รับคืนงวดหนี้
 * ให้เห็นก่อนกดยืนยันว่าหลังจ่ายแล้วคงเหลือเท่าไร เหลือกี่งวด งวดถัดไปวันไหน
 * และเงินในกระเป๋าที่เลือกจะเหลือเท่าไร
 *
 * onConfirm({ method, accountId, amount, date })
 */
export default function PayDebtPopup({ debt, entry, progress, onConfirm, onCancel, busy }) {
  const isRecv = debt.direction === 'receivable'
  const [method, setMethod] = useState(debt.defaultMethod || 'transfer')
  const [accountId, setAccountId] = useState(debt.defaultAccountId || '')
  const [amount, setAmount] = useState(String(entry.amount))
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [error, setError] = useState('')

  const cash = useWalletStore((s) => s.cash)
  const accounts = useWalletStore((s) => s.transferAccounts)
  const resolveAccount = useWalletStore((s) => s.resolveTransferAccountId)

  const value = Number(amount) || 0
  const resolved = method === 'transfer' ? resolveAccount(accountId) : null
  const source = method === 'cash' ? cash : (accounts.find((a) => a.id === resolved)?.balance ?? null)
  const after = source === null ? null : (isRecv ? source + value : source - value)

  const remainingAfter = Math.max(0, progress.remainingAmount - value)
  const countAfter = Math.max(0, progress.remainingCount - 1)
  const nextAfter = progress.rows.find((r) => r.status === 'pending' && r.seq > entry.seq) ?? null

  const submit = () => {
    if (busy) return
    if (!(value > 0)) return setError('ใส่จำนวนเงิน')
    if (method === 'transfer' && !resolved) return setError('เลือกบัญชี')
    onConfirm({ method, accountId: resolved, amount: value, date })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-sm max-h-[92vh] overflow-y-auto">
        <div className="px-5 pt-3 pb-2 text-center">
          <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto mb-3 sm:hidden" />
          <p className="text-xs text-gray-500">{debt.name} · งวดที่ {entry.seq} จาก {debt.months}</p>
          <p className={`text-3xl font-bold tabular-nums mt-1 ${isRecv ? 'text-emerald-700' : 'text-gray-900'}`}>{fmt(value)}</p>
          <p className="text-xs text-gray-500">ครบกำหนด {formatIsoThai(entry.dueDate)}</p>
        </div>

        <div className="px-5 pb-4 space-y-3">
          <div>
            <label className="label">{isRecv ? 'รับเข้า' : 'จ่ายจาก'}</label>
            <div className="grid grid-cols-2 gap-2">
              <button className={`btn text-sm ${method === 'cash' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setMethod('cash'); setError('') }}>
                💵 เงินสด <span className="text-xs opacity-70 ml-1 tabular-nums">{fmt(cash)}</span>
              </button>
              <button className={`btn text-sm ${method === 'transfer' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setMethod('transfer'); setError('') }}>
                🏦 เงินโอน
              </button>
            </div>
            {method === 'transfer' && (
              <div className="mt-2"><TransferAccountPicker value={accountId} onChange={setAccountId} label="" /></div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">วันที่</label>
              <DatePicker value={date} onChange={setDate} />
            </div>
            <div>
              <label className="label">จำนวน</label>
              <input className="input text-right" type="number" value={amount} onChange={(e) => { setAmount(e.target.value); setError('') }} />
            </div>
          </div>

          <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 text-xs space-y-1">
            <p className="text-gray-500">หลังจ่ายงวดนี้</p>
            <div className="flex justify-between"><span>คงเหลือ</span><span className="tabular-nums font-medium">{fmt(remainingAfter)}</span></div>
            <div className="flex justify-between"><span>เหลืออีก</span><span className="tabular-nums font-medium">{countAfter} งวด</span></div>
            {nextAfter
              ? <div className="flex justify-between"><span>งวดถัดไป งวดที่ {nextAfter.seq}</span><span className="tabular-nums">{formatIsoThai(nextAfter.dueDate)}</span></div>
              : <div className="flex justify-between text-emerald-700 font-medium"><span>งวดสุดท้าย</span><span>ปิดสัญญา</span></div>}
            {after !== null && (
              <div className={`flex justify-between border-t border-gray-200 pt-1 ${after < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                <span>{isRecv ? 'เงินในกระเป๋าหลังรับ' : 'เงินในกระเป๋าหลังจ่าย'}</span>
                <span className="tabular-nums font-medium">{fmt(after)}</span>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">⚠️ {error}</p>}

          <button className="btn btn-primary w-full !h-11" onClick={submit} disabled={busy}>
            {busy ? '⏳ กำลังบันทึก…' : `${isRecv ? 'ยืนยันรับคืน' : 'ยืนยันจ่าย'} ${fmt(value)}`}
          </button>
          <button className="btn btn-secondary w-full" onClick={onCancel} disabled={busy}>ยกเลิก</button>
        </div>
      </div>
    </div>
  )
}
