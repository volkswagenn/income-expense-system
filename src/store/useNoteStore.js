import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { activeShopId } from '../lib/activeShop'

export const INITIAL = { notes: {} }

const useNoteStore = create(
  persist(
    (set, get) => ({
      ...INITIAL,
      _reset: () => set(INITIAL),

      setNote: (date, text) => set((s) => ({ notes: { ...s.notes, [date]: text } })),
      deleteNote: (date) =>
        set((s) => {
          const n = { ...s.notes }
          delete n[date]
          return { notes: n }
        }),
      getNote: (date) => get().notes[date] ?? '',
    }),
    { name: activeShopId ? `${activeShopId}_calendar_notes` : 'default_calendar_notes' }
  )
)

export default useNoteStore
