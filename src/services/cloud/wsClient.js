import { getCloudConfig, getApiBaseUrl } from './cloudConfig'
import { getCloudDeviceId } from '../../lib/cloudSyncMetadata'

const RECONNECT_BASE_MS = 2_000
const RECONNECT_MAX_MS = 60_000
const RECONNECT_FACTOR = 2

let socket = null
let reconnectTimer = null
let reconnectDelay = RECONNECT_BASE_MS
let isDestroyed = false
let activeShopId = null
let onChangesHandler = null

function dispatchStatus(status) {
  window.dispatchEvent(new CustomEvent('zuzoo:sync-ws-status', { detail: { status } }))
}

function buildWsUrl(shopId) {
  const baseUrl = getApiBaseUrl()
  const config = getCloudConfig()

  if (!baseUrl || !config.accessToken || !shopId) return null

  const wsBase = baseUrl.replace(/^https/, 'wss').replace(/^http(?!s)/, 'ws')
  const params = new URLSearchParams({
    token: config.accessToken,
    shopId,
    deviceId: getCloudDeviceId(),
  })
  return `${wsBase}/api/sync/ws?${params}`
}

function scheduleReconnect() {
  if (isDestroyed) return
  clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => {
    if (!isDestroyed) connectWs(activeShopId, onChangesHandler)
  }, reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay * RECONNECT_FACTOR, RECONNECT_MAX_MS)
}

export function isWsConnected() {
  return socket !== null && socket.readyState === WebSocket.OPEN
}

export function connectWs(shopId, onChanges) {
  if (socket) {
    socket.onclose = null
    socket.onerror = null
    socket.close()
    socket = null
  }

  isDestroyed = false
  activeShopId = shopId
  onChangesHandler = onChanges

  const url = buildWsUrl(shopId)
  if (!url) return

  try {
    socket = new WebSocket(url)
  } catch {
    scheduleReconnect()
    return
  }

  socket.onopen = () => {
    reconnectDelay = RECONNECT_BASE_MS
    dispatchStatus('open')
  }

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      if (msg.type === 'changes' && typeof onChangesHandler === 'function') {
        onChangesHandler(msg.syncedAt)
      }
    } catch {
      // Ignore malformed websocket messages.
    }
  }

  socket.onclose = (event) => {
    socket = null
    dispatchStatus('closed')
    if (!isDestroyed && event.code !== 4001 && event.code !== 4002) {
      scheduleReconnect()
    }
  }

  socket.onerror = () => {
    // The close handler owns reconnect scheduling.
  }
}

export function disconnectWs() {
  isDestroyed = true
  activeShopId = null
  clearTimeout(reconnectTimer)
  reconnectTimer = null
  if (socket) {
    socket.onclose = null
    socket.onerror = null
    socket.close()
    socket = null
  }
}
