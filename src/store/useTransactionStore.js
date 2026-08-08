import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuid } from 'uuid'
import useRecurringStore from './useRecurringStore'

export const INITIAL = { transactions: [] }

const useTransactionStore = create(
  persist(
    (set, get) => ({
      ...INITIAL,
      _reset: () => set(INITIAL),

      addTransaction: (data) => {
        const tx = {
          id: uuid(),
          createdAt: new Date().toISOString(),
          ...data,
        }
        set((s) => ({ transactions: [tx, ...s.transactions] }))
        return tx
      },

      updateTransaction: (id, changes) =>
        set((s) => ({
          transactions: s.transactions.map((t) => (t.id === id ? { ...t, ...changes } : t)),
        })),

      deleteTransaction: (id) => {
        const tx = get().transactions.find((t) => t.id === id)
        set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) }))
        if (tx?.recurringEntryId) {
          useRecurringStore.getState().syncEntryFromTransaction(id)
        }
      },

      getByType: (type) => get().transactions.filter((t) => t.type === type),

      getByDateRange: (startDate, endDate) =>
        get().transactions.filter((t) => t.date >= startDate && t.date <= endDate),

      getByDate: (date) => get().transactions.filter((t) => t.date === date),

      getIncomeByDate: (date) =>
        get().transactions.filter((t) => t.type === 'income' && t.date === date),

      getExpenseByDate: (date) =>
        get().transactions.filter((t) => t.type === 'expense' && t.date === date),

      deleteByDate: (date) =>
        set((s) => ({ transactions: s.transactions.filter((t) => t.date !== date) })),
    }),
    { name: 'default_transactions' }
  )
)

export default useTransactionStore
