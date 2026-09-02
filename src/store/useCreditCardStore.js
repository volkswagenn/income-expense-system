import { create } from 'zustand'
import * as cardApi from '../lib/api/creditCards'
import * as stmtApi from '../lib/api/cardStatements'
import { cyclePeriod, pendingCycles, toDateString } from '../lib/cardCycle'
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
export const INITIAL = { cards: [], statements: [], closing: false }

const useCreditCardStore = create((set, get) => ({
  ...INITIAL,
  _reset: () => set(INITIAL),

  _hydrate: (data) => set({
    cards: data?.cards ?? [],
    statements: data?.statements ?? [],
  }),

  refresh: async () => {
    const [cards, statements] = await Promise.all([
      cardApi.listCreditCards(),
      stmtApi.listCardStatements(),
    ])
    set({ cards, statements })
    return { cards, statements }
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

  getCardLabel: (id) => {
    const c = get().cards.find((x) => x.id === id)
    if (!c) return 'ไม่ระบุบัตร'
    const base = c.bankName ? `${c.bankName} — ${c.name}` : c.name
    return c.last4 ? `${base} ···${c.last4}` : base
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
