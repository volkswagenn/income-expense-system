import { v4 as uuid } from 'uuid'
import { buildLogEntry } from './logBuilder'

function readLogKey(shopId) {
  try {
    return JSON.parse(localStorage.getItem(`${shopId}_activity_log`) || 'null')
  } catch {
    return null
  }
}

export function createAuditEntry(entry) {
  return {
    id: uuid(),
    timestamp: new Date().toISOString(),
    status: 'success',
    errorMessage: null,
    deviceInfo: navigator.userAgent,
    sessionId: sessionStorage.getItem('sessionId') ?? 'unknown',
    ...buildLogEntry(entry),
  }
}

export function appendShopAuditLog(shopId, entry) {
  if (!shopId) return null
  const log = createAuditEntry(entry)
  const key = `${shopId}_activity_log`
  const current = readLogKey(shopId) ?? { state: { logs: [] }, version: 0 }
  const logs = Array.isArray(current?.state?.logs) ? current.state.logs : []
  localStorage.setItem(key, JSON.stringify({
    ...current,
    state: {
      ...(current.state ?? {}),
      logs: [log, ...logs],
    },
  }))
  return log
}
