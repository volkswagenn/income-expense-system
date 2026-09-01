import { create } from 'zustand'
import * as settingsApi from '../lib/api/settings'

/* global __APP_VERSION__ */
// เวอร์ชันฝังตอน build จาก package.json (ดู define ใน vite.config.js)
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'

const INITIAL_PERSISTED = { notifyDaysBefore: 3 }

/**
 * ตั้งค่าระดับร้าน — เก็บในตาราง shop_settings ไม่ใช่ localStorage
 * ทุกคนในร้านจึงเห็นค่าเดียวกัน และแก้ได้เฉพาะเจ้าของร้าน (RLS บังคับ)
 */
const useAppStore = create((set) => ({
  version: APP_VERSION,
  ...INITIAL_PERSISTED,

  _reset: () => set(INITIAL_PERSISTED),

  _hydrate: (settings) => set({ notifyDaysBefore: settings?.notifyDaysBefore ?? 3 }),

  setNotifyDaysBefore: async (n) => {
    const previous = useAppStore.getState().notifyDaysBefore
    const value = Number(n) || 0
    set({ notifyDaysBefore: value })
    try {
      await settingsApi.saveNotifyDaysBefore(value)
    } catch (err) {
      set({ notifyDaysBefore: previous })
      throw err
    }
  },
}))

export default useAppStore
