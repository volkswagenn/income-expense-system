import { useState, useEffect } from 'react'
import { differenceInDays, parseISO } from 'date-fns'
import useCreditCardStore from '../../store/useCreditCardStore'
import useWalletStore from '../../store/useWalletStore'
import useAppStore from '../../store/useAppStore'
import useLogStore from '../../store/useLogStore'
import { buildLogEntry } from '../../lib/logBuilder'
import { formatCard } from '../../components/shared/CreditCardPicker'
import { nextClosingDate, formatThaiDate, daysUntil } from '../../lib/cardCycle'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import PayCardBillPopup from '../../components/shared/PayCardBillPopup'
import BankSelect from '../../components/shared/BankSelect'
import BankLogo from '../../components/shared/BankLogo'
import { BANKS } from '../../lib/banks'

const BANK_NAMES = BANKS.map((b) => b.name)
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

/** สีเตือนตามวันครบกำหนด — ชุดเดียวกับรายการค้างชำระ */
function alertOf(dueDate, notifyDays) {
  if (!dueDate) return { box: 'bg-gray-50 border-gray-200', text: 'text-gray-700' }
  try {
    const diff = differenceInDays(parseISO(dueDate), new Date())
    if (diff < 0) return { box: 'bg-red-100 border-red-400', text: 'text-red-800', label: `เกินกำหนด ${Math.abs(diff)} วัน` }
    if (diff <= notifyDays) return { box: 'bg-red-50 border-red-300', text: 'text-red-700', label: `อีก ${diff} วัน` }
    return { box: 'bg-amber-50 border-amber-200', text: 'text-amber-800', label: `อีก ${diff} วัน` }
  } catch {
    return { box: 'bg-gray-50 border-gray-200', text: 'text-gray-700' }
  }
}

