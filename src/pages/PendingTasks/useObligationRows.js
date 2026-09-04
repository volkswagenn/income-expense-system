import { useMemo } from 'react'
import usePendingStore from '../../store/usePendingStore'
import useRecurringStore from '../../store/useRecurringStore'
import useCreditCardStore from '../../store/useCreditCardStore'
import useDebtStore from '../../store/useDebtStore'
import { toDateString } from '../../lib/cardCycle'
import { localDateStr, localMonthStr } from '../../lib/dateUtils'

/**
 * รวมทุกอย่างที่ "ต้องจ่าย" และ "รอรับ" จากทุกแหล่งให้เป็นแถวหน้าตาเดียวกัน
 *
 * ที่ต้องรวม เพราะเงินก้อนเดียวกันถูกเรียกเก็บคนละทาง: บิลบัตร งวดผ่อนในบิล
 * สัญญาผ่อนที่ตัดบัญชีเอง รายการค้างชำระ และรายการประจำ ถ้าดูแยกหน้าจะตอบไม่ได้ว่า
 * สัปดาห์นี้ต้องเตรียมเงินเท่าไร
 *
 * kind: card | installment | debt | receivable | pending | recurring | income
 */
export const OBLIGATION_KINDS = {
  pending: { label: 'ค้างจ่าย', dot: '#A8760B', tagBg: 'bg-pending-soft', tagFg: 'text-[#8A6A15]' },
  card: { label: 'บิลบัตร', dot: '#B3335C', tagBg: 'bg-expense-soft', tagFg: 'text-[#A93A2E]' },
  installment: { label: 'งวดผ่อน', dot: '#6D4AA8', tagBg: 'bg-recurring-soft', tagFg: 'text-[#5A3C90]' },
  debt: { label: 'หนี้สิน', dot: '#A8760B', tagBg: 'bg-pending-soft', tagFg: 'text-[#8A6A15]' },
  recurring: { label: 'รายการประจำ', dot: '#6D4AA8', tagBg: 'bg-recurring-soft', tagFg: 'text-[#5A3C90]' },
  tax: { label: 'ใบกำกับภาษี', dot: '#B4571E', tagBg: 'bg-[#FBEFE4]', tagFg: 'text-[#B4571E]' },
  income: { label: 'รอรับเงิน', dot: '#3A55C4', tagBg: 'bg-transfer-soft', tagFg: 'text-transfer' },
  receivable: { label: 'ลูกหนี้', dot: '#12795B', tagBg: 'bg-income-soft', tagFg: 'text-income' },
}

const num = (v) => Number(v ?? 0)

