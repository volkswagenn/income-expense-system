import { useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import useDebtStore from '../../store/useDebtStore'
import useCategoryStore from '../../store/useCategoryStore'
import useLogStore from '../../store/useLogStore'
import { buildLogEntry } from '../../lib/logBuilder'
import { formatIsoThai } from '../../lib/cardCycle'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import CategorySelect from '../../components/shared/CategorySelect'
import DebtFields, { EMPTY_DEBT, computeDebt, validateDebt } from '../../components/shared/DebtFields'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

/** ระยะของหนี้ (แบบ Wallet Story) — ระยะสั้นคือผ่อนจบภายใน 1 ปี */
export const TERMS = {
  short: { label: 'ระยะสั้น', cls: 'bg-sky-50 text-sky-700 border-sky-200', note: 'ผ่อนจบภายใน 1 ปี' },
  long:  { label: 'ระยะยาว', cls: 'bg-violet-50 text-violet-700 border-violet-200', note: 'ผ่อนนานกว่า 1 ปี' },
}

const STATUS = {
  active:    { label: 'กำลังผ่อน', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  completed: { label: 'ผ่อนครบ',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'ยกเลิก',   cls: 'bg-gray-50 text-gray-400 border-gray-200' },
}

/** เพิ่มหนี้สิน — ย้ายมาจากหน้ากระเป๋าเงิน DebtFields มีหมวดหมู่กับระยะให้เลือกแล้ว */
function DebtFormPopup({ onSave, onClose, busy }) {
  const [v, setV] = useState({ ...EMPTY_DEBT })
  const [error, setError] = useState('')
  const calc = computeDebt(v)
  const submit = () => {
    const err = validateDebt(v, calc)
    if (err) return setError(err)
    onSave(v, calc)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
        <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between sticky top-0">
          <h3 className="font-semibold text-base">📒 เพิ่มหนี้สิน</h3>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-5">
          <DebtFields value={v} onChange={(x) => { setV(x); setError('') }} />
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-3">⚠️ {error}</p>}
        </div>
        <div className="px-5 py-4 border-t bg-gray-50 flex gap-2 justify-end sticky bottom-0">
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? '⏳' : 'บันทึกหนี้สิน'}</button>
        </div>
      </div>
    </div>
  )
}

/**
 * แก้ไขหนี้สิน — แก้ได้ทุกอย่างเหมือนตอนสร้าง รวมยอด จำนวนงวด และวันครบกำหนด
 *
 * เดิมแก้ได้แค่ชื่อกับหมายเหตุ เพราะกลัวไปทับงวดที่จ่ายเงินไปแล้ว แต่คนกรอกผิด
 * ตั้งแต่แรกก็มี การบังคับให้ยกเลิกแล้วสร้างใหม่ทำให้ประวัติการจ่ายที่ถูกต้องอยู่แล้ว
 * หายไปด้วย ซึ่งแย่กว่าปัญหาเดิม
 *
 * ฝั่งฐานข้อมูลจะไม่แตะงวดที่จ่ายผ่านระบบไปแล้วเลย (ดู edit_debt ใน debt.sql)
 * ตรงนี้จึงบอกผู้ใช้ให้ชัดว่าอะไรจะถูกสร้างใหม่และอะไรจะคงเดิม
 */
function DebtEditPopup({ debt, entries = [], onSave, onClose, busy }) {
  const paidCount = entries.filter((e) => e.status === 'paid').length
  const prepaidCount = entries.filter((e) => e.status === 'prepaid').length

  // แปลงสัญญาที่บันทึกไว้กลับเป็นค่าในฟอร์ม เพื่อให้แก้ต่อจากของเดิมได้
  const [v, setV] = useState(() => ({
    ...EMPTY_DEBT,
    direction: debt.direction ?? 'payable',
    name: debt.name ?? '',
    counterparty: debt.counterparty ?? '',
    categoryId: debt.categoryId ?? '',
    note: debt.note ?? '',
    term: debt.term ?? 'long',
    mode: Number(debt.interestRate) > 0 ? 'calc' : 'known',
    monthly: String(debt.monthlyAmount ?? ''),
    principal: String(debt.principalAmount ?? ''),
    rate: String(debt.interestRate ?? '0'),
    months: String(debt.months ?? ''),
    dueDay: String(debt.dueDay ?? ''),
    firstDue: debt.firstDue ?? '',
    prepaid: (debt.prepaidCount ?? 0) > 0,
    prepaidCount: String(debt.prepaidCount ?? ''),
    method: debt.defaultMethod ?? 'transfer',
    accountId: debt.defaultAccountId ?? '',
  }))
  const [error, setError] = useState('')
  const calc = computeDebt(v)

  const submit = () => {
    const err = validateDebt(v, calc)
    if (err) return setError(err)
    if (calc.months < paidCount) {
      return setError(`ลดเหลือ ${calc.months} งวดไม่ได้ เพราะจ่ายผ่านระบบไปแล้ว ${paidCount} งวด`)
    }
    onSave(v, calc)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
        <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between sticky top-0">
          <h3 className="font-semibold text-base">📒 แก้ไขหนี้สิน</h3>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onClose}>×</button>
        </div>

        <div className="p-5">
          {paidCount > 0 && (
            <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3">
              จ่ายผ่านระบบไปแล้ว {paidCount} งวด — งวดเหล่านี้จะไม่ถูกแตะ แก้ได้เฉพาะงวดที่ยังไม่จ่าย
            </p>
          )}

          <DebtFields value={v} onChange={(x) => { setV(x); setError('') }} />

          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mt-3">
            กดบันทึกแล้วตารางงวดที่ยังไม่จ่ายจะถูกสร้างใหม่ตามค่าที่แก้
            {prepaidCount > 0 && ' รวมงวดที่ทำเครื่องหมายว่าจ่ายมาก่อนใช้ระบบด้วย'}
          </p>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-3">⚠️ {error}</p>}
        </div>

        <div className="px-5 py-4 border-t bg-gray-50 flex gap-2 justify-end sticky bottom-0">
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? '⏳' : 'บันทึก'}</button>
        </div>
      </div>
    </div>
  )
}

