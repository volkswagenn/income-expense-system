import { useEffect, useState } from 'react'
import Popup from './Popup'
import UiIcon from './UiIcon'

/**
 * แป้นตัวเลขสำหรับกรอกยอดเงิน — ต่างจาก NumpadPopup ที่ใช้กรอกวันที่ 1–31
 *
 * ทำไมต้องบวกยอดต่อกันได้
 *   ร้านค้าซื้อของครั้งเดียวได้ใบเสร็จหลายใบ เดิมต้องเปิดเครื่องคิดเลขอีกตัว
 *   บวกเสร็จค่อยมาพิมพ์ผลลัพธ์ ซึ่งพิมพ์ผิดง่ายและไม่เหลือร่องรอยว่ามาจากใบไหนบ้าง
 *   ที่นี่กด + คั่นแล้วกด = ระบบรวมให้ และโชว์สมการที่กดไว้ให้ตรวจซ้ำได้
 *
 * ใช้คีย์บอร์ดได้ทุกปุ่ม เพราะคนกรอกเยอะๆ จะใช้แป้นตัวเลขบนคีย์บอร์ดเร็วกว่าจิ้มจอ
 */
const KEYS = [
  ['1'], ['2'], ['3'], ['⌫', 'muted'],
  ['4'], ['5'], ['6'], ['+', 'op'],
  ['7'], ['8'], ['9'], ['−', 'op'],
  ['.'], ['0'], ['=', 'eq'],
]

const TONE = {
  op: { bg: '#F2FAD9', fg: '#5C7A0F', bd: '#D8E9A8', fw: 700 },
  eq: { bg: '#16181D', fg: '#C7F250', bd: '#16181D', fw: 700 },
  muted: { bg: '#EFEDE7', fg: '#16181D', bd: '#E4E2DC', fw: 600 },
  plain: { bg: '#fff', fg: '#16181D', bd: '#E4E2DC', fw: 600 },
}

