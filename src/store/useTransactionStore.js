import { create } from 'zustand'
import * as txApi from '../lib/api/transactions'

export const INITIAL = { transactions: [] }

/**
 * ธุรกรรมทั้งหมด
 *
 * store เก็บเฉพาะช่วง 24 เดือนล่าสุดที่โหลดมาตอนเปิดแอป (ข้อมูลเก่ากว่านั้นยังอยู่ครบ
 * ในฐานข้อมูล ไม่ได้ถูกลบ — ดึงเพิ่มได้ด้วย loadRange เมื่อผู้ใช้เลือกช่วงย้อนหลัง)
 *
 * การบันทึกรายการควรส่ง effect + log มาด้วยเสมอ เพื่อให้ insert + ตัดเงิน + เขียน log
 * จบใน transaction เดียวที่ฐานข้อมูล ถ้าไม่ส่ง effect มาจะเป็นการ insert เฉยๆ
 */
const useTransactionStore = create((set, get) => ({
  ...INITIAL,
  _reset: () => set(INITIAL),

  _hydrate: (transactions) => set({ transactions: transactions ?? [] }),

  addTransaction: async (data, { effect = null, log = null } = {}) => {
    const tx = await txApi.createTransaction(data, { effect, log })
    set((s) => ({ transactions: [tx, ...s.transactions] }))
    return tx
  },

  updateTransaction: async (id, changes) => {
    const tx = await txApi.updateTransaction(id, changes)
    set((s) => ({ transactions: s.transactions.map((t) => (t.id === id ? { ...t, ...tx } : t)) }))
    return tx
  },

  /**
   * ยกเลิกรายการ — ฐานข้อมูลจะคืนเงิน ลบรายการค้าง/ใบกำกับที่ผูกอยู่
   * และย้อนสถานะรายการประจำให้ในคำสั่งเดียว
   */
  deleteTransaction: async (id, { effect = null, log = null } = {}) => {
    await txApi.cancelTransaction(id, { effect, log })
    set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) }))
  },

  /** ดึงรายการของช่วงวันที่ที่ระบุมาเพิ่ม (ใช้ตอนดูรายงานย้อนหลังเกินช่วงที่โหลดไว้) */
  loadRange: async (from, to) => {
    const rows = await txApi.listTransactions({ from, to })
    set((s) => {
      const seen = new Set(s.transactions.map((t) => t.id))
      const fresh = rows.filter((t) => !seen.has(t.id))
      if (fresh.length === 0) return s
      return {
        transactions: [...s.transactions, ...fresh].sort((a, b) => (a.date < b.date ? 1 : -1)),
      }
    })
    return rows
  },

  getByType: (type) => get().transactions.filter((t) => t.type === type),

  getByDateRange: (startDate, endDate) =>
    get().transactions.filter((t) => t.date >= startDate && t.date <= endDate),

  getByDate: (date) => get().transactions.filter((t) => t.date === date),

  getIncomeByDate: (date) =>
    get().transactions.filter((t) => t.type === 'income' && t.date === date),

  getExpenseByDate: (date) =>
    get().transactions.filter((t) => t.type === 'expense' && t.date === date),

  /**
   * ลบทุกรายการของวันนั้น — ใช้ตอนนำเข้าข้อมูลทับวันเดิม
   * ยกเลิกทีละรายการเพื่อให้ฐานข้อมูลคืนเงินและเก็บกวาดรายการที่ผูกอยู่ให้ครบ
   */
  deleteByDate: async (date, { reverseEffect } = {}) => {
    const targets = get().transactions.filter((t) => t.date === date)
    for (const tx of targets) {
      await get().deleteTransaction(tx.id, { effect: reverseEffect?.(tx) ?? null })
    }
    return targets.length
  },
}))

export default useTransactionStore
