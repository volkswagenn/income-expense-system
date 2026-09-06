import { create } from 'zustand'
import * as slipApi from '../lib/api/paymentSlips'

/**
 * สลิปการจ่ายเงินทุกชนิด เก็บเป็น map ตาม "ชนิด:id ของการจ่าย"
 *
 * หน้าประวัติการจ่ายอ่านจากที่นี่ที่เดียว ไม่ต้องยิงถามทีละแถว
 * และป๊อปอัปจ่ายเงินเรียก save() หลังจ่ายสำเร็จ — ถ้าแนบสลิปไม่สำเร็จ เงินยังถูกต้อง
 * เพราะสลิปเป็นข้อมูลประกอบ ไม่ได้อยู่ในเส้นทางเงิน
 */
const usePaymentSlipStore = create((set, get) => ({
  slips: [],

  _hydrate: (slips = []) => set({ slips }),
  _reset: () => set({ slips: [] }),

  refresh: async () => {
    set({ slips: await slipApi.listPaymentSlips() })
  },

  /** สลิปของการจ่ายหนึ่งครั้ง — คืน null ถ้ายังไม่ได้แนบ */
  getSlip: (kind, refId) =>
    get().slips.find((s) => s.kind === kind && s.refId === refId) ?? null,

  save: async ({ kind, refId, paidAt, attachments, note }) => {
    const saved = await slipApi.savePaymentSlip({ kind, refId, paidAt, attachments, note })
    set((s) => ({
      slips: [saved, ...s.slips.filter((x) => !(x.kind === kind && x.refId === refId))],
    }))
    return saved
  },

  remove: async (id) => {
    await slipApi.deletePaymentSlip(id)
    set((s) => ({ slips: s.slips.filter((x) => x.id !== id) }))
  },
}))

export default usePaymentSlipStore
