import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const INITIAL_PERSISTED = { notifyDaysBefore: 3 }

/* global __APP_VERSION__ */
// เวอร์ชันฝังตอน build จาก package.json (ดู define ใน vite.config.js)
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'

const useAppStore = create(
  persist(
    (set) => ({
      version: APP_VERSION,
      ...INITIAL_PERSISTED,

      // เหลือเฉพาะค่าที่ผูกกับร้าน — version มาจาก build ไม่ถูกรีเซ็ต
      _reset: () => set(INITIAL_PERSISTED),

      setNotifyDaysBefore: (n) => set({ notifyDaysBefore: Number(n) || 0 }),
    }),
    {
      // TODO เฟส 8: ย้าย notifyDaysBefore ไปตาราง shop_settings แล้วตัด persist ทิ้ง
      name: 'default_app_settings',
      partialize: (s) => ({ notifyDaysBefore: s.notifyDaysBefore }),
    }
  )
)

export default useAppStore
