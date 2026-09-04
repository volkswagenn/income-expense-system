import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import useDebtStore from '../../store/useDebtStore'
import useLogStore from '../../store/useLogStore'
import { buildLogEntry } from '../../lib/logBuilder'
import { EMPTY_DEBT, computeDebt, validateDebt } from '../../components/shared/DebtFields'
import AmountInput from '../../components/shared/AmountInput'
import DatePicker from '../../components/shared/DatePicker'
import CategorySelect from '../../components/shared/CategorySelect'
import Icon from '../../components/shared/Icon'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt0 = (n) => Math.round(Number(n ?? 0)).toLocaleString('th-TH')

const TERMS = [
  { key: 'short', label: 'ระยะสั้น', sub: 'ผ่อนจบภายใน 1 ปี' },
  { key: 'long', label: 'ระยะยาว', sub: 'ผ่อนนานกว่า 1 ปี' },
]

const MODES = [
  { key: 'ins', label: 'ผ่อนเป็นงวด', sub: 'รู้ค่างวดและจำนวนงวด' },
  { key: 'amt', label: 'ยอดรวมก้อนเดียว', sub: 'ติดตามเป็นเปอร์เซ็นต์ที่คืนแล้ว' },
]

/** การ์ดตัวเลือกแบบสองใบวางคู่กัน — ใช้ทั้งระยะเวลาหนี้และรูปแบบการชำระคืน */
function PickCard({ on, label, sub, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-ctl border px-[13px] py-2.5 transition ${
        on ? 'border-ink shadow-[0_0_0_1px_#16181D] bg-[#F2FAD9]' : 'border-hairline bg-white hover:border-[#C9C5BA]'
      }`}
    >
      <div className="text-[12.5px] font-semibold">{label}</div>
      <div className={`text-[11.5px] mt-[3px] ${on ? 'text-[#5C7A0F]' : 'text-faint'}`}>{sub}</div>
    </button>
  )
}

/** ช่องตัวเลขที่กด − / + ทีละหนึ่ง — ใช้กับจำนวนงวดและงวดที่ผ่อนมาแล้ว */
function Stepper({ value, onChange, min = 0, max = 480 }) {
  const step = (d) => onChange(String(Math.min(max, Math.max(min, (Number(value) || 0) + d))))
  return (
    <div className="h-10 px-1.5 border border-hairline rounded-[11px] bg-white flex items-center gap-1.5">
      <button type="button" onClick={() => step(-1)} className="w-7 h-7 flex-none rounded-lg bg-paper text-[15px] font-bold text-muted hover:bg-hairline">−</button>
      <span className="flex-1 text-center text-[15px] font-bold tabular-nums">{Number(value) || 0}</span>
      <button type="button" onClick={() => step(1)} className="w-7 h-7 flex-none rounded-lg bg-paper text-[15px] font-bold text-muted hover:bg-hairline">+</button>
    </div>
  )
}

/**
 * แท็บ "หนี้สิน" ของหน้าบันทึกรายการ — สร้างสัญญาหนี้ใหม่
 *
 * ทำไมสร้างหนี้ถึงมาอยู่ในหน้าบันทึกรายการ
 *   การรับรู้หนี้ก้อนใหม่คือการบันทึกสิ่งที่เพิ่งเกิดขึ้นวันนี้ เหมือนบันทึกรายจ่าย
 *   ต่างจากหน้า "บัตรและหนี้สิน" ที่เอาไว้ติดตามภาระที่มีอยู่แล้ว
 *
 * ใช้ computeDebt / validateDebt ชุดเดียวกับป๊อปอัปในหน้าจัดการข้อมูล
 * ตัวเลขงวดและดอกเบี้ยจึงออกมาเท่ากันเสมอ ไม่ว่าจะสร้างจากทางไหน
 */
export default function DebtForm({ onPreviewChange }) {
  const createDebt = useDebtStore((s) => s.createDebt)
  const totals = useDebtStore((s) => s.getTotals())
  const { addLog } = useLogStore()

  const [v, setV] = useState(() => ({ ...EMPTY_DEBT, term: 'short', months: '12' }))
  const [mode, setMode] = useState('ins')       // ins = ผ่อนเป็นงวด, amt = ยอดรวมก้อนเดียว
  const [paidPct, setPaidPct] = useState(0)     // ใช้เฉพาะโหมดยอดรวม
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')

  const set = (k, val) => { setV((s) => ({ ...s, [k]: val })); setError('') }
  const calc = useMemo(() => computeDebt(v), [v])

  const months = Math.max(1, Math.round(Number(v.months) || 0))
  const donePeriods = Math.min(months, Math.round(Number(v.prepaidCount) || 0))
  const perMonth = calc?.monthly ?? 0
  const total = calc?.total ?? 0
  const paidAmt = mode === 'ins' ? perMonth * donePeriods : (total * paidPct) / 100
  const leftAmt = Math.max(0, total - paidAmt)
  const pct = total > 0 ? Math.round((paidAmt / total) * 100) : 0

  const submit = async () => {
    const value = { ...v, prepaid: donePeriods > 0, prepaidCount: String(donePeriods) }
    const c = computeDebt(value)
    const err = validateDebt(value, c)
    if (err) return setError(err)

    setBusy(true)
    setError('')
    try {
      const isRecv = value.direction === 'receivable'
      await createDebt({
        direction: value.direction, name: value.name.trim(), counterparty: value.counterparty.trim(),
        categoryId: value.categoryId || null, term: c.term,
        principalAmount: c.principal, totalAmount: c.total, months: c.months,
        monthlyAmount: c.monthly, interestRate: value.mode === 'calc' ? Number(value.rate) || 0 : 0,
        prepaidCount: c.prepaidCount, firstDue: format(c.firstDue, 'yyyy-MM-dd'), dueDay: c.dueDay,
        defaultMethod: value.method, defaultAccountId: value.method === 'transfer' ? value.accountId : null,
      }, c.rows, buildLogEntry({
        activityType: 'DEBT_CREATE',
        description: `${isRecv ? 'ให้ยืม' : 'เพิ่มหนี้'} "${value.name}" ${fmt(c.total)} บาท ${c.months} งวด งวดละ ${fmt(c.monthly)}`,
        newValue: { name: value.name, direction: value.direction, total: c.total, months: c.months, term: c.term },
      }))
      setDone(`บันทึกสัญญา "${value.name.trim()}" แล้ว`)
      setV({ ...EMPTY_DEBT, term: 'short', months: '12' })
      setPaidPct(0)
    } catch (e) {
      setError(e?.message ?? 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  // แผงขวาบอกว่าหนี้ก้อนนี้จะไปรวมอยู่กลุ่มไหนและกลุ่มนั้นจะกลายเป็นเท่าไร
  const bucket = v.term === 'short' ? totals.short ?? 0 : totals.long ?? 0

  useEffect(() => {
    onPreviewChange?.({ kind: 'debt', term: v.term, total, months, monthly: perMonth })
  }, [onPreviewChange, v.term, total, months, perMonth])

  return (
    <div className="pb-2">
      {/* เจ้าหนี้ + วันที่เริ่มสัญญา */}
      <div className="px-5 pt-4 grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <div>
          <label className="flex items-baseline gap-[7px] text-[12.5px] font-semibold mb-1.5">
            เจ้าหนี้ / ผู้ให้กู้
            <span className="text-[11px] font-normal text-faint">ใครเป็นคนให้ยืม</span>
          </label>
          <input
            className="w-full h-11 px-3.5 border border-hairline rounded-ctl bg-white text-[13.5px] outline-none focus:border-ink"
            value={v.counterparty}
            onChange={(e) => set('counterparty', e.target.value)}
            placeholder="เช่น ธนาคารกสิกรไทย · ลีสซิ่ง · ญาติ"
          />
        </div>
        <div>
          <label className="flex items-baseline gap-[7px] text-[12.5px] font-semibold mb-1.5">
            วันที่เริ่มสัญญา
            <span className="text-[11px] font-normal text-faint">ใช้นับงวดถัดไป</span>
          </label>
          <DatePicker value={v.firstDue} onChange={(val) => set('firstDue', val)} placeholder="ไม่ระบุ = งวดถัดไป" />
        </div>
      </div>

      {/* ชื่อสัญญา + หมวดหมู่ */}
      <div className="px-5 pt-4 grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <div>
          <label className="flex items-baseline gap-[7px] text-[12.5px] font-semibold mb-1.5">
            ชื่อสัญญา
            <span className="text-[11px] font-normal text-faint">ใช้เป็นชื่อในรายงานและหน้าหนี้สิน</span>
          </label>
          <input
            className="w-full h-11 px-3.5 border border-ink rounded-ctl bg-white text-[13.5px] outline-none"
            value={v.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="เช่น สินเชื่อรถ"
          />
        </div>
        <div>
          <label className="flex items-baseline gap-[7px] text-[12.5px] font-semibold mb-1.5">
            หมวดหมู่
            <span className="text-[11px] font-normal text-faint">ค่างวดที่จ่ายจะลงหมวดนี้ในรายงาน</span>
          </label>
          <CategorySelect type="expense" value={v.categoryId} onChange={(val) => set('categoryId', val)} />
        </div>
      </div>

      {/* ระยะเวลาหนี้ */}
      <div className="px-5 pt-4">
        <label className="flex items-baseline gap-[7px] text-[12.5px] font-semibold mb-2">
          ระยะเวลาหนี้
          <span className="text-[11px] font-normal text-faint">แยกกลุ่มหนี้ในรายงาน</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {TERMS.map((t) => (
            <PickCard key={t.key} on={v.term === t.key} label={t.label} sub={t.sub} onClick={() => set('term', t.key)} />
          ))}
        </div>
        <p className="text-[11px] text-faint leading-relaxed mt-1.5">
          หนี้ที่มีระยะเวลาชำระคืนมากกว่า 1 ปี นับเป็นหนี้ระยะยาว · ก้อนนี้จะไปรวมอยู่กลุ่ม{v.term === 'short' ? 'ระยะสั้น' : 'ระยะยาว'} ซึ่งตอนนี้มียอดรวม {fmt(bucket)} บาท
        </p>
      </div>

      {/* รูปแบบการชำระคืน */}
      <div className="px-5 pt-4">
        <label className="flex items-baseline gap-[7px] text-[12.5px] font-semibold mb-2">
          รูปแบบการชำระคืน
          <span className="text-[11px] font-normal text-faint">เลือกวิธีที่จะติดตามยอด</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {MODES.map((m) => (
            <PickCard key={m.key} on={mode === m.key} label={m.label} sub={m.sub} onClick={() => setMode(m.key)} />
          ))}
        </div>
      </div>

      {/* ยอดต่องวด — ต้องมีทั้งสองโหมด ต่างกันแค่วิธีนับความคืบหน้า */}
      <div className="px-5 pt-4 grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <div>
          <label className="block text-[12px] font-semibold mb-1.5">
            {mode === 'ins' ? 'ยอดผ่อนต่องวด (บาท)' : 'ยอดหนี้ทั้งก้อน (บาท)'}
          </label>
          <AmountInput
            className="input h-10"
            value={v.monthly}
            onChange={(e) => set('monthly', e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <label className="block text-[12px] font-semibold mb-1.5">วันครบกำหนดของทุกเดือน</label>
          <input
            type="number" min="1" max="31"
            className="input h-10"
            value={v.dueDay}
            onChange={(e) => set('dueDay', e.target.value)}
          />
        </div>
      </div>

      {/* ผ่อนเป็นงวด — จำนวนงวด + งวดที่ผ่อนมาแล้ว + แถบจุด */}
      {mode === 'ins' && (
        <div className="px-5 pt-4">
          <div className="border border-hairline rounded-[14px] px-[15px] py-[13px]">
            <div className="grid grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[12px] font-semibold mb-1.5">จำนวนงวดทั้งหมด</label>
                <Stepper value={v.months} onChange={(val) => set('months', val)} min={1} />
              </div>
              <div>
                <label className="flex items-baseline gap-1.5 text-[12px] font-semibold mb-1.5">
                  ผ่อนมาแล้วกี่งวด
                  <span className="text-[10.5px] font-normal text-faint">กรอกถ้าเริ่มผ่อนไปก่อนแล้ว</span>
                </label>
                <Stepper value={v.prepaidCount} onChange={(val) => set('prepaidCount', val)} min={0} max={months} />
              </div>
            </div>

            {/* จุดหนึ่งจุดคือหนึ่งงวด — เห็นความคืบหน้าได้ทันทีโดยไม่ต้องอ่านตัวเลข */}
            <div className="flex items-center gap-[7px] flex-wrap mt-[11px]">
              {Array.from({ length: Math.min(months, 60) }, (_, i) => (
                <span
                  key={i}
                  className="w-[11px] h-[7px] rounded-[2px] block border"
                  style={{
                    background: i < donePeriods ? '#C7F250' : '#F4F3EF',
                    borderColor: i < donePeriods ? '#A9CE3F' : '#E4E2DC',
                  }}
                />
              ))}
              {months > 60 && <span className="text-[11px] text-faint">+{months - 60} งวด</span>}
            </div>

            <div className="flex items-baseline gap-3.5 flex-wrap mt-2 text-[11.5px] text-faint">
              <span>งวดละ <b className="tabular-nums text-ink">{fmt0(perMonth)}</b></span>
              <span>ชำระคืนแล้ว <b className="tabular-nums text-income">{fmt0(paidAmt)}</b> ({pct}%)</span>
              <span>คงเหลือ <b className="tabular-nums text-expense">{fmt0(leftAmt)}</b></span>
            </div>
          </div>
        </div>
      )}

      {/* ยอดรวมก้อนเดียว — ติดตามด้วยเปอร์เซ็นต์ */}
      {mode === 'amt' && (
        <div className="px-5 pt-4">
          <div className="border border-hairline rounded-[14px] px-[15px] py-[13px]">
            <label className="flex items-baseline gap-[7px] text-[12px] font-semibold mb-1.5">
              ชำระคืนแล้ว
              <span className="text-[10.5px] font-normal text-faint">คิดเป็นเปอร์เซ็นต์ของหนี้ทั้งหมด</span>
            </label>
            <div className="flex items-center gap-2.5">
              <button type="button" onClick={() => setPaidPct((p) => Math.max(0, p - 5))} className="w-8 h-8 flex-none rounded-[9px] bg-paper text-base font-bold text-muted hover:bg-hairline">−</button>
              <span className="flex-none w-[66px] text-center text-[19px] font-bold tabular-nums">{paidPct}%</span>
              <button type="button" onClick={() => setPaidPct((p) => Math.min(100, p + 5))} className="w-8 h-8 flex-none rounded-[9px] bg-paper text-base font-bold text-muted hover:bg-hairline">+</button>
              <span className="flex-1 min-w-0 h-2 bg-hairline rounded-[4px] overflow-hidden block">
                <span className="h-full bg-lime block" style={{ width: `${paidPct}%` }} />
              </span>
            </div>
            <div className="flex items-baseline gap-3.5 flex-wrap mt-2 text-[11.5px] text-faint">
              <span>ชำระคืนแล้ว <b className="tabular-nums text-income">{fmt0(paidAmt)}</b></span>
              <span>คงเหลือ <b className="tabular-nums text-expense">{fmt0(leftAmt)}</b></span>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="mx-5 mt-4 text-[12.5px] text-expense bg-expense-soft border border-[#F0C4BE] rounded-ctl px-3.5 py-2.5">
          {error}
        </p>
      )}
      {done && (
        <p className="mx-5 mt-4 text-[12.5px] text-income bg-income-soft border border-[#BFE0D2] rounded-ctl px-3.5 py-2.5">
          ✓ {done}
        </p>
      )}

      {/* แถบบันทึกของแท็บนี้ */}
      <div className="mt-4 border-t border-[#F2F0EA] px-[18px] py-[13px] flex items-center gap-2.5 flex-wrap">
        <button
          onClick={submit}
          disabled={busy}
          className="h-[50px] w-full justify-center rounded-[14px] lg:h-[42px] lg:w-auto lg:justify-start lg:rounded-ctl px-[22px] bg-ink text-white text-sm font-semibold flex items-center gap-2 hover:brightness-125 disabled:opacity-50"
        >
          {busy ? 'กำลังบันทึก…' : 'บันทึกสัญญาหนี้'}
        </button>
        <span className="text-[11.5px] text-faint leading-relaxed">
          <Icon name="info" size={15} className="inline align-[-3px] mr-1 text-muted" />
          สร้างสัญญาแล้วระบบจะตั้งงวดให้ครบทุกงวด แล้วไปรออยู่ที่หน้ารอดำเนินการตามวันครบกำหนด
        </span>
      </div>
    </div>
  )
}
