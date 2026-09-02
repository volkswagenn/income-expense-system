import { useMemo } from 'react'
import DatePicker from './DatePicker'
import TransferAccountPicker from './TransferAccountPicker'
import {
  debtSchedule, scheduleTotal, installmentTotal, maxPrepaidForDebt, latestFirstDueFor,
  formatThaiDate, toDateString, clampedDate,
} from '../../lib/cardCycle'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

export const EMPTY_DEBT = {
  direction: 'payable',
  name: '',
  counterparty: '',
  mode: 'known',          // 'known' = รู้ค่างวดอยู่แล้ว | 'calc' = ให้ระบบคำนวณจากเงินต้น
  monthly: '',
  principal: '',
  rate: '0',
  months: '12',
  dueDay: String(new Date().getDate()),
  firstDue: '',
  prepaid: false,
  prepaidCount: '',
  method: 'transfer',
  accountId: '',
}

/**
 * คำนวณทุกอย่างจากค่าในฟอร์ม — ใช้ทั้งตอนแสดงตัวอย่างและตอนบันทึก
 * คืน null ถ้ายังกรอกไม่พอ
 */
export function computeDebt(v, today = new Date()) {
  const months = Math.round(Number(v.months) || 0)
  if (!(months >= 1) || months > 480) return null
  const dueDay = Math.min(31, Math.max(1, Math.round(Number(v.dueDay) || 1)))

  let firstDue
  if (v.firstDue) firstDue = new Date(v.firstDue + 'T00:00:00')
  else {
    // ไม่ระบุ = งวดแรกคือวันที่ dueDay ครั้งถัดไปนับจากวันนี้
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const same = clampedDate(t.getFullYear(), t.getMonth(), dueDay)
    firstDue = same >= t ? same : clampedDate(t.getFullYear(), t.getMonth() + 1, dueDay)
  }

  let monthly, principal, interest = 0, total
  if (v.mode === 'calc') {
    principal = Number(v.principal)
    if (!(principal > 0)) return null
    const m = installmentTotal(principal, months, Number(v.rate) || 0)
    total = m.total; interest = m.interest
    monthly = Math.round((total / months) * 100) / 100
  } else {
    monthly = Number(v.monthly)
    if (!(monthly > 0)) return null
    total = Math.round(monthly * months * 100) / 100
    principal = total
  }

  const rows = debtSchedule(firstDue, months, dueDay, monthly)
  // เศษจากการหารไปงวดสุดท้าย ให้ผลรวมเท่ายอดรวมพอดี
  if (rows.length > 1) {
    const sumButLast = scheduleTotal(rows.slice(0, -1))
    rows[rows.length - 1].amount = Math.round((total - sumButLast) * 100) / 100
  }

  const maxPrepaid = Math.min(maxPrepaidForDebt(firstDue, dueDay, today), months)
  const wantPrepaid = v.prepaid ? Math.max(0, Math.round(Number(v.prepaidCount) || 0)) : 0
  const prepaidOver = wantPrepaid > maxPrepaid
  const suggestFirstDue = prepaidOver ? latestFirstDueFor(dueDay, wantPrepaid, today) : null
  const prepaidCount = prepaidOver ? 0 : wantPrepaid
  const remaining = rows.slice(prepaidCount)

  return {
    months, dueDay, firstDue, monthly, principal, interest, total, rows,
    maxPrepaid, wantPrepaid, prepaidOver, suggestFirstDue, prepaidCount,
    paidAlready: scheduleTotal(rows.slice(0, prepaidCount)),
    remainingTotal: scheduleTotal(remaining),
    remainingCount: remaining.length,
    next: remaining[0] ?? null,
    last: rows[rows.length - 1],
  }
}

export function validateDebt(v, calc) {
  if (!v.name.trim()) return 'กรอกชื่อรายการ'
  if (!calc) return v.mode === 'calc' ? 'กรอกเงินต้นและจำนวนงวด' : 'กรอกค่างวดและจำนวนงวด'
  if (calc.prepaidOver) {
    return `งวดแรกครบกำหนดใกล้เกินไป ผ่อนมาแล้วได้มากสุด ${calc.maxPrepaid} งวด` +
      (calc.suggestFirstDue ? ` — ตั้งงวดแรกไม่เกิน ${formatThaiDate(calc.suggestFirstDue)}` : '')
  }
  if (v.method === 'transfer' && !v.accountId) return 'เลือกบัญชีที่จะใช้จ่าย'
  return null
}

