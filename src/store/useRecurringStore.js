import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuid } from 'uuid'
import { getDaysInMonth } from 'date-fns'
import { localMonthStr } from '../lib/dateUtils'

export function computeDueDate(year, month, billingDay) {
  const lastDay = getDaysInMonth(new Date(year, month - 1))
  const day = Math.min(billingDay, lastDay)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export const INITIAL = { items: [], entries: [] }

const useRecurringStore = create(
  persist(
    (set, get) => ({
      ...INITIAL,
      _reset: () => set(INITIAL),

      // ── Items (templates) ────────────────────────────────────────────────────

      addItem: (data) => {
        const item = {
          id: uuid(),
          enabled: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...data,
        }
        set((s) => ({ items: [...s.items, item] }))
        return item
      },

      updateItem: (id, changes) =>
        set((s) => ({
          items: s.items.map((it) =>
            it.id === id ? { ...it, ...changes, updatedAt: new Date().toISOString() } : it
          ),
        })),

      toggleItem: (id) =>
        set((s) => ({
          items: s.items.map((it) =>
            it.id === id ? { ...it, enabled: !it.enabled, updatedAt: new Date().toISOString() } : it
          ),
        })),

      deleteItem: (id) =>
        set((s) => ({
          items: s.items.filter((it) => it.id !== id),
          // keep paid entries for history, remove only pending/skipped
          entries: s.entries.filter((e) => e.recurringId !== id || e.status === 'paid'),
        })),

      // ── Entries (monthly records) ────────────────────────────────────────────

      // idempotent: safe to call multiple times for same month
      generateEntries: (month) => {
        const { items, entries } = get()
        const [year, mon] = month.split('-').map(Number)
        const newEntries = []
        items.filter((it) => it.enabled).forEach((item) => {
          const exists = entries.some(
            (e) => e.recurringId === item.id && e.month === month
          )
          if (!exists) {
            newEntries.push({
              id: uuid(),
              recurringId: item.id,
              month,
              dueDate: computeDueDate(year, mon, item.billingDay),
              status: 'pending',
              amount: item.amountType === 'fixed' ? (item.fixedAmount ?? 0) : 0,
              paidAt: null,
              paidMethod: null,
              transactionId: null,
              pendingPaymentId: null,
              createdAt: new Date().toISOString(),
            })
          }
        })
        if (newEntries.length > 0) {
          set((s) => ({ entries: [...s.entries, ...newEntries] }))
        }
      },

      updateEntry: (id, changes) =>
        set((s) => ({
          entries: s.entries.map((e) => (e.id === id ? { ...e, ...changes } : e)),
        })),

      markSkipped: (entryId) =>
        set((s) => ({
          entries: s.entries.map((e) => (e.id === entryId ? { ...e, status: 'skipped' } : e)),
        })),

      // sync back when transaction deleted from History page
      syncEntryFromTransaction: (transactionId) =>
        set((s) => ({
          entries: s.entries.map((e) =>
            e.transactionId === transactionId
              ? { ...e, status: 'pending', transactionId: null, pendingPaymentId: null, paidAt: null, paidMethod: null, amount: 0 }
              : e
          ),
        })),

      // sync back when pending paid from Wallet page
      syncEntryPaidFromPending: (pendingPaymentId) =>
        set((s) => ({
          entries: s.entries.map((e) =>
            e.pendingPaymentId === pendingPaymentId
              ? { ...e, status: 'paid', paidAt: new Date().toISOString() }
              : e
          ),
        })),

      getEntriesByMonth: (month) =>
        get().entries.filter((e) => e.month === month),

      getEntriesByDate: (date) =>
        get().entries.filter((e) => e.dueDate === date),

      getSummaryByMonth: (month) => {
        const entries = get().getEntriesByMonth(month)
        const paid = entries.filter((e) => e.status === 'paid')
        const pending = entries.filter((e) => e.status === 'pending')
        return {
          paidCount: paid.length,
          paidTotal: paid.reduce((s, e) => s + (e.amount || 0), 0),
          pendingCount: pending.length,
          pendingTotal: pending.reduce((s, e) => s + (e.amount || 0), 0),
          total: [...paid, ...pending].reduce((s, e) => s + (e.amount || 0), 0),
        }
      },

      getPendingCountCurrentMonth: () => {
        const month = localMonthStr()
        return get().entries.filter((e) => e.month === month && e.status === 'pending').length
      },
    }),
    { name: 'default_recurring_data' }
  )
)

export default useRecurringStore
