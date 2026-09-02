import { useState } from 'react'
import AmountInput from './AmountInput'
import { format } from 'date-fns'
import useWalletStore from '../../store/useWalletStore'
import DatePicker from './DatePicker'
import TransferAccountPicker from './TransferAccountPicker'
import { formatIsoThai } from '../../lib/cardCycle'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

/**
 * จ่ายบิลบัตรเครดิต
 *
 * ยอดเริ่มต้นคือเต็มจำนวนเสมอ เพราะเป็นทางเลือกที่ถูกต้องในเกือบทุกกรณี
 * ปุ่มขั้นต่ำมีไว้ให้กดได้ แต่มีคำเตือนกำกับว่าระยะปลอดดอกเบี้ยจะหายไป
 * ซึ่งเป็นความเข้าใจผิดที่แพงที่สุดเรื่องบัตรเครดิต
 *
 * onConfirm({ method, accountId, amount, date })
 */
export default function PayCardBillPopup({ statement, cardLabel, onConfirm, onCancel, busy }) {
  const remaining = Number(statement.amount) - Number(statement.paidAmount)
  const minimum = Math.min(Number(statement.minimumAmount) || 0, remaining)

  const [method, setMethod] = useState('cash')
  const [accountId, setAccountId] = useState('')
  const [amount, setAmount] = useState(String(remaining))
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [error, setError] = useState('')

  const resolveAccount = useWalletStore((s) => s.resolveTransferAccountId)
  const cash = useWalletStore((s) => s.cash)
  const accounts = useWalletStore((s) => s.transferAccounts)

  const value = Number(amount) || 0
  const isMinimum = minimum > 0 && Math.abs(value - minimum) < 0.005 && value < remaining
  const isPartial = value > 0 && value < remaining && !isMinimum

  // ยอดในกระเป๋าที่จะจ่าย ใช้เตือนก่อนกด ไม่ได้บล็อก
  const sourceBalance = method === 'cash'
    ? cash
    : (accounts.find((a) => a.id === resolveAccount(accountId))?.balance ?? null)
  const notEnough = sourceBalance !== null && value > sourceBalance

  const setPreset = (v) => { setAmount(String(v)); setError('') }

  const submit = () => {
    if (busy) return
    if (!(value > 0)) return setError('ใส่จำนวนเงินที่จะจ่าย')
    const resolved = method === 'transfer' ? resolveAccount(accountId) : null
    if (method === 'transfer' && !resolved) return setError('เลือกบัญชีที่จะจ่าย')
    onConfirm({ method, accountId: resolved, amount: value, date })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b bg-gray-50 sticky top-0 flex items-center justify-between">
          <h3 className="font-semibold text-base">💳 จ่ายบิลบัตรเครดิต</h3>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onCancel}>×</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-rose-50 border border-rose-100 p-3">
            <p className="text-xs text-rose-700">{cardLabel}</p>
            <p className="text-2xl font-bold text-rose-700 tabular-nums mt-0.5">{fmt(remaining)}</p>
            <p className="text-xs text-rose-600 mt-0.5">
              ครบกำหนด {formatIsoThai(statement.dueDate)}
              {Number(statement.paidAmount) > 0 && ` · จ่ายไปแล้ว ${fmt(statement.paidAmount)}`}
            </p>
          </div>

          <div>
            <label className="label">จ่ายจาก</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                className={`btn text-sm ${method === 'cash' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setMethod('cash'); setError('') }}
              >
                💵 เงินสด
              </button>
              <button
                className={`btn text-sm ${method === 'transfer' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setMethod('transfer'); setError('') }}
              >
                🏦 เงินโอน
              </button>
            </div>
          </div>

          {method === 'transfer' && (
            <TransferAccountPicker value={accountId} onChange={setAccountId} label="ตัดจากบัญชี" />
          )}

          <div>
            <label className="label">จำนวนที่จ่าย</label>
            <div className="flex gap-2 mb-2">
              <button className="btn btn-secondary text-xs flex-1" onClick={() => setPreset(remaining)}>
                เต็มจำนวน
              </button>
              {minimum > 0 && minimum < remaining && (
                <button className="btn btn-secondary text-xs flex-1" onClick={() => setPreset(minimum)}>
                  ขั้นต่ำ {fmt(minimum)}
                </button>
              )}
            </div>
            <AmountInput
              className="input text-right"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError('') }}
            />
          </div>

          <div>
            <label className="label">วันที่จ่าย</label>
            <DatePicker value={date} onChange={setDate} />
          </div>

          {(isMinimum || isPartial) && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
              <p className="font-medium">⚠️ จ่ายไม่เต็มจำนวน</p>
              <p>
                ระยะปลอดดอกเบี้ยจะหายไป และธนาคารจะคิดดอกเบี้ยย้อนตั้งแต่วันที่ทำรายการ
                ไม่ใช่คิดจากยอดที่เหลือ
              </p>
              <p>ยอดที่เหลือ {fmt(remaining - value)} บาท จะถูกยกไปรวมในบิลรอบถัดไป</p>
            </div>
          )}

          {value > remaining && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
              💚 จ่ายเกิน {fmt(value - remaining)} บาท — ส่วนที่เกินจะเป็นเครดิตในบัตร
              และถูกหักออกจากบิลรอบถัดไปให้เอง
            </div>
          )}

          {notEnough && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              ⚠️ ยอดใน{method === 'cash' ? 'เงินสด' : 'บัญชีที่เลือก'}มี {fmt(sourceBalance)} บาท จ่ายแล้วจะติดลบ
            </p>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">⚠️ {error}</p>}

          <p className="text-xs text-gray-500">
            การจ่ายบิลเป็นการย้ายเงินไปปิดหนี้ ไม่ใช่รายจ่ายก้อนใหม่
            รายจ่ายถูกบันทึกไปแล้วตั้งแต่วันที่รูด จึงไม่ถูกนับซ้ำในรายงาน
          </p>
        </div>

        <div className="px-5 py-4 border-t bg-gray-50 sticky bottom-0 flex gap-2 justify-end">
          <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>ยกเลิก</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? '⏳ กำลังจ่าย…' : `จ่าย ${fmt(value)} บาท`}
          </button>
        </div>
      </div>
    </div>
  )
}
