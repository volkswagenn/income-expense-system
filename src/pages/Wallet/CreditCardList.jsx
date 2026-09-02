import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { differenceInDays, parseISO } from 'date-fns'
import useCreditCardStore from '../../store/useCreditCardStore'
import useWalletStore from '../../store/useWalletStore'
import useTransactionStore from '../../store/useTransactionStore'
import useCategoryStore from '../../store/useCategoryStore'
import useAppStore from '../../store/useAppStore'
import useLogStore from '../../store/useLogStore'
import { buildLogEntry } from '../../lib/logBuilder'
import { walletTarget } from '../../lib/api/transactions'
import { formatCard } from '../../components/shared/CreditCardPicker'
import { nextClosingDate, formatThaiDate, formatIsoThai, daysUntil } from '../../lib/cardCycle'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import PayCardBillPopup from '../../components/shared/PayCardBillPopup'
import CardCashbackPopup from '../../components/shared/CardCashbackPopup'
import CardAdvancePopup from '../../components/shared/CardAdvancePopup'
import CardFeePopup from '../../components/shared/CardFeePopup'
import BankLogo from '../../components/shared/BankLogo'
import { MONTHS_TH } from '../Manage/CardFormPopup'

const CASHBACK_CATEGORY = 'เครดิตเงินคืนบัตร'
const FEE_CATEGORY = 'ค่าธรรมเนียมบัตร'
const FEE_PREFIX = 'ค่าธรรมเนียมรายปี'

/** ยอดที่ธนาคารจะหักตามที่ผูกไว้ */
export function autopayAmountOf(card, statement) {
  if (!card || !statement || card.autopayMode === 'off') return 0
  const remaining = Number(statement.amount) - Number(statement.paidAmount)
  if (remaining <= 0) return 0
  if (card.autopayMode === 'full') return remaining
  if (card.autopayMode === 'minimum') return Math.min(Number(statement.minimumAmount) || 0, remaining)
  return Math.min(Number(card.autopayAmount) || 0, remaining)
}

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

/**
 * การ์ดบัตรหนึ่งใบบนหน้ากระเป๋าเงิน — งานประจำวันเท่านั้น
 * (จ่ายบิล กดเงินสด เงินคืน ค่าธรรมเนียม ย้อนรายการ)
 * การเพิ่ม/แก้ไข/ลบบัตรอยู่ที่ จัดการข้อมูล → บัตรเครดิต
 */