/**
 * ช่องกรอกหนี้สิน — ใช้ซ้อนในฟอร์มรายจ่าย และในป๊อปอัปจากหน้ากระเป๋าเงิน
 * value/onChange ควบคุมจากข้างนอก
 */
export default function DebtFields({ value: v, onChange, hideName = false }) {
  const set = (k, x) => onChange({ ...v, [k]: x })
  const calc = useMemo(() => computeDebt(v), [v])
  const isRecv = v.direction === 'receivable'

  return (
    <div className="space-y-3">
      <div>
        <label className="label">ทิศทาง</label>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { k: 'payable', t: 'เราติดคนอื่น', d: 'ผ่อนบ้าน ผ่อนรถ เงินกู้' },
            { k: 'receivable', t: 'คนอื่นติดเรา', d: 'ให้ยืมแล้วทยอยคืน' },
          ].map((o) => (
            <button key={o.k} type="button"
              className={`rounded-xl border px-3 py-2 text-left ${v.direction === o.k ? 'border-gray-900 ring-1 ring-gray-900 bg-white' : 'border-gray-200 bg-white'}`}
              onClick={() => set('direction', o.k)}>
              <span className="block text-sm font-medium">{o.t}</span>
              <span className="block text-xs text-gray-500">{o.d}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={`grid gap-2 ${hideName ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {!hideName && (
          <div>
            <label className="label">ชื่อรายการ</label>
            <input className="input" value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="เช่น ผ่อนรถ Yaris" />
          </div>
        )}
        <div>
          <label className="label">{isRecv ? 'ใครยืม' : 'เจ้าหนี้ / ผู้ให้กู้'}</label>
          <input className="input" value={v.counterparty} onChange={(e) => set('counterparty', e.target.value)} placeholder={isRecv ? 'ชื่อคนยืม' : 'เช่น ธนาคารกรุงศรี'} />
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-3">
        <div className="flex gap-1.5">
          {[
            { k: 'known', t: 'รู้ค่างวดอยู่แล้ว' },
            { k: 'calc', t: 'ให้ระบบคำนวณ' },
          ].map((o) => (
            <button key={o.k} type="button"
              className={`btn text-xs py-1 px-3 ${v.mode === o.k ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => set('mode', o.k)}>{o.t}</button>
          ))}
        </div>

        {v.mode === 'known' ? (
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label">งวดละ</label>
              <input className="input text-right" type="number" min="0" value={v.monthly} onChange={(e) => set('monthly', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="label">จำนวนงวด</label>
              <input className="input text-center" type="number" min="1" max="480" value={v.months} onChange={(e) => set('months', e.target.value)} />
            </div>
            <div>
              <label className="label">ทุกวันที่</label>
              <select className="input" value={v.dueDay} onChange={(e) => set('dueDay', e.target.value)}>
                {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="label">เงินต้น</label>
                <input className="input text-right" type="number" min="0" value={v.principal} onChange={(e) => set('principal', e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label className="label">ดอกเบี้ย %/เดือน</label>
                <input className="input text-right" type="number" min="0" step="0.01" value={v.rate} onChange={(e) => set('rate', e.target.value)} />
              </div>
              <div>
                <label className="label">จำนวนงวด</label>
                <input className="input text-center" type="number" min="1" max="480" value={v.months} onChange={(e) => set('months', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="label">ทุกวันที่</label>
                <select className="input" value={v.dueDay} onChange={(e) => set('dueDay', e.target.value)}>
                  {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <p className="text-xs text-amber-800">
              ดอกเบี้ยแบบคงที่จากเงินต้น ถ้าสัญญาเป็นแบบลดต้นลดดอกให้ใช้โหมด "รู้ค่างวดอยู่แล้ว" แล้วลอกค่างวดจากสัญญา
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">งวดแรกครบกำหนด</label>
            <DatePicker value={v.firstDue} onChange={(d) => set('firstDue', d)} placeholder={calc ? formatThaiDate(calc.firstDue) : 'อัตโนมัติ'} />
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs text-amber-900 cursor-pointer select-none mt-1 mb-1">
              <input type="checkbox" className="w-4 h-4 accent-amber-700" checked={v.prepaid} onChange={(e) => set('prepaid', e.target.checked)} />
              <span className="font-medium">เคยผ่อนมาก่อน</span>
            </label>
            {v.prepaid && (
              <div className="flex items-center gap-1.5">
                <input className="input !h-8 w-20 text-center text-sm" type="number" min="0" value={v.prepaidCount} onChange={(e) => set('prepaidCount', e.target.value)} placeholder="0" />
                <span className="text-xs text-amber-900">งวด</span>
              </div>
            )}
          </div>
        </div>

        {calc?.prepaidOver && (
          <div className="text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-700 space-y-1">
            <p className="font-medium">⚠️ งวดแรกครบกำหนดใกล้เกินไป</p>
            <p>ตั้งงวดแรก {formatThaiDate(calc.firstDue)} มีงวดที่ครบกำหนดแล้วมากสุด <strong>{calc.maxPrepaid} งวด</strong></p>
            {calc.suggestFirstDue && (
              <button type="button" className="btn btn-primary text-xs py-1 px-3 mt-1"
                onClick={() => set('firstDue', toDateString(calc.suggestFirstDue))}>
                ใช้งวดแรก {formatThaiDate(calc.suggestFirstDue)} ให้เลย
              </button>
            )}
          </div>
        )}

        <div>
          <label className="label">{isRecv ? 'รับคืนเข้า (ค่าเริ่มต้น)' : 'จ่ายจาก (ค่าเริ่มต้น)'}</label>
          <div className="flex gap-1.5 mb-1.5">
            {[{ k: 'cash', t: '💵 เงินสด' }, { k: 'transfer', t: '🏦 เงินโอน' }].map((o) => (
              <button key={o.k} type="button"
                className={`btn text-xs py-1 px-3 ${v.method === o.k ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => set('method', o.k)}>{o.t}</button>
            ))}
          </div>
          {v.method === 'transfer' && (
            <TransferAccountPicker value={v.accountId} onChange={(id) => set('accountId', id)} label="" />
          )}
        </div>

        {calc && !calc.prepaidOver && (
          <div className="text-xs text-amber-900 bg-white/70 rounded-lg px-3 py-2 space-y-0.5">
            {calc.interest > 0 && (
              <>
                <div className="flex justify-between"><span>เงินต้น</span><span className="tabular-nums">{fmt(calc.principal)}</span></div>
                <div className="flex justify-between"><span>ดอกเบี้ย {v.rate}% × {calc.months} งวด</span><span className="tabular-nums">+ {fmt(calc.interest)}</span></div>
              </>
            )}
            <div className="flex justify-between font-semibold"><span>{calc.months} งวด × {fmt(calc.monthly)}</span><span className="tabular-nums">{fmt(calc.total)}</span></div>
            {calc.prepaidCount > 0 && (
              <>
                <div className="flex justify-between"><span>ผ่อนมาแล้ว {calc.prepaidCount} งวด</span><span className="tabular-nums">− {fmt(calc.paidAlready)}</span></div>
                <div className="flex justify-between font-semibold border-t border-amber-200 pt-0.5"><span>คงเหลือ</span><span className="tabular-nums">{fmt(calc.remainingTotal)}</span></div>
              </>
            )}
            <div className="flex justify-between text-amber-800"><span>เหลืออีก</span><span className="tabular-nums">{calc.remainingCount} งวด</span></div>
            {calc.next && (
              <div className="flex justify-between text-amber-800"><span>งวดถัดไป งวดที่ {calc.next.seq}</span><span className="tabular-nums">{formatThaiDate(calc.next.dueDate)}</span></div>
            )}
            <div className="flex justify-between text-amber-800"><span>หมดสัญญา</span><span className="tabular-nums">{formatThaiDate(calc.last.dueDate)}</span></div>
          </div>
        )}
      </div>
    </div>
  )
}
