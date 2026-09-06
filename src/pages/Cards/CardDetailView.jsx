import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import useCreditCardStore from '../../store/useCreditCardStore'
import useWalletStore from '../../store/useWalletStore'
import useTransactionStore from '../../store/useTransactionStore'
import useCategoryStore from '../../store/useCategoryStore'
import usePendingStore from '../../store/usePendingStore'
import useAppStore from '../../store/useAppStore'
import useLogStore from '../../store/useLogStore'
import { buildLogEntry } from '../../lib/logBuilder'
import { walletTarget } from '../../lib/api/transactions'
import { formatCard } from '../../components/shared/CreditCardPicker'
import { nextClosingDate, formatThaiDate, formatIsoThai, formatIsoThaiShort, daysUntil, cyclePeriod, toDateString, clampedDate } from '../../lib/cardCycle'
import AppIcon from '../../components/shared/AppIcon'
import { DEFAULT_ICONS } from '../../lib/defaultIcons'
import Icon from '../../components/shared/Icon'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import PayCardBillPopup from '../../components/shared/PayCardBillPopup'
import CardCashbackPopup from '../../components/shared/CardCashbackPopup'
import CardAdvancePopup from '../../components/shared/CardAdvancePopup'
import CardFeePopup from '../../components/shared/CardFeePopup'
import CardChargePopup from '../../components/shared/CardChargePopup'
import EditTransactionPopup from '../../components/shared/EditTransactionPopup'
import { cancelTransaction as cancelTx, describeTxCancelEffects } from '../../lib/transactionActions'
import PayInstallmentPopup from '../Recurring/PayInstallmentPopup'
import InstallmentFormPopup from '../../components/shared/InstallmentFormPopup'
import RowMenu from '../../components/shared/RowMenu'
import { MONTHS_TH } from '../Manage/CardFormPopup'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })
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

const AUTOPAY_LABEL = { full: '(เต็มจำนวน)', minimum: '(ขั้นต่ำ)', fixed: '(จำนวนคงที่)' }

/** ป้ายกำกับชนิดของรายการในบิล */
const TAG_TONE = {
  'รูดบัตร': 'bg-paper text-muted',
  'งวดผ่อน': 'bg-recurring-soft text-[#5A3C90]',
  // งวดของรอบก่อนที่บิลใบนี้กวาดมารวม — สีเข้มกว่าเพื่อให้เห็นว่าไม่ใช่งวดปกติของรอบ
  'งวดตกค้าง': 'bg-pending-soft text-[#8A6A15]',
  'กดเงินสด': 'bg-[#FBEFE4] text-[#B4571E]',
  'ค่าธรรมเนียม': 'bg-pending-soft text-[#8A6A15]',
  'เงินคืน': 'bg-income-soft text-income',
}

function Meta({ label, value }) {
  return (
    <div className="flex items-baseline gap-2.5 py-1.5 border-t border-[#F6F4EF]">
      <span className="flex-none w-[130px] text-[11.5px] text-faint">{label}</span>
      <span className="tabular-nums flex-1 min-w-0 text-xs font-medium text-right">{value}</span>
    </div>
  )
}

/**
 * สีป้ายงวด — สามสถานะที่ต้องแยกออกจากกันให้ได้ในแวบเดียว
 *   จ่ายแล้ว = เขียว · งวดของแถวนี้ = กล่องขาวขอบเข้ม · เข้าบิลแล้วรอจ่ายบิล = ชมพู
 *   ยังไม่ถึงรอบ = เทาจาง
 *
 * งวดที่กำลังถูกเก็บต้องเป็นกล่องขาว ไม่ใช่เทาแบบเดียวกับงวดที่ยังมาไม่ถึง
 * เพราะสองอย่างนี้คนละเรื่องกันโดยสิ้นเชิง อันหนึ่งต้องเตรียมเงินไว้เดี๋ยวนี้
 * อีกอันยังไม่ต้องทำอะไร ถ้าสีเหมือนกันก็ต้องไล่อ่านวันที่ทุกป้ายถึงจะรู้
 */
const PIP_TONE = {
  // จ่ายแล้วทันกำหนด
  paid:    'bg-lime border-[#A9CF3A] text-ink',
  prepaid: 'bg-lime border-[#A9CF3A] text-ink',
  // จ่ายแล้วแต่ช้ากว่าวันครบกำหนด — ข้างในเขียว (จ่ายแล้วจริง) กรอบแดง (ช้า)
  paidLate: 'bg-lime border-expense text-ink shadow-[0_0_0_1px_#C03A2D]',
  // งวดที่ค้างอยู่ตอนนี้ ยังไม่ถึงกำหนด
  current: 'bg-white border-ink text-ink shadow-[0_0_0_1px_#16181D]',
  // เลยวันครบกำหนดแล้วยังไม่จ่าย แต่ยังไม่ถึงวันตัดรอบถัดไป — กรอบแดง
  overdue: 'bg-white border-expense text-expense shadow-[0_0_0_1px_#C03A2D]',
  // ค้างข้ามวันตัดรอบถัดไปไปแล้ว — แดงทึบ ไม่มีข้อแก้ตัวแล้ว
  overdueHard: 'bg-expense border-expense text-white',
  // เข้าบิลไปแล้ว ยังไม่ถึงกำหนด และไม่ใช่งวดที่เน้น — ชมพูจาง
  billed:  'bg-expense-soft border-[#F0C4BE] text-[#A93A2E]',
  pending: 'bg-paper border-hairline text-faint',
}
const PIP_LABEL = {
  paid: 'จ่ายแล้ว',
  prepaid: 'จ่ายมาก่อนเริ่มใช้แอป',
  billed: 'เข้าบิลแล้ว รอจ่ายบิล',
  pending: 'ยังไม่ถึงกำหนด',
}

/**
 * ป้ายงวดผ่อนในแถวรายการ — งวดละหนึ่งป้าย พร้อมวันครบกำหนดของงวดนั้น
 *
 * ของเดิมเป็นจุดเปล่า ซึ่งบอกได้แค่ "จ่ายไปกี่งวดแล้ว" ซึ่งเป็นตัวเลขที่เขียนไว้เป็น
 * ตัวหนังสือข้างๆ อยู่แล้ว จุดจึงกินที่ไปเปล่าๆ คำถามที่แถวนี้ยังตอบไม่ได้สักทีคือ
 * "งวดไหนครบกำหนดวันไหน" วันที่จึงย้ายเข้ามาอยู่ในป้ายเลย
 *
 * ป้ายกว้างเท่าเนื้อหาพอดีและตัดบรรทัดเอง จึงลงในที่ว่างของแถวได้โดยไม่ดันคอลัมน์อื่น
 */
/** วันที่แบบ 'YYYY-MM-DD' ตามเวลาเครื่อง จากค่าที่อาจเป็น date หรือ timestamptz */
const dayOf = (v) => {
  if (!v) return null
  const s = String(v)
  if (!s.includes('T')) return s.slice(0, 10)
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s.slice(0, 10) : toDateString(d)
}

