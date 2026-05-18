import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuid } from 'uuid'
import { activeShopId } from '../lib/activeShop'
import { enqueueCloudDelete, enqueueCloudUpsert, touchCloudMetadata, withCloudMetadata } from '../lib/cloudSyncMetadata'

export const INITIAL = { cash: 0, transfer: 0, subWallets: [], loans: [] }

function enqueueWalletSnapshot(state) {
  enqueueCloudUpsert('wallet_state', withCloudMetadata({
    id: 'wallet-main',
    cash: state.cash,
    transfer: state.transfer,
    subWallets: state.subWallets,
    loans: state.loans,
  }, 'wallet_state'))
}

const useWalletStore = create(
  persist(
    (set, get) => ({
      ...INITIAL,
      _reset: () => set(INITIAL),

      total: () => get().cash + get().transfer,

      setCash: (val) => set((s) => {
        const next = { ...s, cash: val }
        enqueueWalletSnapshot(next)
        return { cash: val }
      }),
      setTransfer: (val) => set((s) => {
        const next = { ...s, transfer: val }
        enqueueWalletSnapshot(next)
        return { transfer: val }
      }),

      addCash: (amount) => set((s) => {
        const next = { ...s, cash: s.cash + amount }
        enqueueWalletSnapshot(next)
        return { cash: next.cash }
      }),
      addTransfer: (amount) => set((s) => {
        const next = { ...s, transfer: s.transfer + amount }
        enqueueWalletSnapshot(next)
        return { transfer: next.transfer }
      }),
      deductCash: (amount) => set((s) => {
        const next = { ...s, cash: s.cash - amount }
        enqueueWalletSnapshot(next)
        return { cash: next.cash }
      }),
      deductTransfer: (amount) => set((s) => {
        const next = { ...s, transfer: s.transfer - amount }
        enqueueWalletSnapshot(next)
        return { transfer: next.transfer }
      }),

      createSubWallet: (name, initialBalance = 0) => {
        const wallet = withCloudMetadata({ id: uuid(), name, balance: initialBalance, createdAt: new Date().toISOString() }, 'sub_wallets')
        set((s) => {
          const next = { ...s, subWallets: [...s.subWallets, wallet] }
          enqueueCloudUpsert('sub_wallets', wallet)
          enqueueWalletSnapshot(next)
          return { subWallets: next.subWallets }
        })
        return wallet
      },

      updateSubWallet: (id, delta) =>
        set((s) => {
          const subWallets = s.subWallets.map((w) => {
            if (w.id !== id) return w
            const updated = touchCloudMetadata({ ...w, balance: w.balance + delta }, 'sub_wallets')
            enqueueCloudUpsert('sub_wallets', updated)
            return updated
          })
          enqueueWalletSnapshot({ ...s, subWallets })
          return { subWallets }
        }),

      deleteSubWallet: (id) =>
        set((s) => {
          const target = s.subWallets.find((w) => w.id === id)
          if (target) enqueueCloudDelete('sub_wallets', target)
          const subWallets = s.subWallets.filter((w) => w.id !== id)
          enqueueWalletSnapshot({ ...s, subWallets })
          return { subWallets }
        }),

      renameSubWallet: (id, name) =>
        set((s) => {
          const subWallets = s.subWallets.map((w) => {
            if (w.id !== id) return w
            const updated = touchCloudMetadata({ ...w, name }, 'sub_wallets')
            enqueueCloudUpsert('sub_wallets', updated)
            return updated
          })
          enqueueWalletSnapshot({ ...s, subWallets })
          return { subWallets }
        }),

      getSubWallet: (id) => get().subWallets.find((w) => w.id === id),

      reorderSubWallets: (orderedIds) =>
        set((s) => {
          const subWallets = orderedIds.map((id) => s.subWallets.find((w) => w.id === id)).filter(Boolean)
          enqueueWalletSnapshot({ ...s, subWallets })
          return { subWallets }
        }),

      addLoan: (loan) =>
        set((s) => {
          const item = withCloudMetadata({ id: loan.id ?? uuid(), ...loan }, 'loans')
          const loans = [...s.loans, item]
          enqueueCloudUpsert('loans', item)
          enqueueWalletSnapshot({ ...s, loans })
          return { loans }
        }),

      returnLoanById: (loanId, returnMethod) =>
        set((s) => {
          const loans = s.loans.map((l) => {
            if (l.id !== loanId) return l
            const updated = touchCloudMetadata({ ...l, returned: true, returnedAt: new Date().toISOString(), returnMethod }, 'loans')
            enqueueCloudUpsert('loans', updated)
            return updated
          })
          enqueueWalletSnapshot({ ...s, loans })
          return { loans }
        }),

      unReturnLoanById: (loanId) =>
        set((s) => {
          const loans = s.loans.map((l) => {
            if (l.id !== loanId) return l
            const updated = touchCloudMetadata({ ...l, returned: false, returnedAt: null, returnMethod: null }, 'loans')
            enqueueCloudUpsert('loans', updated)
            return updated
          })
          enqueueWalletSnapshot({ ...s, loans })
          return { loans }
        }),

      deleteLoanById: (loanId) =>
        set((s) => {
          const target = s.loans.find((l) => l.id === loanId)
          if (target) enqueueCloudDelete('loans', target)
          const loans = s.loans.filter((l) => l.id !== loanId)
          enqueueWalletSnapshot({ ...s, loans })
          return { loans }
        }),

      updateLoanById: (loanId, changes) =>
        set((s) => {
          const loans = s.loans.map((l) => {
            if (l.id !== loanId) return l
            const updated = touchCloudMetadata({ ...l, ...changes }, 'loans')
            enqueueCloudUpsert('loans', updated)
            return updated
          })
          enqueueWalletSnapshot({ ...s, loans })
          return { loans }
        }),

      getActiveLoans: () => get().loans.filter((l) => !l.returned),
    }),
    {
      name: activeShopId ? `${activeShopId}_wallet_main` : 'default_wallet_main',
      partialize: (s) => ({ cash: s.cash, transfer: s.transfer, subWallets: s.subWallets, loans: s.loans }),
    }
  )
)

export default useWalletStore
