import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuid } from 'uuid'

// กระเป๋าเงินโอนประกอบด้วยบัญชีธนาคารหลายบัญชี
// field `transfer` คือ "ยอดรวมทุกบัญชี" ที่ระบบ sync ให้อัตโนมัติทุกครั้งที่บัญชีเปลี่ยน
// จึงอ่าน transfer ได้เหมือนเดิมทุกที่ (Dashboard, รายงาน, การเช็คยอดติดลบ)
export const INITIAL = { cash: 0, transfer: 0, subWallets: [], loans: [], transferAccounts: [] }

export function sumTransferAccounts(accounts) {
  return (accounts ?? []).reduce((sum, a) => sum + (Number(a.balance) || 0), 0)
}

/** คืน patch ที่อัปเดตบัญชีพร้อมยอดรวมให้ตรงกันเสมอ */
function syncedAccounts(accounts) {
  return { transferAccounts: accounts, transfer: sumTransferAccounts(accounts) }
}

const useWalletStore = create(
  persist(
    (set, get) => ({
      ...INITIAL,
      _reset: () => set(INITIAL),

      total: () => get().cash + get().transfer,

      setCash: (val) => set({ cash: val }),

      addCash: (amount) => set((s) => ({ cash: s.cash + amount })),
      deductCash: (amount) => set((s) => ({ cash: s.cash - amount })),

      // ── บัญชีเงินโอน ─────────────────────────────────────────────────────────

      createTransferAccount: ({ bankName, name, initialBalance = 0 }) => {
        const account = {
          id: uuid(),
          bankName: bankName ?? '',
          name: name ?? '',
          balance: Number(initialBalance) || 0,
          createdAt: new Date().toISOString(),
        }
        set((s) => syncedAccounts([...s.transferAccounts, account]))
        return account
      },

      updateTransferAccount: (id, changes) =>
        set((s) => syncedAccounts(
          s.transferAccounts.map((a) => (a.id === id ? { ...a, ...changes } : a))
        )),

      deleteTransferAccount: (id) =>
        set((s) => syncedAccounts(s.transferAccounts.filter((a) => a.id !== id))),

      /** บวก/ลบยอดในบัญชีเดียว — ทางเข้าหลักของการเคลื่อนไหวเงินโอนทั้งหมด */
      adjustTransferAccount: (id, delta) =>
        set((s) => syncedAccounts(
          s.transferAccounts.map((a) => (a.id === id ? { ...a, balance: a.balance + delta } : a))
        )),

      moveBetweenTransferAccounts: (fromId, toId, amount) =>
        set((s) => syncedAccounts(
          s.transferAccounts.map((a) => {
            if (a.id === fromId) return { ...a, balance: a.balance - amount }
            if (a.id === toId) return { ...a, balance: a.balance + amount }
            return a
          })
        )),

      getTransferAccount: (id) => get().transferAccounts.find((a) => a.id === id),

      /** มีบัญชีเดียว → ใช้บัญชีนั้นอัตโนมัติ ไม่ต้องให้ผู้ใช้เลือก */
      getDefaultTransferAccountId: () => {
        const accounts = get().transferAccounts
        return accounts.length === 1 ? accounts[0].id : null
      },

      /** id ที่ใช้ได้จริง: ตัวที่ส่งมา → บัญชีเดียวที่มี → null (เรียกไม่ได้) */
      resolveTransferAccountId: (id) => {
        const accounts = get().transferAccounts
        if (id && accounts.some((a) => a.id === id)) return id
        return accounts.length === 1 ? accounts[0].id : null
      },

      getTransferAccountLabel: (id) => {
        const a = get().transferAccounts.find((x) => x.id === id)
        if (!a) return 'ไม่ระบุบัญชี'
        return a.bankName ? `${a.bankName} — ${a.name}` : a.name
      },

      // เข้ากันได้กับโค้ดเดิม: ไม่ระบุบัญชีจะไปลงบัญชีเดียวที่มี
      addTransfer: (amount, accountId) => {
        const id = get().resolveTransferAccountId(accountId)
        if (!id) return false
        get().adjustTransferAccount(id, amount)
        return true
      },
      deductTransfer: (amount, accountId) => {
        const id = get().resolveTransferAccountId(accountId)
        if (!id) return false
        get().adjustTransferAccount(id, -amount)
        return true
      },

      // ── กระเป๋าตังค์ย่อย ─────────────────────────────────────────────────────

      createSubWallet: (name, initialBalance = 0) => {
        const wallet = { id: uuid(), name, balance: initialBalance, createdAt: new Date().toISOString() }
        set((s) => ({ subWallets: [...s.subWallets, wallet] }))
        return wallet
      },

      updateSubWallet: (id, delta) =>
        set((s) => ({
          subWallets: s.subWallets.map((w) => (w.id === id ? { ...w, balance: w.balance + delta } : w)),
        })),

      deleteSubWallet: (id) =>
        set((s) => ({ subWallets: s.subWallets.filter((w) => w.id !== id) })),

      renameSubWallet: (id, name) =>
        set((s) => ({
          subWallets: s.subWallets.map((w) => (w.id === id ? { ...w, name } : w)),
        })),

      getSubWallet: (id) => get().subWallets.find((w) => w.id === id),

      reorderSubWallets: (orderedIds) =>
        set((s) => ({
          subWallets: orderedIds.map((id) => s.subWallets.find((w) => w.id === id)).filter(Boolean),
        })),

      addLoan: (loan) =>
        set((s) => {
          const item = { id: loan.id ?? uuid(), ...loan }
          return { loans: [...s.loans, item] }
        }),

      returnLoanById: (loanId, returnMethod, returnAccountId = null) =>
        set((s) => ({
          loans: s.loans.map((l) =>
            l.id === loanId
              ? { ...l, returned: true, returnedAt: new Date().toISOString(), returnMethod, returnAccountId }
              : l
          ),
        })),

      unReturnLoanById: (loanId) =>
        set((s) => ({
          loans: s.loans.map((l) =>
            l.id === loanId ? { ...l, returned: false, returnedAt: null, returnMethod: null, returnAccountId: null } : l
          ),
        })),

      deleteLoanById: (loanId) =>
        set((s) => ({ loans: s.loans.filter((l) => l.id !== loanId) })),

      updateLoanById: (loanId, changes) =>
        set((s) => ({
          loans: s.loans.map((l) => (l.id === loanId ? { ...l, ...changes } : l)),
        })),

      getActiveLoans: () => get().loans.filter((l) => !l.returned),
    }),
    {
      name: 'default_wallet_main',
      version: 1,
      partialize: (s) => ({
        cash: s.cash,
        transfer: s.transfer,
        subWallets: s.subWallets,
        loans: s.loans,
        transferAccounts: s.transferAccounts,
      }),
      // v0 ยังไม่มีบัญชีเงินโอน — เริ่มจากศูนย์ ให้ผู้ใช้สร้างบัญชีเอง
      migrate: (persisted, version) => {
        if (!persisted || version >= 1) return persisted
        return { ...persisted, transferAccounts: [], transfer: 0 }
      },
      // กันยอดรวมเพี้ยนถ้าไฟล์ backup ถูกแก้มา
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const total = sumTransferAccounts(state.transferAccounts)
        if (state.transfer !== total) state.transfer = total
      },
    }
  )
)

export default useWalletStore
