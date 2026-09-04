import { create } from 'zustand'
import * as walletApi from '../lib/api/wallet'

// กระเป๋าเงินโอนประกอบด้วยบัญชีธนาคารหลายบัญชี
// field `transfer` คือ "ยอดรวมทุกบัญชี" ที่ระบบ sync ให้อัตโนมัติทุกครั้งที่บัญชีเปลี่ยน
// จึงอ่าน transfer ได้เหมือนเดิมทุกที่ (Dashboard, รายงาน, การเช็คยอดติดลบ)
export const INITIAL = { cash: 0, transfer: 0, subWallets: [], loans: [], transferAccounts: [] }

function sumTransferAccounts(accounts) {
  return (accounts ?? []).reduce((sum, a) => sum + (Number(a.balance) || 0), 0)
}

/** คืน patch ที่อัปเดตบัญชีพร้อมยอดรวมให้ตรงกันเสมอ */
function syncedAccounts(accounts) {
  return { transferAccounts: accounts, transfer: sumTransferAccounts(accounts) }
}

/**
 * ยอดเงินทั้งหมด
 *
 * store นี้เป็นแค่ "แคชของยอดบนเซิร์ฟเวอร์" ไม่ใช่แหล่งความจริง
 * ทุก action ที่ขยับยอดจะเรียก RPC แล้วเอา **ยอดที่เซิร์ฟเวอร์คืนกลับมา** ไปเซ็ต
 * ไม่คำนวณเองซ้ำ — เพราะถ้ามีคนอื่นแก้พร้อมกัน ยอดที่คำนวณเองจะเพี้ยนทันที
 */
