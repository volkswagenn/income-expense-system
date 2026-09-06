import { useMemo } from 'react'
import useCreditCardStore from '../store/useCreditCardStore'
import useDebtStore from '../store/useDebtStore'
import usePendingStore from '../store/usePendingStore'
import useRecurringStore from '../store/useRecurringStore'
import usePaymentSlipStore from '../store/usePaymentSlipStore'
import useWalletStore from '../store/useWalletStore'
import useCategoryStore from '../store/useCategoryStore'
import { formatIsoThai } from '../lib/cardCycle'

/**
 * ประวัติการจ่ายเงินทุกชนิดรวมเป็นรายการเดียว
 *
 * การจ่ายในระบบนี้อยู่กระจายห้าตาราง เพราะแต่ละอันมีกติกาเงินคนละแบบ
 * (จ่ายบิลบัตรคือย้ายเงินไปปิดหนี้ ไม่ใช่รายจ่าย · จ่ายค่างวดคือรายจ่ายจริง ฯลฯ)
 * การรวมจึงทำที่ชั้นอ่านอย่างเดียวแบบนี้ ไม่ใช่ยัดทุกอย่างลงตารางเดียวตั้งแต่แรก
 * ซึ่งจะทำให้กติกาเงินของแต่ละชนิดปนกันจนแก้ทีหลังไม่ได้
 *
 * แต่ละแถวหน้าตาเหมือนกันหมด: จ่ายเมื่อไร จ่ายอะไร เท่าไร จากกระเป๋าไหน สลิปอยู่ไหน
 */

export const PAYMENT_KINDS = {
  card_bill:        { label: 'บิลบัตรเครดิต', icon: 'credit_card',     tone: 'bg-expense-soft text-[#A93A2E]' },
  card_installment: { label: 'ค่างวดผ่อนบัตร', icon: 'credit_card',     tone: 'bg-recurring-soft text-[#5A3C90]' },
  debt:             { label: 'งวดหนี้สิน',     icon: 'receipt_long',    tone: 'bg-pending-soft text-[#8A6A15]' },
  pending:          { label: 'รายการค้างชำระ', icon: 'pending_actions', tone: 'bg-pending-soft text-[#8A6A15]' },
  recurring:        { label: 'รายการประจำ',    icon: 'history',         tone: 'bg-recurring-soft text-[#5A3C90]' },
}

