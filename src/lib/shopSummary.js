import { SHOP_DATA_BASES, shopDataKeys } from './shopKeys'

function readPersisted(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { ok: false, missing: true, state: null }
    const parsed = JSON.parse(raw)
    return { ok: true, missing: false, state: parsed?.state ?? {} }
  } catch (err) {
    return { ok: false, missing: false, state: null, error: err.message }
  }
}

function readRaw(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null')
  } catch {
    return null
  }
}

function latestTransactionDate(transactions) {
  if (!transactions.length) return null
  return transactions
    .map((tx) => tx.createdAt || tx.date)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null
}

export function getShopSummary(shopId) {
  const tx = readPersisted(`${shopId}_transactions`)
  const wallet = readPersisted(`${shopId}_wallet_main`)
  const pending = readPersisted(`${shopId}_pending_data`)
  const categories = readPersisted(`${shopId}_categories_data`)
  const logs = readPersisted(`${shopId}_activity_log`)
  const notes = readPersisted(`${shopId}_calendar_notes`)
  const app = readPersisted(`${shopId}_app_settings`)

  const transactions = Array.isArray(tx.state?.transactions) ? tx.state.transactions : []
  const pendingPayments = Array.isArray(pending.state?.pendingPayments) ? pending.state.pendingPayments : []
  const pendingIncomes = Array.isArray(pending.state?.pendingIncomes) ? pending.state.pendingIncomes : []
  const taxInvoices = Array.isArray(pending.state?.taxInvoices) ? pending.state.taxInvoices : []
  const subWallets = Array.isArray(wallet.state?.subWallets) ? wallet.state.subWallets : []

  const healthItems = [
    ['transactions', tx],
    ['wallet', wallet],
    ['pending', pending],
    ['categories', categories],
    ['logs', logs],
    ['notes', notes],
    ['settings', app],
  ]

  const missing = healthItems.filter(([, item]) => item.missing).map(([name]) => name)
  const broken = healthItems.filter(([, item]) => !item.ok && !item.missing).map(([name]) => name)

  return {
    totalBalance: Number(wallet.state?.cash || 0) + Number(wallet.state?.transfer || 0),
    cash: Number(wallet.state?.cash || 0),
    transfer: Number(wallet.state?.transfer || 0),
    transactionCount: transactions.length,
    pendingPaymentCount: pendingPayments.filter((item) => item.status === 'pending').length,
    pendingIncomeCount: pendingIncomes.filter((item) => item.status === 'pending').length,
    taxWaitingCount: taxInvoices.filter((item) => item.status === 'waiting').length,
    subWalletCount: subWallets.length,
    latestTransactionAt: latestTransactionDate(transactions),
    health: {
      ok: missing.length === 0 && broken.length === 0,
      missing,
      broken,
    },
  }
}

export function getAllShopSummaries(shops) {
  return Object.fromEntries(shops.map((shop) => [shop.id, getShopSummary(shop.id)]))
}

export function findOrphanShopData(shops) {
  const knownIds = new Set(shops.map((shop) => shop.id))
  const ids = new Set()

  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (!key) continue
    const base = SHOP_DATA_BASES.find((item) => key.endsWith(`_${item}`))
    if (!base) continue
    const id = key.slice(0, -1 * (`_${base}`.length))
    if (id && !knownIds.has(id) && id !== 'default') ids.add(id)
  }

  return [...ids].map((id) => ({
    id,
    keys: shopDataKeys(id).filter((key) => localStorage.getItem(key) != null),
    summary: getShopSummary(id),
  }))
}

export function buildShopBackup(shop) {
  const data = {
    _backupType: 'shop',
    _shopId: shop.id,
    _shopName: shop.name,
    _backupAt: new Date().toISOString(),
  }

  for (const key of shopDataKeys(shop.id)) {
    data[key] = readRaw(key)
  }

  return data
}
