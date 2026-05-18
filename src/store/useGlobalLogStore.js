import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuid } from 'uuid'

export const INITIAL = { logs: [] }

const useGlobalLogStore = create(
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
    }),
    { name: 'global_activity_log' }
  )
)

export default useGlobalLogStore

// ── Utilities for reading any shop's data from localStorage ──────

export function readShopLogsFromStorage(shopId) {
  const key = shopId ? `${shopId}_activity_log` : 'default_activity_log'
  try {
    const data = localStorage.getItem(key)
    if (!data) return []
    return (JSON.parse(data)?.state?.logs ?? []).map((log) => ({ ...log, _shopId: shopId }))
  } catch { return [] }
}

export function readShopTransactionsFromStorage(shopId) {
  const key = shopId ? `${shopId}_transactions` : 'default_transactions'
  try {
    const data = localStorage.getItem(key)
    if (!data) return []
    return (JSON.parse(data)?.state?.transactions ?? []).map((tx) => ({ ...tx, _shopId: shopId }))
  } catch { return [] }
}
