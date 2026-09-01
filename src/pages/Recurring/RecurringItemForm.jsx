import { useState } from 'react'
import CategorySelect from '../../components/shared/CategorySelect'
import TransferAccountPicker from '../../components/shared/TransferAccountPicker'
import NumpadPopup from '../../components/shared/NumpadPopup'
import { FREQUENCY_OPTIONS, THAI_MONTHS_FULL } from '../../lib/recurringSchedule'

const EMPTY = {
  name: '',
  category: '',
  amountType: 'fixed',
  fixedAmount: '',
  billingDay: '',
  frequency: 'monthly',       // monthly | yearly
  billingMonth: '',            // ใช้เฉพาะรายปี (1–12)
  vendor: '',
  note: '',
  enabled: true,
  defaultMethod: '',            // ตั้งวิธีจ่ายไว้ล่วงหน้า
  defaultTransferAccountId: '', // ถ้าจ่ายด้วยเงินโอน ตั้งบัญชีไว้เลย
}

const METHOD_OPTIONS = [
  { value: 'cash', label: '💵 เงินสด' },
  { value: 'transfer', label: '🏦 โอนเงิน' },
  { value: 'pending', label: '📋 ค้างชำระ' },
]

export default function RecurringItemForm({ item, onSave, onClose }) {
  const [form, setForm] = useState(
    item
      ? {
          ...EMPTY,
          ...item,
          fixedAmount: item.fixedAmount != null ? String(item.fixedAmount) : '',
          frequency: item.frequency ?? 'monthly',
          billingMonth: item.billingMonth ?? '',
        }
      : { ...EMPTY }
  )
  const [error, setError] = useState({})
  const [showNumpad, setShowNumpad] = useState(false)

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'กรอกชื่อรายการ'
    if (!form.category) e.category = 'เลือกหมวดหมู่'
    if (!form.billingDay || isNaN(Number(form.billingDay)) || Number(form.billingDay) < 1 || Number(form.billingDay) > 31)
      e.billingDay = 'วันที่ 1–31'
    if (form.frequency === 'yearly' && !(Number(form.billingMonth) >= 1 && Number(form.billingMonth) <= 12))
      e.billingMonth = 'เลือกเดือนที่เรียกเก็บ'
    if (form.amountType === 'fixed') {
      const amt = parseFloat(form.fixedAmount)
      if (!form.fixedAmount || isNaN(amt) || amt <= 0) e.fixedAmount = 'กรอกยอดเงิน'
    }
    return e
  }

  const handleSave = () => {
    const e = validate()
    if (Object.keys(e).length > 0) { setError(e); return }
    onSave({
      ...form,
      name: form.name.trim(),
      billingDay: Number(form.billingDay),
      frequency: form.frequency === 'yearly' ? 'yearly' : 'monthly',
      billingMonth: form.frequency === 'yearly' ? Number(form.billingMonth) : null,
      fixedAmount: form.amountType === 'fixed' ? parseFloat(form.fixedAmount) : undefined,
      vendor: form.vendor.trim() || undefined,
      note: form.note.trim() || undefined,
      defaultMethod: form.defaultMethod || undefined,
      defaultTransferAccountId:
        form.defaultMethod === 'transfer' ? (form.defaultTransferAccountId || undefined) : undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-shrink-0">
          <h3 className="font-semibold text-base text-gray-900">
            {item ? '✏️ แก้ไขรายการประจำ' : '➕ เพิ่มรายการประจำ'}
          </h3>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onClose}>×</button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">ชื่อรายการ *</label>
            <input
              className="input w-full"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="เช่น ค่า internet, ค่าไฟ"
              autoFocus
            />
            {error.name && <p className="text-xs text-red-500 mt-1">{error.name}</p>}
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">หมวดหมู่ *</label>
            <CategorySelect
              className="input w-full"
              value={form.category}
              onChange={(v) => set('category', v)}
              placeholder="— เลือกหมวดหมู่ —"
            />
            {error.category && <p className="text-xs text-red-500 mt-1">{error.category}</p>}
          </div>

          {/* Amount type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">ประเภทยอด</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'fixed', label: '📌 คงที่', desc: 'ยอดเท่ากันทุกเดือน' },
                { value: 'variable', label: '📊 เปลี่ยนแปลง', desc: 'กรอกยอดตอนจ่าย' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => set('amountType', opt.value)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    form.amountType === opt.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="text-sm font-medium text-gray-800">{opt.label}</p>
                  <p className="text-xs text-gray-500">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Fixed amount */}
          {form.amountType === 'fixed' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">ยอดเงิน (บาท) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input w-full text-right"
                value={form.fixedAmount}
                onChange={(e) => set('fixedAmount', e.target.value)}
                placeholder="0.00"
              />
              {error.fixedAmount && <p className="text-xs text-red-500 mt-1">{error.fixedAmount}</p>}
            </div>
          )}

          {/* รอบเรียกเก็บ: รายเดือน / รายปี */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">รอบเรียกเก็บ</label>
            <div className="grid grid-cols-2 gap-2">
              {FREQUENCY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set('frequency', opt.value)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    form.frequency === opt.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="text-sm font-medium text-gray-800">{opt.label}</p>
                  <p className="text-xs text-gray-500">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Billing month (รายปี) + day */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {form.frequency === 'yearly' ? 'เรียกเก็บทุกปี วันที่ *' : 'เรียกเก็บทุกวันที่ *'}
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="number"
                min="1"
                max="31"
                className="input w-20 text-center"
                value={form.billingDay}
                onChange={(e) => set('billingDay', e.target.value)}
                placeholder="1–31"
              />
              <button
                type="button"
                onClick={() => setShowNumpad(true)}
                className="btn btn-secondary px-3"
                title="เปิดแป้นตัวเลข"
                aria-label="เปิดแป้นตัวเลข"
              >
                🔢
              </button>
              {form.frequency === 'yearly' ? (
                <select
                  className="input flex-1 min-w-[140px]"
                  value={form.billingMonth}
                  onChange={(e) => set('billingMonth', e.target.value)}
                >
                  <option value="">— เลือกเดือน —</option>
                  {THAI_MONTHS_FULL.map((m, i) => (
                    <option key={i + 1} value={i + 1}>{m}</option>
                  ))}
                </select>
              ) : (
                <span className="text-sm text-gray-500">ของทุกเดือน</span>
              )}
            </div>
            {error.billingDay && <p className="text-xs text-red-500 mt-1">{error.billingDay}</p>}
            {error.billingMonth && <p className="text-xs text-red-500 mt-1">{error.billingMonth}</p>}
            <p className="text-xs text-gray-400 mt-1">ถ้าเดือนนั้นสั้นกว่า จะใช้วันสุดท้ายแทน</p>
          </div>

          {/* วิธีจ่ายที่ตั้งไว้ล่วงหน้า — เมื่อกดจ่ายตามรอบจะใช้ค่านี้ทันที */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              วิธีจ่ายประจำ <span className="text-gray-400 font-normal">(ไม่บังคับ)</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {METHOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set('defaultMethod', form.defaultMethod === opt.value ? '' : opt.value)}
                  className={`py-2 px-2 rounded-lg border-2 text-sm font-medium transition-all ${
                    form.defaultMethod === opt.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              ตั้งไว้แล้วเวลากดจ่ายตามรอบ ระบบจะเลือกให้อัตโนมัติ (เปลี่ยนตอนจ่ายได้)
            </p>
          </div>

          {/* บัญชีที่จะตัดเงินเมื่อจ่ายด้วยเงินโอน */}
          {form.defaultMethod === 'transfer' && (
            <TransferAccountPicker
              value={form.defaultTransferAccountId}
              onChange={(v) => set('defaultTransferAccountId', v)}
              label="ตัดจากบัญชี"
            />
          )}

          {/* Vendor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">ผู้รับเงิน <span className="text-gray-400 font-normal">(ไม่บังคับ)</span></label>
            <input
              className="input w-full"
              value={form.vendor}
              onChange={(e) => set('vendor', e.target.value)}
              placeholder="เช่น AIS, การไฟฟ้า"
            />
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">หมายเหตุ <span className="text-gray-400 font-normal">(ไม่บังคับ)</span></label>
            <input
              className="input w-full"
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
              placeholder="รายละเอียดเพิ่มเติม..."
            />
          </div>

          {/* Enabled toggle */}
          <div className="flex items-center justify-between py-2 border-t border-gray-100">
            <div>
              <p className="text-sm font-medium text-gray-700">เปิดใช้งาน</p>
              <p className="text-xs text-gray-400">ปิดเพื่อหยุดพักโดยไม่ลบ</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.enabled}
              onClick={() => set('enabled', !form.enabled)}
              className={`relative w-11 h-6 flex-shrink-0 rounded-full transition-colors ${form.enabled ? 'bg-blue-500' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>

        <div className="px-5 pb-5 pt-3 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button className="btn btn-secondary flex-1" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary flex-1" onClick={handleSave}>
            {item ? 'บันทึก' : '➕ เพิ่มรายการ'}
          </button>
        </div>
      </div>

      {showNumpad && (
        <NumpadPopup
          title="วันที่เรียกเก็บ"
          hint="1–31"
          initialValue={form.billingDay}
          min={1}
          max={31}
          maxLength={2}
          onSave={(n) => { set('billingDay', String(n)); setError((er) => ({ ...er, billingDay: undefined })); setShowNumpad(false) }}
          onClose={() => setShowNumpad(false)}
        />
      )}
    </div>
  )
}
