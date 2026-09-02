import { create } from 'zustand'
import { format, subDays } from 'date-fns'
import * as txApi from '../lib/api/transactions'

// loadedFrom = วันแรกสุดที่โหลดมาไว้ใน store แล้ว (รายการเก่ากว่านี้ยังอยู่ในฐานข้อมูล)
export const INITIAL = { transactions: [], loadedFrom: null }

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

  _hydrate: (transactions) =>
    set({ transactions: transactions ?? [], loadedFrom: txApi.defaultRangeStart() }),

  /** ดึงช่วงที่โหลดไว้ใหม่ทั้งชุด — ใช้เมื่อ realtime แจ้งว่าเครื่องอื่นแก้รายการ */
  refresh: async () => {
    const from = get().loadedFrom ?? txApi.defaultRangeStart()
    const rows = await txApi.listTransactions({ from })
    set({ transactions: rows, loadedFrom: from })
  },

  /**
   * ใส่รายการที่ฐานข้อมูลสร้างให้จาก RPC อื่น (จ่ายรายการค้าง / รับเงินรอรับ)
   * เข้า store โดยไม่ต้องดึงใหม่ทั้งชุด — ข้ามถ้ามีอยู่แล้ว (realtime อาจใส่ให้ก่อน)
   */
  insertLocal: (tx) =>
    set((s) => (s.transactions.some((t) => t.id === tx.id) ? s : { transactions: [tx, ...s.transactions] })),

  addTransaction: async (data, { effect = null, log = null } = {}) => {
    const tx = await txApi.createTransaction(data, { effect, log })
    get().insertLocal(tx)
    return tx
  },

  updateTransaction: async (id, changes) => {
    const tx = await txApi.updateTransaction(id, changes)
    set((s) => ({ transactions: s.transactions.map((t) => (t.id === id ? { ...t, ...tx } : t)) }))
    return tx
  },

  /** แก้ไขรายการพร้อมย้อน/ปรับยอดเงินใน RPC เดียว (ดู editTransaction ใน api) */
  editTransaction: async (id, changes, { reverse = null, apply = null, log = null } = {}) => {
    const tx = await txApi.editTransaction(id, changes, { reverse, apply, log })
    set((s) => ({ transactions: s.transactions.map((t) => (t.id === id ? { ...t, ...tx } : t)) }))
    return tx
  },

  /**
   * ทำให้ store มีรายการตั้งแต่วันที่ระบุ — เรียกก่อนกรอง/รายงาน/ตรวจซ้ำที่ย้อนหลัง
   * เกินช่วง 24 เดือนที่โหลดตอนเปิดแอป ไม่งั้นจะขึ้นว่า "ไม่มีข้อมูล" ทั้งที่มีอยู่จริง
   */
  ensureRange: async (from) => {
    const { loadedFrom } = get()
    if (!from) return
    if (loadedFrom && from >= loadedFrom) return
    // ดึงเฉพาะส่วนที่ยังไม่มี: จาก `from` ถึงวันก่อนหน้าช่วงที่โหลดไว้แล้ว
    const to = loadedFrom ? format(subDays(new Date(loadedFrom + 'T00:00:00'), 1), 'yyyy-MM-dd') : null
    await get().loadRange(from, to)
    set({ loadedFrom: from })
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
