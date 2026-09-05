import { useState } from 'react'
import Popup from '../../components/shared/Popup'
import AmountInput from '../../components/shared/AmountInput'
import TransferAccountPicker from '../../components/shared/TransferAccountPicker'
import BankSelect from '../../components/shared/BankSelect'
import { BANKS } from '../../lib/banks'
import { nextClosingDate, formatThaiDate } from '../../lib/cardCycle'
import { IconPickerButton } from '../../components/shared/IconPicker'
import { DEFAULT_ICONS } from '../../lib/defaultIcons'

const BANK_NAMES = BANKS.map((b) => b.name)
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

export const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

export const AUTOPAY_MODES = [
  { value: 'off', label: 'ไม่ได้ผูกไว้' },
  { value: 'full', label: 'เต็มจำนวน' },
  { value: 'minimum', label: 'ขั้นต่ำ' },
  { value: 'fixed', label: 'จำนวนคงที่' },
]
export const autopayLabel = (mode) => AUTOPAY_MODES.find((m) => m.value === mode)?.label ?? 'ไม่ได้ผูกไว้'

/**
 * ฟอร์มเพิ่ม/แก้ไขบัตรเครดิต — ย้ายมาจากหน้ากระเป๋าเงินให้อยู่ใน "จัดการข้อมูล"
 * เพิ่มค่าธรรมเนียมรายปีกับเดือนที่เรียกเก็บ (แบบ Wallet Story) ไว้ให้การ์ดบัตรเตือน
 */
