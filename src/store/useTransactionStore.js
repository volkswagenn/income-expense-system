import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuid } from 'uuid'
import { activeShopId } from '../lib/activeShop'
import { getCurrentActorSnapshot } from '../lib/auditActor'
import { enqueueCloudDelete, enqueueCloudUpsert, touchCloudMetadata, withCloudMetadata } from '../lib/cloudSyncMetadata'

// lazy getter to avoid circular import at module load time
const getRecurringStore = () => import('./useRecurringStore').then((m) => m.default.getState())

export const INITIAL = { transactions: [] }

const useTransactionStore = create(
  persist(
    (set, get) => ({
      ...INITIAL,
      _reset: () => set(INITIAL),

      addTransaction: (data) => {
        const { actor, ...rest } = data
        const tx = withCloudMetadata({
          id: uuid(),
          createdAt: new Date().toISOString(),
          ...rest,
          actor: actor === undefined ? getCurrentActorSnapshot() : actor,
        }, 'transactions')
        set((s) => ({ transactions: [tx, ...s.transactions] }))
        enqueueCloudUpsert('transactions', tx)
        return tx
      },

      updateTransaction: (id, changes) =>
        set((s) => ({
          transactions: s.transactions.map((t) => {
            if (t.id !== id) return t
            const updated = touchCloudMetadata({ ...t, ...changes }, 'transactions')
            enqueueCloudUpsert('transactions', updated)
            return updated
          }),
        })),

      deleteTransaction: (id) => {
        const tx = get().transactions.find((t) => t.id === id)
        if (tx) enqueueCloudDelete('transactions', tx)
        set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) }))
        if (tx?.recurringEntryId) {
          getRecurringStore().then((store) => store.syncEntryFromTransaction(id))
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
        set((s) => {
          s.transactions.filter((t) => t.date === date).forEach((t) => enqueueCloudDelete('transactions', t))
          return { transactions: s.transactions.filter((t) => t.date !== date) }
        }),
    }),
    { name: activeShopId ? `${activeShopId}_transactions` : 'default_transactions' }
  )
)

export default useTransactionStore
