import { create } from 'zustand'
import * as cardApi from '../lib/api/creditCards'

/**
 * บัตรเครดิต
 *
 * store นี้เป็นแค่ "แคชของยอดบนเซิร์ฟเวอร์" เหมือน useWalletStore
 * ยอดหนี้ (outstanding) ถูกขยับที่ฐานข้อมูลผ่าน apply_wallet_effect ตอนบันทึก/แก้/ยกเลิก
 * รายการ ฝั่งหน้าจอจึงต้องเรียก refresh() หลังงานพวกนั้นเสมอ ห้ามคำนวณยอดเอง
 *
 * บัตรเป็นหนี้ ไม่ใช่ทรัพย์สิน จึงไม่ถูกรวมเข้า total() ของกระเป๋าเงิน
 * ยอดรวมหน้าแรกยังตอบคำถามว่า "มีเงินเท่าไร" ไม่ใช่ "รวยเท่าไร"
 */
export const INITIAL = { cards: [] }

const useCreditCardStore = create((set, get) => ({
  ...INITIAL,
  _reset: () => set(INITIAL),

  _hydrate: (cards) => set({ cards: cards ?? [] }),

  refresh: async () => {
    const cards = await cardApi.listCreditCards()
    set({ cards })
    return cards
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

  reorderCards: async (orderedIds) => {
    await cardApi.reorderCreditCards(orderedIds)
    set((s) => ({ cards: orderedIds.map((id) => s.cards.find((c) => c.id === id)).filter(Boolean) }))
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
}))

export default useCreditCardStore
