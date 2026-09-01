import { create } from 'zustand'
import * as logsApi from '../lib/api/logs'

export const INITIAL = { logs: [], page: 0, hasMore: false, total: 0, loading: false }

/**
 * ประวัติการใช้งาน
 *
 * ต่างจากของเดิม 2 อย่าง:
 *  • ไม่มีเพดาน 5,000 รายการแล้ว (ของเดิมตัดทิ้งเพราะโควตา localStorage)
 *    ตารางโตได้ไม่จำกัด จึงต้องโหลดทีละหน้า ห้ามดึงทั้งตาราง
 *  • แก้ย้อนหลังไม่ได้ — RLS อนุญาตแค่ insert / select และให้เจ้าของร้านลบได้
 */
const useLogStore = create((set, get) => ({
  ...INITIAL,
  _reset: () => set(INITIAL),

  /** โหลดหน้าแรก — เรียกตอนเปิดหน้าประวัติ */
  loadFirstPage: async () => {
    set({ loading: true })
    try {
      const [{ logs, hasMore }, total] = await Promise.all([
        logsApi.listLogs({ page: 0 }),
        logsApi.countLogs(),
      ])
      set({ logs, hasMore, total, page: 0, loading: false })
      return logs
    } catch (err) {
      set({ loading: false })
      throw err
    }
  },

  loadMore: async () => {
    const { page, hasMore, loading } = get()
    if (!hasMore || loading) return
    set({ loading: true })
    try {
      const next = page + 1
      const { logs, hasMore: more } = await logsApi.listLogs({ page: next })
      set((s) => ({ logs: [...s.logs, ...logs], hasMore: more, page: next, loading: false }))
    } catch (err) {
      set({ loading: false })
      throw err
    }
  },

  /**
   * เขียน log 1 รายการ — **ตั้งใจไม่ throw**
   *
   * ทั่วทั้งแอปเรียกตัวนี้แบบไม่ await (ยิงทิ้งไว้หลังบันทึกงานจริงเสร็จ) ถ้าปล่อยให้
   * reject จะกลายเป็น unhandled rejection ที่ผู้ใช้แก้อะไรไม่ได้ และในบางเบราว์เซอร์
   * ทำให้เห็นข้อความ error เด้งขึ้นมาทั้งที่งานจริงสำเร็จไปแล้ว
   *
   * log เป็นบันทึกประกอบ ไม่ใช่ตัวงาน — เขียนไม่ลงก็ไม่ควรทำให้สิ่งที่ผู้ใช้เพิ่งทำพัง
   * งานที่แตะเงินไม่ได้พึ่งตัวนี้อยู่แล้ว เพราะส่ง log ไปกับ RPC ในทรานแซกชันเดียวกัน
   */
  addLog: async (entry) => {
    try {
      const log = await logsApi.writeLog(entry)
      set((s) => ({ logs: [log, ...s.logs], total: s.total + 1 }))
      return log
    } catch (err) {
      console.error('เขียนประวัติการใช้งานไม่สำเร็จ:', err)
      return null
    }
  },

  clearOldLogs: async (keepDays = 365) => {
    await logsApi.clearOldLogs(keepDays)
    await get().loadFirstPage()
  },

  getLogsCount: () => get().total,
  getLogsByType: (type) => get().logs.filter((l) => l.activityType === type),
  getRecentLogs: (n = 50) => get().logs.slice(0, n),

  /** ดึงทั้งหมดเพื่อส่งออกไฟล์ — ไม่เก็บลง state เพราะอาจมีเป็นหมื่นแถว */
  fetchAllForExport: () => logsApi.listAllLogsForExport(),
}))

export default useLogStore
