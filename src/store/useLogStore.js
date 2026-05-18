import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuid } from 'uuid'
import { activeShopId } from '../lib/activeShop'

export const INITIAL = { logs: [] }

const useLogStore = create(
  persist(
    (set, get) => ({
      ...INITIAL,
      _reset: () => set(INITIAL),

      addLog: (entry) => {
        const log = {
          id: uuid(),
          timestamp: new Date().toISOString(),
          status: 'success',
          errorMessage: null,
          deviceInfo: navigator.userAgent,
          sessionId: sessionStorage.getItem('sessionId') ?? 'unknown',
          ...entry,
        }
        set((s) => ({ logs: [log, ...s.logs] }))
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
    { name: activeShopId ? `${activeShopId}_activity_log` : 'default_activity_log' }
  )
)

export default useLogStore