function DebtRow({ debt, categoryName, onEdit, onCancelDebt }) {
  const progress = useDebtStore((s) => s.getProgress(debt.id))
  const isRecv = debt.direction === 'receivable'
  const term = TERMS[debt.term] ?? TERMS.long
  const status = STATUS[debt.status] ?? STATUS.active
  return (
    <div className="rounded-xl border border-gray-200 p-3.5 flex items-center gap-3">
      <span className="text-2xl leading-none">{isRecv ? '🤝' : '📒'}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-medium text-gray-800 truncate">{debt.name}</p>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${term.cls}`}>{term.label}</span>
          {debt.status !== 'active' && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${status.cls}`}>{status.label}</span>
          )}
        </div>
        <p className="text-xs text-gray-500 truncate">
          {isRecv ? 'คนอื่นติดเรา' : 'เราติดคนอื่น'}
          {debt.counterparty && ` · ${debt.counterparty}`}
          {categoryName && ` · ${categoryName}`}
        </p>
        {progress && (
          <p className="text-xs text-gray-400 truncate">
            {progress.doneCount}/{debt.months} งวด · งวดละ {fmt(debt.monthlyAmount)}
            {progress.next && ` · งวดถัดไป ${formatIsoThai(progress.next.dueDate)}`}
          </p>
        )}
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs text-gray-400">คงเหลือ</p>
        <p className={`font-bold tabular-nums text-sm ${isRecv ? 'text-emerald-600' : 'text-amber-700'}`}>
          {fmt(progress?.remainingAmount ?? 0)}
        </p>
      </div>
      <div className="flex gap-1 shrink-0">
        <button className="text-xs text-blue-500 hover:text-blue-700 px-1.5 py-1" onClick={() => onEdit(debt)}>แก้ไข</button>
        {debt.status === 'active' && (
          <button className="text-xs text-red-400 hover:text-red-600 px-1.5 py-1" onClick={() => onCancelDebt(debt, progress)}>ยกเลิก</button>
        )}
      </div>
    </div>
  )
}

export default function DebtManage() {
  const debts = useDebtStore((s) => s.debts)
  const { createDebt, editDebt, cancelDebt, getProgress, getEntries } = useDebtStore()
  const categories = useCategoryStore((s) => s.categories)
  const { addLog } = useLogStore()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [showDone, setShowDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async (fn) => {
    if (busy) return
    setBusy(true); setError('')
    try { await fn() } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const categoryName = (id) => categories.find((c) => c.id === id)?.name ?? ''

  const handleCreate = (v, calc) => run(async () => {
    const isRecv = v.direction === 'receivable'
    await createDebt({
      direction: v.direction, name: v.name.trim(), counterparty: v.counterparty.trim(),
      categoryId: v.categoryId || null, term: calc.term,
      principalAmount: calc.principal, totalAmount: calc.total, months: calc.months,
      monthlyAmount: calc.monthly, interestRate: v.mode === 'calc' ? Number(v.rate) || 0 : 0,
      prepaidCount: calc.prepaidCount, firstDue: format(calc.firstDue, 'yyyy-MM-dd'), dueDay: calc.dueDay,
      defaultMethod: v.method, defaultAccountId: v.method === 'transfer' ? v.accountId : null,
    }, calc.rows, buildLogEntry({
      activityType: 'DEBT_CREATE',
      description: `${isRecv ? 'ให้ยืม' : 'เพิ่มหนี้'} "${v.name}" ${fmt(calc.total)} บาท ${calc.months} งวด งวดละ ${fmt(calc.monthly)} (${TERMS[calc.term].label})` + (calc.prepaidCount ? ` · ผ่อนมาแล้ว ${calc.prepaidCount} งวด` : ''),
      newValue: { name: v.name, direction: v.direction, total: calc.total, months: calc.months, term: calc.term, prepaid: calc.prepaidCount },
    }))
    setFormOpen(false)
  })

  const handleEdit = (v, calc) => run(async () => {
    const debt = editing
    await editDebt(debt.id, {
      name: v.name.trim(), counterparty: v.counterparty.trim(),
      categoryId: v.categoryId || null, term: calc.term,
      principalAmount: calc.principal, totalAmount: calc.total, months: calc.months,
      monthlyAmount: calc.monthly, interestRate: v.mode === "calc" ? Number(v.rate) || 0 : 0,
      prepaidCount: calc.prepaidCount, firstDue: format(calc.firstDue, "yyyy-MM-dd"), dueDay: calc.dueDay,
      note: v.note,
      defaultMethod: v.method, defaultAccountId: v.method === "transfer" ? v.accountId : null,
    }, calc.rows, buildLogEntry({
      activityType: "DEBT_UPDATE",
      description:
        `แก้ไขหนี้สิน "${debt.name}"${v.name.trim() !== debt.name ? ` → "${v.name.trim()}"` : ""} ` +
        `${fmt(calc.total)} บาท ${calc.months} งวด งวดละ ${fmt(calc.monthly)}`,
      oldValue: debt,
      newValue: { name: v.name, total: calc.total, months: calc.months, term: calc.term, dueDay: calc.dueDay },
    }))
    setEditing(null)
  })

  const handleCancel = () => run(async () => {
    const { debt, progress } = cancelTarget
    await cancelDebt(debt.id, buildLogEntry({
      activityType: 'DEBT_CANCEL',
      description: `ยกเลิก "${debt.name}" เหลือ ${progress?.remainingCount ?? 0} งวด`,
      oldValue: debt,
    }))
    setCancelTarget(null)
  })

  const active = debts.filter((d) => d.status === 'active')
  const done = debts.filter((d) => d.status !== 'active')

  // สรุปหนี้ที่เราติดคนอื่น แยกระยะสั้น/ยาว แบบหน้าหนี้สินของ Wallet Story
  const byTerm = active
    .filter((d) => d.direction === 'payable')
    .reduce((acc, d) => {
      const k = d.term === 'short' ? 'short' : 'long'
      acc[k] += getProgress(d.id)?.remainingAmount ?? 0
      return acc
    }, { short: 0, long: 0 })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-semibold text-gray-900">📒 หนี้สิน</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            สัญญาผ่อน เงินกู้ และเงินที่ให้คนอื่นยืม — จ่ายค่างวดที่{' '}
            <Link to="/wallet" className="text-blue-600 hover:underline">หน้ากระเป๋าเงิน</Link>
          </p>
        </div>
        <button className="btn btn-primary text-xs" onClick={() => setFormOpen(true)}>+ เพิ่มหนี้สิน</button>
      </div>

      {(byTerm.short > 0 || byTerm.long > 0) && (
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(TERMS).map(([k, t]) => (
            <div key={k} className={`rounded-xl border px-3.5 py-2.5 ${t.cls}`}>
              <p className="text-xs">{t.label} · {t.note}</p>
              <p className="font-bold tabular-nums">{fmt(byTerm[k])}</p>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">⚠️ {error}</p>}

      {active.length === 0 && done.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <p className="text-4xl mb-3">📒</p>
          <p className="text-sm">ยังไม่มีหนี้สิน</p>
          <p className="text-xs mt-1">ผ่อนบ้าน ผ่อนรถ เงินกู้ หรือเงินที่ให้คนอื่นยืม</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {active.map((d) => (
              <DebtRow key={d.id} debt={d} categoryName={categoryName(d.categoryId)}
                onEdit={setEditing}
                onCancelDebt={(debt, progress) => setCancelTarget({ debt, progress })} />
            ))}
          </div>
          {done.length > 0 && (
            <div>
              <button className="text-xs text-gray-500 hover:text-gray-700" onClick={() => setShowDone((v) => !v)}>
                {showDone ? '▲ ซ่อนที่จบแล้ว' : `▼ ที่จบแล้ว ${done.length} รายการ`}
              </button>
              {showDone && (
                <div className="space-y-2 mt-2">
                  {done.map((d) => (
                    <DebtRow key={d.id} debt={d} categoryName={categoryName(d.categoryId)}
                      onEdit={setEditing} onCancelDebt={() => {}} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {formOpen && <DebtFormPopup onSave={handleCreate} onClose={() => setFormOpen(false)} busy={busy} />}
      {editing && (
        <DebtEditPopup
          debt={editing}
          entries={getEntries(editing.id)}
          onSave={handleEdit}
          onClose={() => setEditing(null)}
          busy={busy}
        />
      )}

      <ConfirmPopup open={!!cancelTarget} title="ยกเลิกหนี้สิน"
        message={cancelTarget
          ? `ยกเลิกงวดที่เหลือ ${cancelTarget.progress?.remainingCount ?? 0} งวด (${fmt(cancelTarget.progress?.remainingAmount ?? 0)} บาท) ของ "${cancelTarget.debt.name}"?\n\nงวดที่จ่ายไปแล้วยังอยู่ เพราะเกิดขึ้นจริง`
          : ''}
        onConfirm={handleCancel} onCancel={() => setCancelTarget(null)} confirmLabel="ยกเลิกหนี้สิน" danger />
    </div>
  )
}
