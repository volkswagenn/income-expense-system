import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuid } from 'uuid'
import { activeShopId } from '../lib/activeShop'
import { enqueueCloudDelete, enqueueCloudUpsert, touchCloudMetadata, withCloudMetadata } from '../lib/cloudSyncMetadata'

const getRecurringStore = () => import('./useRecurringStore').then((m) => m.default.getState())

export const INITIAL = { pendingPayments: [], taxInvoices: [], pendingIncomes: [] }

const usePendingStore = create(
  persist(
    (set, get) => ({
      ...INITIAL,
      _reset: () => set(INITIAL),

      // Pending incomes
      addPendingIncome: (data) => {
        const item = withCloudMetadata({
          id: uuid(),
          status: 'pending',
          createdAt: new Date().toISOString(),
          receivedAt: null,
          receivedMethod: null,
          transactionId: null,
          ...data,
        }, 'pending_incomes')
        set((s) => ({ pendingIncomes: [item, ...s.pendingIncomes] }))
        enqueueCloudUpsert('pending_incomes', item)
        return item
      },

      receivePendingIncome: (id, method, transactionId = null) =>
        set((s) => ({
          pendingIncomes: s.pendingIncomes.map((p) => {
            if (p.id !== id) return p
            const updated = touchCloudMetadata({ ...p, status: 'received', receivedAt: new Date().toISOString(), receivedMethod: method, ...(transactionId ? { transactionId } : {}) }, 'pending_incomes')
            enqueueCloudUpsert('pending_incomes', updated)
            return updated
          }),
        })),

      deletePendingIncome: (id) =>
        set((s) => {
          const target = s.pendingIncomes.find((p) => p.id === id)
          if (target) enqueueCloudDelete('pending_incomes', target)
          return { pendingIncomes: s.pendingIncomes.filter((p) => p.id !== id) }
        }),

      unReceivePendingIncome: (id) =>
        set((s) => ({
          pendingIncomes: s.pendingIncomes.map((p) => {
            if (p.id !== id) return p
            const updated = touchCloudMetadata({ ...p, status: 'pending', receivedAt: null, receivedMethod: null, transactionId: null }, 'pending_incomes')
            enqueueCloudUpsert('pending_incomes', updated)
            return updated
          }),
        })),

      getPendingIncomeUnpaid: () => get().pendingIncomes.filter((p) => p.status === 'pending'),
      getPendingIncomeTotal: () =>
        get().pendingIncomes.filter((p) => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0),

      // Pending payments
      addPending: (data) => {
        const item = withCloudMetadata({
          id: uuid(),
          status: 'pending',
          paidAt: null,
          paidMethod: null,
          createdAt: new Date().toISOString(),
          ...data,
        }, 'pending_payments')
        set((s) => ({ pendingPayments: [item, ...s.pendingPayments] }))
        enqueueCloudUpsert('pending_payments', item)
        return item
      },

      payPending: (id, method, transactionId = null) => {
        const p = get().pendingPayments.find((x) => x.id === id)
        set((s) => ({
          pendingPayments: s.pendingPayments.map((x) => {
            if (x.id !== id) return x
            const updated = touchCloudMetadata({ ...x, status: 'paid', paidAt: new Date().toISOString(), paidMethod: method, ...(transactionId ? { transactionId } : {}) }, 'pending_payments')
            enqueueCloudUpsert('pending_payments', updated)
            return updated
          }),
        }))
        if (p?.recurringEntryId) {
          getRecurringStore().then((store) => store.syncEntryPaidFromPending(id))
        }
      },

      deletePending: (id) =>
        set((s) => {
          const target = s.pendingPayments.find((p) => p.id === id)
          if (target) enqueueCloudDelete('pending_payments', target)
          return { pendingPayments: s.pendingPayments.filter((p) => p.id !== id) }
        }),

      deletePendingByTxId: (transactionId) =>
        set((s) => {
          s.pendingPayments.filter((p) => p.transactionId === transactionId).forEach((p) => enqueueCloudDelete('pending_payments', p))
          return { pendingPayments: s.pendingPayments.filter((p) => p.transactionId !== transactionId) }
        }),

      unPayPending: (id) =>
        set((s) => ({
          pendingPayments: s.pendingPayments.map((p) => {
            if (p.id !== id) return p
            const updated = touchCloudMetadata({ ...p, status: 'pending', paidAt: null, paidMethod: null, transactionId: null }, 'pending_payments')
            enqueueCloudUpsert('pending_payments', updated)
            return updated
          }),
        })),

      updatePendingById: (id, changes) =>
        set((s) => ({
          pendingPayments: s.pendingPayments.map((p) => {
            if (p.id !== id) return p
            const updated = touchCloudMetadata({ ...p, ...changes }, 'pending_payments')
            enqueueCloudUpsert('pending_payments', updated)
            return updated
          }),
        })),

      syncPendingByTxId: (transactionId, changes) =>
        set((s) => ({
          pendingPayments: s.pendingPayments.map((p) =>
            p.transactionId === transactionId ? { ...p, ...changes } : p
          ),
        })),

      getPendingUnpaid: () => get().pendingPayments.filter((p) => p.status === 'pending'),
      getPendingTotal: () =>
        get().pendingPayments.filter((p) => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0),

      // Tax invoices
      addTaxInvoice: (data) => {
        const item = withCloudMetadata({
          id: uuid(),
          status: 'waiting',
          receivedAt: null,
          createdAt: new Date().toISOString(),
          ...data,
        }, 'tax_invoices')
        set((s) => ({ taxInvoices: [item, ...s.taxInvoices] }))
        enqueueCloudUpsert('tax_invoices', item)
        return item
      },

      receiveTaxInvoice: (id, filePath = null) =>
        set((s) => ({
          taxInvoices: s.taxInvoices.map((t) => {
            if (t.id !== id) return t
            const updated = touchCloudMetadata({ ...t, status: 'received', receivedAt: new Date().toISOString(), ...(filePath ? { filePath } : {}) }, 'tax_invoices')
            enqueueCloudUpsert('tax_invoices', updated)
            return updated
          }),
        })),

      deleteTaxInvoice: (id) =>
        set((s) => {
          const target = s.taxInvoices.find((t) => t.id === id)
          if (target) enqueueCloudDelete('tax_invoices', target)
          return { taxInvoices: s.taxInvoices.filter((t) => t.id !== id) }
        }),

      deleteTaxInvoiceByTxId: (transactionId) =>
        set((s) => {
          s.taxInvoices.filter((t) => t.transactionId === transactionId).forEach((t) => enqueueCloudDelete('tax_invoices', t))
          return { taxInvoices: s.taxInvoices.filter((t) => t.transactionId !== transactionId) }
        }),

      unreceiveTaxInvoice: (id) =>
        set((s) => ({
          taxInvoices: s.taxInvoices.map((t) => {
            if (t.id !== id) return t
            const updated = touchCloudMetadata({ ...t, status: 'waiting', receivedAt: null, filePath: null }, 'tax_invoices')
            enqueueCloudUpsert('tax_invoices', updated)
            return updated
          }),
        })),

      syncTaxInvoiceByTxId: (transactionId, changes) =>
        set((s) => ({
          taxInvoices: s.taxInvoices.map((t) =>
            t.transactionId === transactionId ? { ...t, ...changes } : t
          ),
        })),

      getTaxWaiting: () => get().taxInvoices.filter((t) => t.status === 'waiting'),
    }),
    { name: activeShopId ? `${activeShopId}_pending_data` : 'default_pending_data' }
  )
)

export default usePendingStore