function CardRow({ card, onPay, onUndoPay, onCashback, onAutopay, onAdvance, onUndoAdvance, onFee }) {
  const [showHistory, setShowHistory] = useState(false)
  const notifyDays = useAppStore((s) => s.notifyDaysBefore)
  const statements = useCreditCardStore((s) => s.getStatements(card.id))
  const current = useCreditCardStore((s) => s.getCurrentCycle(card.id))
  const advances = useCreditCardStore((s) => s.getAdvances(card.id))

  const unpaid = statements
    .filter((s) => s.status !== 'paid')
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
  const bill = unpaid[0] ?? null
  const paidHistory = statements.filter((s) => s.status === 'paid')
  const unbilledAdvances = advances.filter((a) => !a.statementId)

  // วงเงินที่ใช้ไปนับยอดผ่อนที่ยังไม่ถูกเรียกเก็บด้วย เพราะธนาคารกันวงเงิน
  // ไว้เต็มก้อนตั้งแต่วันที่ซื้อ ไม่ได้กันทีละงวด
  const usage = useCreditCardStore((s) => s.getCardLimitUsage(card.id))
  const debt = Number(card.outstanding) || 0
  const credit = debt < 0 ? -debt : 0
  // เครดิตในบัตร (outstanding ติดลบ) ไม่ได้เพิ่มวงเงิน แค่ยังไม่ได้ใช้ — แถบจึงเริ่มที่ศูนย์
  const used = Math.max(0, usage?.used ?? debt)
  const limit = usage?.limit ?? 0
  const pct = limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0
  const overLimit = usage?.over ?? false

  const closing = nextClosingDate(card.closingDay)
  const daysToClosing = daysUntil(closing)
  const alert = bill ? alertOf(bill.dueDate, notifyDays) : null

  // แสดงการ์ดยืนยันเมื่อใกล้ถึงหรือเลยวันครบกำหนดแล้วเท่านั้น
  const autopayDue = bill && daysUntil(new Date(bill.dueDate + 'T00:00:00')) <= notifyDays
    ? autopayAmountOf(card, bill)
    : 0

  // เงินคืนโดยประมาณของรอบนี้ — ตัวเลขคาดการณ์ล้วน ไม่แตะยอดหนี้และไม่เข้ารายงาน
  const estCashback = Number(card.cashbackRate) > 0 && current?.spend > 0
    ? (current.spend * Number(card.cashbackRate)) / 100
    : 0

  // ค่าธรรมเนียมรายปี — เตือนเฉพาะเดือนที่ตั้งไว้ และยังไม่ได้บันทึกของปีนี้
  const thisYear = String(new Date().getFullYear())
  const feeRecorded = useTransactionStore((s) => s.transactions.some((t) =>
    t.cardId === card.id && t.type === 'expense'
    && String(t.date ?? '').startsWith(thisYear)
    && String(t.itemName ?? '').startsWith(FEE_PREFIX)
  ))
  const hasFee = Number(card.annualFee) > 0
  const feeDue = hasFee && Number(card.annualFeeMonth) === new Date().getMonth() + 1 && !feeRecorded

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
          <p className="text-xs text-gray-400">{credit > 0 ? 'เครดิตคงเหลือ' : 'ยอดหนี้รวม'}</p>
          <p className={`font-bold tabular-nums ${debt > 0 ? 'text-rose-600' : credit > 0 ? 'text-emerald-600' : 'text-gray-500'}`}>
            {fmt(Math.abs(debt))}
          </p>
        </div>
      </div>

      {credit > 0 && (
        <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
          💚 มีเครดิตในบัตร {fmt(credit)} บาท จากการจ่ายเกินหรือเงินคืน ระบบจะหักออกจากบิลรอบถัดไปให้เอง
        </p>
      )}

      {feeDue && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-800">
            🧾 เดือน {MONTHS_TH[card.annualFeeMonth - 1]} ธนาคารเรียกเก็บค่าธรรมเนียมรายปี{' '}
            <strong className="tabular-nums">{fmt(card.annualFee)}</strong> บาท
            {' '}ถ้าได้รับการยกเว้นก็ไม่ต้องกด
          </p>
          <button className="btn btn-primary text-xs mt-2" onClick={() => onFee(card)}>
            บันทึกค่าธรรมเนียม
          </button>
        </div>
      )}

      {/* ผูกหักบัญชีไว้และถึงกำหนดแล้ว — เตรียมรายการไว้ให้ เหลือแค่กดยืนยัน
          ไม่หักเงินเอง เพราะแอปไม่มีทางรู้ว่าธนาคารหักสำเร็จจริงหรือไม่ */}
      {bill && autopayDue > 0 && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
          <p className="text-xs text-indigo-800">
            🏦 ธนาคารจะหัก <strong className="tabular-nums">{fmt(autopayDue)}</strong> บาท
            {card.autopayMode === 'minimum' && ' (ขั้นต่ำ)'}
            {card.autopayMode === 'fixed' && ' (จำนวนคงที่)'}
            {' '}จากบัญชีที่ผูกไว้ ในวันที่ {formatIsoThai(bill.dueDate)}
          </p>
          <button className="btn btn-primary text-xs mt-2" onClick={() => onAutopay(card, bill, autopayDue)}>
            ยืนยันว่าถูกหักแล้ว
          </button>
        </div>
      )}

      {/* บิลที่ปิดรอบแล้วและยังจ่ายไม่ครบ */}
      {bill && (
        <div className={`rounded-xl border p-3 ${alert.box}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={`text-xs font-medium ${alert.text}`}>
                ยอดที่ต้องชำระ · ครบกำหนด {formatIsoThai(bill.dueDate)}
                {alert.label && ` · ${alert.label}`}
              </p>
              <p className={`text-xl font-bold tabular-nums ${alert.text}`}>
                {fmt(Number(bill.amount) - Number(bill.paidAmount))}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                ขั้นต่ำ {fmt(bill.minimumAmount)}
                {Number(bill.paidAmount) > 0 && ` · จ่ายไปแล้ว ${fmt(bill.paidAmount)}`}
                {Number(bill.previousBalance) > 0 && ` · ยกมา ${fmt(bill.previousBalance)}`}
                {Number(bill.previousBalance) < 0 && ` · หักเครดิต ${fmt(-bill.previousBalance)}`}
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
                  {current.advance > 0 && ` · กดเงินสด ${fmt(current.advance)}`}
                </span>
              </p>
            </div>
            {estCashback > 0 && (
              <p className="text-xs text-emerald-600 shrink-0 text-right">
                เงินคืนโดยประมาณ<br />≈ {fmt(estCashback)}
              </p>
            )}
          </div>

          {unbilledAdvances.length > 0 && (
            <div className="border-t border-gray-200 mt-2 pt-2 space-y-1">
              {unbilledAdvances.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-xs gap-2">
                  <span className="text-gray-500 truncate">
                    🏧 กดเงินสด {formatIsoThai(a.date)}
                    {Number(a.fee) > 0 && ` · ค่าธรรมเนียม ${fmt(a.fee)}`}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="tabular-nums text-gray-700">{fmt(a.amount)}</span>
                    <button
                      className="text-gray-400 hover:text-red-600"
                      onClick={() => onUndoAdvance(card, a)}
                      title="ย้อนการกดเงินสดนี้"
                    >
                      ย้อน
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
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

      <div className="flex gap-2 justify-end items-center flex-wrap">
        {paidHistory.length > 0 && (
          <button
            className="text-xs text-gray-400 hover:text-gray-600 mr-auto"
            onClick={() => setShowHistory((v) => !v)}
          >
            {showHistory ? '▲ ซ่อนบิลที่จ่ายแล้ว' : `▼ บิลที่จ่ายแล้ว ${paidHistory.length} รอบ`}
          </button>
        )}
        <button className="btn btn-secondary text-xs py-1 px-2.5" onClick={() => onAdvance(card)}>
          กดเงินสด
        </button>
        {hasFee && !feeDue && (
          <button className="btn btn-secondary text-xs py-1 px-2.5" onClick={() => onFee(card)}>
            ค่าธรรมเนียมรายปี
          </button>
        )}
        <button className="btn btn-secondary text-xs py-1 px-2.5" onClick={() => onCashback(card, estCashback)}>
          บันทึกเงินคืน
        </button>
        <Link to="/manage/cards" className="text-xs text-gray-400 hover:text-gray-600 px-1" title="แก้ไขข้อมูลบัตรที่ จัดการข้อมูล">
          แก้ไขบัตร
        </Link>
      </div>

      {showHistory && (
        <div className="border-t pt-2 space-y-1.5">
          {paidHistory.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-xs gap-2">
              <span className="text-gray-500">
                รอบ {s.cycle} · ครบกำหนด {formatIsoThai(s.dueDate)}
                {s.paidAt && <span className="text-emerald-600"> · จ่าย {formatIsoThai(s.paidAt)}</span>}
                {Number(s.paidAmount) > Number(s.amount) && (
                  <span className="text-emerald-600"> · จ่ายเกิน {fmt(Number(s.paidAmount) - Number(s.amount))}</span>
                )}
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
  const { ensureStatements, payStatement, undoPayment, cashAdvance, undoAdvance } = useCreditCardStore()
  const getCardLabel = useCreditCardStore((s) => s.getCardLabel)
  const refreshCards = useCreditCardStore((s) => s.refresh)
  const refreshWallet = useWalletStore((s) => s.refresh)
  const refreshTransactions = useTransactionStore((s) => s.refresh)
  const addTransaction = useTransactionStore((s) => s.addTransaction)
  const categories = useCategoryStore((s) => s.categories)
  const addCategory = useCategoryStore((s) => s.addCategory)
  const { addLog } = useLogStore()

  const [payTarget, setPayTarget] = useState(null)          // { card, statement }
  const [undoTarget, setUndoTarget] = useState(null)        // { card, statement }
  const [cashbackTarget, setCashbackTarget] = useState(null) // { card, estimate }
  const [autopayTarget, setAutopayTarget] = useState(null)   // { card, statement, amount }
  const [advanceTarget, setAdvanceTarget] = useState(null)   // card
  const [undoAdvanceTarget, setUndoAdvanceTarget] = useState(null) // { card, advance }
  const [feeTarget, setFeeTarget] = useState(null)           // card
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // เผื่อกรณีเปิดหน้านี้ค้างไว้ข้ามวันสรุปยอด — DataGate ปิดรอบให้ตอนเปิดแอปอยู่แล้ว
  // เรียกซ้ำไม่เสียหาย ฐานข้อมูลกันด้วย unique (card_id, cycle)
  useEffect(() => {
    ensureStatements()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn) => {
    if (busy) return
    setBusy(true)
    setError('')
    try { await fn() } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  // หมวดหมู่พิเศษของบัตร แยกไว้ไม่ให้ปนกับรายได้/รายจ่ายจริงตอนดูรายงาน สร้างครั้งแรกครั้งเดียว
  const ensureCategory = async (name, type) => {
    const found = categories.find((c) => c.type === type && c.name === name && !c.deleted)
    if (found) return found.id
    return (await addCategory(name, type))?.id ?? null
  }

  const handlePay = ({ method, accountId, amount, date }) => run(async () => {
    const { card, statement } = payTarget
    const remaining = Number(statement.amount) - Number(statement.paidAmount)
    await payStatement(statement.id, {
      method,
      accountId,
      amount,
      date,
      log: buildLogEntry({
        activityType: 'CARD_PAYMENT',
        description:
          `จ่ายบิลบัตร "${formatCard(card)}" รอบ ${statement.cycle} ` +
          `${fmt(amount)} บาท จาก${method === 'cash' ? 'เงินสด' : 'เงินโอน'}` +
          (amount > remaining ? ` (จ่ายเกิน ${fmt(amount - remaining)} เป็นเครดิตในบัตร)` : ''),
        walletEffect: { target: method, delta: -amount, transferAccountId: accountId },
        newValue: { statementId: statement.id, cardId: card.id, amount, date, method },
      }),
    })
    // เงินออกจากกระเป๋าที่เซิร์ฟเวอร์แล้ว ดึงยอดจริงกลับมา
    await refreshWallet()
    setPayTarget(null)
  })

  /**
   * บันทึกเงินคืนเข้าบัตร
   *
   * ไม่มีกลไกพิเศษ — เป็นรายรับที่ปลายทางเป็นบัตร ฐานข้อมูลกลับเครื่องหมายให้เอง
   * หนี้ลดลงพอดี และยอดไปโผล่ในรายงานรายรับให้เลย
   */
  const handleCashback = ({ kind, amount, date, note }) => run(async () => {
    const { card } = cashbackTarget
    const categoryId = await ensureCategory(CASHBACK_CATEGORY, 'income')
    const label = kind === 'refund' ? 'คืนสินค้าเข้าบัตร' : 'เครดิตเงินคืน'
    const target = walletTarget('card', { cardId: card.id })
    await addTransaction({
      date,
      type: 'income',
      amount,
      method: 'card',
      cardId: card.id,
      category: categoryId,
      itemName: `${label} — ${formatCard(card)}`,
      otherIncomeType: label,
      note: note || null,
    }, {
      effect: { target, delta: +amount },
      log: buildLogEntry({
        activityType: 'CARD_CASHBACK',
        description: `${label} ${fmt(amount)} บาท เข้าบัตร "${formatCard(card)}"`,
        walletEffect: { target: 'card', delta: +amount, cardId: card.id },
        newValue: { cardId: card.id, amount, date, kind },
      }),
    })
    await refreshCards()
    setCashbackTarget(null)
  })

  /**
   * ค่าธรรมเนียมรายปี — รายจ่ายธรรมดาที่รูดบนบัตร เข้าบิลรอบนั้นเหมือนยอดรูดทั่วไป
   * ชื่อรายการขึ้นต้นด้วย FEE_PREFIX เพื่อให้การ์ดรู้ว่าปีนี้บันทึกแล้ว ไม่เตือนซ้ำ
   */
  const handleFee = ({ amount, date, note }) => run(async () => {
    const card = feeTarget
    const categoryId = await ensureCategory(FEE_CATEGORY, 'expense')
    const target = walletTarget('card', { cardId: card.id })
    await addTransaction({
      date,
      type: 'expense',
      amount,
      method: 'card',
      cardId: card.id,
      category: categoryId,
      itemName: `${FEE_PREFIX} — ${formatCard(card)}`,
      note: note || null,
    }, {
      effect: { target, delta: -amount },
      log: buildLogEntry({
        activityType: 'CARD_FEE',
        description: `ค่าธรรมเนียมรายปี ${fmt(amount)} บาท บัตร "${formatCard(card)}"`,
        walletEffect: { target: 'card', delta: -amount, cardId: card.id },
        newValue: { cardId: card.id, amount, date },
      }),
    })
    await refreshCards()
    setFeeTarget(null)
  })

  /**
   * กดเงินสดจากบัตร — ย้ายเงินจากบัตรเข้ากระเป๋า ไม่ใช่รายจ่าย
   * ค่าธรรมเนียมเท่านั้นที่เป็นรายจ่าย (RPC สร้างให้) ทั้งคู่เข้าบิลรอบที่กด
   */
  const handleAdvance = ({ amount, fee, target, date, note }) => run(async () => {
    const card = advanceTarget
    const toCash = target === 'cash'
    await cashAdvance(card.id, {
      amount, fee, target, date, note,
      log: buildLogEntry({
        activityType: 'CARD_ADVANCE',
        description:
          `กดเงินสด ${fmt(amount)} บาท จากบัตร "${formatCard(card)}"` +
          (fee > 0 ? ` ค่าธรรมเนียม ${fmt(fee)} บาท` : '') +
          ` เข้า${toCash ? 'เงินสด' : 'บัญชีเงินโอน'}`,
        walletEffect: {
          target: toCash ? 'cash' : 'transfer',
          delta: +amount,
          transferAccountId: toCash ? null : target.split(':')[1],
        },
        newValue: { cardId: card.id, amount, fee, target, date },
      }),
    })
    await Promise.all([refreshWallet(), refreshTransactions()])
    setAdvanceTarget(null)
  })

  const handleUndoAdvance = () => run(async () => {
    const { card, advance } = undoAdvanceTarget
    await undoAdvance(advance.id, buildLogEntry({
      activityType: 'CARD_ADVANCE_UNDO',
      description: `ย้อนการกดเงินสด ${fmt(advance.amount)} บาท จากบัตร "${formatCard(card)}"`,
      oldValue: advance,
    }))
    await Promise.all([refreshWallet(), refreshTransactions()])
    setUndoAdvanceTarget(null)
  })

  /** ยืนยันว่าธนาคารหักบัญชีไปแล้วจริง — บันทึกเป็นการจ่ายบิลตามปกติ */
  const handleAutopayConfirm = () => run(async () => {
    const { card, statement, amount } = autopayTarget
    await payStatement(statement.id, {
      method: 'transfer',
      accountId: card.autopayAccountId,
      amount,
      date: statement.dueDate,
      log: buildLogEntry({
        activityType: 'CARD_AUTOPAY',
        description:
          `ยืนยันหักบัญชีอัตโนมัติ บัตร "${formatCard(card)}" รอบ ${statement.cycle} ` +
          `${fmt(amount)} บาท`,
        walletEffect: { target: 'transfer', delta: -amount, transferAccountId: card.autopayAccountId },
        newValue: { statementId: statement.id, cardId: card.id, amount, mode: card.autopayMode },
      }),
    })
    await refreshWallet()
    setAutopayTarget(null)
  })

  const handleUndoPay = () => run(async () => {
    const { card, statement } = undoTarget
    const amount = Number(statement.paidAmount)
    await undoPayment(statement.id, amount, buildLogEntry({
      activityType: 'CARD_PAYMENT_UNDO',
      description: `ย้อนการจ่ายบิลบัตร "${formatCard(card)}" รอบ ${statement.cycle} ${fmt(amount)} บาท`,
      oldValue: statement,
      newValue: { statementId: statement.id, cardId: card.id, amount },
    }))
    await refreshWallet()
    setUndoTarget(null)
  })

  const totalOutstanding = cards.reduce((sum, c) => sum + (Number(c.outstanding) || 0), 0)

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-gray-500">
          รูดบัตรแล้วยอดจะมาสะสมเป็นหนี้ที่นี่ ไม่ตัดเงินสดหรือเงินโอน
          ระบบปิดรอบและคิดยอดที่ต้องชำระให้เองเมื่อถึงวันสรุปยอด
        </p>
        <Link to="/manage/cards" className="btn btn-secondary text-xs shrink-0">จัดการบัตร</Link>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">⚠️ {error}</p>}

      {cards.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <div className="text-3xl mb-2">💳</div>
          <p className="text-sm">ยังไม่มีบัตรเครดิต</p>
          <p className="text-xs mt-1">
            เพิ่มบัตรได้ที่{' '}
            <Link to="/manage/cards" className="text-blue-600 hover:underline">จัดการข้อมูล → บัตรเครดิต</Link>
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2.5">
            {cards.map((card) => (
              <CardRow
                key={card.id}
                card={card}
                onPay={(c, s) => setPayTarget({ card: c, statement: s })}
                onUndoPay={(c, s) => setUndoTarget({ card: c, statement: s })}
                onCashback={(c, estimate) => setCashbackTarget({ card: c, estimate })}
                onAutopay={(c, s, amount) => setAutopayTarget({ card: c, statement: s, amount })}
                onAdvance={(c) => setAdvanceTarget(c)}
                onUndoAdvance={(c, a) => setUndoAdvanceTarget({ card: c, advance: a })}
                onFee={(c) => setFeeTarget(c)}
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

      {payTarget && (
        <PayCardBillPopup
          statement={payTarget.statement}
          cardLabel={getCardLabel(payTarget.card.id)}
          onConfirm={handlePay}
          onCancel={() => setPayTarget(null)}
          busy={busy}
        />
      )}

      {cashbackTarget && (
        <CardCashbackPopup
          cardLabel={getCardLabel(cashbackTarget.card.id)}
          estimate={cashbackTarget.estimate}
          onConfirm={handleCashback}
          onCancel={() => setCashbackTarget(null)}
          busy={busy}
        />
      )}

      {advanceTarget && (
        <CardAdvancePopup
          cardLabel={getCardLabel(advanceTarget.id)}
          onConfirm={handleAdvance}
          onCancel={() => setAdvanceTarget(null)}
          busy={busy}
        />
      )}

      {feeTarget && (
        <CardFeePopup
          cardLabel={getCardLabel(feeTarget.id)}
          defaultAmount={Number(feeTarget.annualFee) || 0}
          onConfirm={handleFee}
          onCancel={() => setFeeTarget(null)}
          busy={busy}
        />
      )}

      <ConfirmPopup
        open={!!undoAdvanceTarget}
        title="ย้อนการกดเงินสด"
        message={
          undoAdvanceTarget
            ? `ดึงเงิน ${fmt(undoAdvanceTarget.advance.amount)} บาท กลับออกจาก${undoAdvanceTarget.advance.target === 'cash' ? 'เงินสด' : 'บัญชีเงินโอน'} หนี้บัตรลดลงเท่าเดิม`
              + (Number(undoAdvanceTarget.advance.fee) > 0 ? ` และลบรายจ่ายค่าธรรมเนียม ${fmt(undoAdvanceTarget.advance.fee)} บาท` : '')
              + '\n\nยืนยันหรือไม่?'
            : ''
        }
        onConfirm={handleUndoAdvance}
        onCancel={() => setUndoAdvanceTarget(null)}
        confirmLabel="ย้อนการกดเงิน"
        danger
      />

      <ConfirmPopup
        open={!!autopayTarget}
        title="ยืนยันการหักบัญชี"
        message={
          autopayTarget
            ? `ยืนยันว่าธนาคารหัก ${fmt(autopayTarget.amount)} บาท จากบัญชีที่ผูกไว้แล้วจริง?\n\nระบบจะบันทึกเป็นการจ่ายบิลรอบ ${autopayTarget.statement.cycle} ลงวันที่ ${autopayTarget.statement.dueDate}\n\nกดยืนยันเฉพาะเมื่อเช็คแล้วว่าเงินถูกหักจริง ถ้าเงินไม่พอหรือธนาคารหักไม่สำเร็จ อย่ากดยืนยัน`
            : ''
        }
        onConfirm={handleAutopayConfirm}
        onCancel={() => setAutopayTarget(null)}
        confirmLabel="ยืนยันว่าถูกหักแล้ว"
      />

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
    </div>
  )
}
