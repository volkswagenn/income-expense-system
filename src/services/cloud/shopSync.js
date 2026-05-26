import { getSupabaseClient, supabaseUpsertRows } from './apiClient'
import { getSupabaseAnonKey, getSupabaseUrl, isCloudEnabled } from './cloudConfig'
import useShopStore from '../../store/useShopStore'
import { pullAndApplyShop } from './pullApply'
import { pushShopQueue } from './syncApi'

function hasCloudConfig() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey())
}

function isNewer(incoming, local) {
  const inTime = incoming?.updatedAt || incoming?.lastUsedAt || incoming?.createdAt
  const loTime = local?.updatedAt || local?.lastUsedAt || local?.createdAt
  if (!loTime) return true
  if (!inTime) return false
  return new Date(inTime).getTime() > new Date(loTime).getTime()
}

function mergeShops(local, cloud) {
  const map = new Map(local.map((s) => [s.id, s]))
  for (const cloudShop of cloud) {
    const localShop = map.get(cloudShop.id)
    if (!localShop || isNewer(cloudShop, localShop)) {
      map.set(cloudShop.id, cloudShop)
    }
  }
  return Array.from(map.values()).filter((s) => !s.deletedAt)
}

// ── Fetch shops (หลัง login ทันที) ───────────────────────────────────────

export async function fetchShopsFromCloud() {
  if (!hasCloudConfig()) return { ok: false, reason: 'no-config' }

  const url = getSupabaseUrl()
  const key = getSupabaseAnonKey()
  const headers = { apikey: key, Authorization: `Bearer ${key}` }

  try {
    const res = await fetch(
      `${url}/rest/v1/shops?select=*&deleted_at=is.null&order=updated_at.asc`,
      { headers }
    )
    if (!res.ok) return { ok: false, reason: 'fetch-failed' }

    const rows = await res.json()
    const cloudShops = rows.map((r) => r.payload).filter(Boolean)

    if (cloudShops.length > 0) {
      const current = useShopStore.getState().shops
      const merged = mergeShops(current, cloudShops)
      useShopStore.setState({ shops: merged })
    }

    return { ok: true, shops: cloudShops.length }
  } catch (err) {
    console.warn('[shopSync] fetchShops failed:', err.message)
    return { ok: false, reason: 'error', error: err.message }
  }
}

// ── Push shop ──────────────────────────────────────────────────────────────

export async function pushShopToCloud(shop) {
  if (!isCloudEnabled()) return
  const now = new Date().toISOString()
  try {
    await supabaseUpsertRows('shops', [{
      id: shop.id,
      name: shop.name ?? shop.id,   // Bug fix: shops table มี name NOT NULL
      payload: { ...shop, updatedAt: now },
      updated_at: now,
      deleted_at: null,
    }])
  } catch (err) {
    console.warn('[shopSync] pushShop failed:', err.message)
  }
}

export async function deleteShopFromCloud(shopId) {
  if (!isCloudEnabled()) return
  const now = new Date().toISOString()
  try {
    const supabase = getSupabaseClient()
    await supabase.from('shops').update({ deleted_at: now, updated_at: now }).eq('id', shopId)
  } catch (err) {
    console.warn('[shopSync] deleteShop failed:', err.message)
  }
}

// ── Push all shops (สำหรับ initial admin sync) ───────────────────────────

export async function pushAllShopsToCloud() {
  if (!isCloudEnabled()) return { ok: false }
  const shops = useShopStore.getState().shops
  const now = new Date().toISOString()
  const rows = shops.map((s) => ({
    id: s.id,
    name: s.name ?? s.id,   // Bug fix: shops table มี name NOT NULL
    payload: { ...s, updatedAt: now },
    updated_at: now,
    deleted_at: null,
  }))
  try {
    await supabaseUpsertRows('shops', rows)
    return { ok: true, count: rows.length }
  } catch (err) {
    console.warn('[shopSync] pushAllShops failed:', err.message)
    return { ok: false, error: err.message }
  }
}

// ── Fetch shop data (เมื่อเข้าร้าน — pull transactions/wallets/categories) ──

export async function fetchShopDataFromCloud(shopId) {
  if (!isCloudEnabled()) return { ok: false, reason: 'cloud-disabled' }
  try {
    return await pullAndApplyShop(shopId, { full: true })
  } catch (err) {
    console.warn('[shopSync] fetchShopData failed:', err.message)
    return { ok: false, reason: 'error', error: err.message }
  }
}

// ── Auto-sync: push pending queue + pull new data ─────────────────────────

export async function autoSyncShop(shopId) {
  if (!isCloudEnabled()) return { ok: false, reason: 'cloud-disabled' }
  try {
    const [pushResult, pullResult] = await Promise.all([
      pushShopQueue(shopId),
      pullAndApplyShop(shopId),
    ])
    return { ok: true, push: pushResult, pull: pullResult }
  } catch (err) {
    console.warn('[shopSync] autoSync failed:', err.message)
    return { ok: false, reason: 'error', error: err.message }
  }
}
