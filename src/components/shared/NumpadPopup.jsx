import { useEffect, useState } from 'react'

/**
 * แป้นตัวเลขแบบ popup — กดปุ่มบนจอหรือพิมพ์จากคีย์บอร์ดก็ได้
 *   Enter     = บันทึก
 * Backspace = ลบตัวท้าย
 * Escape    = ปิดโดยไม่บันทึก
 *
 * ใช้กับค่าที่เป็นจำนวนเต็มช่วงสั้นๆ เช่น วันที่ 1–31
 */
export default function NumpadPopup({
  title = 'กรอกตัวเลข',
  hint,
  initialValue = '',
  min = 1,
  max = 31,
  maxLength = 2,
  onSave,
  onClose,
}) {
  const [value, setValue] = useState(initialValue ? String(initialValue) : '')
  const [error, setError] = useState('')

  const num = value === '' ? NaN : Number(value)
  const valid = !isNaN(num) && num >= min && num <= max

  const push = (digit) => {
    setError('')
    setValue((v) => {
      const next = (v === '0' ? '' : v) + digit
      return next.length > maxLength ? v : next
    })
  }
  const backspace = () => { setError(''); setValue((v) => v.slice(0, -1)) }
  const clear = () => { setError(''); setValue('') }

  const save = () => {
    if (!valid) { setError(`กรอกตัวเลข ${min}–${max}`); return }
    onSave(num)
  }

  // รับจากคีย์บอร์ดด้วย — จับที่ window เพราะ popup นี้ไม่มี input ให้โฟกัส
  useEffect(() => {
    const onKey = (e) => {
      if (e.key >= '0' && e.key <= '9') { e.preventDefault(); push(e.key); return }
      if (e.key === 'Backspace') { e.preventDefault(); backspace(); return }
      if (e.key === 'Delete') { e.preventDefault(); clear(); return }
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); save(); return }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
    }
    // ใช้ capture เพื่อดักก่อนฟอร์มข้างหลัง ไม่งั้น Enter อาจไปกดบันทึกฟอร์มแม่
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[280px] overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm text-gray-900">{title}</h3>
            {hint && <p className="text-xs text-gray-400">{hint}</p>}
          </div>
          <button type="button" className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onClose}>×</button>
        </div>

        <div className="p-4 space-y-3">
          {/* จอแสดงค่า */}
          <div className={`h-14 rounded-xl border-2 flex items-center justify-center text-3xl font-bold tabular-nums ${
            error ? 'border-red-300 bg-red-50 text-red-600' :
            valid ? 'border-ink bg-white text-ink' : 'border-gray-200 bg-gray-50 text-gray-400'
          }`}>
            {value === '' ? <span className="text-base font-normal text-gray-300">{min}–{max}</span> : value}
          </div>
          {error && <p className="text-xs text-red-500 -mt-1">{error}</p>}

          {/* แป้นตัวเลข */}
          <div className="grid grid-cols-3 gap-2">
            {keys.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => push(k)}
                className="h-12 rounded-xl border border-hairline bg-white text-lg font-semibold text-ink hover:bg-[#F6F5F1] active:bg-[#ECEBE6]"
              >
                {k}
              </button>
            ))}
            <button
              type="button"
              onClick={clear}
              className="h-12 rounded-xl border border-hairline bg-white text-sm font-medium text-gray-500 hover:bg-[#F6F5F1]"
              title="ล้าง (Delete)"
            >
              C
            </button>
            <button
              type="button"
              onClick={() => push('0')}
              className="h-12 rounded-xl border border-hairline bg-white text-lg font-semibold text-ink hover:bg-[#F6F5F1] active:bg-[#ECEBE6]"
            >
              0
            </button>
            <button
              type="button"
              onClick={backspace}
              className="h-12 rounded-xl border border-hairline bg-white text-lg text-gray-500 hover:bg-[#F6F5F1]"
              title="ลบตัวท้าย (Backspace)"
            >
              ⌫
            </button>
          </div>

          <button
            type="button"
            onClick={save}
            className="btn btn-primary w-full"
          >
            บันทึก (Enter)
          </button>
          <p className="text-[11px] text-gray-400 text-center">พิมพ์จากคีย์บอร์ดได้ · Enter บันทึก · Esc ปิด</p>
        </div>
      </div>
    </div>
  )
}
