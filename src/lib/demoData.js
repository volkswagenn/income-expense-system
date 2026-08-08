import { v4 as uuid } from 'uuid'
import { subDays, startOfMonth, addDays } from 'date-fns'
import { localDateStr, localMonthStr } from './dateUtils'
import { APP_DATA_KEYS } from './appDataKeys'

/**
 * ชุดข้อมูลตัวอย่างสำหรับทดสอบระบบ
 *
 * ทุกรายการมีธง `_demo: true` ติดไว้ จึงลบออกได้ทีหลังโดยไม่แตะข้อมูลจริง
 * ใช้ผ่านหน้า ตั้งค่า → ข้อมูลทดสอบ หรือเรียก seedDemoData() / clearDemoData()
 */
export const DEMO_FLAG = '_demo'

const BANKS = [
  { bankName: 'กสิกรไทย', name: 'บัญชีร้าน', balance: 128500 },
  { bankName: 'ไทยพาณิชย์', name: 'บัญชีสำรอง', balance: 42000 },
]

const EXPENSE_CATS = [
  { name: 'ต้นทุนสินค้า', subs: ['อาหารสัตว์', 'ของใช้สัตว์เลี้ยง'] },
  { name: 'ค่าสาธารณูปโภค', subs: ['ค่าไฟ', 'ค่าน้ำ', 'อินเทอร์เน็ต'] },
  { name: 'ค่าเช่า', subs: [] },
  { name: 'ค่าแรงพนักงาน', subs: [] },
  { name: 'ค่าขนส่ง', subs: [] },
]
const INCOME_CATS = [
  { name: 'ขายสินค้า', subs: ['หน้าร้าน', 'ออนไลน์'] },
  { name: 'บริการ', subs: ['อาบน้ำตัดขน', 'ฝากเลี้ยง'] },
]

const EXPENSE_ITEMS = [
  ['อาหารแมว Royal Canin', 2850], ['ทรายแมว 10 ถุง', 1200],
  ['ค่าไฟฟ้าประจำเดือน', 3450], ['ค่าน้ำประปา', 680],
  ['ปลอกคอ+สายจูง', 1650], ['ขนมสุนัข', 980],
  ['ค่าส่งของ Kerry', 450], ['อุปกรณ์ทำความสะอาด', 720],
]
const INCOME_ITEMS = [
  ['ขายหน้าร้าน', 8500], ['ขายออนไลน์ Shopee', 6200],
  ['อาบน้ำตัดขน', 3400], ['ฝากเลี้ยง 3 วัน', 2400],
  ['ขายหน้าร้าน', 11200], ['ขายออนไลน์ Lazada', 4800],
]

function pick(arr, i) { return arr[i % arr.length] }