export default function useObligationRows() {
  const pending = usePendingStore((s) => s.pendingPayments)
  const incomes = usePendingStore((s) => s.pendingIncomes)
  const taxInvoices = usePendingStore((s) => s.taxInvoices)
  const recEntries = useRecurringStore((s) => s.entries)
  const recItems = useRecurringStore((s) => s.items)
  const statements = useCreditCardStore((s) => s.statements)
  const installments = useCreditCardStore((s) => s.installments)
  const instEntries = useCreditCardStore((s) => s.entries)
  const getCardLabel = useCreditCardStore((s) => s.getCardLabel)
  const debts = useDebtStore((s) => s.debts)
  const debtEntries = useDebtStore((s) => s.entries)
  const getProgress = useDebtStore((s) => s.getProgress)

  return useMemo(() => {
    const out = []
    const month = localMonthStr()
    const today = localDateStr()

    // ── บิลบัตรที่ปิดรอบแล้วแต่ยังไม่จ่าย ───────────────────────────────────
    for (const s of statements) {
      if (s.status === 'paid') continue
      out.push({
        key: `s-${s.id}`, kind: 'card',
        title: `บิลบัตร ${getCardLabel(s.cardId)}`,
        meta: `รอบ ${s.cycle} · ขั้นต่ำ ${num(s.minimumAmount).toLocaleString()}`,
        amount: num(s.amount) - num(s.paidAmount),
        due: s.dueDate, action: 'payCard', actionLabel: 'จ่ายบิล', data: s,
      })
    }

    // ── งวดถัดไปของสัญญาหนี้/ลูกหนี้ (งวดเดียวต่อสัญญา ไม่ยัดทั้งตาราง) ────
    const activeDebt = new Map(debts.filter((d) => d.status === 'active').map((d) => [d.id, d]))
    const seenDebt = new Set()
    for (const e of [...debtEntries].sort((a, b) => a.seq - b.seq)) {
      const d = activeDebt.get(e.debtId)
      if (!d || e.status !== 'pending' || seenDebt.has(d.id)) continue
      seenDebt.add(d.id)
      const recv = d.direction === 'receivable'
      out.push({
        key: `d-${e.id}`, kind: recv ? 'receivable' : 'debt',
        title: d.name,
        meta: `${d.counterparty || ''} · งวดที่ ${e.seq}/${d.months}`.replace(/^ · /, ''),
        amount: num(e.amount), due: e.dueDate,
        action: 'payDebt', actionLabel: recv ? 'รับคืน' : 'จ่ายงวด',
        data: { debt: d, entry: e, progress: getProgress(d.id) },
      })
    }

    // ── งวดผ่อนผ่านบัตร — จ่ายไม่ได้ตรงนี้ เพราะถูกเรียกเก็บรวมในบิลบัตร ───
    const activeInst = new Map(installments.filter((i) => i.status === 'active').map((i) => [i.id, i]))
    const seenInst = new Set()
    for (const e of [...instEntries].sort((a, b) => a.seq - b.seq)) {
      const i = activeInst.get(e.installmentId)
      if (!i || !['pending', 'billed'].includes(e.status) || seenInst.has(i.id)) continue
      seenInst.add(i.id)
      out.push({
        key: `i-${e.id}`, kind: 'installment',
        title: i.name,
        meta: `ผ่อนบัตร ${getCardLabel(i.cardId)} · งวดที่ ${e.seq}/${i.months}`,
        amount: num(e.amount), due: e.dueDate,
        action: 'goto', actionLabel: 'ดูสัญญา', goto: '/cards?view=debt',
        note: e.status === 'billed' ? 'อยู่ในบิลบัตรแล้ว' : 'เรียกเก็บผ่านบิลบัตร',
      })
    }

    // ── รายการค้างชำระ ─────────────────────────────────────────────────────
    for (const p of pending) {
      if (p.status !== 'pending') continue
      out.push({
        key: `p-${p.id}`, kind: 'pending',
        title: p.description || p.itemName || 'ค้างชำระ',
        meta: p.openDate ? `เปิดบิล ${p.openDate}` : 'ค้างชำระ',
        amount: num(p.amount), due: p.dueDate || toDateString(new Date()),
        action: 'payPending', actionLabel: 'จ่าย', data: p,
      })
    }

    // ── รายการประจำที่ยังไม่จ่ายของเดือนนี้ ─────────────────────────────────
    for (const e of recEntries) {
      if (e.month !== month || e.status !== 'pending') continue
      const it = recItems.find((x) => x.id === e.recurringId)
      out.push({
        key: `r-${e.id}`, kind: 'recurring',
        title: it?.name ?? 'รายการประจำ',
        meta: `รายจ่ายประจำ${it?.defaultMethod === 'card' ? ' · ตัดบัตร' : ''}`,
        amount: num(e.amount), due: e.dueDate,
        action: 'goto', actionLabel: 'ไปจ่าย', goto: '/transactions?tab=recurring',
      })
    }

    // ── ใบกำกับภาษีที่ยังไม่ได้รับ ───────────────────────────────────────────
    // ไม่ใช่เงินที่ต้องจ่าย แต่เป็นเอกสารที่ต้องตามเก็บ ถ้าไม่รวมไว้ที่นี่ก็ไม่มีหน้าไหน
    // เตือนเลย (ยอดจึงไม่ถูกนับในตัวเลขรวมด้านบน)
    for (const t of taxInvoices) {
      if (t.status !== 'waiting') continue
      out.push({
        key: `t-${t.id}`, kind: 'tax',
        title: t.itemName || 'รอใบกำกับภาษี',
        meta: t.receiptNo ? `เลขที่ใบเสร็จ ${t.receiptNo}` : 'ยังไม่ได้รับใบกำกับภาษี',
        amount: num(t.amount), due: t.dueDate || today,
        action: 'receiveTax', actionLabel: 'ได้รับแล้ว', data: t,
      })
    }

    // ── บิลที่เปิดไว้รอรับเงิน ──────────────────────────────────────────────
    for (const p of incomes) {
      if (p.status !== 'pending') continue
      out.push({
        key: `in-${p.id}`, kind: 'income',
        title: p.description || 'รอรับเงิน',
        meta: p.note || 'รอรับเงิน',
        amount: num(p.amount), due: p.date || today,
        action: 'receive', actionLabel: 'รับเงิน', data: p,
      })
    }

    return out.sort((a, b) => String(a.due).localeCompare(String(b.due)))
  }, [statements, debts, debtEntries, installments, instEntries, pending, incomes, taxInvoices, recEntries, recItems, getCardLabel, getProgress])
}
