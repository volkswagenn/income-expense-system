import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createLogRecord } from '../lib/logBuilder'

export const INITIAL = { logs: [] }

// เพดานจำนวน log ที่เก็บใน localStorage (โควตาราว 5MB ต่อ origin)
// log เก่าที่สุดจะถูกตัดทิ้งอัตโนมัติ — ดาวน์โหลดเก็บไว้ก่อนได้ที่หน้าสำรองข้อมูล
export const MAX_LOGS = 5000

const useLogStore = create(
  persist(
    (set, get) => ({
      ...INITIAL,
      _reset: () => set(INITIAL),

      addLog: (entry) => {
        const log = createLogRecord(entry)
        set((s) => ({ logs: [log, ...s.logs].slice(0, MAX_LOGS) }))
        return log
      },

      updateLog: (id, changes) =>
        set((s) => ({
          logs: s.logs.map((l) => (l.id === id ? { ...l, ...changes } : l)),
        })),

      deleteLog: (id) =>
        set((s) => ({ logs: s.logs.filter((l) => l.id !== id) })),

      clearOldLogs: (keepDays = 365) => {
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - keepDays)
        set((s) => ({
          logs: s.logs.filter((l) => new Date(l.timestamp) >= cutoff),
        }))
      },

      getLogsCount: () => get().logs.length,
      getLogsByType: (type) => get().logs.filter((l) => l.activityType === type),
      getRecentLogs: (n = 50) => get().logs.slice(0, n),
    }),
    { name: 'default_activity_log' }
  )
)

export default useLogStore
