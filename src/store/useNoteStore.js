import { create } from 'zustand'
import * as notesApi from '../lib/api/notes'

export const INITIAL = { notes: {} }

/**
 * โน้ตบนปฏิทิน
 *
 * store เปลี่ยนบทบาทจาก "ที่เก็บข้อมูลถาวร" เป็น "แคชของข้อมูลบนเซิร์ฟเวอร์"
 * จึงไม่มี persist อีกต่อไป — ข้อมูลจริงอยู่ที่ Postgres
 *
 * โน้ตเป็นงานที่ผิดพลาดแล้วไม่เสียหาย (ไม่แตะเงิน) จึงใช้ optimistic update:
 * อัปเดตหน้าจอทันที แล้วค่อยยิงไปเซิร์ฟเวอร์ ถ้าพลาดค่อยย้อนกลับ
 */
const useNoteStore = create((set, get) => ({
  ...INITIAL,
  _reset: () => set(INITIAL),

  /** เรียกตอนเปิดแอป ด้วยข้อมูลที่โหลดมาแล้วจาก loadAllData() */
  _hydrate: (notes) => set({ notes: notes ?? {} }),

  /** ดึงใหม่ทั้งชุด — ใช้เมื่อ realtime แจ้งว่าเครื่องอื่นแก้โน้ต */
  refresh: async () => set({ notes: await notesApi.listNotes() }),

  setNote: async (date, text) => {
    const previous = get().notes[date]

    set((s) => {
      const notes = { ...s.notes }
      if (text?.trim()) notes[date] = text
      else delete notes[date]
      return { notes }
    })

    try {
      await notesApi.setNote(date, text)
    } catch (err) {
      // ย้อนกลับให้ตรงกับของจริงบนเซิร์ฟเวอร์ ไม่งั้นหน้าจอจะโกหกผู้ใช้
      set((s) => {
        const notes = { ...s.notes }
        if (previous === undefined) delete notes[date]
        else notes[date] = previous
        return { notes }
      })
      throw err
    }
  },

  deleteNote: async (date) => {
    const previous = get().notes[date]

    set((s) => {
      const notes = { ...s.notes }
      delete notes[date]
      return { notes }
    })

    try {
      await notesApi.deleteNote(date)
    } catch (err) {
      if (previous !== undefined) set((s) => ({ notes: { ...s.notes, [date]: previous } }))
      throw err
    }
  },

  getNote: (date) => get().notes[date] ?? '',
}))

export default useNoteStore
