import {
  getCloudDeviceId,
  getPendingCloudQueueItems,
  markCloudQueueItemFailed,
  markCloudQueueItemsSynced,
  markCloudQueueItemsSyncing,
  nowIso,
  pruneSyncedCloudQueueItems,
  resetStuckCloudQueueItems,
} from '../../lib/cloudSyncMetadata'
import { supabaseSoftDeleteRows, supabaseUpsertRows } from './apiClient'
import { getApiBaseUrl, getCloudConfig, isCloudEnabled, saveCloudConfig } from './cloudConfig'

function groupByTable(items) {
  return items.reduce((groups, item) => {
    const table = item.tableName
    if (!table) return groups
    groups[table] = groups[table] || []
    groups[table].push(item)
    return groups
  }, {})
}

function timestampFrom(item) {
  return item.payload?.updatedAt || item.payload?.updated_at || item.updatedAt || nowIso()
}

function toSupabaseRow(item, shopId) {
  const payload = item.payload || {}
  const timestamp = timestampFrom(item)
  return {
    id: item.recordId || payload.id,
    shop_id: payload.shopId || payload.shop_id || item.shopId || shopId,
    device_id: payload.deviceId || payload.device_id || item.deviceId || getCloudDeviceId(),
    payload,
    created_at: payload.createdAt || payload.created_at || item.createdAt || timestamp,
    updated_at: timestamp,
    deleted_at: payload.deletedAt || payload.deleted_at || null,
  }
}

function toDeleteRow(item, shopId) {
  const row = toSupabaseRow(item, shopId)
  const timestamp = row.deleted_at || row.updated_at || nowIso()
  return {
    id: row.id,
    shop_id: row.shop_id,
    device_id: row.device_id,
    updated_at: timestamp,
    deleted_at: timestamp,
  }
}

async function notifyBackend(shopId, deviceId, syncedAt) {
  const baseUrl = getApiBaseUrl()
  const config = getCloudConfig()
  if (!baseUrl || !config.accessToken) return

  try {
    await fetch(`${baseUrl}/api/sync/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.accessToken}`,
      },
      body: JSON.stringify({ shopId, deviceId, syncedAt }),
    })
  } catch {
    // Notification failure must not block a completed Supabase push.
  }
}

export async function pushShopQueue(shopId, options = {}) {
  if (!isCloudEnabled()) {
    return { ok: false, skipped: true, message: 'Cloud sync is disabled' }
  }

  resetStuckCloudQueueItems(shopId)
  const changes = getPendingCloudQueueItems(shopId, options.limit ?? 50)
  if (changes.length === 0) {
    return { ok: true, applied: [], failed: [], message: 'No pending sync items' }
  }

  markCloudQueueItemsSyncing(shopId, changes.map((item) => item.id))

  const applied = []
  const failed = []
  const syncedAt = nowIso()

  try {
    const groups = groupByTable(changes)
    for (const [tableName, items] of Object.entries(groups)) {
      const upserts = items.filter((item) => item.action === 'upsert')
      const deletes = items.filter((item) => item.action === 'delete')

      if (upserts.length) {
        const rows = upserts.map((item) => toSupabaseRow(item, shopId)).filter((row) => row.id)
        // eslint-disable-next-line no-await-in-loop
        await supabaseUpsertRows(tableName, rows, { onConflict: 'id' })
        applied.push(...upserts.map((item) => item.id))
      }

      if (deletes.length) {
        const rows = deletes.map((item) => toDeleteRow(item, shopId)).filter((row) => row.id)
        // eslint-disable-next-line no-await-in-loop
        await supabaseSoftDeleteRows(tableName, rows)
        applied.push(...deletes.map((item) => item.id))
      }
    }

    markCloudQueueItemsSynced(shopId, applied, syncedAt)
    pruneSyncedCloudQueueItems(shopId)
    saveCloudConfig({ lastSyncAt: syncedAt, lastSyncError: null })
    await notifyBackend(shopId, getCloudDeviceId(), syncedAt)

    return { ok: true, applied, failed, syncedAt }
  } catch (err) {
    const appliedSet = new Set(applied)
    changes
      .filter((item) => !appliedSet.has(item.id))
      .forEach((item) => {
        failed.push({ id: item.id, message: err.message })
        markCloudQueueItemFailed(shopId, item.id, err.message)
      })
    saveCloudConfig({ lastSyncError: err.message })
    throw err
  }
}

export async function pushAllShopQueues(shops, options = {}) {
  const results = []
  for (const shop of shops) {
    // Sequential by design: keeps dependency/order easier to audit and avoids API bursts.
    // eslint-disable-next-line no-await-in-loop
    const result = await pushShopQueue(shop.id, options)
    results.push({ shopId: shop.id, shopName: shop.name, ...result })
  }
  return results
}
