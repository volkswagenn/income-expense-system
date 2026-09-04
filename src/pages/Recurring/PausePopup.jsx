import { useState } from 'react'
import Popup from '../../components/shared/Popup'
import NumpadPopup from '../../components/shared/NumpadPopup'
import { addMonths, THAI_MONTHS_SHORT } from '../../lib/recurringSchedule'
import { localMonthStr } from '../../lib/dateUtils'

/**
 * เลือกว่าจะพักการเรียกเก็บกี่เดือน
 *
 * มีปุ่มลัด 1–3 เดือนเพราะเป็นกรณีที่ใช้บ่อยที่สุด ส่วนที่นานกว่านั้นกดกำหนดเอง
 * แล้วใส่ตัวเลขจากแป้นตัวเลขตัวเดียวกับที่ใช้กรอกวันเรียกเก็บ
 */

const QUICK = [1, 2, 3]

function monthLabel(month) {
  const [y, m] = month.split('-').map(Number)
  return `${THAI_MONTHS_SHORT[m - 1]} ${y + 543}`
}

export default function PausePopup({ item, paidThisMonth, onConfirm, onClose }) {
  const [months, setMonths] = useState(1)
  const [showNumpad, setShowNumpad] = useState(false)
  const [saving, setSaving] = useState(false)

  const thisMonth = localMonthStr()
  // จ่ายเดือนนี้ไปแล้วก็ย้อนไปยกเลิกบิลไม่ได้ ต้องเริ่มพักเดือนหน้า
  const from = paidThisMonth ? addMonths(thisMonth, 1) : thisMonth
  const until = addMonths(from, months)
  const lastPaused = addMonths(until, -1)

  const confirm = async () => {
    if (saving) return
    setSaving(true)
    try {
      await onConfirm(months)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Popup
      title="พักการเรียกเก็บ"
      sub={item.name}
      icon="schedule"
      width={420}
      onClose={onClose}
      onConfirm={confirm}
      busy={saving}
      confirmLabel="พักการเรียกเก็บ"
    >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">พักกี่เดือน</label>
            <div className="grid grid-cols-4 gap-2">
              {QUICK.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMonths(n)}
                  className={`h-12 rounded-xl border-2 text-sm font-semibold transition-all ${
                    months === n ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {n} เดือน
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowNumpad(true)}
                className={`h-12 rounded-xl border-2 text-sm font-semibold transition-all ${
                  !QUICK.includes(months) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
                title="กำหนดเอง"
              >
                {QUICK.includes(months) ? 'กำหนดเอง' : `${months} เดือน`}
              </button>
            </div>
          </div>

          {/* บอกผลลัพธ์เป็นเดือนจริง ไม่ให้ต้องนับเอง */}
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm text-gray-700 space-y-1">
            <p>
              พักตั้งแต่ <span className="font-semibold">{monthLabel(from)}</span>
              {months > 1 && <> ถึง <span className="font-semibold">{monthLabel(lastPaused)}</span></>}
            </p>
            <p>
              กลับมาเรียกเก็บอัตโนมัติ <span className="font-semibold text-emerald-600">{monthLabel(until)}</span>
            </p>
            {paidThisMonth && (
              <p className="text-xs text-amber-600">เดือนนี้จ่ายไปแล้ว จึงเริ่มพักเดือนถัดไป</p>
            )}
          </div>

          <p className="text-xs text-gray-400">
            ระหว่างพักรายการยังอยู่ในหน้านี้และบอกว่าเหลืออีกกี่เดือน แต่จะไม่ถูกนับเป็นยอดรอจ่าย
            รอบที่ยังไม่จ่ายในช่วงนี้จะถูกลบ ส่วนที่จ่ายไปแล้วยังอยู่ครบ
          </p>

      {showNumpad && (
        <NumpadPopup
          title="พักกี่เดือน"
          hint="1–24 เดือน"
          initialValue={months}
          min={1}
          max={24}
          maxLength={2}
          onSave={(n) => { setMonths(n); setShowNumpad(false) }}
          onClose={() => setShowNumpad(false)}
        />
      )}
    </Popup>
  )
}
