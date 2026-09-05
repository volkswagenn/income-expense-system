import { useState } from 'react'
import { format } from 'date-fns'
import Popup from './Popup'
import AmountInput from './AmountInput'
import DatePicker from './DatePicker'
import CategorySelect from './CategorySelect'

/**
 * บันทึกยอดรูดบัตรจากหน้าบัตรโดยตรง
 *
 * ทำไมต้องมี ทั้งที่ฟอร์มบันทึกรายจ่ายก็รูดบัตรได้
 *   คนที่กำลังไล่บิลอยู่หน้าบัตรมีสมุดบิลอยู่ตรงหน้า และกำลังคีย์ทีละบรรทัด
 *   การให้เด้งไปหน้าบันทึกรายจ่ายแล้วเลือกช่องทาง เลือกบัตร ทุกบรรทัด
 *   ทำให้งานที่ควรใช้สามช่องกลายเป็นเจ็ดขั้น และหลุดจากบิลที่กำลังดูอยู่
 *
 * ยอดที่บันทึกเป็นรายจ่ายจริงเหมือนรูดบัตรจากที่อื่นทุกประการ — หนี้บัตรเพิ่มทันที
 * และไปโผล่ในบิลรอบที่วันที่นั้นตกอยู่ ไม่ใช่รายการพิเศษของหน้านี้
 *
 * onConfirm({ date, amount, itemName, categoryId, vendor, note })
 */
export default function CardChargePopup({ cardLabel, onConfirm, onCancel, busy }) {
  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    amount: '',
    itemName: '',
    categoryId: '',
    vendor: '',
    note: '',
  })
  const [error, setError] = useState('')
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setError('') }

  const submit = () => {
    if (busy) return
    const value = Number(form.amount)
    if (!form.itemName.trim()) return setError('ใส่ชื่อรายการ')
    if (!(value > 0)) return setError('ใส่จำนวนเงินให้ถูกต้อง')
    onConfirm({
      date: form.date,
      amount: value,
      itemName: form.itemName.trim(),
      categoryId: form.categoryId || null,
      vendor: form.vendor || null,
      note: form.note || null,
    })
  }

  return (
    <Popup
      title="เพิ่มรายการรูดบัตร"
      sub={cardLabel}
      icon="credit_card"
      headTone="danger"
      width={470}
      onClose={onCancel}
      onConfirm={submit}
      busy={busy}
      confirmLabel="บันทึกรายการ"
      error={error}
    >
      <div>
        <label className="label">ชื่อรายการ</label>
        <input
          className="input"
          autoFocus
          placeholder="เช่น ค่าน้ำมัน / ของเข้าร้าน / ค่าโฆษณา"
          value={form.itemName}
          onChange={(e) => set('itemName', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">จำนวนเงิน (บาท)</label>
          <AmountInput
            className="input text-right"
            value={form.amount}
            onChange={(e) => set('amount', e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="label">วันที่รูด</label>
          <DatePicker value={form.date} onChange={(v) => set('date', v)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">หมวดหมู่</label>
          <CategorySelect type="expense" value={form.categoryId} onChange={(v) => set('categoryId', v)} placeholder="ไม่ระบุ" />
        </div>
        <div>
          <label className="label">ผู้ขาย/ร้านค้า</label>
          <input className="input" value={form.vendor} onChange={(e) => set('vendor', e.target.value)} />
        </div>
      </div>

      <div>
        <label className="label">หมายเหตุ</label>
        <input className="input" value={form.note} onChange={(e) => set('note', e.target.value)} />
      </div>

      <p className="text-[11.5px] text-faint leading-relaxed">
        บันทึกเป็นรายจ่ายบนบัตรใบนี้ หนี้บัตรเพิ่มทันที และเข้าบิลรอบที่วันที่รูดตกอยู่
        ถ้าเป็นของที่ผ่อน ให้ใช้ “เพิ่มรายการผ่อน” แทน จะได้แตกเป็นงวดให้เอง
      </p>
    </Popup>
  )
}
