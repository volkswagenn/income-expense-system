import { useLayoutEffect, useRef } from 'react'

/**
 * ช่องกรอกจำนวนเงินที่ใส่จุลภาคให้ระหว่างพิมพ์
 *
 * ทำไมต้องมี: ยอดเงินหลักหมื่นหลักแสนถ้าไม่มีจุลภาค คนอ่านไม่ออกว่าพิมพ์ถึงหลักไหนแล้ว
 * (66360 กับ 663600 ต่างกันสิบเท่าแต่หน้าตาแทบเหมือนกัน) พิมพ์ผิดหลักเดียวคือเงินผิดทั้งรายการ
 *
 * ใช้ type="text" ไม่ใช่ type="number" เพราะเบราว์เซอร์ไม่ยอมให้ใส่จุลภาคใน number
 * แต่ยังตั้ง inputMode ให้ขึ้นแป้นตัวเลขบนมือถือเหมือนเดิม
 *
 * onChange ส่งค่ากลับในรูป { target: { value } } โดยค่าเป็นตัวเลขล้วนไม่มีจุลภาค
 * หน้าจอเดิมที่เขียน onChange={(e) => set(..., e.target.value)} จึงใช้ได้ทันทีไม่ต้องแก้
 */

/** เก็บเฉพาะตัวเลขกับจุดทศนิยมจุดเดียว และไม่เกิน 2 ตำแหน่ง */
function sanitize(text, maxDecimals) {
  let s = String(text ?? '').replace(/[^\d.]/g, '')
  const first = s.indexOf('.')
  if (first !== -1) s = s.slice(0, first + 1) + s.slice(first + 1).replace(/\./g, '')
  if (maxDecimals === 0) return s.split('.')[0]
  const [int, dec] = s.split('.')
  return dec === undefined ? int : `${int}.${dec.slice(0, maxDecimals)}`
}

/** ใส่จุลภาคเฉพาะจำนวนเต็ม — คงจุดท้ายไว้ระหว่างพิมพ์ เช่น "1,234." */
function withCommas(raw) {
  if (raw === '' || raw == null) return ''
  const [int, dec] = String(raw).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return dec === undefined ? grouped : `${grouped}.${dec}`
}

const digitsBefore = (text, caret) => String(text).slice(0, caret).replace(/[^\d.]/g, '').length

export default function AmountInput({
  value, onChange, className = 'input w-full text-right',
  placeholder = '0.00', maxDecimals = 2,
  // รับไว้เฉยๆ เพื่อให้สลับจาก <input type="number"> ได้โดยไม่ต้องรื้อ props เดิม
  type, min, max, step,
  ...rest
}) {
  const ref = useRef(null)
  const caretRef = useRef(null)

  const display = withCommas(value)

  // คืนตำแหน่งเคอร์เซอร์หลังใส่จุลภาค ไม่งั้นพิมพ์กลางตัวเลขแล้วเคอร์เซอร์กระโดดไปท้าย
  useLayoutEffect(() => {
    const el = ref.current
    const want = caretRef.current
    if (!el || want == null) return
    caretRef.current = null
    let seen = 0
    let pos = el.value.length
    for (let i = 0; i < el.value.length; i++) {
      if (/[\d.]/.test(el.value[i])) seen++
      if (seen === want) { pos = i + 1; break }
    }
    if (want === 0) pos = 0
    el.setSelectionRange(pos, pos)
  })

  const handleChange = (e) => {
    const el = e.target
    caretRef.current = digitsBefore(el.value, el.selectionStart ?? el.value.length)
    onChange?.({ target: { value: sanitize(el.value, maxDecimals) } })
  }

  return (
    <input
      ref={ref}
      type="text"
      inputMode={maxDecimals === 0 ? 'numeric' : 'decimal'}
      className={className}
      placeholder={placeholder}
      value={display}
      onChange={handleChange}
      {...rest}
    />
  )
}
