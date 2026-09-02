import { useState } from 'react'
import useWalletStore from '../../store/useWalletStore'
import TransferAccountPicker from '../../components/shared/TransferAccountPicker'
import DateTimeField, { toTimestamp, todayDate } from '../../components/shared/DateTimeField'
import { formatIsoThai } from '../../lib/cardCycle'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

/**
 * จ่ายค่างวดผ่อนหนึ่งงวด
 *
 * บัตรเครดิตในระบบนี้ทำหน้าที่ติดตามวงเงินและยอดผ่อน ไม่ใช่ตัวจ่ายเงิน
 * เงินจริงออกจากบัญชีหรือเงินสดเสมอ ตรงนี้จึงต้องเลือกให้ได้ว่าหักจากที่ไหน
 * ค่าเริ่มต้นใช้บัญชีที่ผูกหักอัตโนมัติไว้กับบัตร ถ้าตั้งไว้แล้ว
 */
export default function PayInstallmentPopup({ installment, entry, card, onConfirm, onCancel, busy }) {
  const autopayAccount = card?.autopayMode && card.autopayMode !== 'off' ? card.autopayAccountId : ''

  const [method, setMethod] = useState(autopayAccount ? 'transfer' : 'cash')
  const [accountId, setAccountId] = useState(autopayAccount ?? '')
  const [amount, setAmount] = useState(String(entry?.amount ?? ''))
  const [date, setDate] = useState(todayDate())
  const [time, setTime] = useState('')
  const [error, setError] = useState('')

  const resolveAccount = useWalletStore((s) => s.resolveTransferAccountId)
  const cash = useWalletStore((s) => s.cash)
  const accounts = useWalletStore((s) => s.transferAccounts)

  const parsed = parseFloat(amount)
  const needsAccount = method === 'transfer'
  const resolvedAccount = needsAccount ? resolveAccount(accountId) : null
  const balance = needsAccount
    ? Number(accounts.find((a) => a.id === resolvedAccount)?.balance ?? 0)
    : Number(cash ?? 0)
  const willBeNegative = parsed > 0 && parsed > balance

  const confirm = () => {
    if (busy) return
    if (!parsed || parsed <= 0) return setError('กรอกยอดที่จ่ายให้ถูกต้อง')
    if (needsAccount && !resolvedAccount) return setError('เลือกบัญชีที่จะตัดเงิน')
    onConfirm({
      method,
      accountId: resolvedAccount,
      amount: parsed,
      paidAt: toTimestamp(date, time),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0">
            <h3 className="font-semibold text-base text-gray-900">จ่ายค่างวด</h3>
            <p className="text-sm text-gray-500 truncate">{installment?.name}</p>
          </div>
          <button type="button" className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onCancel}>×</button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3">
            <p className="text-xs text-rose-700">
              งวดที่ {entry?.seq} จาก {installment?.months} · ครบกำหนด {formatIsoThai(entry?.dueDate)}
            </p>
            <p className="text-2xl font-bold tabular-nums text-rose-700 mt-0.5">{fmt(entry?.amount)}</p>
          </div>

          <div>
            <label className="label">จ่ายจาก</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'cash', label: '💵 เงินสด' },
                { value: 'transfer', label: '🏦 เงินโอน' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setMethod(opt.value); setError('') }}
                  className={`py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                    method === opt.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {needsAccount && (
            <>
              <TransferAccountPicker value={accountId} onChange={setAccountId} label="ตัดจากบัญชี" />
              {autopayAccount && accountId === autopayAccount && (
                <p className="text-xs text-gray-400 -mt-2">บัญชีที่ผูกหักอัตโนมัติไว้กับบัตรใบนี้</p>
              )}
            </>
          )}

          <div>
            <label className="label">จำนวนที่จ่าย</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input w-full text-right"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError('') }}
            />
          </div>

          <DateTimeField
            label="วันที่จ่าย"
            date={date}
            time={time}
            onChange={(v) => { setDate(v.date); setTime(v.time); setError('') }}
          />

          {willBeNegative && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ยอดใน{needsAccount ? 'บัญชี' : 'เงินสด'}เหลือ {fmt(balance)} จ่ายแล้วจะติดลบ
            </p>
          )}

          <p className="text-xs text-gray-400">
            เงินออกจากกระเป๋าที่เลือกและบันทึกเป็นรายจ่ายให้ทันที งวดนี้จะไม่ถูกเรียกเก็บเข้าบิลบัตรอีก
          </p>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="px-5 pb-5 pt-3 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button className="btn btn-secondary flex-1" onClick={onCancel} disabled={busy}>ยกเลิก</button>
          <button className="btn btn-primary flex-1" onClick={confirm} disabled={busy}>
            {busy ? 'กำลังบันทึก…' : `จ่าย ${fmt(parsed || 0)} บาท`}
          </button>
        </div>
      </div>
    </div>
  )
}
