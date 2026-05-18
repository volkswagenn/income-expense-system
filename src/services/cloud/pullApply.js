import { getCloudDeviceId, getCloudQueueItems } from '../../lib/cloudSyncMetadata'
import { supabaseSelectRows } from './apiClient'
import { isCloudEnabled, saveCloudConfig } from './cloudConfig'

const LAST_PULL_PREFIX = 'zuzoo_cloud_last_pull_at'

const TABLE_TARGETS = {
  transactions: { keyBase: 'transactions', field: 'transactions' },
  pending_payments: { keyBase: 'pending_data', field: 'pendingPayments' },
  pending_incomes: { keyBase: 'pending_data', field: 'pendingIncomes' },
  tax_invoices: { keyBase: 'pending_data', field: 'taxInvoices' },
  recurring_items: { keyBase: 'recurring_data', field: 'items' },
  recurring_entries: { keyBase: 'recurring_data', field: 'entries' },
  categories: { keyBase: 'categories_data', field: 'categories' },
  vendors: { keyBase: 'categories_data', field: 'vendors' },
  quick_items: { keyBase: 'categories_data', field: 'quickItems' },
  sub_wallets: { keyBase: 'wallet_main', field: 'subWallets' },
  loans: { keyBase: 'wallet_main', field: 'loans' },
  wallet_state: { keyBase: 'wallet_main', field: null },
  activity_logs: { keyBase: 'activity_log', field: 'logs' },
}

function persistedKey(shopId, keyBase) {
  return `${shopId}_${keyBase}`
}

function readPersisted(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? { state: {}, version: 0 }
  } catch {
    return { state: {}, version: 0 }
  }
}

function writePersisted(key, persisted) {
  localStorage.setItem(key, JSON.stringify({
    version: persisted.version ?? 0,
    state: persisted.state ?? {},
  }))
}

function isNewer(incoming, local) {
  if (!local?.updatedAt) return true
  if (!incoming?.updatedAt) return false
  return new Date(incoming.updatedAt).getTime() > new Date(local.updatedAt).getTime()
}

function hasLocalPending(shopId, tableName, recordId) {
  return getCloudQueueItems(shopId).some((item) =>
    item.tableName === tableName &&
    item.recordId === recordId &&
    ['pending', 'syncing', 'failed'].includes(item.status)
  )
}

function applyArrayUpsert(shopId, tableName, payload) {
  const target = TABLE_TARGETS[tableName]
  if (!target || !payload?.id) return { applied: false, reason: 'unsupported' }
  if (hasLocalPending(shopId, tableName, payload.id)) return { applied: false, reason: 'local-pending' }

  const key = persistedKey(shopId, target.keyBase)
  const persisted = readPersisted(key)
  const state = persisted.state ?? {}
  const list = Array.isArray(state[target.field]) ? state[target.field] : []
  const index = list.findIndex((item) => item.id === payload.id)
  const local = index >= 0 ? list[index] : null

  if (!isNewer(payload, local)) return { applied: false, reason: 'not-newer' }
  const nextList = index >= 0
    ? list.map((item) => item.id === payload.id ? payload : item)
    : [payload, ...list]
  writePersisted(key, { ...persisted, state: { ...state, [target.field]: nextList } })
  return { applied: true }
}

function applyArrayDelete(shopId, tableName, recordId) {
  const target = TABLE_TARGETS[tableName]
  if (!target || !recordId) return { applied: false, reason: 'unsupported' }
  if (hasLocalPending(shopId, tableName, recordId)) return { applied: false, reason: 'local-pending' }

  const key = persistedKey(shopId, target.keyBase)
  const persisted = readPersisted(key)
  const state = persisted.state ?? {}
  const list = Array.isArray(state[target.field]) ? state[target.field] : []
  const nextList = list.filter((item) => item.id !== recordId)
  if (nextList.length === list.length) return { applied: false, reason: 'missing' }
  writePersisted(key, { ...persisted, state: { ...state, [target.field]: nextList } })
  return { applied: true }
}

