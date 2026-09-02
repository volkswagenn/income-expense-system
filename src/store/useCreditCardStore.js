import { create } from 'zustand'
import * as cardApi from '../lib/api/creditCards'
import * as stmtApi from '../lib/api/cardStatements'
import * as instApi from '../lib/api/cardInstallments'
import { cyclePeriod, pendingCycles, toDateString, clampedDate, dueDateFor, cycleKey } from '../lib/cardCycle'
import useTransactionStore from './useTransactionStore'

/**
 * บัตรเครดิตและใบแจ้งยอด
 *
 * store นี้เป็นแค่ "แคชของยอดบนเซิร์ฟเวอร์" เหมือน useWalletStore
 * ยอดหนี้ (outstanding) ถูกขยับที่ฐานข้อมูลผ่าน apply_wallet_effect ตอนบันทึก/แก้/ยกเลิก
 * รายการ และตอนจ่ายบิล ฝั่งหน้าจอจึงต้องเรียก refresh() หลังงานพวกนั้นเสมอ
 *
 * บัตรเป็นหนี้ ไม่ใช่ทรัพย์สิน จึงไม่ถูกรวมเข้า total() ของกระเป๋าเงิน
 * ยอดรวมหน้าแรกยังตอบคำถามว่า "มีเงินเท่าไร" ไม่ใช่ "รวยเท่าไร"
 */
export const INITIAL = { cards: [], statements: [], installments: [], entries: [], closing: false }

