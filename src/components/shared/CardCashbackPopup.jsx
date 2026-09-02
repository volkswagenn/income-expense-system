import { useState } from 'react'
import { format } from 'date-fns'
import DatePicker from './DatePicker'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

const KINDS = [
  { value: 'cashback', label: '💰 เครดิตเงินคืน', note: 'เงินคืนจากการใช้จ่ายที่เข้าเงื่อนไข' },
  { value: 'refund', label: '↩️ คืนสินค้า', note: 'ร้านคืนเงินเข้าบัตร' },
]

/**
 * บันทึกเงินที่กลับเข้าบัตร
 *
 * ไม่ต้องมีกลไกพิเศษเลย — เงินคืนคือรายรับที่ปลายทางเป็นบัตร
 * walletTarget คืน 'card:<id>' แล้วสาขา card กลับเครื่องหมายเป็น outstanding - amount
 * หนี้ลดลงพอดี และเงินคืนไปโผล่ในรายงานรายรับให้เอง
 *
 * onConfirm({ kind, amount, date, note })
 */
export default function CardCashbackPopup({ cardLabel, estimate = 0, onConfirm, onCancel, busy }) {
  const [kind, setKind] = useState('cashback')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    if (busy) return
    const value = Number(amount)
    if (!(value > 0)) return setError('ใส่จำนวนเงินที่ได้คืน')
    onConfirm({ kind, amount: value, date, note })
  }

  const active = KINDS.find((k) => k.value === kind)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
          <h3 className="font-semibold text-base">💰 บันทึกเงินคืนเข้าบัตร</h3>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onCancel}>×</button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500">{cardLabel}</p>

          <div>
            <label className="label">ประเภท</label>
            <div className="grid grid-cols-2 gap-2">
              {KINDS.map((k) => (
                <button
                  key={k.value}
                  className={`btn text-sm ${kind === k.value ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => { setKind(k.value); setError('') }}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">{active?.note}</p>
          </div>

          <div>
            <label className="label">จำนวนเงินที่ได้คืน (บาท)</label>
            <input
              className="input text-right"
              type="number"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError('') }}
              placeholder="0.00"
              autoFocus
            />
            {estimate > 0 && kind === 'cashback' && (
              <button
                className="text-xs text-emerald-600 hover:text-emerald-700 mt-1"
                onClick={() => { setAmount(String(Math.round(estimate * 100) / 100)); setError('') }}
              >
                ใช้ยอดประมาณการ {fmt(estimate)} บาท
              </button>
            )}
          </div>

          <div>
            <label className="label">วันที่เงินเข้าบัตร</label>
            <DatePicker value={date} onChange={setDate} />
            <p className="text-xs text-gray-400 mt-1">
              ใส่วันที่ตามที่เห็นในใบแจ้งยอดจริง ระบบจะพาไปลดยอดของบิลรอบนั้นให้เอง
            </p>
          </div>

          <div>
            <label className="label">หมายเหตุ</label>
            <input
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น เงินคืนรอบเดือน ก.ย."
            />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">⚠️ {error}</p>}

          <p className="text-xs text-gray-500">
            บันทึกเป็นรายรับที่ปลายทางเป็นบัตร หนี้จะลดลงทันที
            และยอดนี้จะไปปรากฏในรายงานรายรับหมวด "เครดิตเงินคืนบัตร"
          </p>
        </div>

        <div className="px-5 py-4 border-t bg-gray-50 flex gap-2 justify-end">
          <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>ยกเลิก</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? '⏳ กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}
