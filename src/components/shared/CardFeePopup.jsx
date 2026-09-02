import { useState } from 'react'
import { format } from 'date-fns'
import AmountInput from './AmountInput'
import DatePicker from './DatePicker'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

/**
 * บันทึกค่าธรรมเนียมรายปีของบัตร
 *
 * เป็นรายจ่ายธรรมดาที่รูดบนบัตร (หมวด "ค่าธรรมเนียมบัตร") เข้าบิลรอบนั้นเหมือนยอดรูดทั่วไป
 * แยกป๊อปอัปไว้เพื่อให้กดจากการ์ดบัตรได้ทีเดียวโดยไม่ต้องไปกรอกฟอร์มรายจ่ายเอง
 *
 * onConfirm({ amount, date, note })
 */
export default function CardFeePopup({ cardLabel, defaultAmount = 0, onConfirm, onCancel, busy }) {
  const [amount, setAmount] = useState(defaultAmount > 0 ? String(defaultAmount) : '')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    if (busy) return
    const value = Number(amount)
    if (!(value > 0)) return setError('ใส่จำนวนค่าธรรมเนียม')
    onConfirm({ amount: value, date, note })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
          <h3 className="font-semibold text-base">🧾 บันทึกค่าธรรมเนียมรายปี</h3>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onCancel}>×</button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500">{cardLabel}</p>

          <div>
            <label className="label">จำนวนเงิน (บาท)</label>
            <AmountInput
              className="input text-right"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError('') }}
              placeholder="0.00"
              autoFocus
            />
            {defaultAmount > 0 && (
              <p className="text-xs text-gray-400 mt-1">ตั้งไว้ในข้อมูลบัตร {fmt(defaultAmount)} บาท แก้ได้ถ้าปีนี้ธนาคารเก็บไม่เท่าเดิม</p>
            )}
          </div>

          <div>
            <label className="label">วันที่เรียกเก็บ</label>
            <DatePicker value={date} onChange={setDate} />
            <p className="text-xs text-gray-400 mt-1">ใส่วันตามใบแจ้งยอด ระบบจะพาเข้าบิลรอบนั้นให้เอง</p>
          </div>

          <div>
            <label className="label">หมายเหตุ</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ค่าธรรมเนียมปี 2569" />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">⚠️ {error}</p>}

          <p className="text-xs text-gray-500">
            บันทึกเป็นรายจ่ายบนบัตรหมวด "ค่าธรรมเนียมบัตร" หนี้บัตรเพิ่มทันที
            ถ้าธนาคารยกเว้นให้ภายหลัง ให้บันทึกเป็นเงินคืนเข้าบัตรแทน
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