function EntryPips({ rows, currentSeq: currentSeqProp = null, closingDay = null }) {
  const list = (rows ?? []).filter((r) => r.status !== 'cancelled')
  if (list.length === 0) return null
  // แสดงทุกงวดไม่ตัด — สัญญา 84 งวดก็ต้องเห็นครบ ป้ายตัดบรรทัดเองตามความกว้าง
  // (เคยตัดที่ 12 แล้วขึ้น "+72 งวด" ซึ่งซ่อนสิ่งที่คนเปิดหน้านี้มาดูพอดี)
  const shown = list
  const today = toDateString(new Date())
  // งวดที่เน้น = งวดที่ผู้ใช้ค้างอยู่จริงตอนนี้: งวดแรกที่ยังไม่จ่าย ไม่ว่าจะเข้าบิลแล้ว
  // (billed) หรือกำลังจะเข้า (pending) — ตามที่ธนาคารมอง งวดที่เข้าบิลแล้วแต่ยังไม่จ่าย
  // ยังเป็นภาระของงวดนั้น ไม่ได้ถูกเลื่อนไปงวดถัดไป ที่เรียกใช้ระบุมาแทนได้
  const currentSeq = currentSeqProp
    ?? list.find((r) => r.status !== 'paid' && r.status !== 'prepaid')?.seq
    ?? null
  // วันตัดรอบถัดจากรอบของงวดนี้ — ค้างข้ามวันนี้ไปคือค้างจริงจัง ไม่ใช่แค่ช้าไม่กี่วัน
  // (รหัสรอบคือเดือนที่ตัด ใช้เป็นเลขเดือน 0-based ของเดือนถัดไปได้พอดี)
  const nextCutoffOf = (r) => {
    const [y, m] = String(r.cycle ?? '').split('-').map(Number)
    if (!y || !m || !closingDay) return null
    return toDateString(clampedDate(y, m, closingDay))
  }
  // สามคำถามเรียงตามลำดับ: จ่ายหรือยัง → จ่ายทันไหม / ค้างนานแค่ไหน → เป็นงวดที่เน้นไหม
  const toneOf = (r) => {
    if (r.status === 'prepaid') return PIP_TONE.prepaid
    if (r.status === 'paid') {
      const paidDay = dayOf(r.paidAt)
      return paidDay && r.dueDate && paidDay > r.dueDate ? PIP_TONE.paidLate : PIP_TONE.paid
    }
    if (r.dueDate && today > r.dueDate) {
      const cut = nextCutoffOf(r)
      return cut && today > cut ? PIP_TONE.overdueHard : PIP_TONE.overdue
    }
    if (r.seq === currentSeq) return PIP_TONE.current
    return r.status === 'billed' ? PIP_TONE.billed : PIP_TONE.pending
  }
  const labelOf = (r) => {
    if (r.status === 'paid') {
      const paidDay = dayOf(r.paidAt)
      return paidDay && r.dueDate && paidDay > r.dueDate ? `จ่ายแล้ว แต่ช้ากว่ากำหนด (${formatIsoThai(paidDay)})` : 'จ่ายแล้วทันกำหนด'
    }
    if (r.status !== 'prepaid' && r.dueDate && today > r.dueDate) {
      const cut = nextCutoffOf(r)
      return cut && today > cut ? 'ค้างข้ามวันตัดรอบถัดไปแล้ว' : 'เลยกำหนดแล้ว ยังไม่จ่าย'
    }
    if (r.seq === currentSeq && r.status === 'pending') return 'งวดที่ค้างอยู่ตอนนี้'
    return PIP_LABEL[r.status] ?? r.status
  }
  return (
    // เรียงต่อกันแล้วตัดบรรทัดเหมือนเดิม แต่ป้ายทุกใบกว้างเท่ากัน (กำหนดตายตัว ไม่ยืดตามช่อง)
    // ขอบป้ายจึงตรงกันเป็นคอลัมน์โดยไม่ต้องใช้ตาราง ซึ่งจะยืดป้ายให้เต็มแถวจนดูหนา
    // 86px คือความกว้างที่เคสยาวสุด "28 มี.ค. 69" (วันสองหลัก + เดือน 4 ตัวอักษร + ปี พ.ศ.)
    // ยังอยู่ครบในฟอนต์ 9.5px — แคบกว่านี้ปีจะถูกตัดเป็น … ซึ่งคือสิ่งที่ผู้ใช้ทักมา
    <span className="flex flex-wrap gap-1">
      {shown.map((r) => (
        <span
          key={r.seq}
          title={'งวดที่ ' + r.seq + ' จาก ' + list.length + ' · ครบกำหนด ' + formatIsoThai(r.dueDate)
            + ' · ' + fmt(r.amount) + ' บาท · '
            + labelOf(r)}
          className={'flex items-center gap-1 w-[86px] flex-none h-[17px] px-1.5 rounded-[5px] border text-[9.5px] leading-none tabular-nums whitespace-nowrap '
            + toneOf(r)}
        >
          {/* เลขงวดกว้างคงที่ชิดขวา เส้นคั่นทุกใบจึงอยู่ตำแหน่งเดียวกันทั้งคอลัมน์ */}
          <span className="font-bold w-[13px] text-right flex-none">{r.seq}</span>
          <span className="w-px h-[9px] bg-current opacity-30 flex-none" />
          <span className="opacity-80">{formatIsoThaiShort(r.dueDate)}</span>
        </span>
      ))}
    </span>
  )
}

/**
 * หน้ารายละเอียดบัตรหนึ่งใบ — ตามแบบ mockup
 *
 * ซ้าย: หัวบัตร → แจ้งเตือน (หักบัญชี/ค่าธรรมเนียม/เครดิต) → บิลที่ต้องจ่าย →
 *       รอบถัดไปที่สะสมอยู่ → แถบวงเงิน → ปุ่มลัด → รายการในรอบบิล
 * ขวา: ข้อมูลบัตร · ผ่อนผ่านบัตรใบนี้ · บิลที่จ่ายแล้ว
 */