function applyWalletState(shopId, payload) {
  if (!payload?.id) return { applied: false, reason: 'invalid-wallet' }
  if (hasLocalPending(shopId, 'wallet_state', payload.id)) return { applied: false, reason: 'local-pending' }
  const key = persistedKey(shopId, 'wallet_main')
  const persisted = readPersisted(key)
  const state = persisted.state ?? {}
  const localUpdatedAt = state.cloudSync?.updatedAt || state.updatedAt
  if (localUpdatedAt && payload.updatedAt && new Date(payload.updatedAt).getTime() <= new Date(localUpdatedAt).getTime()) {
    return { applied: false, reason: 'not-newer' }
  }
  writePersisted(key, {
    ...persisted,
    state: {
      ...state,
      cash: Number(payload.cash ?? state.cash ?? 0),
      transfer: Number(payload.transfer ?? state.transfer ?? 0),
      subWallets: Array.isArray(payload.subWallets) ? payload.subWallets : (state.subWallets ?? []),
      loans: Array.isArray(payload.loans) ? payload.loans : (state.loans ?? []),
      updatedAt: payload.updatedAt,
      cloudSync: payload.cloudSync,
    },
  })
  return { applied: true }
}

function rowToPayload(row) {
  return {
    ...(row.payload ?? {}),
    id: row.payload?.id ?? row.id,
    shopId: row.payload?.shopId ?? row.shop_id,
    deviceId: row.payload?.deviceId ?? row.device_id,
    updatedAt: row.payload?.updatedAt ?? row.updated_at,
    createdAt: row.payload?.createdAt ?? row.created_at,
    deletedAt: row.payload?.deletedAt ?? row.deleted_at,
  }
}

function recordResult(stats, result) {
  if (result.applied) stats.applied += 1
  else if (result.reason === 'local-pending') stats.conflicts += 1
  else if (result.reason === 'unsupported') stats.unsupported += 1
  else stats.skipped += 1
}

export async function pullAndApplyShop(shopId, options = {}) {
  if (!isCloudEnabled()) return { ok: false, skipped: true, message: 'Cloud sync is disabled' }

  const sinceKey = `${LAST_PULL_PREFIX}_${shopId}`
  const since = options.full ? null : localStorage.getItem(sinceKey)
  const localDeviceId = getCloudDeviceId()
  const stats = { applied: 0, skipped: 0, conflicts: 0, unsupported: 0 }
  let latestSyncedAt = null

  for (const tableName of Object.keys(TABLE_TARGETS)) {
    // eslint-disable-next-line no-await-in-loop
    const rows = await supabaseSelectRows(tableName, {
      shopId,
      since,
      excludeDeviceId: localDeviceId,
    })

    for (const row of rows) {
      if (row.device_id === localDeviceId) {
        stats.skipped += 1
        continue
      }
      if (row.updated_at && (!latestSyncedAt || row.updated_at > latestSyncedAt)) {
        latestSyncedAt = row.updated_at
      }

      if (row.deleted_at) {
        recordResult(stats, applyArrayDelete(shopId, tableName, row.id))
        continue
      }

      const payload = rowToPayload(row)
      const result = tableName === 'wallet_state'
        ? applyWalletState(shopId, payload)
        : applyArrayUpsert(shopId, tableName, payload)
      recordResult(stats, result)
    }
  }

  const syncedAt = latestSyncedAt ?? new Date().toISOString()
  localStorage.setItem(sinceKey, syncedAt)
  saveCloudConfig({ lastPullAt: syncedAt, lastSyncError: null })
  return { ok: true, syncedAt, ...stats }
}

export async function pullAndApplyAllShops(shops, options = {}) {
  const results = []
  for (const shop of shops) {
    // eslint-disable-next-line no-await-in-loop
    const result = await pullAndApplyShop(shop.id, options)
    results.push({ shopId: shop.id, shopName: shop.name, ...result })
  }
  return results
}
