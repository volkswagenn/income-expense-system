import Popup from '../../components/shared/Popup'
import { useState } from 'react'
import AmountInput from '../../components/shared/AmountInput'
import { useNavigate } from 'react-router-dom'
import CategorySelect from '../../components/shared/CategorySelect'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import CreditCardPicker from '../../components/shared/CreditCardPicker'
import TransferAccountPicker from '../../components/shared/TransferAccountPicker'
import NumpadPopup from '../../components/shared/NumpadPopup'
import { IconPickerButton } from '../../components/shared/IconPicker'
import { CYCLE_OFFSETS, FREQUENCY_OPTIONS, THAI_MONTHS_FULL, VAT_MODES, VAT_RATE, monthName, cycleMonth, vatBreakdown, vatMode } from '../../lib/recurringSchedule'
import { localMonthStr } from '../../lib/dateUtils'

const EMPTY = {
  icon: null,               // ไอคอนประจำรายการ (null = ไม่ตั้ง)
  name: '',
  category: '',
  amountType: 'fixed',
  fixedAmount: '',
  billingDay: '',
  frequency: 'monthly',       // monthly | yearly
  billingMonth: '',            // ใช้เฉพาะรายปี (1–12)
  billingCycleOffset: 0,       // รอบบิลที่เก็บ เทียบกับเดือนที่จ่าย (-1 = ของเดือนก่อน)
  vatMode: 'none',            // none | included | add — fixedAmount เก็บตัวเลขที่กรอกเสมอ
  vendor: '',
  note: '',
  enabled: true,
  defaultMethod: '',            // ตั้งวิธีจ่ายไว้ล่วงหน้า
  defaultTransferAccountId: '', // ถ้าจ่ายด้วยเงินโอน ตั้งบัญชีไว้เลย
  defaultCardId: '',            // ถ้ารูดบัตร ตั้งใบที่จะรูดไว้เลย
}

const METHOD_OPTIONS = [
  { value: 'cash', label: '💵 เงินสด' },
  { value: 'transfer', label: '🏦 โอนเงิน' },
  { value: 'card', label: '💳 บัตรเครดิต' },
  { value: 'pending', label: '📋 ค้างชำระ' },
]

/**
 * ช่องข้อความที่ว่างได้ ฐานข้อมูลเก็บเป็น null ไม่ใช่ '' — พอ spread เข้าฟอร์มตรงๆ
 * ค่า null จะทับค่าตั้งต้น '' ของ EMPTY แล้วไปพังตอน .trim() ตอนกดบันทึก
 * (อาการ: แก้รายการที่ไม่ได้กรอกผู้รับเงิน/หมายเหตุ แล้วขึ้น Cannot read properties of null)
 */
const TEXT_FIELDS = ['name', 'category', 'vendor', 'note', 'defaultMethod', 'defaultTransferAccountId', 'defaultCardId']

function toFormValues(item) {
  if (!item) return { ...EMPTY }
  const form = {
    ...EMPTY,
    ...item,
    fixedAmount: item.fixedAmount != null ? String(item.fixedAmount) : '',
    frequency: item.frequency ?? 'monthly',
    billingMonth: item.billingMonth ?? '',
    billingCycleOffset: Number(item.billingCycleOffset) || 0,
    vatMode: vatMode(item),
  }
  for (const key of TEXT_FIELDS) form[key] = form[key] ?? ''
  return form
}