export default function CardDetailView({ cardId }) {
  const card = useCreditCardStore((s) => s.getCard(cardId))
  const statements = useCreditCardStore((s) => s.getStatements(cardId))
  const current = useCreditCardStore((s) => s.getCurrentCycle(cardId))
  const advances = useCreditCardStore((s) => s.getAdvances(cardId))
  const usage = useCreditCardStore((s) => s.getCardLimitUsage(cardId))
  const installments = useCreditCardStore((s) => s.getActiveInstallments(cardId))
  const allEntries = useCreditCardStore((s) => s.entries)
  const rowMarks = useCreditCardStore((s) => s.rowMarks)
  const markRow = useCreditCardStore((s) => s.markRow)
  const unmarkRow = useCreditCardStore((s) => s.unmarkRow)
  const getInstallmentProgress = useCreditCardStore((s) => s.getInstallmentProgress)
  const getStatementBreakdown = useCreditCardStore((s) => s.getStatementBreakdown)
  const isPayableStatement = useCreditCardStore((s) => s.isPayableStatement)
  const getUncoveredTransactions = useCreditCardStore((s) => s.getUncoveredTransactions)
  const notifyDays = useAppStore((s) => s.notifyDaysBefore)
  const transactions = useTransactionStore((s) => s.transactions)
  const getCategoryName = useCategoryStore((s) => s.getCategoryName)
  const { pendingPayments, taxInvoices, pendingIncomes } = usePendingStore()

  const {
    ensureStatements, payStatement, undoPayment, cashAdvance, undoAdvance, payEntry,
  } = useCreditCardStore()
  const deleteInstallment = useCreditCardStore((s) => s.deleteInstallment)
  const cancelInstallment = useCreditCardStore((s) => s.cancelInstallment)
  const attachTxToStatement = useCreditCardStore((s) => s.attachTransactionToStatement)
  const detachTxFromStatement = useCreditCardStore((s) => s.detachTransactionFromStatement)
  const refreshCards = useCreditCardStore((s) => s.refresh)
  const refreshWallet = useWalletStore((s) => s.refresh)
  const refreshTransactions = useTransactionStore((s) => s.refresh)
  const addTransaction = useTransactionStore((s) => s.addTransaction)
  const categories = useCategoryStore((s) => s.categories)
  const addCategory = useCategoryStore((s) => s.addCategory)
  const { addLog } = useLogStore()

  const [payTarget, setPayTarget] = useState(null)
  const [undoTarget, setUndoTarget] = useState(null)
  const [cashbackTarget, setCashbackTarget] = useState(null)
  const [autopayTarget, setAutopayTarget] = useState(null)
  const [advanceTarget, setAdvanceTarget] = useState(null)
  const [undoAdvanceTarget, setUndoAdvanceTarget] = useState(null)
  const [feeTarget, setFeeTarget] = useState(null)
  const [payEntryTarget, setPayEntryTarget] = useState(null)
  // null = ปิดอยู่, { installment } = แก้ใบนั้น, { installment: null } = เพิ่มใหม่บนบัตรใบนี้
  const [insForm, setInsForm] = useState(null)
  const [insDeleteTarget, setInsDeleteTarget] = useState(null)
  const [chargeOpen, setChargeOpen] = useState(false)
  const [cancelTxTarget, setCancelTxTarget] = useState(null)
  const [editingTx, setEditingTx] = useState(null)
  // ติ๊กรายแถวในบิล — { row, on } ; on = กำลังจะติ๊ก, false = กำลังจะเอาเครื่องหมายออก
  const [markTarget, setMarkTarget] = useState(null)
  const [showPaid, setShowPaid] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // เผื่อกรณีเปิดหน้านี้ค้างไว้ข้ามวันสรุปยอด — เรียกซ้ำไม่เสียหาย
  useEffect(() => { ensureStatements() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ใบที่ยอดถูกยกไปรวมในบิลใบถัดไปแล้วไม่ใช่ "ยังค้าง" — เงินอยู่ในใบใหม่แล้ว
  const unpaid = useMemo(
    () => statements.filter((s) => isPayableStatement(s)).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)),
    [statements, isPayableStatement]
  )
  const bill = unpaid[0] ?? null
  const paidHistory = useMemo(
    () => statements.filter((s) => s.status === 'paid').sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1)),
    [statements]
  )
  const unbilledAdvances = advances.filter((a) => !a.statementId)

  // วันนี้แบบ 'YYYY-MM-DD' ตามเวลาเครื่อง — ใช้ตัดสินว่างวดที่ค้างเลยกำหนดหรือยัง
  const todayStr = toDateString(new Date())

  // รายการในรอบบิลที่กำลังเดินอยู่ — รวมยอดรูด เงินคืน และเงินสดที่กดจากบัตร
  const cycleRows = useMemo(() => {
    if (!card) return []
    const p = cyclePeriod(card.closingDay, card.dueDay)
    const to = toDateString(p.end)
    // ทุกรายการที่ยังไม่มีใบไหนครอบ — กฎเดียวกับตอนออกบิลจริง (ดู getUncoveredTransactions)
    // รายการที่ลงวันที่ย้อนหลังเข้ารอบที่ปิดไปแล้วจึงยังเห็นได้ว่ามันจะไปอยู่บิลใบนี้
    const rows = getUncoveredTransactions(cardId, to)
      .map((t) => ({
        key: `t-${t.id}`, tx: t, date: t.date, name: t.itemName || '(ไม่ระบุชื่อ)',
        cat: getCategoryName(t.category),
        tag: t.installmentEntryId ? 'งวดผ่อน'
          : String(t.itemName ?? '').startsWith(FEE_PREFIX) ? 'ค่าธรรมเนียม'
          : t.type === 'income' ? 'เงินคืน' : 'รูดบัตร',
        amount: t.type === 'income' ? -Number(t.amount || 0) : Number(t.amount || 0),
      }))
    for (const a of advances) {
      if (a.statementId || a.date > to) continue
      rows.push({
        key: `a-${a.id}`, tx: null, advance: a, date: a.date, name: 'กดเงินสดจากบัตร',
        cat: Number(a.fee) > 0 ? `ค่าธรรมเนียม ${fmt(a.fee)}` : 'ไม่มีค่าธรรมเนียม',
        tag: 'กดเงินสด', amount: Number(a.amount || 0) + Number(a.fee || 0),
      })
    }
    // งวดผ่อนของรอบนี้ที่ยังไม่ถูกเรียกเก็บ — ยังไม่มีรายจ่ายจริงจนกว่าจะปิดรอบ
    // (ดู close_card_statement ใน supabase/card.sql) แต่ต้องเห็นในบิลนี้ เพราะ
    // ธนาคารจะเก็บมันรวมมากับบิลใบเดียวกัน
    const billedIds = new Set(rows.map((r) => r.tx?.installmentEntryId).filter(Boolean))
    for (const ins of installments) {
      for (const e of allEntries) {
        if (e.installmentId !== ins.id) continue
        // รวมงวดตกค้างจากรอบก่อนที่ยังไม่ถูกเก็บด้วย — บิลใบนี้จะกวาดมันมาเก็บ
        if (e.status !== 'pending' || e.cycle > p.cycle) continue
        if (billedIds.has(e.id)) continue

        // งวดของสัญญานี้ที่ "เข้าบิลไปแล้วแต่ยังไม่ได้จ่าย" (อยู่ในใบก่อนหน้า) — ถ้ามี
        // นั่นคืองวดที่ผู้ใช้ค้างอยู่จริง หัวแถวต้องพูดถึงงวดนั้น ไม่ใช่งวดที่กำลังจะเข้าบิลนี้
        // ธนาคารไม่ได้ "เลื่อน" งวดที่ค้าง มันยังอยู่ในใบเดิม แค่ยอดถูกยกมา (ยอดยกมา)
        const owed = allEntries
          .filter((x) => x.installmentId === ins.id && x.status === 'billed')
          .sort((a, b) => a.seq - b.seq)[0] ?? null
        const owedStmt = owed ? statements.find((s) => s.id === owed.statementId) : null
        const owedDue = owedStmt?.dueDate ?? owed?.dueDate ?? null
        const owedOverdue = !!owedDue && owedDue < todayStr

        // งวดของรอบก่อนที่ไม่มีบิลใบไหนเก็บไป บิลใบนี้จะกวาดมารวม — สัญญาเดียวจึงมี
        // ได้สองแถวในรอบเดียว (งวดตกค้าง + งวดของรอบนี้) ต้องเขียนให้อ่านออกว่าทำไม
        // ไม่งั้นดูเหมือนระบบสร้างรายการซ้ำ ซึ่งเป็นสิ่งแรกที่คนคิดเมื่อเห็นชื่อเดียวกันสองบรรทัด
        const carried = e.cycle < p.cycle

        rows.push({
          key: `ie-${e.id}`, tx: null, date: to, upcoming: true, installment: ins,
          // งวดที่ค้างอยู่ขึ้นก่อน (ถ้ามี) ไม่งั้นก็งวดที่จะเข้าบิลนี้
          name: owed
            ? `${ins.name} — งวดที่ ${owed.seq}/${ins.months} ${owedOverdue ? 'เกินกำหนด' : 'รอจ่ายบิล'} ${formatIsoThai(owedDue)}`
            : `${ins.name} — งวดที่ ${e.seq}/${ins.months}${carried ? ' (ตกค้างจากรอบก่อน)' : ''}`,
          // งวด "เข้าบิล" ตอนตัดรอบ ไม่ใช่ตอนครบกำหนด — สองวันนี้คนละความหมาย
          // ตัดรอบ = ธนาคารบันทึกงวดลงใบ · ครบกำหนด = วันสุดท้ายที่ต้องจ่ายใบนั้น
          cat: carried
            ? `งวด ${e.seq} เป็นของรอบ ${e.cycle} ที่ไม่มีบิลเก็บไว้ บิลใบนี้จึงกวาดมารวม · ชำระภายใน ${formatThaiDate(p.due)}`
            : `งวด ${e.seq} เข้าบิลนี้ตอนตัดรอบ ${formatThaiDate(p.end)} · ชำระภายใน ${formatThaiDate(p.due)}`,
          tag: carried ? 'งวดตกค้าง' : 'งวดผ่อน', amount: Number(e.amount || 0), entry: e,
          owed, owedOverdue,
        })
      }
    }

    return rows.sort((x, y) => String(x.date).localeCompare(String(y.date)))
  }, [transactions, statements, advances, card, cardId, getCategoryName, installments, allEntries, getUncoveredTransactions, todayStr])

  // สรุปงวดผ่อน: ที่รวมอยู่ในบิลรอบนี้ กับที่เหลือไปรอบถัดๆ ไป
  const installmentOutlook = useMemo(() => {
    const ids = new Set(installments.map((i) => i.id))
    const pending = allEntries.filter((e) => ids.has(e.installmentId) && e.status === 'pending')
    // <= ไม่ใช่ = : งวดที่ตกค้างจากรอบก่อน (รอบที่ยังไม่มีใบแจ้งยอด) จะถูกกวาดมา
    // เก็บในบิลใบถัดไปด้วย ต้องนับเป็น "รอบนี้" ให้ตรงกับรายการที่แสดงข้างบน
    // ไม่งั้นกล่องสรุปจะบอกจำนวนงวดไม่ตรงกับที่เห็นในรายการ
    const cycle = current?.cycle
    const inThis = pending.filter((e) => e.cycle <= cycle)
    const later = pending.filter((e) => e.cycle > cycle)
    const sum = (list) => list.reduce((t, e) => t + Number(e.amount || 0), 0)
    return {
      thisCount: inThis.length, thisAmount: sum(inThis),
      laterCount: later.length, laterAmount: sum(later),
    }
  }, [installments, allEntries, current])

  const run = async (fn) => {
    if (busy) return
    setBusy(true); setError('')
    try { await fn() } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  // หมวดหมู่พิเศษของบัตร แยกไว้ไม่ให้ปนกับรายรับ/รายจ่ายจริงตอนดูรายงาน
  const ensureCategory = async (name, type) => {
    const found = categories.find((c) => c.type === type && c.name === name && !c.deleted)
    if (found) return found.id
    return (await addCategory(name, type))?.id ?? null
  }

  if (!card) return <p className="text-center text-sm text-faint py-10">ไม่พบบัตรใบนี้</p>

  const debt = Number(card.outstanding) || 0
  const credit = debt < 0 ? -debt : 0
  const used = Math.max(0, usage?.used ?? debt)
  const limit = usage?.limit ?? 0
  const pct = limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0
  const overLimit = usage?.over ?? false
  const closing = nextClosingDate(card.closingDay)
  const daysToClosing = daysUntil(closing)
  const billLeft = bill ? Number(bill.amount) - Number(bill.paidAmount) : 0
  const billBreakdown = bill ? getStatementBreakdown(bill.id) : null

  // กระทบยอดหนี้: บิลที่ยังไม่จ่าย + ของที่ยังไม่เข้าบิล + ส่วนที่ไม่ได้มาจากรายการเลย
  // ค่างวดผ่อนที่ยังไม่เข้าบิลไม่นับ เพราะยังไม่เคยเป็นหนี้บัตร (ดู close_card_statement)
  const billedUnpaidTotal = unpaid.reduce((n, s) => n + (Number(s.amount) - Number(s.paidAmount)), 0)
  const uncoveredCharges = current
    ? Number(current.spend || 0) + Number(current.advance || 0) - Number(current.credit || 0)
    : 0
  const unbilledDebt = Math.round((debt - billedUnpaidTotal - uncoveredCharges) * 100) / 100
  const billDays = bill ? daysUntil(new Date(bill.dueDate + 'T00:00:00')) : null
  const billAlert = billDays == null ? '' : billDays < 0 ? `เกินกำหนด ${-billDays} วัน` : billDays === 0 ? 'ครบกำหนดวันนี้' : `อีก ${billDays} วัน`

  const autopayDue = bill && billDays <= notifyDays ? autopayAmountOf(card, bill) : 0

  const estCashback = Number(card.cashbackRate) > 0 && current?.spend > 0
    ? (current.spend * Number(card.cashbackRate)) / 100
    : 0

  const thisYear = String(new Date().getFullYear())
  const feeRecorded = transactions.some((t) =>
    t.cardId === card.id && t.type === 'expense'
    && String(t.date ?? '').startsWith(thisYear)
    && String(t.itemName ?? '').startsWith(FEE_PREFIX)
  )
  const hasFee = Number(card.annualFee) > 0
  const feeDue = hasFee && Number(card.annualFeeMonth) === new Date().getMonth() + 1 && !feeRecorded

  // ── การกระทำทั้งหมด (ยกมาจากหน้ากระเป๋าเงินเดิม ตรรกะเงินไม่เปลี่ยน) ──────
  const handlePay = ({ method, accountId, amount, date }) => run(async () => {
    const statement = payTarget
    const remaining = Number(statement.amount) - Number(statement.paidAmount)
    await payStatement(statement.id, {
      method, accountId, amount, date,
      log: buildLogEntry({
        activityType: 'CARD_PAYMENT',
        description:
          `จ่ายบิลบัตร "${formatCard(card)}" รอบ ${statement.cycle} ${fmt(amount)} บาท ` +
          `จาก${method === 'cash' ? 'เงินสด' : 'เงินโอน'}` +
          (amount > remaining ? ` (จ่ายเกิน ${fmt(amount - remaining)} เป็นเครดิตในบัตร)` : ''),
        walletEffect: { target: method, delta: -amount, transferAccountId: accountId },
        newValue: { statementId: statement.id, cardId: card.id, amount, date, method },
      }),
    })
    await refreshWallet()
    setPayTarget(null)
  })

  const handleCashback = ({ kind, amount, date, note }) => run(async () => {
    const categoryId = await ensureCategory(CASHBACK_CATEGORY, 'income')
    const label = kind === 'refund' ? 'คืนสินค้าเข้าบัตร' : 'เครดิตเงินคืน'
    await addTransaction({
      date, type: 'income', amount, method: 'card', cardId: card.id, category: categoryId,
      itemName: `${label} — ${formatCard(card)}`, otherIncomeType: label, note: note || null,
    }, {
      effect: { target: walletTarget('card', { cardId: card.id }), delta: +amount },
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

  const handleFee = ({ amount, date, note }) => run(async () => {
    const categoryId = await ensureCategory(FEE_CATEGORY, 'expense')
    await addTransaction({
      date, type: 'expense', amount, method: 'card', cardId: card.id, category: categoryId,
      itemName: `${FEE_PREFIX} — ${formatCard(card)}`, note: note || null,
    }, {
      effect: { target: walletTarget('card', { cardId: card.id }), delta: -amount },
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
   * เมนูท้ายแถวของบิล — เปลี่ยนตามชนิดของแถว
   * แถวในบิลมาจากสามที่ (รายจ่ายจริง / ยอดกดเงินสด / งวดผ่อนที่รอเรียกเก็บ)
   * ซึ่งย้อนคนละวิธีกัน จึงต้องแยกเมนู ไม่ใช่โชว์ปุ่มแก้ไขอันเดียวแล้วซ่อนที่เหลือ
   */
  const rowMenuItems = (r, ins) => {
    if (r.tx) {
      return [
        {
          icon: 'edit_note',
          label: 'แก้ไขรายการ',
          desc: 'แก้ยอด วันที่ หมวดหมู่ หรือย้ายไปช่องทางอื่น',
          onClick: () => setEditingTx(r.tx),
        },
        // รายการที่ธนาคารเก็บในบิลใบที่ออกไปแล้ว (คีย์ตามบิลจริงหลังวันสรุปยอด)
        // ใส่เข้าใบนั้นได้จากตรงนี้ ยอดบิลบวกเพิ่ม และรายการหายจากรอบนี้ไปอยู่ใบนั้น
        ...(r.tx.installmentEntryId ? [] : unpaid.map((s) => ({
          icon: 'receipt_long',
          label: `ใส่เข้าบิลที่ครบกำหนด ${formatIsoThai(s.dueDate)}`,
          desc: `ปิดรอบ ${formatIsoThai(s.periodEnd)} · ยอดบิลจะเพิ่มเป็น ${fmt(Number(s.amount) - Number(s.paidAmount) + Math.abs(r.amount))}`,
          onClick: () => run(async () => {
            await attachTxToStatement(r.tx.id, s.id)
            await addLog(buildLogEntry({
              activityType: 'CARD_STATEMENT_ATTACH',
              description: `ใส่ "${r.name}" ${fmt(Math.abs(r.amount))} บาท เข้าบิลที่ครบกำหนด ${formatIsoThai(s.dueDate)} ของบัตร "${formatCard(card)}"`,
              newValue: { transactionId: r.tx.id, statementId: s.id, cardId: card.id },
            }))
          }),
        }))),
        {
          icon: 'delete',
          label: 'ลบรายการนี้',
          desc: 'คืนยอดกลับให้บัตร และลบรายการออกจากประวัติ',
          danger: true,
          onClick: () => setCancelTxTarget(r.tx),
        },
      ]
    }
    if (r.advance) {
      return [
        {
          icon: 'undo',
          label: 'ย้อนการกดเงินสด',
          desc: 'คืนเงินออกจากกระเป๋าปลายทางและลดหนี้บัตรกลับ',
          danger: true,
          onClick: () => setUndoAdvanceTarget(r.advance),
        },
      ]
    }
    if (ins) {
      const next = r.entry
      return [
        next && {
          icon: 'payments',
          label: `จ่ายค่างวดที่ ${next.seq}`,
          desc: 'ตัดเงินจากเงินสด/บัญชี โดยไม่รอบิลบัตร',
          onClick: () => setPayEntryTarget({ installment: ins, entry: next }),
        },
        {
          icon: 'edit_note',
          label: 'แก้ไขรายการผ่อน',
          desc: 'แก้ยอด จำนวนงวด วันที่ หรือบัตรที่ใช้ผ่อน',
          onClick: () => setInsForm({ installment: ins }),
        },
        {
          icon: 'delete',
          label: 'ลบรายการผ่อนทิ้ง',
          desc: 'ใช้เมื่อบันทึกผิด — คืนเงินงวดที่จ่ายไปแล้วให้ด้วย',
          danger: true,
          onClick: () => setInsDeleteTarget({
            installment: ins, progress: getInstallmentProgress(ins.id), mode: 'delete',
          }),
        },
      ].filter(Boolean)
    }
    return [{ icon: 'info', label: 'รายการนี้จัดการที่อื่น', desc: 'ดูรายละเอียดได้ที่หน้าประวัติทั้งหมด', onClick: () => {} }]
  }

  const handleAdvance = ({ amount, fee, target, date, note }) => run(async () => {
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
          target: toCash ? 'cash' : 'transfer', delta: +amount,
          transferAccountId: toCash ? null : target.split(':')[1],
        },
        newValue: { cardId: card.id, amount, fee, target, date },
      }),
    })
    await Promise.all([refreshWallet(), refreshTransactions()])
    setAdvanceTarget(null)
  })

  const handleUndoAdvance = () => run(async () => {
    const a = undoAdvanceTarget
    await undoAdvance(a.id, buildLogEntry({
      activityType: 'CARD_ADVANCE_UNDO',
      description: `ย้อนการกดเงินสด ${fmt(a.amount)} บาท จากบัตร "${formatCard(card)}"`,
      oldValue: a,
    }))
    await Promise.all([refreshWallet(), refreshTransactions()])
    setUndoAdvanceTarget(null)
  })

  const handleAutopayConfirm = () => run(async () => {
    const { statement, amount } = autopayTarget
    await payStatement(statement.id, {
      method: 'transfer', accountId: card.autopayAccountId, amount, date: statement.dueDate,
      log: buildLogEntry({
        activityType: 'CARD_AUTOPAY',
        description: `ยืนยันหักบัญชีอัตโนมัติ บัตร "${formatCard(card)}" รอบ ${statement.cycle} ${fmt(amount)} บาท`,
        walletEffect: { target: 'transfer', delta: -amount, transferAccountId: card.autopayAccountId },
        newValue: { statementId: statement.id, cardId: card.id, amount, mode: card.autopayMode },
      }),
    })
    await refreshWallet()
    setAutopayTarget(null)
  })

  const handleUndoPay = () => run(async () => {
    const statement = undoTarget
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

  const handlePayEntry = ({ method, accountId, amount, date }) => run(async () => {
    const { installment, entry } = payEntryTarget
    await payEntry(entry.id, {
      method, accountId, amount, date,
      log: buildLogEntry({
        activityType: 'INSTALLMENT_PAY',
        description: `จ่ายค่างวดที่ ${entry.seq}/${installment.months} "${installment.name}" ${fmt(amount)} บาท`,
        walletEffect: { target: method, delta: -amount, transferAccountId: accountId },
        newValue: { installmentId: installment.id, entryId: entry.id, amount, date },
      }),
    })
    await Promise.all([refreshWallet(), refreshCards()])
    setPayEntryTarget(null)
  })

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_336px] gap-3 items-start">
      {/* ── คอลัมน์ซ้าย ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2.5 min-w-0">
        {error && (
          <p className="text-[12.5px] text-expense bg-expense-soft border border-[#F0C4BE] rounded-ctl px-3.5 py-2">
            ทำรายการไม่สำเร็จ — {error}
          </p>
        )}

        <div className="card px-4 py-3.5 flex items-center gap-3">
          <span className="w-10 h-10 flex-none rounded-lg bg-paper flex items-center justify-center">
            <AppIcon value={card.icon} size={22} fallback={DEFAULT_ICONS.card} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-semibold truncate">{formatCard(card)}</span>
            <span className="block text-[11.5px] text-faint truncate">
              {card.bankName} · สรุปยอดทุกวันที่ {card.closingDay} · ครบกำหนดวันที่ {card.dueDay}
            </span>
          </span>
          <span className="text-right flex-none">
            <span className="block text-[11px] text-faint">{credit > 0 ? 'เครดิตคงเหลือ' : 'ยอดหนี้รวม'}</span>
            <span className={`tabular-nums block text-[19px] font-bold ${
              debt > 0 ? 'text-expense' : credit > 0 ? 'text-income' : 'text-muted'
            }`}>
              {fmt(Math.abs(debt))}
            </span>
          </span>
        </div>

        {credit > 0 && (
          <div className="bg-income-soft border border-[#BFE0D2] rounded-[13px] px-3.5 py-2.5 text-[11.5px] text-[#0F6A50] leading-relaxed">
            มีเครดิตในบัตร <b className="tabular-nums">{fmt(credit)}</b> บาท จากการจ่ายเกินหรือเงินคืน
            ระบบจะหักออกจากบิลรอบถัดไปให้เอง
          </div>
        )}

        {/* กระทบยอด — พิสูจน์ว่ายอดหนี้มาจากไหนบ้าง
            ยอดหนี้เพิ่มทุกครั้งที่รูด แต่บิลเก็บเฉพาะของที่อยู่ในรอบ ส่วนต่างที่เหลือคือ
            ยอดยกมาตอนเพิ่มบัตรกับการปรับยอดด้วยมือ ซึ่งไม่เคยขึ้นบิลเลยและไม่มีที่ไหนบอก
            ถ้าไม่แสดงไว้ ผู้ใช้จะเจอยอดหนี้ที่จ่ายบิลครบทุกใบแล้วก็ยังไม่เป็นศูนย์ */}
        {Math.abs(unbilledDebt) >= 0.01 && (
          <div className="bg-paper border border-hairline rounded-[13px] px-3.5 py-2.5 text-[11.5px] text-muted leading-relaxed">
            ยอดหนี้ {fmt(debt)} = บิลที่ยังไม่จ่าย <b className="tabular-nums">{fmt(billedUnpaidTotal)}</b>
            {' '}+ ที่ยังไม่เข้าบิล <b className="tabular-nums">{fmt(uncoveredCharges)}</b>
            {' '}+ <b className="tabular-nums">{fmt(unbilledDebt)}</b> ที่มาจากยอดยกมาตอนเพิ่มบัตรหรือการปรับยอดด้วยมือ
            {' '}— ก้อนสุดท้ายจะไม่ถูกเรียกเก็บผ่านบิลใบไหน ต้องจ่ายแล้วปรับยอดเอง
          </div>
        )}

        {bill && autopayDue > 0 && (
          <div className="bg-transfer-soft border border-[#C9D0F2] rounded-[13px] px-3.5 py-2.5 flex items-center gap-3 flex-wrap">
            <span className="flex-1 min-w-[220px] text-[11.5px] text-[#2E44A6] leading-relaxed">
              ธนาคารจะหัก <b className="tabular-nums">{fmt(autopayDue)}</b> บาท {AUTOPAY_LABEL[card.autopayMode] ?? ''}
              {' '}จากบัญชีที่ผูกไว้ ในวันที่ {formatIsoThai(bill.dueDate)}
            </span>
            <button
              className="flex-none h-8 px-3.5 rounded-[9px] bg-transfer text-white text-xs font-semibold hover:brightness-95"
              onClick={() => setAutopayTarget({ statement: bill, amount: autopayDue })}
            >
              ยืนยันว่าถูกหักแล้ว
            </button>
          </div>
        )}

        {feeDue && (
          <div className="bg-pending-soft border border-pending-line rounded-[13px] px-3.5 py-2.5 flex items-center gap-3 flex-wrap">
            <span className="flex-1 min-w-[220px] text-[11.5px] text-[#8A6A15] leading-relaxed">
              เดือน {MONTHS_TH[card.annualFeeMonth - 1]} ธนาคารเรียกเก็บค่าธรรมเนียมรายปี{' '}
              <b className="tabular-nums">{fmt(card.annualFee)}</b> บาท ถ้าได้รับการยกเว้นก็ไม่ต้องกด
            </span>
            <button
              className="flex-none h-8 px-3.5 rounded-[9px] bg-pending text-white text-xs font-semibold hover:brightness-95"
              onClick={() => setFeeTarget(card)}
            >
              บันทึกค่าธรรมเนียม
            </button>
          </div>
        )}

        {bill && (
          <div className="bg-expense-soft border border-[#F0C4BE] rounded-panel px-4 py-3.5">
            <div className="flex items-start justify-between gap-5 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11.5px] font-semibold text-[#A93A2E]">
                    ยอดที่ต้องชำระ · ครบกำหนด {formatIsoThai(bill.dueDate)} · {billAlert}
                  </span>
                  {unpaid.length > 1 && (
                    <span className="tabular-nums flex-none text-[11px] font-bold bg-white border border-[#F0C4BE] text-[#A93A2E] rounded-full px-2">
                      ค้างอีก {unpaid.length - 1} รอบ
                    </span>
                  )}
                </div>
                <div className="tabular-nums text-[34px] font-semibold tracking-[-0.03em] text-[#C03A2D] leading-[1.15] mt-0.5">
                  {fmt(billLeft)}
                </div>
                <div className="text-[11.5px] text-[#7A5B56] mt-0.5">
                  ขั้นต่ำ {fmt(bill.minimumAmount)}
                  {Number(bill.paidAmount) > 0 && ` · จ่ายไปแล้ว ${fmt(bill.paidAmount)}`}
                  {Number(bill.previousBalance) > 0 && ` · ยกมา ${fmt(bill.previousBalance)}`}
                  {Number(bill.previousBalance) < 0 && ` · หักเครดิต ${fmt(-bill.previousBalance)}`}
                </div>
                {/* บิลใบเดียวมีของสองแบบปนกัน — รูดเต็มจำนวนกับค่างวดผ่อน — ต้องแยกให้เห็น
                    ไม่งั้นคนที่รู้ว่าเดือนนี้ไม่ได้รูดอะไรเลยจะงงว่ายอดมาจากไหน */}
                {billBreakdown && (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[#7A5B56] mt-1">
                    {billBreakdown.full > 0 && <span>รูดเต็มจำนวน <b className="tabular-nums">{fmt(billBreakdown.full)}</b></span>}
                    {billBreakdown.installment > 0 && (
                      <span>ค่างวดผ่อน {billBreakdown.installmentCount} งวด <b className="tabular-nums">{fmt(billBreakdown.installment)}</b></span>
                    )}
                    {billBreakdown.advance > 0 && <span>กดเงินสด <b className="tabular-nums">{fmt(billBreakdown.advance)}</b></span>}
                    {billBreakdown.credit > 0 && <span>เงินคืน <b className="tabular-nums">−{fmt(billBreakdown.credit)}</b></span>}
                  </div>
                )}
                {/* รายการที่ถูกใส่เข้าใบนี้หลังออกบิล — ต้องเห็นว่ามีอะไรบ้าง และเอาออกได้
                    ไม่งั้นยอดบิลขยับโดยหาที่มาไม่เจอ */}
                {(() => {
                  const attached = transactions.filter((t) => t.cardStatementId === bill.id)
                  if (attached.length === 0) return null
                  return (
                    <div className="mt-2 border-t border-[#F0C4BE] pt-1.5 space-y-0.5">
                      <div className="text-[11px] text-[#7A5B56]">ใส่เพิ่มเข้าบิลใบนี้หลังออกบิล {attached.length} รายการ</div>
                      {attached.map((t) => (
                        <div key={t.id} className="flex items-center gap-2 text-[11.5px]">
                          <span className="tabular-nums text-faint flex-none">{formatIsoThai(t.date)}</span>
                          <span className="min-w-0 flex-1 truncate">{t.itemName || '(ไม่ระบุชื่อ)'}</span>
                          <span className={`tabular-nums flex-none font-semibold ${t.type === 'income' ? 'text-income' : ''}`}>
                            {t.type === 'income' ? '−' : ''}{fmt(t.amount)}
                          </span>
                          <button
                            className="flex-none text-[11px] text-[#A93A2E] underline hover:no-underline"
                            title="เอาออกจากบิลใบนี้ — รายการจะไปอยู่บิลรอบถัดไปตามวันที่รูด"
                            onClick={() => run(async () => {
                              await detachTxFromStatement(t.id)
                              await addLog(buildLogEntry({
                                activityType: 'CARD_STATEMENT_DETACH',
                                description: `เอา "${t.itemName}" ${fmt(t.amount)} บาท ออกจากบิลที่ครบกำหนด ${formatIsoThai(bill.dueDate)} ของบัตร "${formatCard(card)}"`,
                                oldValue: { transactionId: t.id, statementId: bill.id, cardId: card.id },
                              }))
                            })}
                          >
                            เอาออก
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
              <div className="flex flex-col gap-1.5 w-[196px] flex-none">
                <button
                  className="h-10 rounded-[11px] bg-ink text-white text-[13.5px] font-semibold flex items-center justify-center gap-1.5 hover:bg-black"
                  onClick={() => setPayTarget(bill)}
                >
                  <Icon name="credit_card" size={18} />
                  จ่ายบิล
                </button>
                <span className="text-[11px] text-[#8A6A15] text-center leading-snug">
                  ปิดรอบแล้ว ยอดนิ่ง · จ่ายขั้นต่ำได้ แต่ระยะปลอดดอกเบี้ยจะหายไป
                </span>
              </div>
            </div>
          </div>
        )}

        {current && (
          <div className="bg-[#FAF9F6] border border-[#EFEDE7] rounded-panel px-4 py-3">
            <div className="flex items-start gap-3.5 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] text-faint">
                  รอบถัดไปสะสมแล้ว · ครบกำหนด {formatThaiDate(current.due)}
                  {daysToClosing >= 0 && ` · สรุปยอดอีก ${daysToClosing} วัน`}
                </div>
                <div className="tabular-nums text-base font-semibold text-[#3F444C] mt-0.5">
                  {fmt(current.net)}
                  <span className="text-[11.5px] font-normal text-faint ml-2">
                    {current.count} รายการ
                    {current.spend > 0 && ` · รูดเต็มจำนวน ${fmt(current.spend)}`}
                    {current.installmentCount > 0 &&
                      ` · ค่างวดผ่อน ${current.installmentCount} งวด ${fmt(current.installment)}`}
                    {current.advance > 0 && ` · กดเงินสด ${fmt(current.advance)}`}
                    {current.credit > 0 && ` · เงินคืน −${fmt(current.credit)}`}
                  </span>
                </div>
              </div>
              {estCashback > 0 && (
                <div className="flex-none text-right text-[11px] text-income leading-snug">
                  เงินคืนโดยประมาณ<br /><span className="tabular-nums">≈ {fmt(estCashback)}</span>
                </div>
              )}
            </div>

            {unbilledAdvances.map((a) => (
              <div key={a.id} className="flex items-center gap-2.5 border-t border-hairline mt-2 pt-2 text-[11.5px]">
                <span className="flex-1 min-w-0 text-muted truncate">
                  กดเงินสด {formatIsoThai(a.date)}
                  {Number(a.fee) > 0 && ` · ค่าธรรมเนียม ${fmt(a.fee)}`}
                </span>
                <span className="tabular-nums flex-none text-[#3F444C]">{fmt(a.amount)}</span>
                <button className="flex-none text-faint text-[11.5px] hover:text-expense" onClick={() => setUndoAdvanceTarget(a)}>
                  ย้อน
                </button>
              </div>
            ))}
          </div>
        )}

        {limit > 0 && (
          <div>
            <div className="flex justify-between text-xs text-muted flex-wrap gap-2">
              <span>ใช้ไป <b className="tabular-nums text-ink">{fmt(used)}</b></span>
              <span>{overLimit ? 'เกินวงเงิน' : 'เหลือ'} <b className={`tabular-nums ${overLimit ? 'text-expense' : 'text-income'}`}>{fmt(Math.abs(limit - used))}</b></span>
              <span>วงเงิน <b className="tabular-nums text-ink">{fmt(limit)}</b></span>
            </div>
            <div className="h-1.5 bg-[#EFEDE7] rounded-[3px] mt-1.5 overflow-hidden">
              <div className={`h-full rounded-[3px] ${overLimit ? 'bg-expense' : 'bg-[#E48A80]'}`} style={{ width: `${pct}%` }} />
            </div>
            {usage?.unbilled > 0 && (
              <div className="text-[11px] text-faint mt-1.5">
                รวมยอดผ่อนที่ยังไม่ถูกเรียกเก็บ {fmt(usage.unbilled)} ซึ่งธนาคารกันวงเงินไว้แล้ว
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5 flex-wrap">
          {paidHistory.length > 0 && (
            <button className="mr-auto text-xs text-faint hover:text-ink" onClick={() => setShowPaid((v) => !v)}>
              {showPaid ? '▲ ซ่อนบิลที่จ่ายแล้ว' : `▼ บิลที่จ่ายแล้ว ${paidHistory.length} รอบ`}
            </button>
          )}
          <button className="h-8 px-3 rounded-[9px] border border-hairline bg-white text-xs flex items-center gap-1.5 hover:bg-paper" onClick={() => setAdvanceTarget(card)}>
            <Icon name="payments" size={15} className="text-muted" />กดเงินสด
          </button>
          {hasFee && !feeDue && (
            <button className="h-8 px-3 rounded-[9px] border border-hairline bg-white text-xs hover:bg-paper" onClick={() => setFeeTarget(card)}>
              ค่าธรรมเนียมรายปี
            </button>
          )}
          <button className="h-8 px-3 rounded-[9px] border border-hairline bg-white text-xs hover:bg-paper" onClick={() => setCashbackTarget({ estimate: estCashback })}>
            บันทึกเงินคืน
          </button>
          {/* งานที่ทำบ่อยที่สุดในแถวนี้ จึงอยู่ขวาสุดและเป็นปุ่มทึบ — ตำแหน่งที่ตาไปหยุดหลังสุด */}
          <button
            className="h-8 px-3 rounded-[9px] bg-ink text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-black"
            onClick={() => setChargeOpen(true)}
          >
            <Icon name="add" size={15} />
            เพิ่มรายการรูดบัตร
          </button>
        </div>

        <div className="card flex flex-col overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 pt-3 pb-2 flex-none flex-wrap">
            <span className="text-sm font-semibold">รายการในรอบบิลนี้</span>
            <span className="tabular-nums text-[11px] font-semibold bg-expense-soft text-[#A93A2E] rounded-md px-2 py-0.5">
              {cycleRows.length} รายการ
            </span>
            <span className="ml-auto text-xs text-faint">
              {current ? `รอบ ${current.cycle} · สรุปยอด ${formatThaiDate(current.end)}` : ''}
            </span>
          </div>
          <div className="px-4 pb-1 text-[11px] text-faint">
            รายการที่รูดหลังวันสรุปยอดจะย้ายไปอยู่บิลรอบถัดไปให้เอง · กดปุ่ม ⋮ ท้ายแถวเพื่อจัดการรายการนั้น ·
            ติ๊กหน้าแถวเพื่อทำเครื่องหมายว่าตรวจกับสลิปแล้ว (ไม่ตัดเงิน) ·
            งวดผ่อนที่ติดป้าย "รอเรียกเก็บ" คือค่างวดของรอบนี้ที่ธนาคารจะรวมมากับบิลใบนี้ตอนสรุปยอด
          </div>
          <div className="px-4 pb-3 overflow-x-auto">
            {cycleRows.length === 0 ? (
              <p className="text-center text-[12.5px] text-faint py-8">ยังไม่มีรายการในรอบนี้</p>
            ) : cycleRows.map((r) => {
              const insEntry = r.upcoming
                ? { i: r.installment }
                : r.tx?.installmentEntryId
                  ? installments
                    .map((i) => ({ i, e: getInstallmentProgress(i.id)?.rows?.find((x) => x.id === r.tx.installmentEntryId) }))
                    .find((x) => x.e)
                  : null
              const prog = insEntry ? getInstallmentProgress(insEntry.i.id) : null
              const marked = rowMarks.includes(r.key)
              return (
                <div key={r.key} className="grid grid-cols-[22px_64px_minmax(0,1fr)_96px_110px_30px] gap-2.5 items-center py-2 border-t border-[#F2F0EA]">
                  {/* ติ๊กว่าไล่เช็คบรรทัดนี้กับสลิปแล้ว — ไม่ตัดเงิน เพราะธนาคารเก็บบิลทั้งใบ
                      ไม่ได้เก็บทีละบรรทัด (ดูหมายเหตุใน supabase/card.sql ส่วน 11) */}
                  {r.upcoming ? <span /> : (
                  <button
                    onClick={() => setMarkTarget({ row: r, on: !marked })}
                    disabled={busy}
                    title={marked ? 'เอาเครื่องหมายถูกออก' : 'ทำเครื่องหมายว่าตรวจแล้ว'}
                    className={`w-[19px] h-[19px] rounded-[6px] border flex items-center justify-center transition disabled:opacity-50 ${
                      marked ? 'bg-lime border-lime text-ink' : 'bg-white border-[#D8D4C9] hover:border-ink'
                    }`}
                  >
                    {marked && <Icon name="check" size={14} />}
                  </button>
                  )}
                  <span className="tabular-nums text-[11.5px] text-faint">{formatIsoThai(r.date)}</span>
                  <span className="min-w-0">
                    <span className={`block text-[12.5px] font-medium truncate ${marked ? 'text-muted line-through' : ''}`}>{r.name}</span>
                    <span className="block text-[11px] text-faint truncate">{r.cat}</span>
                    {prog && (
                      <span className="flex items-center gap-2 mt-1 flex-wrap">
                        {/* เน้นงวดที่ "แถวนี้" พูดถึง ไม่ใช่งวดแรกที่ยังไม่จ่ายของทั้งสัญญา
                            สองอันนี้ต่างกันได้ เช่นงวดก่อนหน้าเข้าบิลใบที่แล้วแต่ยังไม่ได้จ่ายบิล
                            ถ้าเน้นผิดตัว หัวแถวจะบอกงวดหนึ่งแต่กรอบขาวไปอยู่อีกงวด */}
                        <EntryPips
                          rows={prog.rows}
                          currentSeq={r.owed?.seq ?? insEntry.e?.seq ?? r.entry?.seq}
                          closingDay={card.closingDay}
                        />
                        <span className="text-[10.5px] text-faint">
                          จ่ายแล้ว {prog.paidCount + prog.prepaidCount} จาก {insEntry.i.months} งวด
                        </span>
                      </span>
                    )}
                  </span>
                  <span className="justify-self-start flex flex-col items-start gap-0.5">
                    <span className={`text-[10.5px] rounded-full px-2 py-0.5 ${TAG_TONE[r.tag] ?? TAG_TONE['รูดบัตร']}`}>
                      {r.tag}
                    </span>
                    {r.upcoming && <span className="text-[10px] text-faint">รอเรียกเก็บ</span>}
                  </span>
                  <span className={`tabular-nums text-right text-[13px] font-semibold ${
                    r.amount < 0 ? 'text-income' : r.upcoming ? 'text-muted' : 'text-ink'
                  }`}>
                    {r.amount < 0 ? `−${fmt(-r.amount)}` : fmt(r.amount)}
                  </span>
                  {/* ทุกแถวต้องจัดการได้ ไม่ใช่เฉพาะแถวที่เป็นรายจ่ายจริง —
                      งวดผ่อนที่รอเรียกเก็บกับยอดกดเงินสดก็คือของที่ผู้ใช้บันทึกไว้เหมือนกัน
                      เมนูจึงเปลี่ยนตามชนิดของแถว แทนที่จะซ่อนปุ่มไปเฉยๆ */}
                  <span className="justify-self-end">
                    <RowMenu
                      compact
                      title={r.name}
                      sub={`${formatIsoThai(r.date)} · ${r.tag} · ${fmt(Math.abs(r.amount))} บาท`}
                      icon="credit_card"
                      items={rowMenuItems(r, insEntry?.i ?? null)}
                    />
                  </span>
                </div>
              )
            })}
          </div>
          {(installmentOutlook.thisCount > 0 || installmentOutlook.laterCount > 0) && (
            <div className="mx-4 mb-3 bg-recurring-soft rounded-[9px] px-2.5 py-2 text-[11px] text-[#5A3C90] leading-relaxed">
              {installmentOutlook.thisCount > 0 && (
                <div>
                  งวดผ่อนที่จะรวมมากับบิลรอบนี้ <b className="tabular-nums">{installmentOutlook.thisCount}</b> งวด
                  รวม <b className="tabular-nums">{fmt(installmentOutlook.thisAmount)}</b> บาท
                </div>
              )}
              {installmentOutlook.laterCount > 0 && (
                <div>
                  ที่เหลือหลังรอบนี้อีก <b className="tabular-nums">{installmentOutlook.laterCount}</b> งวด
                  รวม <b className="tabular-nums">{fmt(installmentOutlook.laterAmount)}</b> บาท (ทยอยเข้าบิลรอบถัดๆ ไป)
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── คอลัมน์ขวา ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2.5 min-w-0">
        <div className="card px-[15px] py-3.5">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold">ข้อมูลบัตร</span>
            <Link to="/manage/cards" className="ml-auto text-xs font-semibold text-income hover:underline">แก้ไข</Link>
          </div>
          <Meta label="ธนาคาร / ผู้ออกบัตร" value={card.bankName || '—'} />
          <Meta label="ชื่อเรียกบัตร" value={card.name} />
          <Meta label="4 ตัวท้าย" value={card.last4 || '—'} />
          <Meta label="วันสรุปยอด" value={`ทุกวันที่ ${card.closingDay}`} />
          <Meta label="วันครบกำหนดชำระ" value={`ทุกวันที่ ${card.dueDay}`} />
          <Meta label="วงเงิน" value={fmt(card.creditLimit)} />
          <Meta label="อัตราเงินคืน" value={Number(card.cashbackRate) > 0 ? `${card.cashbackRate}%` : 'ไม่มี'} />
          <Meta
            label="ค่าธรรมเนียมรายปี"
            value={hasFee
              ? `${fmt(card.annualFee)} (${MONTHS_TH[(card.annualFeeMonth || 1) - 1]})${feeRecorded ? ' · บันทึกแล้วปีนี้' : ''}`
              : 'ไม่มี'}
          />
          <Meta
            label="ผูกหักบัญชีอัตโนมัติ"
            value={card.autopayMode && card.autopayMode !== 'off' ? (AUTOPAY_LABEL[card.autopayMode] ?? '').replace(/[()]/g, '') : 'ไม่ได้ผูก'}
          />
          <Meta label="ยอดหนี้คงค้าง" value={fmt(debt)} />
          <div className="mt-2.5 bg-paper rounded-[9px] px-2.5 py-2 text-[11px] text-muted leading-relaxed">
            รูดวันนี้จะไปอยู่ในบิลที่ครบกำหนด <b>{current ? formatThaiDate(current.due) : '—'}</b>
          </div>
        </div>

        <div className="card px-[15px] py-3.5">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold">ผ่อนผ่านบัตรใบนี้</span>
            <span className="tabular-nums text-[11px] font-semibold bg-recurring-soft text-[#5A3C90] rounded-full px-2 py-0.5">
              {installments.length} รายการ
            </span>
            {/* เพิ่มจากตรงนี้ได้เลย ไม่ต้องอ้อมไปหน้าบันทึกรายจ่าย —
                คนที่มาบันทึกสัญญาที่ผ่อนอยู่ก่อนแล้วไม่ได้กำลังจะรูดอะไรวันนี้ */}
            <button
              className="ml-auto flex-none h-[28px] px-2.5 rounded-lg border border-hairline bg-white text-[11.5px] font-semibold hover:bg-paper flex items-center gap-1"
              onClick={() => setInsForm({ installment: null })}
            >
              <Icon name="add" size={16} />
              เพิ่มรายการผ่อน
            </button>
          </div>
          {installments.length === 0 ? (
            <p className="text-[11.5px] text-faint mt-2">ยังไม่มีรายการผ่อนบนบัตรใบนี้</p>
          ) : installments.map((i) => {
            const p = getInstallmentProgress(i.id)
            if (!p) return null
            const done = p.paidCount + p.prepaidCount
            const next = p.rows.find((r) => r.status === 'pending' || r.status === 'billed')
            return (
              <div key={i.id} className="border-t border-[#F6F4EF] pt-2.5 mt-2.5">
                <div className="flex items-baseline gap-2">
                  <span className="flex-1 min-w-0 text-[12.5px] font-medium truncate">{i.name}</span>
                  {/* คงเหลือ = ที่ยังไม่ได้จ่ายจริง รวมงวดที่เข้าบิลแล้วแต่ยังไม่ได้จ่ายบิล */}
                  <span className="tabular-nums flex-none text-[12.5px] font-semibold text-expense">{fmt(p.unpaidAmount)}</span>
                  <span className="flex-none self-center">
                    <RowMenu
                      compact
                      title={i.name}
                      sub={`ผ่อน ${i.months} งวด · เหลือ ${fmt(p.unpaidAmount)} บาท`}
                      icon="credit_card"
                      items={[
                        {
                          icon: 'edit_note',
                          label: 'แก้ไขรายการผ่อน',
                          desc: p.billedCount + p.paidCount > 0
                            ? 'มีงวดที่เกิดขึ้นแล้ว แก้ได้เฉพาะรายละเอียด'
                            : 'แก้ยอด จำนวนงวด วันที่ และบัตรได้',
                          onClick: () => setInsForm({ installment: i }),
                        },
                        {
                          icon: 'cancel',
                          label: 'ยกเลิกสัญญา',
                          desc: 'หยุดงวดที่เหลือ เก็บงวดที่เกิดไปแล้วไว้เป็นประวัติ',
                          onClick: () => setInsDeleteTarget({ installment: i, progress: p, mode: 'cancel' }),
                        },
                        {
                          icon: 'delete',
                          label: 'ลบทิ้งทั้งรายการ',
                          desc: 'ใช้เมื่อบันทึกผิด — คืนเงินงวดที่จ่ายไปแล้วให้ด้วย',
                          danger: true,
                          onClick: () => setInsDeleteTarget({ installment: i, progress: p, mode: 'delete' }),
                        },
                      ]}
                    />
                  </span>
                </div>
                <div className="flex justify-between gap-2 text-[11px] text-faint mt-0.5">
                  <span>งวดละ {fmt(next?.amount ?? 0)}</span>
                  <span className="tabular-nums">งวด {done} จาก {i.months}</span>
                </div>
                {/* แถบเดียวบอกได้แค่สัดส่วน ซึ่งข้อความ "งวด x จาก y" บรรทัดบนบอกไปแล้ว
                    ป้ายรายงวดบอกต่อได้ว่างวดไหนครบกำหนดวันไหนและงวดไหนกำลังจะถูกเก็บ */}
                <div className="mt-1.5">
                  <EntryPips rows={p.rows} closingDay={card.closingDay} />
                </div>
                {next && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="flex-1 min-w-0 text-[11px] text-muted">
                      งวดถัดไป งวดที่ {next.seq} · {fmt(next.amount)} · ครบกำหนด {formatIsoThai(next.dueDate)}
                    </span>
                    <button
                      className="flex-none h-[30px] px-2.5 rounded-lg bg-ink text-white text-[11.5px] font-semibold hover:bg-black"
                      onClick={() => setPayEntryTarget({ installment: i, entry: next })}
                    >
                      จ่ายค่างวด
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="card px-[15px] py-3.5">
          <div className="text-[13px] font-semibold">บิลที่จ่ายแล้ว</div>
          {paidHistory.length === 0 ? (
            <p className="text-[11.5px] text-faint mt-2">ยังไม่มีบิลที่จ่ายแล้ว</p>
          ) : paidHistory.slice(0, showPaid ? undefined : 3).map((s) => (
            <div key={s.id} className="flex items-center gap-2.5 border-t border-[#F6F4EF] py-2">
              <span className="flex-1 min-w-0">
                <span className="block text-[11.5px] text-muted">รอบ {s.cycle} · ครบกำหนด {formatIsoThai(s.dueDate)}</span>
                <span className="block text-[11px] text-income">
                  {s.paidAt ? `จ่าย ${formatIsoThai(s.paidAt)}` : 'จ่ายแล้ว'}
                  {Number(s.paidAmount) > Number(s.amount)
                    ? ` · จ่ายเกิน ${fmt(Number(s.paidAmount) - Number(s.amount))}`
                    : ' · เต็มจำนวน'}
                </span>
              </span>
              <span className="tabular-nums flex-none text-xs font-medium">{fmt(s.amount)}</span>
              {Number(s.paidAmount) > 0 && (
                <button className="flex-none text-[11.5px] text-faint hover:text-expense" onClick={() => setUndoTarget(s)}>
                  ย้อน
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── ป๊อปอัป ─────────────────────────────────────────────────────── */}
      {payTarget && (
        <PayCardBillPopup statement={payTarget} cardLabel={formatCard(card)} onConfirm={handlePay} onCancel={() => setPayTarget(null)} busy={busy} />
      )}
      {cashbackTarget && (
        <CardCashbackPopup card={card} estimate={cashbackTarget.estimate} onConfirm={handleCashback} onCancel={() => setCashbackTarget(null)} busy={busy} />
      )}
      {advanceTarget && (
        <CardAdvancePopup card={advanceTarget} onConfirm={handleAdvance} onCancel={() => setAdvanceTarget(null)} busy={busy} />
      )}
      {feeTarget && (
        <CardFeePopup card={feeTarget} onConfirm={handleFee} onCancel={() => setFeeTarget(null)} busy={busy} />
      )}
      {payEntryTarget && (
        <PayInstallmentPopup
          installment={payEntryTarget.installment}
          entry={payEntryTarget.entry}
          card={card}
          onConfirm={handlePayEntry}
          onCancel={() => setPayEntryTarget(null)}
          busy={busy}
        />
      )}
      {editingTx && <EditTransactionPopup transaction={editingTx} onClose={() => setEditingTx(null)} />}

      {insForm && (
        <InstallmentFormPopup
          installment={insForm.installment}
          cardId={cardId}
          onClose={() => setInsForm(null)}
        />
      )}

      {chargeOpen && (
        <CardChargePopup
          card={card}
          onClose={() => setChargeOpen(false)}
          onSaved={() => { refreshCards(); refreshTransactions() }}
        />
      )}

      {/* ลบรายจ่ายบนบัตร — บอกให้ครบว่าอะไรจะย้อนตามไปบ้าง ไม่ใช่แค่ "ลบไหม" */}
      <ConfirmPopup
        open={!!cancelTxTarget}
        danger
        title="ลบรายการนี้"
        message={cancelTxTarget
          ? `"${cancelTxTarget.itemName}" ${fmt(cancelTxTarget.amount)} บาท (${formatIsoThai(cancelTxTarget.date)})\n\n` +
            describeTxCancelEffects(cancelTxTarget, { pendingPayments, taxInvoices, pendingIncomes })
              .map((t) => `· ${t}`).join('\n')
          : ''}
        confirmLabel="ลบรายการ"
        onCancel={() => setCancelTxTarget(null)}
        onConfirm={() => run(async () => {
          await cancelTx(cancelTxTarget)
          setCancelTxTarget(null)
        })}
      />

      {/* ยกเลิก = หยุดงวดที่เหลือ เก็บของที่เกิดไปแล้วไว้ · ลบ = ไม่ควรมีรายการนี้ตั้งแต่แรก
          สองอย่างนี้ต่างกันที่ปลายทางของเงิน จึงต้องบอกให้ชัดก่อนกดยืนยัน */}
      <ConfirmPopup
        open={!!insDeleteTarget}
        danger
        title={insDeleteTarget?.mode === 'delete' ? 'ลบรายการผ่อนทิ้ง' : 'ยกเลิกสัญญาผ่อน'}
        message={insDeleteTarget
          ? insDeleteTarget.mode === 'delete'
            ? `"${insDeleteTarget.installment.name}"\n` +
              `จะถูกลบออกทั้งรายการ พร้อมตารางงวดทั้งหมด\n` +
              (insDeleteTarget.progress.paidCount > 0
                ? `เงินของงวดที่จ่ายผ่านแอปไปแล้ว ${insDeleteTarget.progress.paidCount} งวด จะถูกคืนเข้ากระเป๋าต้นทางให้\n`
                : '') +
              `\nถ้ามีงวดที่เข้าบิลบัตรไปแล้ว จะลบไม่ได้ ให้ใช้ "ยกเลิกสัญญา" แทน`
            : `"${insDeleteTarget.installment.name}"\n` +
              `งวดที่เหลืออีก ${insDeleteTarget.progress.remainingCount} งวด (${fmt(insDeleteTarget.progress.remainingAmount)} บาท) จะถูกยกเลิก\n` +
              `งวดที่เรียกเก็บหรือจ่ายไปแล้วยังอยู่ตามเดิม เพราะเกิดขึ้นจริงแล้ว`
          : ''}
        confirmLabel={insDeleteTarget?.mode === 'delete' ? 'ลบทิ้ง' : 'ยกเลิกสัญญา'}
        onCancel={() => setInsDeleteTarget(null)}
        onConfirm={() => run(async () => {
          const { installment: ins, progress, mode } = insDeleteTarget
          if (mode === 'delete') {
            await deleteInstallment(ins.id, buildLogEntry({
              activityType: 'INSTALLMENT_DELETE',
              description:
                `ลบรายการผ่อน "${ins.name}" ${ins.months} งวด รวม ${fmt(ins.totalAmount)} บาท` +
                (progress.paidCount > 0 ? ` · คืนเงินงวดที่จ่ายไปแล้ว ${progress.paidCount} งวด` : ''),
              oldValue: ins,
            }))
          } else {
            await cancelInstallment(ins.id, buildLogEntry({
              activityType: 'INSTALLMENT_CANCEL',
              description: `ยกเลิกการผ่อน "${ins.name}" · เหลือ ${progress.remainingCount} งวด ${fmt(progress.remainingAmount)} บาท`,
              oldValue: ins,
            }))
          }
          await refreshWallet()
          setInsDeleteTarget(null)
        })}
      />

      {/* ติ๊ก/ถอนเครื่องหมายรายแถว — ถามก่อนทั้งสองทาง ตามที่แบบกำหนดไว้
          ข้อความบอกชัดว่าไม่ตัดเงิน เพราะปุ่มติ๊กในบิลชวนให้เข้าใจว่าเป็นการจ่าย */}
      <ConfirmPopup
        open={!!markTarget}
        title={markTarget?.on ? 'ทำเครื่องหมายว่าตรวจแล้ว' : 'เอาเครื่องหมายถูกออก'}
        message={markTarget
          ? markTarget.on
            ? `"${markTarget.row.name}" ${fmt(Math.abs(markTarget.row.amount))} บาท · รายการนี้จะขึ้นเครื่องหมายถูก ยกเลิกทีหลังได้\n\nไม่ตัดเงินจากกระเป๋า — บิลบัตรจ่ายทั้งใบที่ปุ่ม "จ่ายบิล" เหมือนเดิม`
            : `"${markTarget.row.name}" · เครื่องหมายถูกของรายการนี้จะถูกเอาออก`
          : ''}
        onConfirm={() => run(async () => {
          const { row, on } = markTarget
          if (on) await markRow({ cardId, cycle: current?.cycle ?? null, rowKey: row.key })
          else await unmarkRow(row.key)
          setMarkTarget(null)
        })}
        onCancel={() => setMarkTarget(null)}
        confirmLabel={markTarget?.on ? 'ทำเครื่องหมาย' : 'เอาออก'}
      />
      <ConfirmPopup
        open={!!autopayTarget}
        title="ยืนยันว่าธนาคารหักบัญชีแล้ว"
        message={autopayTarget
          ? `บันทึกว่าธนาคารหัก ${fmt(autopayTarget.amount)} บาท จากบัญชีที่ผูกไว้ สำหรับบิลรอบ ${autopayTarget.statement.cycle}?\n\nเงินจะถูกตัดจากบัญชีในระบบทันที`
          : ''}
        onConfirm={handleAutopayConfirm}
        onCancel={() => setAutopayTarget(null)}
        confirmLabel="ยืนยัน"
      />
      <ConfirmPopup
        open={!!undoTarget}
        title="ย้อนการจ่ายบิล"
        message={undoTarget
          ? `คืนเงิน ${fmt(undoTarget.paidAmount)} บาท กลับเข้ากระเป๋า และเปลี่ยนบิลรอบ ${undoTarget.cycle} กลับเป็นยังไม่จ่าย?\nใช้เมื่อกดจ่ายผิดรายการ หรือโอนไม่สำเร็จ ระบบจะบันทึกการยกเลิกไว้ในประวัติทั้งหมด`
          : ''}
        onConfirm={handleUndoPay}
        onCancel={() => setUndoTarget(null)}
        confirmLabel="ย้อนรายการ"
        danger
      />
      <ConfirmPopup
        open={!!undoAdvanceTarget}
        title="ย้อนการกดเงินสด"
        message={undoAdvanceTarget
          ? `ย้อนการกดเงินสด ${fmt(undoAdvanceTarget.amount)} บาท — เงินจะถูกหักคืนจากกระเป๋าและยอดหนี้บัตรลดลง`
          : ''}
        onConfirm={handleUndoAdvance}
        onCancel={() => setUndoAdvanceTarget(null)}
        confirmLabel="ย้อนรายการ"
        danger
      />
    </div>
  )
}