const useWalletStore = create((set, get) => ({
  ...INITIAL,
  _reset: () => set(INITIAL),

  _hydrate: ({ cash, transferAccounts, subWallets, loans }) =>
    set({
      cash: Number(cash) || 0,
      subWallets: subWallets ?? [],
      loans: loans ?? [],
      ...syncedAccounts(transferAccounts ?? []),
    }),

  /** ดึงยอดล่าสุดจากเซิร์ฟเวอร์ทั้งชุด — ใช้หลังทำงานที่กระทบหลายก้อนพร้อมกัน */
  refresh: async () => {
    const data = await walletApi.loadWallet()
    get()._hydrate(data)
    return data
  },

  total: () => get().cash + get().transfer,

  // ── เงินสด ────────────────────────────────────────────────────────────────

  adjustCash: async (delta) => {
    const cash = await walletApi.adjustCash(delta)
    set({ cash })
    return cash
  },

  addCash: (amount) => get().adjustCash(amount),
  deductCash: (amount) => get().adjustCash(-amount),

  // ── บัญชีเงินโอน ──────────────────────────────────────────────────────────

  createTransferAccount: async (data) => {
    const account = await walletApi.createTransferAccount(data)
    set((s) => syncedAccounts([...s.transferAccounts, account]))
    return account
  },

  updateTransferAccount: async (id, changes) => {
    const account = await walletApi.updateTransferAccount(id, changes)
    set((s) => syncedAccounts(s.transferAccounts.map((a) => (a.id === id ? { ...a, ...account } : a))))
    return account
  },

  deleteTransferAccount: async (id) => {
    await walletApi.deleteTransferAccount(id)
    set((s) => syncedAccounts(s.transferAccounts.filter((a) => a.id !== id)))
  },

  /** บวก/ลบยอดในบัญชีเดียว — ทางเข้าหลักของการเคลื่อนไหวเงินโอนทั้งหมด */
  adjustTransferAccount: async (id, delta) => {
    const balance = await walletApi.adjustTransferAccount(id, delta)
    set((s) => syncedAccounts(s.transferAccounts.map((a) => (a.id === id ? { ...a, balance } : a))))
    return balance
  },

  moveBetweenTransferAccounts: async (fromId, toId, amount) => {
    await walletApi.moveBetweenTransferAccounts(fromId, toId, amount)
    await get().refresh()
  },

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
  addTransfer: async (amount, accountId) => {
    const id = get().resolveTransferAccountId(accountId)
    if (!id) return false
    await get().adjustTransferAccount(id, amount)
    return true
  },
  deductTransfer: async (amount, accountId) => {
    const id = get().resolveTransferAccountId(accountId)
    if (!id) return false
    await get().adjustTransferAccount(id, -amount)
    return true
  },

  // ── กระเป๋าตังค์ย่อย ──────────────────────────────────────────────────────

  createSubWallet: async (name, initialBalance = 0, icon = null) => {
    const wallet = await walletApi.createSubWallet({ name, initialBalance, icon })
    set((s) => ({ subWallets: [...s.subWallets, wallet] }))
    return wallet
  },

  /** ตั้ง/เอาไอคอนของกระเป๋าย่อยออก — อัปเดตหน้าจอก่อน ย้อนกลับถ้าเซิร์ฟเวอร์ปฏิเสธ */
  setSubWalletIcon: async (id, icon) => {
    const before = get().subWallets.find((w) => w.id === id)?.icon ?? null
    set((s) => ({ subWallets: s.subWallets.map((w) => (w.id === id ? { ...w, icon } : w)) }))
    try {
      const wallet = await walletApi.updateSubWalletInfo(id, { icon })
      set((s) => ({ subWallets: s.subWallets.map((w) => (w.id === id ? { ...w, ...wallet } : w)) }))
      return wallet
    } catch (err) {
      set((s) => ({ subWallets: s.subWallets.map((w) => (w.id === id ? { ...w, icon: before } : w)) }))
      throw err
    }
  },

  deleteSubWallet: async (id) => {
    await walletApi.deleteSubWallet(id)
    set((s) => ({ subWallets: s.subWallets.filter((w) => w.id !== id) }))
  },

  renameSubWallet: async (id, name) => {
    const wallet = await walletApi.renameSubWallet(id, name)
    set((s) => ({ subWallets: s.subWallets.map((w) => (w.id === id ? { ...w, ...wallet } : w)) }))
    return wallet
  },

  adjustSubWallet: async (id, delta) => {
    const balance = await walletApi.adjustSubWallet(id, delta)
    set((s) => ({ subWallets: s.subWallets.map((w) => (w.id === id ? { ...w, balance } : w)) }))
    return balance
  },

  /** ชื่อเดิมของ adjustSubWallet — หน้าประวัติกับป๊อปอัพแก้ log ยังเรียกชื่อนี้อยู่ */
  updateSubWallet: (id, delta) => get().adjustSubWallet(id, delta),

  getSubWallet: (id) => get().subWallets.find((w) => w.id === id),

  reorderSubWallets: async (orderedIds) => {
    await walletApi.reorderSubWallets(orderedIds)
    set((s) => ({
      subWallets: orderedIds.map((id) => s.subWallets.find((w) => w.id === id)).filter(Boolean),
    }))
  },

  // ── งานที่ขยับเงินสองก้อนพร้อมกัน — ต้องผ่าน RPC เท่านั้น ────────────────

  moveCashTransfer: async (params) => {
    await walletApi.moveCashTransfer(params)
    await get().refresh()
  },

  moveSubWallet: async (params) => {
    await walletApi.moveSubWallet(params)
    await get().refresh()
  },

  moveBetweenSubWallets: async (params) => {
    await walletApi.moveBetweenSubWallets(params)
    await get().refresh()
  },

  borrowFromSubWallet: async (params) => {
    const loan = await walletApi.borrowFromSubWallet(params)
    await get().refresh()
    return loan
  },

  returnLoanById: async (loanId, returnMethod, returnAccountId = null) => {
    const loan = await walletApi.returnLoan({ loanId, method: returnMethod, accountId: returnAccountId })
    await get().refresh()
    return loan
  },

  /** ย้อน "คืนแล้ว" กลับเป็น "ยังไม่คืน" — ยอดเงินผู้เรียกต้องจัดการเอง */
  unReturnLoanById: async (loanId) => {
    const loan = await walletApi.unReturnLoan(loanId)
    set((s) => ({ loans: s.loans.map((l) => (l.id === loanId ? { ...l, ...loan } : l)) }))
    return loan
  },

  deleteLoanById: async (loanId) => {
    await walletApi.deleteLoan(loanId)
    set((s) => ({ loans: s.loans.filter((l) => l.id !== loanId) }))
  },

  getActiveLoans: () => get().loans.filter((l) => !l.returned),
}))

export default useWalletStore
