import { get as idbGet, set as idbSet } from 'idb-keyval'
import { activeShopId } from './activeShop'

const DEVICE_KEY = 'zuzoo_cloud_device_id'
const QUEUE_SUFFIX = 'cloud_sync_queue_v1'
const MAX_QUEUE_ATTEMPTS = 10

export const CLOUD_SYNC_STATUS = {
  PENDING: 'pending',
  SYNCING: 'syncing',
  SYNCED: 'synced',
  FAILED: 'failed',
  DEAD: 'dead',
}

export function nowIso() {
  return new Date().toISOString()
}

export function getCloudShopId(shopId = activeShopId) {
  return shopId || 'default'
}

export function getCloudDeviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_KEY)
    if (existing) return existing
    const id = crypto?.randomUUID?.() ?? `device-${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(DEVICE_KEY, id)
    return id
  } catch {
    return 'device-unavailable'
  }
}

export function getCloudQueueKey(shopId = activeShopId) {
  return `${getCloudShopId(shopId)}_${QUEUE_SUFFIX}`
}

async function readQueue(shopId = activeShopId) {
  const key = getCloudQueueKey(shopId)
  try {
    const queue = await idbGet(key)
    if (Array.isArray(queue)) return queue

    const raw = localStorage.getItem(key)
    const migratedQueue = raw ? JSON.parse(raw) : []
    if (!Array.isArray(migratedQueue)) return []
    if (migratedQueue.length > 0) await idbSet(key, migratedQueue)
    if (raw) localStorage.removeItem(key)
    return migratedQueue
  } catch {
    return []
  }
}

async function writeQueue(queue, shopId = activeShopId) {
  try {
    await idbSet(getCloudQueueKey(shopId), queue)
  } catch {
    // Cloud queue is a sidecar. Never interrupt the offline/local workflow.
  }
}

async function updateQueueItems(shopId, updater) {
  const queue = await readQueue(shopId)
  const next = queue.map(updater)
  await writeQueue(next, shopId)
  return next
}

export function withCloudMetadata(record, tableName, options = {}) {
  const timestamp = options.timestamp ?? nowIso()
  const existing = record ?? {}
  const sync = existing.cloudSync ?? {}
  return {
    ...existing,
    shopId: existing.shopId ?? getCloudShopId(options.shopId),
    deviceId: existing.deviceId ?? getCloudDeviceId(),
    createdAt: existing.createdAt ?? timestamp,
    updatedAt: timestamp,
    deletedAt: existing.deletedAt ?? null,
    syncStatus: CLOUD_SYNC_STATUS.PENDING,
    cloudSync: {
      tableName,
      revision: Number(sync.revision ?? 0) + 1,
      status: CLOUD_SYNC_STATUS.PENDING,
      deviceId: getCloudDeviceId(),
      updatedAt: timestamp,
      deletedAt: existing.deletedAt ?? null,
    },
  }
}

export function touchCloudMetadata(record, tableName, options = {}) {
  return withCloudMetadata(record, tableName, options)
}

export function makeCloudDeletePayload(record, tableName, options = {}) {
  const timestamp = options.timestamp ?? nowIso()
  return {
    id: record?.id,
    shopId: record?.shopId ?? getCloudShopId(options.shopId),
    deviceId: record?.deviceId ?? getCloudDeviceId(),
    deletedAt: timestamp,
    updatedAt: timestamp,
    syncStatus: CLOUD_SYNC_STATUS.PENDING,
    cloudSync: {
      tableName,
      revision: Number(record?.cloudSync?.revision ?? 0) + 1,
      status: CLOUD_SYNC_STATUS.PENDING,
      deviceId: getCloudDeviceId(),
      updatedAt: timestamp,
      deletedAt: timestamp,
    },
  }
}

export async function enqueueCloudChange(tableName, recordId, action, payload, options = {}) {
  if (!recordId) return null
  const timestamp = options.timestamp ?? nowIso()
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    tableName,
    recordId,
    action,
    payload,
    status: CLOUD_SYNC_STATUS.PENDING,
    attempts: 0,
    shopId: getCloudShopId(options.shopId),
    deviceId: getCloudDeviceId(),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const queue = await readQueue(options.shopId)
  await writeQueue([...queue, item], options.shopId)
  try {
    window.dispatchEvent(new CustomEvent('zuzoo:queue-updated', {
      detail: { shopId: item.shopId },
    }))
  } catch { /* ignore in non-browser env */ }
  return item
}

export function enqueueCloudUpsert(tableName, record, options = {}) {
  return enqueueCloudChange(tableName, record?.id, 'upsert', record, options)
}

export function enqueueCloudDelete(tableName, record, options = {}) {
  const payload = makeCloudDeletePayload(record, tableName, options)
  return enqueueCloudChange(tableName, record?.id, 'delete', payload, options)
}

export async function getCloudQueueSummary(shopId = activeShopId) {
  const queue = await readQueue(shopId)
  return queue.reduce(
    (summary, item) => {
      summary.total += 1
      summary[item.status] = (summary[item.status] ?? 0) + 1
      return summary
    },
    { total: 0, pending: 0, syncing: 0, synced: 0, failed: 0, dead: 0 }
  )
}

export function getCloudQueueItems(shopId = activeShopId) {
  return readQueue(shopId)
}

export async function getPendingCloudQueueItems(shopId = activeShopId, limit = 50) {
  return (await readQueue(shopId))
    .filter((item) => item.status === CLOUD_SYNC_STATUS.PENDING || item.status === CLOUD_SYNC_STATUS.FAILED)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .slice(0, limit)
}

export function markCloudQueueItemsSyncing(shopId = activeShopId, ids = []) {
  const idSet = new Set(ids)
  const timestamp = nowIso()
  return updateQueueItems(shopId, (item) =>
    idSet.has(item.id)
      ? { ...item, status: CLOUD_SYNC_STATUS.SYNCING, updatedAt: timestamp }
      : item
  )
}

export function markCloudQueueItemsSynced(shopId = activeShopId, ids = [], syncedAt = nowIso()) {
  const idSet = new Set(ids)
  return updateQueueItems(shopId, (item) =>
    idSet.has(item.id)
      ? { ...item, status: CLOUD_SYNC_STATUS.SYNCED, syncedAt, updatedAt: syncedAt }
      : item
  )
}

export function markCloudQueueItemFailed(shopId = activeShopId, id, errorMessage = '') {
  const timestamp = nowIso()
  return updateQueueItems(shopId, (item) => {
    if (item.id !== id) return item
    const attempts = Number(item.attempts ?? 0) + 1
    return {
      ...item,
      attempts,
      status: attempts >= MAX_QUEUE_ATTEMPTS ? CLOUD_SYNC_STATUS.DEAD : CLOUD_SYNC_STATUS.FAILED,
      errorMessage,
      updatedAt: timestamp,
    }
  })
}

export function resetStuckCloudQueueItems(shopId = activeShopId) {
  const timestamp = nowIso()
  return updateQueueItems(shopId, (item) =>
    item.status === CLOUD_SYNC_STATUS.SYNCING
      ? { ...item, status: CLOUD_SYNC_STATUS.PENDING, updatedAt: timestamp }
      : item
  )
}

export async function pruneSyncedCloudQueueItems(shopId = activeShopId, keepLatest = 100) {
  const queue = await readQueue(shopId)
  const synced = queue.filter((item) => item.status === CLOUD_SYNC_STATUS.SYNCED)
  const keepSyncedIds = new Set(
    synced
      .sort((a, b) => String(b.syncedAt || b.updatedAt).localeCompare(String(a.syncedAt || a.updatedAt)))
      .slice(0, keepLatest)
      .map((item) => item.id)
  )
  const next = queue.filter((item) => item.status !== CLOUD_SYNC_STATUS.SYNCED || keepSyncedIds.has(item.id))
  await writeQueue(next, shopId)
  return { before: queue.length, after: next.length, removed: queue.length - next.length }
}

export async function compactCloudQueue(shopId = activeShopId) {
  const queue = await readQueue(shopId)
  const compacted = []
  const indexByRecord = new Map()

  for (const item of queue) {
    if (![CLOUD_SYNC_STATUS.PENDING, CLOUD_SYNC_STATUS.SYNCED].includes(item.status)) {
      compacted.push(item)
      continue
    }

    const key = `${item.tableName}:${item.recordId}`
    const previousIndex = indexByRecord.get(key)

    if (previousIndex == null) {
      indexByRecord.set(key, compacted.length)
      compacted.push(item)
      continue
    }

    const previous = compacted[previousIndex]
    if (previous.action === 'delete') continue

    if (item.action === 'delete') {
      compacted[previousIndex] = item
      continue
    }

    compacted[previousIndex] = {
      ...item,
      attempts: Math.max(Number(previous.attempts ?? 0), Number(item.attempts ?? 0)),
      createdAt: previous.createdAt ?? item.createdAt,
      updatedAt: item.updatedAt ?? nowIso(),
    }
  }

  await writeQueue(compacted, shopId)
  return { before: queue.length, after: compacted.length, removed: Math.max(0, queue.length - compacted.length) }
}

export async function buildCloudQueueReport(shops = []) {
  const deviceId = getCloudDeviceId()
  const generatedAt = nowIso()
  const shopReports = await Promise.all(shops.map(async (shop) => {
    const items = await readQueue(shop.id)
    const summary = await getCloudQueueSummary(shop.id)
    const byTable = items.reduce((acc, item) => {
      acc[item.tableName] = acc[item.tableName] ?? { total: 0, pending: 0, failed: 0, dead: 0, delete: 0, upsert: 0 }
      acc[item.tableName].total += 1
      acc[item.tableName][item.status] = (acc[item.tableName][item.status] ?? 0) + 1
      acc[item.tableName][item.action] = (acc[item.tableName][item.action] ?? 0) + 1
      return acc
    }, {})

    return {
      shopId: shop.id,
      shopCode: shop.code ?? null,
      shopName: shop.name,
      queueKey: getCloudQueueKey(shop.id),
      summary,
      byTable,
      latestQueuedAt: items.map((item) => item.updatedAt || item.createdAt).filter(Boolean).sort().at(-1) ?? null,
    }
  }))

  return {
    reportType: 'cloud-upload-readiness',
    app: 'income-expense-system-app',
    generatedAt,
    deviceId,
    status: 'local-preparation-only',
    warning: 'This report does not mean cloud sync is enabled. Backend, auth, conflict handling, and attachment upload are still required.',
    shops: shopReports,
    totals: shopReports.reduce(
      (acc, shop) => {
        acc.shops += 1
        acc.queueItems += shop.summary.total
        acc.pending += shop.summary.pending
        acc.failed += shop.summary.failed
        acc.dead += shop.summary.dead
        return acc
      },
      { shops: 0, queueItems: 0, pending: 0, failed: 0, dead: 0 }
    ),
    risks: [
      'No backend API is connected yet.',
      'Plain password/PIN must never be uploaded from local auth storage.',
      'Attachment file paths still need a cloud storage upload pipeline.',
      'Wallet state requires extra reconciliation before multi-device writes.',
      'Dead-letter and conflict handling are not active yet.',
    ],
  }
}

export async function migrateQueueFromLocalStorage(shopIds = []) {
  for (const shopId of shopIds) {
    const key = getCloudQueueKey(shopId)
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const existing = await idbGet(key)
      if (existing) continue
      const queue = JSON.parse(raw)
      if (Array.isArray(queue) && queue.length > 0) {
        await idbSet(key, queue)
      }
      localStorage.removeItem(key)
    } catch {
      // Cloud queue migration must not block local usage.
    }
  }
}