const useCreditCardStore = create((set, get) => ({
  ...INITIAL,
  _reset: () => set(INITIAL),

  _hydrate: (data) => set({
    cards: data?.cards ?? [],
    statements: data?.statements ?? [],
    installments: data?.installments ?? [],
    entries: data?.entries ?? [],
  }),

  refresh: async () => {
    const [cards, statements, inst] = await Promise.all([
      cardApi.listCreditCards(),
      stmtApi.listCardStatements(),
      instApi.listInstallments(),
    ])
    set({ cards, statements, installments: inst.installments, entries: inst.entries })
    return { cards, statements, ...inst }
  },

  // ── จัดการบัตร ────────────────────────────────────────────────────────────

  createCard: async (data) => {
    const card = await cardApi.createCreditCard(data)
    set((s) => ({ cards: [...s.cards, card] }))
    return card
  },

  updateCard: async (id, changes) => {
    const card = await cardApi.updateCreditCard(id, changes)
    set((s) => ({ cards: s.cards.map((c) => (c.id === id ? { ...c, ...card } : c)) }))
    return card
  },

  deleteCard: async (id) => {
    await cardApi.deleteCreditCard(id)
    set((s) => ({ cards: s.cards.filter((c) => c.id !== id) }))
  },

  /** ปรับยอดหนี้ยกมา — delta เป็นบวกคือหนี้เพิ่ม */
  adjustOutstanding: async (id, delta) => {
    await cardApi.adjustOutstanding(id, delta)
    await get().refresh()
  },

  // ── รอบบิล ────────────────────────────────────────────────────────────────

  /**
   * ปิดทุกรอบที่ผ่านวันสรุปยอดไปแล้วแต่ยังไม่มีใบแจ้งยอด
   *
   * เรียกตอนเปิดหน้า แบบเดียวกับ generateEntries ของรายการประจำ — ไม่ต้องมี cron
   * ปิดทีละรอบตามลำดับเก่าไปใหม่ เพราะยอดค้างของรอบก่อนถูกยกไปเป็นยอดยกมาของรอบถัดไป
   * ฝั่งฐานข้อมูลกันปิดซ้ำด้วย unique (card_id, cycle) อยู่แล้ว เรียกซ้ำจึงไม่เสียหาย
   */
  ensureStatements: async () => {
    if (get().closing) return
    const cards = get().cards.filter((c) => !c.deleted)
    if (cards.length === 0) return

    const todo = []
    for (const card of cards) {
      const existing = new Set(
        get().statements.filter((s) => s.cardId === card.id).map((s) => s.cycle)
      )
      for (const period of pendingCycles(card, existing)) {
        todo.push({ cardId: card.id, period })
      }
    }
    if (todo.length === 0) return

    set({ closing: true })
    try {
      // ต้องทีละใบตามลำดับ ห้ามยิงขนาน — ยอดยกมาของใบถัดไปอ่านจากใบก่อนหน้า
      for (const { cardId, period } of todo) {
        await stmtApi.closeStatement(cardId, period)
      }
      await get().refresh()
    } catch (err) {
      console.warn('ปิดรอบบิลไม่สำเร็จ:', err?.message ?? err)
    } finally {
      set({ closing: false })
    }
  },

  payStatement: async (statementId, params) => {
    const statement = await stmtApi.payStatement(statementId, params)
    await get().refresh()
    return statement
  },

  undoPayment: async (statementId, amount, log) => {
    const statement = await stmtApi.undoPayment(statementId, amount, log)
    await get().refresh()
    return statement
  },

  // ── ผ่อนชำระ ──────────────────────────────────────────────────────────────

  createInstallment: async (cardId, data, schedule, log) => {
    const ins = await instApi.createInstallment(cardId, data, schedule, log)
    await get().refresh()
    return ins
  },

  /** จ่ายค่างวดทีละงวด — เงินออกจากบัญชี/เงินสด ไม่ผ่านบัตร */
  payEntry: async (entryId, params) => {
    const entry = await instApi.payInstallmentEntry(entryId, params)
    await get().refresh()
    return entry
  },

  /** ย้อนการจ่ายค่างวด */
  undoEntry: async (entryId, log) => {
    const entry = await instApi.undoInstallmentEntry(entryId, log)
    await get().refresh()
    return entry
  },

  settleInstallment: async (id, params) => {
    const ins = await instApi.settleInstallment(id, params)
    await get().refresh()
    return ins
  },

  cancelInstallment: async (id, log) => {
    const ins = await instApi.cancelInstallment(id, log)
    await get().refresh()
    return ins
  },

  updateInstallment: async (id, changes) => {
    const ins = await instApi.updateInstallment(id, changes)
    set((s) => ({ installments: s.installments.map((x) => (x.id === id ? { ...x, ...ins } : x)) }))
    return ins
  },

  /** งวดของสัญญาหนึ่ง เรียงตามลำดับงวด */
  getEntries: (installmentId) =>
    get().entries.filter((e) => e.installmentId === installmentId).sort((a, b) => a.seq - b.seq),

  /**
   * สรุปความคืบหน้าของสัญญาผ่อนหนึ่งรายการ
   *
   * งวดถือว่า "จ่ายแล้ว" เมื่อใบแจ้งยอดที่งวดนั้นอยู่ถูกจ่ายครบ — อ่านจากใบ ไม่เก็บซ้ำ
   * ถ้าเก็บสองที่ วันหนึ่งจะมีที่หนึ่งอัปเดตไม่ทันแล้วตัวเลขสองหน้าจะขัดกัน
   */
  getInstallmentProgress: (installmentId) => {
    const ins = get().installments.find((i) => i.id === installmentId)
    if (!ins) return null
    const entries = get().getEntries(installmentId)
    const stmts = get().statements

    const rows = entries.map((e) => {
      const stmt = e.statementId ? stmts.find((s) => s.id === e.statementId) : null
      // งวดจ่ายแล้วได้ 2 ทาง: จ่ายผ่านบิล (ดูจากใบแจ้งยอด) หรือจ่ายทีละงวดจากบัญชี
      // (สถานะ paid มาจากฐานข้อมูลตรงๆ พร้อมเวลาที่จ่ายของตัวเอง)
      let status = e.status                       // pending | billed | paid | cancelled
      if (status === 'billed' && stmt?.status === 'paid') status = 'paid'
      const paidAt = e.status === 'paid' ? e.paidAt : (stmt?.status === 'paid' ? stmt.paidAt : null)
      return { ...e, status, paidAt }
    })

    const paid = rows.filter((r) => r.status === 'paid')
    // prepaid = ผ่อนมาก่อนเริ่มใช้แอป ถือว่าผ่านไปแล้วเหมือนกัน แต่แยกนับไว้
    // เพราะไม่มีรายจ่ายและไม่เคยขยับยอดหนี้ในระบบเรา
    const prepaid = rows.filter((r) => r.status === 'prepaid')
    const remaining = rows.filter((r) => r.status === 'pending')
    return {
      rows,
      paidCount: paid.length,
      prepaidCount: prepaid.length,
      billedCount: rows.filter((r) => r.status === 'billed').length,
      remainingCount: remaining.length,
      remainingAmount: remaining.reduce((s, r) => s + Number(r.amount || 0), 0),
      paidAmount: paid.reduce((s, r) => s + Number(r.amount || 0), 0),
    }
  },

  /** สัญญาที่ยังผ่อนอยู่ ใช้ทำ badge บนแท็บ */
  getActiveInstallments: (cardId = null) =>
    get().installments.filter((i) => i.status === 'active' && (!cardId || i.cardId === cardId)),

  /** ยอดผ่อนที่ยังไม่ถูกเรียกเก็บของบัตรใบหนึ่ง — ธนาคารกันวงเงินไว้แล้วตั้งแต่วันซื้อ */
  getUnbilledInstallmentTotal: (cardId) => {
    const ids = new Set(
      get().installments.filter((i) => i.status === 'active' && i.cardId === cardId).map((i) => i.id)
    )
    return get().entries
      .filter((e) => ids.has(e.installmentId) && e.status === 'pending')
      .reduce((s, e) => s + Number(e.amount || 0), 0)
  },

  /**
   * วงเงินที่ใช้ไปจริง = หนี้คงค้าง + ยอดผ่อนที่ยังไม่ถูกเรียกเก็บ
   * เพราะธนาคารกันวงเงินเต็มก้อนตั้งแต่วันที่ซื้อ ไม่ได้กันทีละงวด
   */
  getCardLimitUsage: (cardId) => {
    const card = get().getCard(cardId)
    if (!card) return null
    const unbilled = get().getUnbilledInstallmentTotal(cardId)
    const used = (Number(card.outstanding) || 0) + unbilled
    const limit = Number(card.creditLimit) || 0
    return { used, unbilled, limit, remaining: limit - used, over: limit > 0 && used > limit }
  },

  // ── ตัวช่วยอ่านค่า ────────────────────────────────────────────────────────

  getCard: (id) => get().cards.find((c) => c.id === id),

  /** บัตรที่ยังใช้งานอยู่ — ตัวเลือกในฟอร์มต้องไม่โชว์บัตรที่ปิดไปแล้ว */
  getActiveCards: () => get().cards.filter((c) => c.enabled),

  /** มีบัตรใบเดียว → ใช้ใบนั้นอัตโนมัติ ไม่ต้องให้ผู้ใช้เลือก */
  resolveCardId: (id) => {
    const cards = get().getActiveCards()
    if (id && cards.some((c) => c.id === id)) return id
    return cards.length === 1 ? cards[0].id : null
  },

  /**
   * ชื่อเต็มของบัตร เช่น "กสิกรไทย — Credit Card K+ ···6931"
   *
   * ผู้ใช้มักกรอกชื่อธนาคารกับชื่อบัตรเหมือนกัน (หรือชื่อหนึ่งมีอีกชื่ออยู่ข้างใน)
   * ถ้าต่อกันตรงๆ จะได้ "Ture Pay Next — Ture Pay Next" ซึ่งยาวและอ่านแล้วงง
   * จึงตัดส่วนที่ซ้ำออกก่อนเสมอ
   */
  getCardLabel: (id) => {
    const c = get().cards.find((x) => x.id === id)
    if (!c) return 'ไม่ระบุบัตร'
    const bank = (c.bankName || '').trim()
    const name = (c.name || '').trim()
    let base
    if (!bank) base = name
    else if (!name) base = bank
    else if (name.includes(bank)) base = name
    else if (bank.includes(name)) base = bank
    else base = `${bank} — ${name}`
    return c.last4 ? `${base} ···${c.last4}` : base
  },

  /**
   * ชื่อสั้นสำหรับที่แคบ (ปฏิทิน, กล่องข้อมูลเมื่อชี้เมาส์)
   * เอาแค่ชื่อบัตรกับเลขท้าย ซึ่งเป็นส่วนที่แยกแยะบัตรได้จริง ตัดชื่อธนาคารทิ้ง
   */
  getCardShortLabel: (id, maxLen = 22) => {
    const c = get().cards.find((x) => x.id === id)
    if (!c) return 'ไม่ระบุบัตร'
    let name = (c.name || c.bankName || 'บัตร').trim()
    if (name.length > maxLen) name = name.slice(0, maxLen - 1).trimEnd() + '…'
    return c.last4 ? `${name} ···${c.last4}` : name
  },

  /** หนี้รวมทุกใบ — ใช้บนหน้าแรกและหน้ากระเป๋าเงิน */
  getTotalOutstanding: () => get().cards.reduce((sum, c) => sum + (Number(c.outstanding) || 0), 0),

  /** ใบแจ้งยอดของบัตรใบหนึ่ง เรียงใหม่ก่อน */
  getStatements: (cardId) => get().statements.filter((s) => s.cardId === cardId),

  /** ใบที่ยังจ่ายไม่ครบ ทั้งร้าน เรียงตามวันครบกำหนด */
  getUnpaidStatements: () =>
    get().statements
      .filter((s) => s.status !== 'paid')
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)),

  /** ยอดที่ต้องจ่ายรวมทุกใบที่ยังค้าง */
  getDueTotal: () =>
    get().getUnpaidStatements().reduce((sum, s) => sum + (Number(s.amount) - Number(s.paidAmount)), 0),

  /**
   * บิลบัตรที่ต้องจ่ายในอีก N เดือนข้างหน้า — ทั้งที่ปิดรอบแล้วและที่ยังไม่ปิด
   *
   * มีสองชนิดที่ต้องแยกให้ผู้ใช้เห็นชัด
   *   • ปิดรอบแล้ว (closed) — ยอดนิ่งแล้ว ไม่เปลี่ยนอีก
   *   • ประมาณการ (projected) — รอบยังไม่ปิด ยอดยังขยับได้ทุกครั้งที่รูด
   *     คิดจากรายการที่รูดไปแล้วในรอบ บวกงวดผ่อนที่จะถูกเรียกเก็บในรอบนั้น
   *
   * ตั้งใจไม่รวมยอดยกมาในตัวประมาณการ เพราะยังไม่รู้ว่าบิลรอบก่อนจะถูกจ่ายครบไหม
   * เดาแล้วผิดแย่กว่าไม่เดา
   */
  getUpcomingBills: (months = 2) => {
    const today = new Date()
    const horizon = new Date(today.getFullYear(), today.getMonth() + months, today.getDate())
    const txs = useTransactionStore.getState().transactions
    const rows = []

    for (const card of get().cards.filter((c) => c.enabled)) {
      // 1) ใบที่ปิดรอบแล้วและยังจ่ายไม่ครบ — ยอดแน่นอน
      for (const s of get().statements) {
        if (s.cardId !== card.id || s.status === 'paid') continue
        const due = new Date(`${s.dueDate}T00:00:00`)
        if (due > horizon) continue
        rows.push({
          key: `s-${s.id}`,
          kind: 'closed',
          cardId: card.id,
          cycle: s.cycle,
          dueDate: s.dueDate,
          due,
          amount: Number(s.amount) - Number(s.paidAmount),
          overdue: due < new Date(today.getFullYear(), today.getMonth(), today.getDate()),
        })
      }

      // 2) รอบที่ยังไม่ปิด ไล่ไปข้างหน้าจนพ้นช่วงที่ดู
      const closed = new Set(get().statements.filter((s) => s.cardId === card.id).map((s) => s.cycle))
      const base = cyclePeriod(card.closingDay, card.dueDay)
      for (let k = 0; k <= months + 1; k++) {
        const end = clampedDate(base.end.getFullYear(), base.end.getMonth() + k, card.closingDay)
        const due = dueDateFor(end, card.dueDay)
        if (due > horizon) break
        const cycle = cycleKey(end)
        if (closed.has(cycle)) continue

        const prevEnd = clampedDate(end.getFullYear(), end.getMonth() - 1, card.closingDay)
        const start = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), prevEnd.getDate() + 1)
        const from = toDateString(start)
        const to = toDateString(end)

        const inRange = txs.filter((t) => t.cardId === card.id && t.date >= from && t.date <= to)
        const spend = inRange.filter((t) => t.type === 'expense')
          .reduce((s, t) => s + Number(t.amount || 0), 0)
        const credit = inRange.filter((t) => t.type === 'income')
          .reduce((s, t) => s + Number(t.amount || 0), 0)

        // งวดผ่อนที่จะถูกเรียกเก็บในรอบนี้ ยังไม่เป็น transaction จึงต้องบวกเพิ่ม
        const activeIds = new Set(
          get().installments.filter((i) => i.status === 'active' && i.cardId === card.id).map((i) => i.id)
        )
        const installment = get().entries
          .filter((e) => activeIds.has(e.installmentId) && e.cycle === cycle && e.status === 'pending')
          .reduce((s, e) => s + Number(e.amount || 0), 0)

        const amount = spend - credit + installment
        if (amount <= 0) continue
        rows.push({
          key: `p-${card.id}-${cycle}`,
          kind: 'projected',
          cardId: card.id,
          cycle,
          dueDate: toDateString(due),
          due,
          amount,
          installment,
          overdue: false,
        })
      }
    }

    rows.sort((a, b) => a.due - b.due)
    const closedTotal = rows.filter((r) => r.kind === 'closed').reduce((s, r) => s + r.amount, 0)
    const projectedTotal = rows.filter((r) => r.kind === 'projected').reduce((s, r) => s + r.amount, 0)
    return { rows, closedTotal, projectedTotal, total: closedTotal + projectedTotal, months, horizon }
  },

  /**
   * ยอดที่สะสมอยู่ในรอบที่ยังไม่ปิด — คำนวณสดจากรายการ ไม่เก็บในฐานข้อมูล
   * ตอบคำถามว่า "ตอนนี้ก่อหนี้ก้อนหน้าไว้เท่าไรแล้ว"
   */
  getCurrentCycle: (cardId) => {
    const card = get().getCard(cardId)
    if (!card) return null
    const period = cyclePeriod(card.closingDay, card.dueDay)
    const from = toDateString(period.start)
    const to = toDateString(period.end)
    const txs = useTransactionStore.getState().transactions
      .filter((t) => t.cardId === cardId && t.date >= from && t.date <= to)

    const spend = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount || 0), 0)
    const credit = txs.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount || 0), 0)
    return { ...period, spend, credit, net: spend - credit, count: txs.length }
  },
}))

export default useCreditCardStore