function CardFormPopup({ card, onSave, onClose }) {
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
  const [showMore, setShowMore] = useState(false)
  const [error, setError] = useState('')

  const clear = (fn) => (v) => { fn(v); setError('') }

  const submit = () => {
    const bank = useCustom ? customBank.trim() : bankName
    if (!bank) return setError('เลือกหรือพิมพ์ชื่อธนาคาร')
    if (!name.trim()) return setError('กรอกชื่อบัตร')
    if (last4 && !/^\d{4}$/.test(last4.trim())) return setError('เลขสี่ตัวท้ายต้องเป็นตัวเลข 4 หลัก')
    onSave({
      bankName: bank,
      name: name.trim(),
      last4: last4.trim(),
      creditLimit: Number(creditLimit) || 0,
      outstanding: Number(outstanding) || 0,
      closingDay: Number(closingDay) || 25,
      dueDay: Number(dueDay) || 15,
      cashbackRate: Number(cashbackRate) || 0,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between sticky top-0">
          <h3 className="font-semibold text-base">💳 {isEdit ? 'แก้ไขบัตร' : 'เพิ่มบัตรเครดิต'}</h3>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onClose}>×</button>
        </div>

        <div className="p-5 space-y-4">
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
              <input
                className="input"
                value={name}
                onChange={(e) => clear(setName)(e.target.value)}
                placeholder="เช่น บัตรหลัก"
              />
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
            <input
              className="input"
              type="number"
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
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="label">วงเงิน (บาท)</label>
                <input
                  className="input"
                  type="number"
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
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">⚠️ {error}</p>}
        </div>

        <div className="px-5 py-4 border-t bg-gray-50 flex gap-2 justify-end sticky bottom-0">
          <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" onClick={submit}>{isEdit ? 'บันทึก' : 'เพิ่มบัตร'}</button>
        </div>
      </div>
    </div>
  )
}

function CardRow({ card, onEdit, onDelete, onPay, onUndoPay }) {
  const [showHistory, setShowHistory] = useState(false)
  const notifyDays = useAppStore((s) => s.notifyDaysBefore)
  const statements = useCreditCardStore((s) => s.getStatements(card.id))
  const current = useCreditCardStore((s) => s.getCurrentCycle(card.id))

  const unpaid = statements
    .filter((s) => s.status !== 'paid')
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
  const bill = unpaid[0] ?? null
  const paidHistory = statements.filter((s) => s.status === 'paid')

  // วงเงินที่ใช้ไปนับยอดผ่อนที่ยังไม่ถูกเรียกเก็บด้วย เพราะธนาคารกันวงเงิน
  // ไว้เต็มก้อนตั้งแต่วันที่ซื้อ ไม่ได้กันทีละงวด
  const usage = useCreditCardStore((s) => s.getCardLimitUsage(card.id))
  const debt = Number(card.outstanding) || 0
  const used = usage?.used ?? debt
  const limit = usage?.limit ?? 0
  const pct = limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0
  const overLimit = usage?.over ?? false

  const closing = nextClosingDate(card.closingDay)
  const daysToClosing = daysUntil(closing)
  const alert = bill ? alertOf(bill.dueDate, notifyDays) : null

  // เงินคืนโดยประมาณของรอบนี้ — ตัวเลขคาดการณ์ล้วน ไม่แตะยอดหนี้และไม่เข้ารายงาน
  const estCashback = Number(card.cashbackRate) > 0 && current?.spend > 0
    ? (current.spend * Number(card.cashbackRate)) / 100
    : 0

  return (
    <div className="rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <BankLogo bankName={card.bankName} size="md" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">{formatCard(card)}</p>
          <p className="text-xs text-gray-500">
            สรุปยอด {formatThaiDate(closing)}
            {daysToClosing >= 0 && <span className="text-gray-400"> (อีก {daysToClosing} วัน)</span>}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-gray-400">ยอดหนี้รวม</p>
          <p className={`font-bold tabular-nums ${debt > 0 ? 'text-rose-600' : 'text-gray-500'}`}>
            {fmt(debt)}
          </p>
        </div>
      </div>

      {/* บิลที่ปิดรอบแล้วและยังจ่ายไม่ครบ */}
      {bill && (
        <div className={`rounded-xl border p-3 ${alert.box}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={`text-xs font-medium ${alert.text}`}>
                ยอดที่ต้องชำระ · ครบกำหนด {bill.dueDate}
                {alert.label && ` · ${alert.label}`}
              </p>
              <p className={`text-xl font-bold tabular-nums ${alert.text}`}>
                {fmt(Number(bill.amount) - Number(bill.paidAmount))}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                ขั้นต่ำ {fmt(bill.minimumAmount)}
                {Number(bill.paidAmount) > 0 && ` · จ่ายไปแล้ว ${fmt(bill.paidAmount)}`}
                {Number(bill.previousBalance) > 0 && ` · ยกมา ${fmt(bill.previousBalance)}`}
              </p>
            </div>
            <button className="btn btn-primary text-xs shrink-0" onClick={() => onPay(card, bill)}>
              จ่ายบิล
            </button>
          </div>
          {unpaid.length > 1 && (
            <p className="text-xs text-gray-600 mt-2">
              มีบิลค้างอีก {unpaid.length - 1} รอบ รวมทั้งหมด{' '}
              {fmt(unpaid.reduce((s, b) => s + Number(b.amount) - Number(b.paidAmount), 0))} บาท
            </p>
          )}
        </div>
      )}

      {/* รอบที่ยังเดินอยู่ — คำนวณสดจากรายการ ยังไม่ปิดจึงยังไม่ต้องจ่าย */}
      {current && (
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-gray-500">
                รอบถัดไปสะสมแล้ว · ครบกำหนด {formatThaiDate(current.due)}
              </p>
              <p className="text-sm font-semibold tabular-nums text-gray-700">
                {fmt(current.net)}
                <span className="text-xs font-normal text-gray-400 ml-1.5">
                  {current.count} รายการ
                </span>
              </p>
            </div>
            {estCashback > 0 && (
              <p className="text-xs text-emerald-600 shrink-0 text-right">
                เงินคืนโดยประมาณ<br />≈ {fmt(estCashback)}
              </p>
            )}
          </div>
        </div>
      )}

      {limit > 0 && (
        <div>
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full ${overLimit ? 'bg-rose-500' : 'bg-rose-300'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1 tabular-nums">
            ใช้ไป {fmt(used)} จากวงเงิน {fmt(limit)}
            {overLimit
              ? <span className="text-rose-500"> · เกินวงเงิน {fmt(used - limit)}</span>
              : ` · เหลือ ${fmt(limit - used)}`}
            {usage?.unbilled > 0 && (
              <span className="block text-gray-400">
                รวมยอดผ่อนที่ยังไม่ถูกเรียกเก็บ {fmt(usage.unbilled)} ซึ่งธนาคารกันวงเงินไว้แล้ว
              </span>
            )}
          </p>
        </div>
      )}

      <div className="flex gap-2 justify-end items-center">
        {paidHistory.length > 0 && (
          <button
            className="text-xs text-gray-400 hover:text-gray-600 mr-auto"
            onClick={() => setShowHistory((v) => !v)}
          >
            {showHistory ? '▲ ซ่อนบิลที่จ่ายแล้ว' : `▼ บิลที่จ่ายแล้ว ${paidHistory.length} รอบ`}
          </button>
        )}
        <button className="btn btn-secondary text-xs py-1 px-2.5" onClick={() => onEdit(card)}>แก้ไข</button>
        <button className="btn btn-secondary text-xs py-1 px-2.5 text-red-600" onClick={() => onDelete(card)}>ลบ</button>
      </div>

      {showHistory && (
        <div className="border-t pt-2 space-y-1.5">
          {paidHistory.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-xs gap-2">
              <span className="text-gray-500">
                รอบ {s.cycle} · ครบกำหนด {s.dueDate}
                {s.paidAt && <span className="text-emerald-600"> · จ่าย {s.paidAt}</span>}
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="tabular-nums text-gray-700">{fmt(s.amount)}</span>
                {Number(s.paidAmount) > 0 && (
                  <button
                    className="text-gray-400 hover:text-red-600"
                    onClick={() => onUndoPay(card, s)}
                    title="ย้อนการจ่ายบิลนี้"
                  >
                    ย้อน
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function CreditCardList() {
  const cards = useCreditCardStore((s) => s.cards)
  const { createCard, updateCard, deleteCard, adjustOutstanding, ensureStatements, payStatement, undoPayment } =
    useCreditCardStore()
  const getCardLabel = useCreditCardStore((s) => s.getCardLabel)
  const refreshWallet = useWalletStore((s) => s.refresh)
  const { addLog } = useLogStore()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [payTarget, setPayTarget] = useState(null)      // { card, statement }
  const [undoTarget, setUndoTarget] = useState(null)    // { card, statement }
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // เผื่อกรณีเปิดหน้านี้ค้างไว้ข้ามวันสรุปยอด — DataGate ปิดรอบให้ตอนเปิดแอปอยู่แล้ว
  // เรียกซ้ำไม่เสียหาย ฐานข้อมูลกันด้วย unique (card_id, cycle)
  useEffect(() => {
    ensureStatements()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => { setEditing(null); setFormOpen(true); setError('') }
  const openEdit = (card) => { setEditing(card); setFormOpen(true); setError('') }

  const handleSave = async (data) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      if (editing) {
        await updateCard(editing.id, {
          bankName: data.bankName,
          name: data.name,
          last4: data.last4 || null,
          creditLimit: data.creditLimit,
          closingDay: data.closingDay,
          dueDay: data.dueDay,
          cashbackRate: data.cashbackRate,
        })
        // ยอดหนี้ต้องไปทาง RPC เสมอ ส่งเป็นส่วนต่าง ไม่เขียนทับยอด
        const delta = data.outstanding - Number(editing.outstanding || 0)
        if (delta !== 0) {
          await adjustOutstanding(editing.id, delta)
          await addLog(buildLogEntry({
            activityType: 'CARD_ADJUST',
            description: `ปรับยอดหนี้บัตร "${data.name}" ${fmt(editing.outstanding)} → ${fmt(data.outstanding)} บาท`,
            oldValue: { outstanding: editing.outstanding },
            newValue: { cardId: editing.id, outstanding: data.outstanding },
          }))
        } else {
          await addLog(buildLogEntry({
            activityType: 'CARD_UPDATE',
            description: `แก้ไขบัตรเครดิต "${data.name}"`,
            oldValue: editing,
            newValue: { ...editing, ...data },
          }))
        }
      } else {
        const card = await createCard(data)
        await addLog(buildLogEntry({
          activityType: 'CARD_CREATE',
          description: `เพิ่มบัตรเครดิต "${data.bankName} — ${data.name}"${data.outstanding ? ` ยอดยกมา ${fmt(data.outstanding)} บาท` : ''}`,
          newValue: card,
        }))
      }
      setFormOpen(false)
      setEditing(null)
      await ensureStatements()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    const card = confirmDelete
    if (!card || busy) return
    setBusy(true)
    setError('')
    try {
      await deleteCard(card.id)
      await addLog(buildLogEntry({
        activityType: 'CARD_DELETE',
        description: `ลบบัตรเครดิต "${formatCard(card)}"`,
        oldValue: card,
      }))
      setConfirmDelete(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handlePay = async ({ method, accountId, amount, date }) => {
    const { card, statement } = payTarget
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await payStatement(statement.id, {
        method,
        accountId,
        amount,
        date,
        log: buildLogEntry({
          activityType: 'CARD_PAYMENT',
          description:
            `จ่ายบิลบัตร "${formatCard(card)}" รอบ ${statement.cycle} ` +
            `${fmt(amount)} บาท จาก${method === 'cash' ? 'เงินสด' : 'เงินโอน'}`,
          walletEffect: { target: method, delta: -amount, transferAccountId: accountId },
          newValue: { statementId: statement.id, cardId: card.id, amount, date, method },
        }),
      })
      // เงินออกจากกระเป๋าที่เซิร์ฟเวอร์แล้ว ดึงยอดจริงกลับมา
      await refreshWallet()
      setPayTarget(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleUndoPay = async () => {
    const { card, statement } = undoTarget
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const amount = Number(statement.paidAmount)
      await undoPayment(statement.id, amount, buildLogEntry({
        activityType: 'CARD_PAYMENT_UNDO',
        description: `ย้อนการจ่ายบิลบัตร "${formatCard(card)}" รอบ ${statement.cycle} ${fmt(amount)} บาท`,
        oldValue: statement,
        newValue: { statementId: statement.id, cardId: card.id, amount },
      }))
      await refreshWallet()
      setUndoTarget(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const totalOutstanding = cards.reduce((sum, c) => sum + (Number(c.outstanding) || 0), 0)

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-gray-500">
          รูดบัตรแล้วยอดจะมาสะสมเป็นหนี้ที่นี่ ไม่ตัดเงินสดหรือเงินโอน
          ระบบปิดรอบและคิดยอดที่ต้องชำระให้เองเมื่อถึงวันสรุปยอด
        </p>
        <button className="btn btn-primary text-xs shrink-0" onClick={openCreate}>
          + เพิ่มบัตร
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">⚠️ {error}</p>}

      {cards.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <div className="text-3xl mb-2">💳</div>
          <p className="text-sm">ยังไม่มีบัตรเครดิต</p>
          <p className="text-xs mt-1">กด "เพิ่มบัตร" เพื่อเริ่มบันทึกรายจ่ายผ่านบัตร</p>
        </div>
      ) : (
        <>
          <div className="space-y-2.5">
            {cards.map((card) => (
              <CardRow
                key={card.id}
                card={card}
                onEdit={openEdit}
                onDelete={setConfirmDelete}
                onPay={(c, s) => setPayTarget({ card: c, statement: s })}
                onUndoPay={(c, s) => setUndoTarget({ card: c, statement: s })}
              />
            ))}
          </div>
          {cards.length > 1 && (
            <div className="flex items-center justify-between text-sm border-t pt-2.5">
              <span className="text-gray-500">ยอดหนี้รวมทุกใบ</span>
              <span className="font-bold tabular-nums text-rose-600">{fmt(totalOutstanding)} บาท</span>
            </div>
          )}
        </>
      )}

      {formOpen && (
        <CardFormPopup
          card={editing}
          onSave={handleSave}
          onClose={() => { setFormOpen(false); setEditing(null) }}
        />
      )}

      {payTarget && (
        <PayCardBillPopup
          statement={payTarget.statement}
          cardLabel={getCardLabel(payTarget.card.id)}
          onConfirm={handlePay}
          onCancel={() => setPayTarget(null)}
          busy={busy}
        />
      )}

      <ConfirmPopup
        open={!!undoTarget}
        title="ย้อนการจ่ายบิล"
        message={
          undoTarget
            ? `คืนเงิน ${fmt(undoTarget.statement.paidAmount)} บาท กลับเข้า${undoTarget.statement.paidMethod === 'cash' ? 'เงินสด' : 'บัญชีเงินโอน'} และหนี้บัตรจะกลับมาเท่าเดิม\n\nยืนยันหรือไม่?`
            : ''
        }
        onConfirm={handleUndoPay}
        onCancel={() => setUndoTarget(null)}
        confirmLabel="ย้อนการจ่าย"
        danger
      />

      <ConfirmPopup
        open={!!confirmDelete}
        title="ลบบัตรเครดิต"
        message={
          confirmDelete
            ? `ลบ "${formatCard(confirmDelete)}" ที่มียอดหนี้ ${fmt(confirmDelete.outstanding)} บาท?\n\nรายการที่เคยรูดบัตรใบนี้จะยังอยู่ในประวัติและรายงานเหมือนเดิม แต่จะเลือกบัตรใบนี้ในฟอร์มไม่ได้อีก`
            : ''
        }
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
        confirmLabel="ลบบัตร"
        danger
      />
    </div>
  )
}
