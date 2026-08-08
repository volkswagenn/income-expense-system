import * as categories from './categories'
import * as logs from './logs'
import * as notes from './notes'
import * as pending from './pending'
import * as recurring from './recurring'
import * as settings from './settings'
import * as transactions from './transactions'
import * as wallet from './wallet'

export { categories, logs, notes, pending, recurring, settings, transactions, wallet }
export { getShopId, hasShop, setShopId } from './context'

/**
 * โหลดข้อมูลตั้งต้นทั้งหมดพร้อมกันตอนเปิดแอป
 *
 * ยิงขนานกันทั้งหมดเพราะไม่มีอันไหนต้องรออันไหน — ช้าที่สุดเท่ากับ request ที่ช้าที่สุด
 * ถ้ามีอันใดอันหนึ่งพัง ให้ล้มทั้งชุดไปเลย แล้วแสดงหน้า error + ปุ่มลองใหม่
 * ดีกว่าเข้าแอปได้แบบข้อมูลไม่ครบ ซึ่งผู้ใช้จะแยกไม่ออกว่าข้อมูลหายจริงหรือแค่โหลดไม่มา
 */
export async function loadAllData() {
  const [
    walletData,
    txs,
    pendingPayments,
    pendingIncomes,
    taxInvoices,
    categoryList,
    vendors,
    quickItems,
    recurringItems,
    recurringEntries,
    noteMap,
    shopSettings,
  ] = await Promise.all([
    wallet.loadWallet(),
    transactions.listTransactions(),
    pending.listPendingPayments(),
    pending.listPendingIncomes(),
    pending.listTaxInvoices(),
    categories.listCategories(),
    categories.listVendors(),
    categories.listQuickItems(),
    recurring.listRecurringItems(),
    recurring.listRecurringEntries(),
    notes.listNotes(),
    settings.loadSettings(),
  ])

  return {
    wallet: walletData,
    transactions: txs,
    pendingPayments,
    pendingIncomes,
    taxInvoices,
    categories: categoryList,
    vendors,
    quickItems,
    recurringItems,
    recurringEntries,
    notes: noteMap,
    settings: shopSettings,
  }
}