export default function CardFormPopup({ card, onSave, onClose, busy }) {
  const isEdit = !!card
  const [bankName, setBankName] = useState(card?.bankName ?? '')
  const [customBank, setCustomBank] = useState(
    card?.bankName && !BANK_NAMES.includes(card.bankName) ? card.bankName : ''
  )
  const [useCustom, setUseCustom] = useState(!!card?.bankName && !BANK_NAMES.includes(card.bankName))
  const [name, setName] = useState(card?.name ?? '')
  const [last4, setLast4] = useState(card?.last4 ?? '')
  const [creditLimit, setCreditLimit] = useState(card ? String(card.creditLimit) : '')
  const [outstanding, setOutstanding] = useState(card ? String(card.outstanding) : '')
  const [closingDay, setClosingDay] = useState(String(card?.closingDay ?? 25))
  const [dueDay, setDueDay] = useState(String(card?.dueDay ?? 15))
  const [cashbackRate, setCashbackRate] = useState(card ? String(card.cashbackRate) : '')
  const [annualFee, setAnnualFee] = useState(card?.annualFee ? String(card.annualFee) : '')
  const [annualFeeMonth, setAnnualFeeMonth] = useState(card?.annualFeeMonth ? String(card.annualFeeMonth) : '')
  const [autopayMode, setAutopayMode] = useState(card?.autopayMode ?? 'off')
  const [autopayAccountId, setAutopayAccountId] = useState(card?.autopayAccountId ?? '')
  const [autopayAmount, setAutopayAmount] = useState(card ? String(card.autopayAmount ?? '') : '')
  const [showMore, setShowMore] = useState(
    !!(card && (Number(card.creditLimit) || Number(card.cashbackRate) || Number(card.annualFee) || card.autopayMode !== 'off'))
  )
  const [icon, setIcon] = useState(card?.icon ?? null)
  const [error, setError] = useState('')

  const clear = (fn) => (v) => { fn(v); setError('') }

  const submit = () => {
    if (busy) return
    const bank = useCustom ? customBank.trim() : bankName
    if (!bank) return setError('เลือกหรือพิมพ์ชื่อธนาคาร')
    if (!name.trim()) return setError('กรอกชื่อบัตร')
    if (last4 && !/^\d{4}$/.test(last4.trim())) return setError('เลขสี่ตัวท้ายต้องเป็นตัวเลข 4 หลัก')
    if (autopayMode !== 'off' && !autopayAccountId) return setError('เลือกบัญชีที่ผูกหักบัญชีไว้')
    if (autopayMode === 'fixed' && !(Number(autopayAmount) > 0)) return setError('ใส่จำนวนที่หักคงที่')
    if (Number(annualFee) > 0 && !annualFeeMonth) return setError('เลือกเดือนที่ธนาคารเรียกเก็บค่าธรรมเนียมรายปี')
    onSave({
      bankName: bank,
      name: name.trim(),
      last4: last4.trim(),
      creditLimit: Number(creditLimit) || 0,
      outstanding: Number(outstanding) || 0,
      closingDay: Number(closingDay) || 25,
      dueDay: Number(dueDay) || 15,
      cashbackRate: Number(cashbackRate) || 0,
      annualFee: Number(annualFee) || 0,
      annualFeeMonth: Number(annualFee) > 0 ? Number(annualFeeMonth) || null : null,
      autopayMode,
      autopayAccountId: autopayMode === 'off' ? null : autopayAccountId,
      autopayAmount: autopayMode === 'fixed' ? Number(autopayAmount) || 0 : 0,
      icon: icon ?? null,
    })
  }

  // แสดงให้เห็นทันทีว่าตั้งวันแล้วบิลจะครบกำหนดเมื่อไร ผู้ใช้จะได้ไม่ต้องเดา
  const cd = Number(closingDay) || 25
  const dd = Number(dueDay) || 15
  const preview = (() => {
    const closing = nextClosingDate(cd)
    const sameMonth = new Date(closing.getFullYear(), closing.getMonth(), Math.min(dd, 28))
    return sameMonth > closing
      ? new Date(closing.getFullYear(), closing.getMonth(), dd)
      : new Date(closing.getFullYear(), closing.getMonth() + 1, dd)
  })()

  return (
    <Popup
      title={isEdit ? 'แก้ไขบัตร' : 'เพิ่มบัตรเครดิต'}
      sub="ธนาคาร วงเงิน วันสรุปยอด และการหักบัญชีอัตโนมัติ"
      icon="credit_card"
      width={460}
      onClose={onClose}
      onConfirm={submit}
      busy={busy}
      confirmLabel={isEdit ? 'บันทึก' : 'เพิ่มบัตร'}
    >
          <div>
            <label className="label">ธนาคาร / ผู้ออกบัตร</label>
            {useCustom ? (
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  value={customBank}
                  onChange={(e) => clear(setCustomBank)(e.target.value)}
                  placeholder="พิมพ์ชื่อผู้ออกบัตร..."
                  autoFocus
                />
                <button className="btn btn-secondary text-xs px-2" onClick={() => setUseCustom(false)}>เลือกจากรายการ</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="flex-1 min-w-0">
                  <BankSelect value={bankName} onChange={clear(setBankName)} />
                </div>
                <button className="btn btn-secondary text-xs px-2 shrink-0" onClick={() => setUseCustom(true)}>อื่นๆ</button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="label">ชื่อเรียกบัตร</label>
              {/* ไอคอนอยู่ติดกับชื่อ เพราะเป็นคู่ที่ใช้แยกบัตรออกจากกันในทุกหน้า
                  ไม่เลือกก็ได้ — จะใช้โลโก้ธนาคารผู้ออกบัตรแทน */}
              <div className="flex items-center gap-2">
                <IconPickerButton
                  value={icon}
                  onChange={setIcon}
                  tone="#D0483C"
                  emptyIcon={DEFAULT_ICONS.card}
                  title="เลือกไอคอนของบัตรใบนี้"
                />
                <input
                  className="input"
                  value={name}
                  onChange={(e) => clear(setName)(e.target.value)}
                  placeholder="เช่น บัตรหลัก"
                />
              </div>
            </div>
            <div>
              <label className="label">4 ตัวท้าย</label>
              <input
                className="input"
                value={last4}
                onChange={(e) => clear(setLast4)(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="1234"
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">วันสรุปยอด</label>
              <select className="input" value={closingDay} onChange={(e) => clear(setClosingDay)(e.target.value)}>
                {DAYS.map((d) => <option key={d} value={d}>ทุกวันที่ {d}</option>)}
              </select>
            </div>
            <div>
              <label className="label">วันครบกำหนดชำระ</label>
              <select className="input" value={dueDay} onChange={(e) => clear(setDueDay)(e.target.value)}>
                {DAYS.map((d) => <option key={d} value={d}>ทุกวันที่ {d}</option>)}
              </select>
            </div>
          </div>

          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            📅 รูดวันนี้จะไปอยู่ในบิลที่ครบกำหนด <strong className="text-gray-700">{formatThaiDate(preview)}</strong>
          </p>

          <div>
            <label className="label">{isEdit ? 'ยอดหนี้คงค้าง' : 'ยอดหนี้ยกมา'} (บาท)</label>
            <AmountInput
              className="input"
              value={outstanding}
              onChange={(e) => clear(setOutstanding)(e.target.value)}
              placeholder="0.00"
            />
            <p className="text-xs text-gray-500 mt-1">
              {isEdit
                ? '⚠️ การแก้ยอดตรงนี้เป็นการปรับยอดหนี้โดยตรง ไม่สร้างรายการรับ-จ่าย'
                : 'ยอดที่ค้างอยู่ตอนนี้ ถ้าเพิ่งเปิดบัตรใหม่ให้ปล่อยเป็น 0'}
            </p>
          </div>

          <button
            className="text-xs text-gray-500 hover:text-gray-700"
            onClick={() => setShowMore((v) => !v)}
          >
            {showMore ? '▲ ซ่อนตัวเลือกเพิ่มเติม' : '▼ ตัวเลือกเพิ่มเติม (ไม่บังคับ)'}
          </button>

          {showMore && (
            <div className="space-y-4 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">วงเงิน (บาท)</label>
                  <AmountInput
                    className="input"
                    value={creditLimit}
                    onChange={(e) => clear(setCreditLimit)(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="label">อัตราเงินคืน (%)</label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    value={cashbackRate}
                    onChange={(e) => clear(setCashbackRate)(e.target.value)}
                    placeholder="0"
                  />
                  <p className="text-xs text-gray-400 mt-1">ใส่แล้วระบบจะประมาณเงินคืนของรอบให้ดู</p>
                </div>
              </div>

              <div className="border-t pt-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">ค่าธรรมเนียมรายปี (บาท)</label>
                    <AmountInput
                      className="input"
                      value={annualFee}
                      onChange={(e) => clear(setAnnualFee)(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="label">เดือนที่เรียกเก็บ</label>
                    <select className="input" value={annualFeeMonth} onChange={(e) => clear(setAnnualFeeMonth)(e.target.value)}>
                      <option value="">ไม่ระบุ</option>
                      {MONTHS_TH.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  แอปจะเตือนบนการ์ดบัตรเมื่อถึงเดือนเรียกเก็บ กดบันทึกเป็นรายจ่ายบนบัตรได้ทีเดียว
                  ถ้าธนาคารยกเว้นให้ปีนั้นก็ไม่ต้องกด
                </p>
              </div>

              <div className="border-t pt-3">
                <label className="label">ผูกหักบัญชีอัตโนมัติไว้กับธนาคาร</label>
                <select
                  className="input"
                  value={autopayMode}
                  onChange={(e) => clear(setAutopayMode)(e.target.value)}
                >
                  {AUTOPAY_MODES.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  บอกแอปว่าคุณสมัครหักบัญชีไว้แบบไหน แอปจะเตรียมรายการจ่ายบิลให้ตรงกับ
                  ที่ธนาคารจะหัก แล้วรอให้คุณกดยืนยัน <strong>แอปไม่หักเงินเอง</strong>{' '}
                  เพราะไม่มีทางรู้ว่าธนาคารหักสำเร็จจริงหรือไม่
                </p>

                {autopayMode !== 'off' && (
                  <div className="mt-3 space-y-2">
                    <TransferAccountPicker
                      value={autopayAccountId}
                      onChange={clear(setAutopayAccountId)}
                      label="บัญชีที่ผูกไว้"
                    />
                    {autopayMode === 'fixed' && (
                      <div>
                        <label className="label">จำนวนที่หักคงที่ (บาท)</label>
                        <AmountInput
                          className="input"
                          value={autopayAmount}
                          onChange={(e) => clear(setAutopayAmount)(e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">⚠️ {error}</p>}
    </Popup>
  )
}