const num = (v) => Number(v ?? 0)
/** timestamptz หรือ date → 'YYYY-MM-DD' ตามเวลาเครื่อง */
const dayOf = (v) => {
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function usePaymentHistory() {
  const cards = useCreditCardStore((s) => s.cards)
  const statements = useCreditCardStore((s) => s.statements)
  const legs = useCreditCardStore((s) => s.statementPayments)
  const installments = useCreditCardStore((s) => s.installments)
  const entries = useCreditCardStore((s) => s.entries)
  const getCardShortLabel = useCreditCardStore((s) => s.getCardShortLabel)
  const debts = useDebtStore((s) => s.debts)
  const debtEntries = useDebtStore((s) => s.entries)
  const pendingPayments = usePendingStore((s) => s.pendingPayments)
  const recItems = useRecurringStore((s) => s.items)
  const recEntries = useRecurringStore((s) => s.entries)
  const slips = usePaymentSlipStore((s) => s.slips)
  const accounts = useWalletStore((s) => s.transferAccounts)
  const getCategoryName = useCategoryStore((s) => s.getCategoryName)

  return useMemo(() => {
    const slipOf = new Map(slips.map((s) => [`${s.kind}:${s.refId}`, s]))
    const accountName = (id) => {
      const a = accounts.find((x) => x.id === id)
      if (!a) return null
      return a.bankName ? `${a.bankName} — ${a.name}` : a.name
    }
    const source = (method, accountId) =>
      method === 'transfer' ? (accountName(accountId) ?? 'เงินโอน') : method === 'cash' ? 'เงินสด' : null

    const rows = []
    const push = (kind, refId, o) => rows.push({
      key: `${kind}:${refId}`, kind, refId, ...o, slip: slipOf.get(`${kind}:${refId}`) ?? null,
    })

    // ── 1. จ่ายบิลบัตร ────────────────────────────────────────────────────
    // ตารางขาการจ่ายเพิ่งมีในรุ่นหลัง บิลที่จ่ายก่อนหน้านั้นไม่มีขา จึงถอยไปอ่าน
    // paid_at/paid_method ที่ตัวใบแทน เพื่อให้ประวัติเก่าไม่หายไปจากหน้านี้
    const stmtById = new Map(statements.map((s) => [s.id, s]))
    const legged = new Set(legs.map((l) => l.statementId))
    for (const l of legs) {
      const st = stmtById.get(l.statementId)
      push('card_bill', l.id, {
        paidAt: l.paidAt, day: dayOf(l.paidAt), amount: num(l.amount),
        title: `บิลบัตร ${getCardShortLabel(st?.cardId)}`,
        detail: st ? `รอบ ${st.cycle} · ครบกำหนด ${formatIsoThai(st.dueDate)}` : '',
        source: source(l.method, l.transferAccountId),
        ref: st ?? null,
      })
    }
    for (const s of statements) {
      if (num(s.paidAmount) <= 0 || legged.has(s.id)) continue
      push('card_bill', s.id, {
        paidAt: s.paidAt, day: dayOf(s.paidAt), amount: num(s.paidAmount),
        title: `บิลบัตร ${getCardShortLabel(s.cardId)}`,
        detail: `รอบ ${s.cycle} · ครบกำหนด ${formatIsoThai(s.dueDate)}`,
        source: source(s.paidMethod, s.transferAccountId),
        legacy: true, ref: s,
      })
    }

    // ── 2. จ่ายค่างวดผ่อนบัตรทีละงวด (เงินออกจากกระเป๋า ไม่ผ่านบิล) ────────
    const insById = new Map(installments.map((i) => [i.id, i]))
    for (const e of entries) {
      if (e.status !== 'paid' || !e.paidAt) continue
      const i = insById.get(e.installmentId)
      push('card_installment', e.id, {
        paidAt: e.paidAt, day: dayOf(e.paidAt), amount: num(e.paidAmount ?? e.amount),
        title: i?.name ?? 'ค่างวดผ่อน',
        detail: `งวดที่ ${e.seq}${i ? `/${i.months}` : ''}${i ? ` · ${getCardShortLabel(i.cardId)}` : ''}`,
        source: source(e.paidMethod, e.transferAccountId),
        ref: e,
      })
    }

    // ── 3. จ่ายงวดหนี้สิน / รับคืนจากลูกหนี้ ───────────────────────────────
    const debtById = new Map(debts.map((d) => [d.id, d]))
    for (const e of debtEntries) {
      if (e.status !== 'paid' || !e.paidAt) continue
      const d = debtById.get(e.debtId)
      push('debt', e.id, {
        paidAt: e.paidAt, day: dayOf(e.paidAt), amount: num(e.amount),
        title: d?.name ?? 'งวดหนี้สิน',
        detail: `งวดที่ ${e.seq}${d ? `/${d.months}` : ''}${d?.counterparty ? ` · ${d.counterparty}` : ''}`,
        source: source(e.paidMethod, e.transferAccountId),
        incoming: d?.direction === 'receivable',
        ref: e,
      })
    }

    // ── 4. จ่ายรายการค้างชำระ ──────────────────────────────────────────────
    for (const p of pendingPayments) {
      if (p.status !== 'paid' || !p.paidAt) continue
      push('pending', p.id, {
        paidAt: p.paidAt, day: dayOf(p.paidAt), amount: num(p.amount),
        title: p.itemName || p.description || 'รายการค้างชำระ',
        // getCategoryName คืน '—' เมื่อหาไม่เจอ ซึ่งไม่ควรกลายเป็นบรรทัดว่างๆ ต่อท้าย
        detail: [p.vendor, p.category ? getCategoryName(p.category) : null]
          .filter((x) => x && x !== '—').join(' · '),
        source: source(p.paidMethod, p.transferAccountId),
        ref: p,
      })
    }

    // ── 5. จ่ายรายการประจำ ─────────────────────────────────────────────────
    const recById = new Map(recItems.map((i) => [i.id, i]))
    for (const e of recEntries) {
      if (e.status !== 'paid' || !e.paidAt) continue
      const it = recById.get(e.recurringId)
      push('recurring', e.id, {
        paidAt: e.paidAt, day: dayOf(e.paidAt), amount: num(e.amount),
        title: it?.name ?? 'รายการประจำ',
        detail: `รอบเดือน ${e.month}`,
        source: source(e.paidMethod, e.transferAccountId),
        ref: e,
      })
    }

    rows.sort((a, b) => String(b.paidAt ?? '').localeCompare(String(a.paidAt ?? '')))
    return rows
  }, [
    cards, statements, legs, installments, entries, debts, debtEntries,
    pendingPayments, recItems, recEntries, slips, accounts,
    getCardShortLabel, getCategoryName,
  ])
}