export default function RecurringItemForm({ item, onSave, onClose }) {
  const navigate = useNavigate()
  const [form, setForm] = useState(() => toFormValues(item))
  const [error, setError] = useState({})
  const [showNumpad, setShowNumpad] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  // กันกดซ้ำ — การบันทึกต้องรอเซิร์ฟเวอร์ตอบ ระหว่างนั้นหน้าต่างยังเปิดอยู่
  // ถ้าไม่ล็อกปุ่มไว้ คนกดซ้ำเพราะคิดว่าไม่ติด จะได้รายการซ้ำสองอัน
  const [saving, setSaving] = useState(false)

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const validate = () => {
    const e = {}
    if (!(form.name ?? '').trim()) e.name = 'กรอกชื่อรายการ'
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

  const handleSave = async () => {
    if (saving) return
    const e = validate()
    if (Object.keys(e).length > 0) { setError(e); return }
    setSaving(true)
    try {
      await onSave({
        ...form,
        name: (form.name ?? '').trim(),
        billingDay: Number(form.billingDay),
        frequency: form.frequency === 'yearly' ? 'yearly' : 'monthly',
        billingMonth: form.frequency === 'yearly' ? Number(form.billingMonth) : null,
        vatMode: form.amountType === 'fixed' ? (form.vatMode ?? 'none') : 'none',
        vatRate: form.amountType === 'fixed' && form.vatMode !== 'none' ? VAT_RATE : 0,
        // ช่องที่ผู้ใช้ล้างต้องส่งเป็น null ไม่ใช่ undefined — toRow() ทิ้งคีย์ undefined
        // ทำให้ค่าเดิมค้างอยู่ในฐานข้อมูล (ลบโน้ตแล้วโน้ตไม่หาย, ยกเลิกวิธีจ่ายประจำแล้วยังถูกเลือกให้)
        fixedAmount: form.amountType === 'fixed' ? parseFloat(form.fixedAmount) : null,
        vendor: (form.vendor ?? '').trim() || null,
        note: (form.note ?? '').trim() || null,
        defaultMethod: form.defaultMethod || null,
        defaultTransferAccountId:
          form.defaultMethod === 'transfer' ? (form.defaultTransferAccountId || null) : null,
        // undefined = ไม่ส่งคีย์นี้เลย (toRow ทิ้งคีย์ที่เป็น undefined ส่วน '' จะกลายเป็น null)
        // ฐานข้อมูลที่ยังไม่ได้รัน recurring.sql จะไม่มีคอลัมน์ default_card_id
        // ถ้าส่ง null ไปทุกครั้ง การบันทึกรายการประจำจะพังทั้งหมด ไม่ใช่แค่ฟีเจอร์บัตร
        defaultCardId: form.defaultMethod === 'card'
          ? (form.defaultCardId || null)
          : (item?.defaultCardId ? null : undefined),
        // เหตุผลเดียวกับ defaultCardId — ฐานข้อมูลที่ยังไม่ได้รัน icons.sql ไม่มีคอลัมน์ icon
        // ถ้าส่ง null ไปทุกครั้ง การบันทึกรายการประจำจะพังทั้งหมด ไม่ใช่แค่เรื่องไอคอน
        // จึงส่งเฉพาะตอนที่ผู้ใช้ตั้งไอคอนจริง หรือตอนสั่งเอาไอคอนเดิมออก
        // เหตุผลเดียวกับ defaultCardId — ฐานข้อมูลที่ยังไม่ได้รัน recurring.sql รอบล่าสุด
        // จะไม่มีคอลัมน์ billing_cycle_offset ส่งไปทุกครั้งจะทำให้บันทึกรายการประจำพังทั้งหมด
        billingCycleOffset: Number(form.billingCycleOffset) !== (Number(item?.billingCycleOffset) || 0)
          ? Number(form.billingCycleOffset) || 0
          : undefined,
        icon: form.icon || (item?.icon ? null : undefined),
      })
    } finally {
      // ปลดล็อกเสมอ แม้บันทึกล้ม ผู้ใช้จะได้แก้แล้วกดใหม่ได้
      setSaving(false)
    }
  }

  return (
    <Popup
      title={item ? 'แก้ไขรายการประจำ' : 'เพิ่มรายการประจำ'}
      icon="history"
      width={460}
      onClose={onClose}
      onConfirm={handleSave}
      busy={saving}
      confirmLabel={item ? 'บันทึก' : 'เพิ่มรายการ'}
    >
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">ชื่อรายการ *</label>
          <div className="flex items-center gap-2">
            <IconPickerButton
              value={form.icon}
              onChange={(v) => set('icon', v)}
              tone="#6D4AA8"
              emptyIcon="event_repeat"
              title="เลือกไอคอนรายการประจำ"
            />
            <input
              className="input flex-1"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="เช่น ค่า internet, ค่าไฟ"
              autoFocus
            />
          </div>
          {error.name && <p className="text-xs text-red-500 mt-1">{error.name}</p>}
        </div>

        {/* Category */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-gray-700">หมวดหมู่ *</label>
            {/* ไปหน้าหมวดหมู่ = ออกจากหน้านี้ ฟอร์มที่กรอกค้างไว้จะหาย จึงถามยืนยันก่อนเสมอ */}
            <button
              type="button"
              onClick={() => setConfirmLeave(true)}
              className="text-xs text-blue-500 hover:text-blue-700 hover:underline"
            >
              🗂️ จัดการหมวดหมู่
            </button>
          </div>
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
            <AmountInput
              className="input w-full text-right"
              value={form.fixedAmount}
              onChange={(e) => set('fixedAmount', e.target.value)}
              placeholder="0.00"
            />
            {error.fixedAmount && <p className="text-xs text-red-500 mt-1">{error.fixedAmount}</p>}

            <label className="block text-[11.5px] text-muted mb-1.5">ภาษีมูลค่าเพิ่ม</label>

            {/* VAT 3 แบบ — ตัวเลขในช่องยอดเงินคือ "ตัวที่ผู้ใช้กรอก" เสมอ ไม่ว่าเลือกแบบไหน
                สลับไปมาได้โดยยอดไม่เพี้ยนและไม่บวกซ้อนกันเอง */}
            <div className="mt-2">
              <div className="grid grid-cols-3 gap-2">
                {VAT_MODES.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set('vatMode', opt.value)}
                    className={`py-2 px-1 rounded-lg border-2 transition-all ${
                      form.vatMode === opt.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <p className="text-xs font-semibold leading-tight">{opt.label}</p>
                    <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>

              {form.vatMode !== 'none' && Number(form.fixedAmount) > 0 && (() => {
                const b = vatBreakdown(form.fixedAmount, form.vatMode, VAT_RATE)
                const fmt = (n) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })
                return (
                  <div className="mt-2 rounded-xl bg-blue-50 border border-blue-100 px-3 py-2 text-xs space-y-0.5">
                    <div className="flex justify-between text-gray-600">
                      <span>ฐานภาษี</span>
                      <span className="tabular-nums">{fmt(b.base)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>VAT {VAT_RATE}%</span>
                      <span className="tabular-nums">{fmt(b.vat)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-blue-700 pt-1 border-t border-blue-200">
                      <span>ยอดที่จะเรียกเก็บ</span>
                      <span className="tabular-nums">{fmt(b.total)} บาท</span>
                    </div>
                  </div>
                )
              })()}
            </div>
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

        {/* รอบบิลที่บิลใบนี้เรียกเก็บ — บิลสาธารณูปโภคของไทยเก็บย้อนหลังเกือบทั้งหมด
            ถ้าไม่บอกไว้ เวลาเทียบยอดกับบิลจริงจะไม่รู้ว่าเงินก้อนนี้เป็นค่าอะไรของเดือนไหน */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            บิลที่จ่ายรอบนี้ เป็นค่าใช้จ่ายของเดือนไหน
          </label>
          <div className="grid grid-cols-3 gap-2">
            {CYCLE_OFFSETS.map((opt) => {
              const on = (Number(form.billingCycleOffset) || 0) === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set('billingCycleOffset', opt.value)}
                  title={opt.hint}
                  className={`py-2 px-2 rounded-lg border-2 text-sm font-medium transition-all ${
                    on ? 'border-ink bg-[#F2FAD9]' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
            {CYCLE_OFFSETS.find((o) => o.value === (Number(form.billingCycleOffset) || 0))?.hint}
            {' · '}
            ตัวอย่าง: บิลที่จ่ายเดือน {monthName(localMonthStr())} คือรอบบิลของเดือน{' '}
            <b className="text-gray-600">{monthName(cycleMonth({ billingCycleOffset: form.billingCycleOffset }, localMonthStr()))}</b>
          </p>
        </div>

        {/* วิธีจ่ายที่ตั้งไว้ล่วงหน้า — เมื่อกดจ่ายตามรอบจะใช้ค่านี้ทันที */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            วิธีจ่ายประจำ <span className="text-gray-400 font-normal">(ไม่บังคับ)</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
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

        {/* บัตรที่จะรูดเมื่อจ่ายด้วยบัตรเครดิต — ยอดไปเป็นหนี้บัตร ไม่ตัดเงินตอนจ่าย */}
        {form.defaultMethod === 'card' && (
          <div className="space-y-1">
            <CreditCardPicker
              value={form.defaultCardId}
              onChange={(v) => set('defaultCardId', v)}
              label="รูดบัตร"
            />
            <p className="text-xs text-gray-500">
              ยอดจะไปสะสมเป็นหนี้ในบัตรแล้วรวมอยู่ในบิลของรอบนั้น ไม่ตัดเงินสด/เงินโอนตอนกดจ่าย
            </p>
          </div>
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
            placeholder="รายละเอียดเพิ่มเติม…"
          />
        </div>

        {/* Enabled toggle */}
        <div className="flex items-center justify-between py-2 border-t border-gray-100">
          <div className="pr-3">
            <p className="text-sm font-medium text-gray-700">เปิดใช้งาน</p>
            {/* ต้องแยกให้ชัดจาก "พักการเรียกเก็บ" ไม่งั้นผู้ใช้เลือกผิดตัว
                ปิดใช้งาน = หายไปเลยไม่มีกำหนด / พัก = ยังเห็นอยู่และกลับมาเอง */}
            <p className="text-xs text-gray-400">
              {form.enabled
                ? 'ปิดแล้วรายการจะหายไปจากทุกหน้า ไม่นับเป็นยอดรอจ่าย จนกว่าจะกดเปิดเอง'
                : 'ตอนนี้ปิดอยู่ รายการไม่แสดงที่ไหนเลย ถ้าอยากหยุดชั่วคราวแบบยังเห็นอยู่ ให้ใช้ปุ่มพักการเรียกเก็บแทน'}
            </p>
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

    <ConfirmPopup
      open={confirmLeave}
      title="ไปหน้าจัดการหมวดหมู่?"
      message={`ข้อมูลที่กรอกไว้ในฟอร์มนี้จะหายไปทั้งหมด ต้องกรอกใหม่เมื่อกลับมา\n\nถ้ายังไม่พร้อม กด "อยู่หน้านี้ต่อ" แล้วบันทึกรายการให้เสร็จก่อน`}
      confirmLabel="ไปตั้งค่าหมวดหมู่"
      cancelLabel="อยู่หน้านี้ต่อ"
      onCancel={() => setConfirmLeave(false)}
      onConfirm={() => {
        setConfirmLeave(false)
        onClose()
        navigate('/manage/categories')
      }}
    />
    </Popup>
  )
}