const QUICK = [100, 500, 1000]
const fmt2 = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function AmountNumpadPopup({
  initialValue = '',
  kicker = 'จำนวนเงิน',
  onSave,
  onClose,
}) {
  const [digits, setDigits] = useState(initialValue ? String(initialValue) : '')
  const [acc, setAcc] = useState(null)     // ยอดสะสมจากการกด + / −
  const [op, setOp] = useState(null)       // เครื่องหมายที่ค้างอยู่
  const [expr, setExpr] = useState('')     // สมการที่กดมาแล้ว ไว้ให้ตรวจซ้ำ
  const [count, setCount] = useState(0)    // จำนวนก้อนที่บวกเข้ามา

  const shown = digits === '' ? (acc === null ? '' : String(acc)) : digits
  const amount = Number(shown) || 0

  const applyOp = (nextOp) => {
    const cur = digits === '' ? 0 : Number(digits) || 0
    const total = op === null || acc === null ? cur : (op === '+' ? acc + cur : acc - cur)
    setAcc(total)
    setOp(nextOp)
    setExpr((e) => `${e ? e + ' ' : ''}${digits === '' ? '' : digits + ' '}${nextOp ?? ''}`.trim())
    setCount((c) => (digits === '' ? c : c + 1))
    setDigits('')
    return total
  }

  const press = (k) => {
    if (k === '⌫') return setDigits((v) => v.slice(0, -1))
    if (k === '+' || k === '−') return applyOp(k)
    if (k === '=') {
      const total = applyOp(null)
      setAcc(total)
      setOp(null)
      setDigits(String(Math.round(total * 100) / 100))
      return
    }
    if (k === '.' && digits.includes('.')) return
    setDigits((v) => (v === '0' && k !== '.' ? k : v + k))
  }

  const reset = () => { setDigits(''); setAcc(null); setOp(null); setExpr(''); setCount(0) }

  // คีย์บอร์ดใช้ได้ทุกปุ่ม — ดักแบบ capture เพื่อไม่ให้ Enter ไปกดบันทึกฟอร์มข้างหลัง
  useEffect(() => {
    const onKey = (e) => {
      if (e.key >= '0' && e.key <= '9') { e.preventDefault(); press(e.key); return }
      if (e.key === '.') { e.preventDefault(); press('.'); return }
      if (e.key === '+') { e.preventDefault(); press('+'); return }
      if (e.key === '-') { e.preventDefault(); press('−'); return }
      if (e.key === 'Backspace') { e.preventDefault(); press('⌫'); return }
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); press('='); return }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  return (
    <Popup
      title="แป้นตัวเลข"
      sub="กรอกยอดเงิน บวกต่อกันได้"
      icon="calculate"
      width={380}
      onClose={onClose}
      onConfirm={() => onSave(String(amount))}
      confirmLabel="ใช้ยอดนี้"
    >
      <div className="flex-none border border-ink rounded-ctl px-[13px] py-[9px]">
        <div className="flex items-baseline gap-2">
          <span className="text-[11.5px] text-muted truncate">{kicker}</span>
          <span className="tabular-nums ml-auto text-[11.5px] font-semibold text-[#5C7A0F]">{expr}</span>
        </div>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className="tabular-nums text-[26px] font-semibold tracking-[-0.01em]">{shown === '' ? '0' : shown}</span>
          <span className="text-[12.5px] text-faint">บาท</span>
          <span className="tabular-nums ml-auto text-[11px] text-faint">
            {count > 0 ? `รวมมาแล้ว ${count} ก้อน` : ''}
          </span>
        </div>
      </div>

      <div className="flex-none flex gap-1.5">
        {QUICK.map((a) => (
          <button
            key={a}
            onClick={() => setDigits(String((Number(digits) || 0) + a))}
            className="flex-1 h-8 rounded-[9px] bg-paper text-[12px] font-semibold hover:bg-hairline"
          >
            +{a.toLocaleString('th-TH')}
          </button>
        ))}
        <button onClick={reset} className="flex-1 h-8 rounded-[9px] bg-paper text-[12px] font-semibold hover:bg-hairline">
          ล้าง
        </button>
      </div>

      <div className="flex-none grid grid-cols-4 gap-[7px]">
        {KEYS.map(([label, tone]) => {
          const t = TONE[tone ?? 'plain']
          return (
            <button
              key={label}
              onClick={() => press(label)}
              style={{
                gridColumn: tone === 'eq' ? 'span 2' : 'span 1',
                background: t.bg, color: t.fg, borderColor: t.bd, fontWeight: t.fw,
              }}
              className="h-11 rounded-[11px] border text-[17px] flex items-center justify-center hover:brightness-[0.97]"
            >
              {label === '⌫' ? <UiIcon name="backspace" size={19} /> : label}
            </button>
          )
        })}
      </div>

      <p className="flex-none text-[11px] text-faint leading-relaxed">
        บวกยอดต่อกันได้ เช่นซื้อของหลายใบเสร็จ กด <b className="text-[#5C7A0F]">+</b> คั่นแล้วกด <b>=</b> ระบบรวมให้
        <br />
        คีย์บอร์ดใช้ได้: ตัวเลข ·{' '}
        <kbd className="rounded-[5px] px-1.5 py-0.5 bg-paper text-muted text-[10.5px] font-semibold">+</kbd>{' '}
        <kbd className="rounded-[5px] px-1.5 py-0.5 bg-paper text-muted text-[10.5px] font-semibold">−</kbd>{' '}
        <kbd className="rounded-[5px] px-1.5 py-0.5 bg-paper text-muted text-[10.5px] font-semibold">Enter</kbd> รวมยอด ·{' '}
        <kbd className="rounded-[5px] px-1.5 py-0.5 bg-paper text-muted text-[10.5px] font-semibold">Backspace</kbd> ลบ ·{' '}
        <kbd className="rounded-[5px] px-1.5 py-0.5 bg-paper text-muted text-[10.5px] font-semibold">Esc</kbd> ปิด
      </p>

      <p className="flex-none text-[11px] text-faint">
        ยอดที่จะใช้ <b className="tabular-nums text-ink">{fmt2(amount)}</b> บาท
      </p>
    </Popup>
  )
}
