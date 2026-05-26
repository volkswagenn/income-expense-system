import { getSupabaseClient } from './apiClient'
import { getCloudDeviceId } from '../../lib/cloudSyncMetadata'
import { isCloudEnabled } from './cloudConfig'

let activeChannel = null
let activeShopId = null
let onChangesHandler = null
let realtimeStatus = 'CLOSED'

function getChannelName(shopId) {
  return `shop-sync:${shopId}`
}

function dispatchStatus(status, shopId = activeShopId) {
  realtimeStatus = status
  window.dispatchEvent(new CustomEvent('zuzoo:realtime-status', { detail: { status, shopId } }))
}

export function connectRealtime(shopId, onChanges) {
  if (!shopId || !isCloudEnabled()) return
  if (activeShopId === shopId && activeChannel) {
    onChangesHandler = onChanges
    return
  }

  disconnectRealtime()

  activeShopId = shopId
  onChangesHandler = onChanges

  try {
    const supabase = getSupabaseClient()
    activeChannel = supabase
      .channel(getChannelName(shopId))
      .on('broadcast', { event: 'sync' }, (message) => {
        const payload = message?.payload ?? {}
        if (payload.fromDeviceId && payload.fromDeviceId === getCloudDeviceId()) return
        if (typeof onChangesHandler === 'function') {
          onChangesHandler(payload.syncedAt ?? null)
        }
      })
      .subscribe((status) => {
        dispatchStatus(status, shopId)
      })
  } catch (err) {
    console.warn('[realtimeClient] connect failed:', err?.message)
    dispatchStatus('CHANNEL_ERROR', shopId)
  }
}

export async function broadcastSync(shopId, syncedAt) {
  if (!isCloudEnabled()) return
  if (!activeChannel || activeShopId !== shopId) return

  try {
    await activeChannel.send({
      type: 'broadcast',
      event: 'sync',
      payload: {
        shopId,
        syncedAt: syncedAt ?? new Date().toISOString(),
        fromDeviceId: getCloudDeviceId(),
      },
    })
  } catch (err) {
    console.warn('[realtimeClient] broadcast failed:', err?.message)
  }
}

export function disconnectRealtime() {
  if (activeChannel) {
    try {
      activeChannel.unsubscribe()
    } catch {
      // ignore
    }
    activeChannel = null
  }
  const closedShopId = activeShopId
  activeShopId = null
  onChangesHandler = null
  dispatchStatus('CLOSED', closedShopId)
}

export function isRealtimeConnected() {
  return activeChannel !== null && realtimeStatus === 'SUBSCRIBED'
}
