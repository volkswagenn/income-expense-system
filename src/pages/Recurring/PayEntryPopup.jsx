import { useState } from 'react'
import { format } from 'date-fns'
import TransferAccountPicker from '../../components/shared/TransferAccountPicker'
import CreditCardPicker from '../../components/shared/CreditCardPicker'
import DateTimeField, { toTimestamp } from '../../components/shared/DateTimeField'
import useWalletStore from '../../store/useWalletStore'
import useCreditCardStore from '../../store/useCreditCardStore'

const METHOD_OPTIONS = [
  { value: 'cash', label: '💵 เงินสด' },
  { value: 'transfer', label: '🏦 โอนเงิน' },
  { value: 'card', label: '💳 บัตรเครดิต' },
  { value: 'pending', label: '📋 ค้างชำระ' },
]

export default function PayEntryPopup({ entry, item, onConfirm, onSaveAmount, onClose }) {
  const isVariable = item.amountType === 'variable'
  const [amount, setAmount] = useState(entry.amount > 0 ? String(entry.amount) : '')
  // ใช้วิธีจ่าย/บัญชีที่ตั้งไว้ตอนสร้างรายการประจำเป็นค่าเริ่มต้น
  const [method, setMethod] = useState(item.defaultMethod ?? '')
  const [accountId, setAccountId] = useState(item.defaultTransferAccountId ?? '')
  const [cardId, setCardId] = useState('')
  const [paidDate, setPaidDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [paidTime, setPaidTime] = useState('')   // ว่าง = เที่ยงตรงของวันที่เลือก
  const [error, setError] = useState('')

  const resolveAccount = useWalletStore((s) => s.resolveTransferAccountId)
  const resolveCard = useCreditCardStore((s) => s.resolveCardId)

  const parsedAmount = parseFloat(amount)
  const canSaveAmount = !isNaN(parsedAmount) && parsedAmount > 0
  const needsAccount = method === 'transfer'
  const needsCard = method === 'card'
  const canSubmit = method && paidDate && canSaveAmount
    && (!needsAccount || !!resolveAccount(accountId))
    && (!needsCard || !!resolveCard(cardId))

  const handleSaveAmount = () => {
    if (!canSaveAmount) { setError('กรุณากรอกยอดเงินที่ถูกต้อง'); return }
    onSaveAmount(parsedAmount)
  }

  const handleConfirm = () => {
    if (!method) { setError('กรุณาเลือกวิธีชำระ'); return }
    if (!parsedAmount || parsedAmount <= 0) { setError('กรุณากรอกยอดเงินที่ถูกต้อง'); return }
    if (!paidDate) { setError('กรุณาเลือกวันที่จ่ายเงิน'); return }
    if (needsAccount && !resolveAccount(accountId)) { setError('กรุณาเลือกบัญชีที่จะตัดเงิน'); return }
    if (needsCard && !resolveCard(cardId)) { setError('กรุณาเลือกบัตรเครดิต'); return }
    onConfirm(
      parsedAmount, method, paidDate,
      needsAccount ? resolveAccount(accountId) : null,
      needsCard ? resolveCard(cardId) : null,
      toTimestamp(paidDate, paidTime)
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-base text-gray-900">บันทึกการจ่าย</h3>
            <p className="text-sm text-gray-500">{item.name}</p>
          </div>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onClose}>×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              ยอดเงิน (บาท) {isVariable && <span className="text-red-500">*</span>}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input w-full text-right text-lg font-bold"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError('') }}
              placeholder="0.00"
              autoFocus={isVariable}
            />
            {!isVariable && (
              <p className="text-xs text-gray-400 mt-1">ยอดคงที่จาก template แก้ไขได้หากจำเป็น</p>
            )}
          </div>

          {/* Method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              วิธีชำระ <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {METHOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setMethod(opt.value); setError('') }}
                  className={`py-2.5 px-2 rounded-lg border-2 text-sm font-medium transition-all ${
                    method === opt.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {item.defaultMethod && (
              <p className="text-xs text-gray-400 mt-1">เลือกให้อัตโนมัติจากที่ตั้งไว้ในรายการประจำ</p>
            )}
          </div>

          {/* บัญชีที่จะตัดเงิน */}
          {needsAccount && (
            <TransferAccountPicker value={accountId} onChange={setAccountId} label="ตัดจากบัญชี" />
          )}

          {/* รูดบัตร — ไม่ตัดเงินสด/เงินโอน แต่ไปเพิ่มหนี้ในบัตรแทน */}
          {needsCard && (
            <>
              <CreditCardPicker value={cardId} onChange={setCardId} label="รูดบัตร" />
              <p className="text-xs text-gray-500">
                ยอดนี้จะไปสะสมเป็นหนี้ในบัตร แล้วไปรวมอยู่ในบิลของรอบนั้น ไม่ตัดเงินตอนนี้
              </p>
            </>
          )}

          {/* Paid date + time */}
          <DateTimeField
            label="วันที่จ่ายเงิน *"
            date={paidDate}
            time={paidTime}
            onChange={({ date, time }) => { setPaidDate(date); setPaidTime(time); setError('') }}
          />

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="px-5 pb-5 grid grid-cols-3 gap-2">
          <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
          {isVariable && (
            <button
              className="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleSaveAmount}
              disabled={!canSaveAmount}
            >
              บันทึกยอด
            </button>
          )}
          <button
            className={`btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed ${!isVariable ? 'col-span-2' : ''}`}
            onClick={handleConfirm}
            disabled={!canSubmit}
          >
            ✓ จ่ายแล้ว
          </button>
        </div>
      </div>
    </div>
  )
}
