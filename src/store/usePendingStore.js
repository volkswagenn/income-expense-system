import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuid } from 'uuid'
import useRecurringStore from './useRecurringStore'

export const INITIAL = { pendingPayments: [], taxInvoices: [], pendingIncomes: [] }

const usePendingStore = create(
  persist(
    (set, get) => ({
      ...INITIAL,
      _reset: () => set(INITIAL),

      // Pending incomes
      addPendingIncome: (data) => {
        const item = {
          id: uuid(),
          status: 'pending',
          createdAt: new Date().toISOString(),
          receivedAt: null,
          receivedMethod: null,
          transactionId: null,
          ...data,
        }
        set((s) => ({ pendingIncomes: [item, ...s.pendingIncomes] }))
        return item
      },

      receivePendingIncome: (id, method, transactionId = null, transferAccountId = null) =>
        set((s) => ({
          pendingIncomes: s.pendingIncomes.map((p) =>
            p.id === id
              ? {
                  ...p,
                  status: 'received',
                  receivedAt: new Date().toISOString(),
                  receivedMethod: method,
                  transferAccountId,
                  ...(transactionId ? { transactionId } : {}),
                }
              : p
          ),
        })),

      deletePendingIncome: (id) =>
        set((s) => ({ pendingIncomes: s.pendingIncomes.filter((p) => p.id !== id) })),

      unReceivePendingIncome: (id) =>
        set((s) => ({
          pendingIncomes: s.pendingIncomes.map((p) =>
            p.id === id ? { ...p, status: 'pending', receivedAt: null, receivedMethod: null, transactionId: null } : p
          ),
        })),

      getPendingIncomeUnpaid: () => get().pendingIncomes.filter((p) => p.status === 'pending'),
      getPendingIncomeTotal: () =>
        get().pendingIncomes.filter((p) => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0),

      // Pending payments
      addPending: (data) => {
        const item = {
          id: uuid(),
          status: 'pending',
          paidAt: null,
          paidMethod: null,
          createdAt: new Date().toISOString(),
          ...data,
        }
        set((s) => ({ pendingPayments: [item, ...s.pendingPayments] }))
        return item
      },

      payPending: (id, method, transactionId = null, transferAccountId = null) => {
        const p = get().pendingPayments.find((x) => x.id === id)
        set((s) => ({
          pendingPayments: s.pendingPayments.map((x) =>
            x.id === id
              ? {
                  ...x,
                  status: 'paid',
                  paidAt: new Date().toISOString(),
                  paidMethod: method,
                  transferAccountId,
                  ...(transactionId ? { transactionId } : {}),
                }
              : x
          ),
        }))
        if (p?.recurringEntryId) {
          useRecurringStore.getState().syncEntryPaidFromPending(id)
        }
      },

      deletePending: (id) =>
        set((s) => ({ pendingPayments: s.pendingPayments.filter((p) => p.id !== id) })),

      deletePendingByTxId: (transactionId) =>
        set((s) => ({ pendingPayments: s.pendingPayments.filter((p) => p.transactionId !== transactionId) })),

      unPayPending: (id) =>
        set((s) => ({
          pendingPayments: s.pendingPayments.map((p) =>
            p.id === id ? { ...p, status: 'pending', paidAt: null, paidMethod: null, transactionId: null } : p
          ),
        })),

      updatePendingById: (id, changes) =>
        set((s) => ({
          pendingPayments: s.pendingPayments.map((p) => (p.id === id ? { ...p, ...changes } : p)),
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
        const item = {
          id: uuid(),
          status: 'waiting',
          receivedAt: null,
          createdAt: new Date().toISOString(),
          ...data,
        }
        set((s) => ({ taxInvoices: [item, ...s.taxInvoices] }))
        return item
      },

      receiveTaxInvoice: (id, filePath = null) =>
        set((s) => ({
          taxInvoices: s.taxInvoices.map((t) =>
            t.id === id
              ? { ...t, status: 'received', receivedAt: new Date().toISOString(), ...(filePath ? { filePath } : {}) }
              : t
          ),
        })),

      deleteTaxInvoice: (id) =>
        set((s) => ({ taxInvoices: s.taxInvoices.filter((t) => t.id !== id) })),

      deleteTaxInvoiceByTxId: (transactionId) =>
        set((s) => ({ taxInvoices: s.taxInvoices.filter((t) => t.transactionId !== transactionId) })),

      unreceiveTaxInvoice: (id) =>
        set((s) => ({
          taxInvoices: s.taxInvoices.map((t) =>
            t.id === id ? { ...t, status: 'waiting', receivedAt: null, filePath: null } : t
          ),
        })),

      syncTaxInvoiceByTxId: (transactionId, changes) =>
        set((s) => ({
          taxInvoices: s.taxInvoices.map((t) =>
            t.transactionId === transactionId ? { ...t, ...changes } : t
          ),
        })),

      getTaxWaiting: () => get().taxInvoices.filter((t) => t.status === 'waiting'),
    }),
    { name: 'default_pending_data' }
  )
)

export default usePendingStore