export function seedDemoData() {
  const now = new Date()
  const today = localDateStr(now)
  const month = localMonthStr(now)
  const stamp = () => new Date().toISOString()

  // ── บัญชีเงินโอน + กระเป๋าตังค์ ────────────────────────────────────
  const accounts = BANKS.map((b) => ({
    id: uuid(), ...b, createdAt: stamp(), [DEMO_FLAG]: true,
  }))
  const subWallets = [
    { id: uuid(), name: 'เงินเก็บฉุกเฉิน', balance: 25000, createdAt: stamp(), [DEMO_FLAG]: true },
    { id: uuid(), name: 'กองทุนซื้อของ', balance: 8000, createdAt: stamp(), [DEMO_FLAG]: true },
  ]

  // ── หมวดหมู่ 2 ชั้น ────────────────────────────────────────────────
  const categories = []
  const addCat = (name, type, parentId = null) => {
    const c = { id: uuid(), name, type, parentId, deleted: false, [DEMO_FLAG]: true }
    categories.push(c)
    return c
  }
  const expenseLeaf = [], incomeLeaf = []
  EXPENSE_CATS.forEach((g) => {
    const main = addCat(g.name, 'expense')
    if (g.subs.length === 0) expenseLeaf.push(main.id)
    g.subs.forEach((s) => expenseLeaf.push(addCat(s, 'expense', main.id).id))
  })
  INCOME_CATS.forEach((g) => {
    const main = addCat(g.name, 'income')
    if (g.subs.length === 0) incomeLeaf.push(main.id)
    g.subs.forEach((s) => incomeLeaf.push(addCat(s, 'income', main.id).id))
  })

  // ── รายการย้อนหลัง 45 วัน ─────────────────────────────────────────
  const transactions = []
  let cash = 15000
  let transferTotal = accounts.reduce((s, a) => s + a.balance, 0)

  for (let d = 44; d >= 0; d -= 1) {
    const date = localDateStr(subDays(now, d))
    // รายรับเกือบทุกวัน
    if (d % 2 === 0 || d % 3 === 0) {
      const [name, base] = pick(INCOME_ITEMS, d)
      const amount = Math.round(base * (0.7 + ((d * 7) % 60) / 100))
      const useTransfer = d % 3 === 0
      transactions.push({
        id: uuid(), date, type: 'income', amount,
        method: useTransfer ? 'transfer' : 'cash',
        ...(useTransfer ? { transferAccountId: accounts[d % 2].id } : {}),
        category: pick(incomeLeaf, d),
        itemName: name, note: '', createdAt: new Date(date + 'T10:00:00').toISOString(),
        [DEMO_FLAG]: true,
      })
      if (useTransfer) accounts[d % 2].balance += amount
      else cash += amount
    }
    // รายจ่ายบางวัน
    if (d % 3 === 1 || d % 5 === 0) {
      const [name, base] = pick(EXPENSE_ITEMS, d)
      const amount = Math.round(base * (0.8 + ((d * 3) % 40) / 100))
      const useTransfer = d % 4 === 0
      transactions.push({
        id: uuid(), date, type: 'expense', amount,
        method: useTransfer ? 'transfer' : 'cash',
        ...(useTransfer ? { transferAccountId: accounts[0].id } : {}),
        category: pick(expenseLeaf, d),
        itemName: name, vendor: '', receiptNo: '', taxStatus: 'none',
        note: '', createdAt: new Date(date + 'T14:00:00').toISOString(),
        [DEMO_FLAG]: true,
      })
      if (useTransfer) accounts[0].balance -= amount
      else cash -= amount
    }
  }
  transferTotal = accounts.reduce((s, a) => s + a.balance, 0)

  // ── ค้างชำระ / รอรับเงิน / ใบกำกับภาษี ────────────────────────────
  const pendingPayments = [
    { id: uuid(), status: 'pending', description: 'ค่าอาหารสัตว์ล็อตใหญ่', itemName: 'อาหารสัตว์ล็อตใหญ่',
      amount: 18500, dueDate: localDateStr(addDays(now, 5)), category: expenseLeaf[0],
      defaultTransferAccountId: accounts[0].id, openDate: today, createdAt: stamp(), [DEMO_FLAG]: true },
    { id: uuid(), status: 'pending', description: 'ค่าเช่าร้านเดือนนี้', itemName: 'ค่าเช่าร้าน',
      amount: 12000, dueDate: localDateStr(subDays(now, 2)), category: expenseLeaf[3],
      openDate: today, createdAt: stamp(), [DEMO_FLAG]: true },
  ]
  const pendingIncomes = [
    { id: uuid(), status: 'pending', description: 'ลูกค้าโอนค้างไว้', amount: 5600,
      date: localDateStr(subDays(now, 1)), receivedAt: null, receivedMethod: null,
      transactionId: null, createdAt: stamp(), [DEMO_FLAG]: true },
  ]
  const taxInvoices = [
    { id: uuid(), status: 'waiting', itemName: 'อาหารแมว Royal Canin', receiptNo: 'INV-2569-0042',
      amount: 2850, dueDate: localDateStr(addDays(now, 10)), createdAt: stamp(), [DEMO_FLAG]: true },
  ]

  // ── รายการประจำ ───────────────────────────────────────────────────
  const recItems = [
    { name: 'ค่าเช่าร้าน', billingDay: 1, amountType: 'fixed', fixedAmount: 12000, category: expenseLeaf[3], defaultMethod: 'transfer', defaultTransferAccountId: accounts[0].id },
    { name: 'ค่าไฟฟ้า', billingDay: 15, amountType: 'variable', category: expenseLeaf[1], defaultMethod: 'cash' },
    { name: 'อินเทอร์เน็ตร้าน', billingDay: 20, amountType: 'fixed', fixedAmount: 890, category: expenseLeaf[2], defaultMethod: 'transfer', defaultTransferAccountId: accounts[1].id },
  ].map((r) => ({ id: uuid(), enabled: true, createdAt: stamp(), updatedAt: stamp(), ...r, [DEMO_FLAG]: true }))

  const [y, m] = month.split('-').map(Number)
  const entries = recItems.map((it, i) => ({
    id: uuid(), recurringId: it.id, month,
    dueDate: `${y}-${String(m).padStart(2, '0')}-${String(it.billingDay).padStart(2, '0')}`,
    status: i === 0 ? 'paid' : 'pending',
    amount: it.amountType === 'fixed' ? it.fixedAmount : 0,
    paidAt: i === 0 ? stamp() : null,
    paidMethod: i === 0 ? 'transfer' : null,
    transferAccountId: i === 0 ? accounts[0].id : null,
    transactionId: null, pendingPaymentId: null,
    createdAt: stamp(), [DEMO_FLAG]: true,
  }))

  // ── โน้ตปฏิทิน ────────────────────────────────────────────────────
  const notes = {
    [localDateStr(addDays(now, 3))]: 'นัดรับของจากซัพพลายเออร์',
    [localDateStr(subDays(now, 4))]: 'ตรวจนับสต็อกประจำเดือน',
  }

  // ── เขียนลง localStorage ตรงๆ แล้วรีโหลดให้ store อ่านใหม่ ──────────
  const write = (key, state, version = 0) =>
    localStorage.setItem(key, JSON.stringify({ state, version }))

  write('default_wallet_main', {
    cash, transfer: transferTotal, subWallets, loans: [], transferAccounts: accounts,
  }, 1)
  write('default_categories_data', {
    categories, vendors: [], quickItems: [],
  }, 2)
  write('default_transactions', { transactions })
  write('default_pending_data', { pendingPayments, taxInvoices, pendingIncomes })
  write('default_recurring_data', { items: recItems, entries })
  write('default_calendar_notes', { notes })

  return {
    transactions: transactions.length,
    categories: categories.length,
    accounts: accounts.length,
    pending: pendingPayments.length + pendingIncomes.length + taxInvoices.length,
    recurring: recItems.length,
  }
}

/** ลบข้อมูลทดสอบทั้งหมด — คืนระบบกลับเป็นสถานะเริ่มต้น */
export function clearDemoData() {
  APP_DATA_KEYS.forEach((k) => localStorage.removeItem(k))
  try {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith('draft:'))
      .forEach((k) => sessionStorage.removeItem(k))
  } catch { /* noop */ }
}

/** มีข้อมูลทดสอบอยู่ในระบบไหม (ดูจากธง _demo) */
export function hasDemoData() {
  try {
    const raw = JSON.parse(localStorage.getItem('default_transactions') || 'null')
    return (raw?.state?.transactions ?? []).some((t) => t[DEMO_FLAG])
  } catch { return false }
}
