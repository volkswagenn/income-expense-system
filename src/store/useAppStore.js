import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { activeShopId } from '../lib/activeShop'

export const INITIAL_PERSISTED = { notifyDaysBefore: 3 }

const useAppStore = create(
  persist(
    (set) => ({
      version: '0.0.1',
      ...INITIAL_PERSISTED,

      // Only resets per-shop persisted fields; version stays (set from SettingApp.txt)
      _reset: () => set(INITIAL_PERSISTED),

      init: ({ version }) => set({ version }),

      setNotifyDaysBefore: (n) => set({ notifyDaysBefore: Number(n) || 0 }),
    }),
    {
      name: activeShopId ? `${activeShopId}_app_settings` : 'default_app_settings',
      partialize: (s) => ({ notifyDaysBefore: s.notifyDaysBefore }),
    }
  )
)

export default useAppStore
