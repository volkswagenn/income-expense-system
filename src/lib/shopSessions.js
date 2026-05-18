const SETTINGS_KEY = 'zuzoo_shop_session_settings_v1'
const SESSIONS_KEY = 'zuzoo_shop_sessions_v1'
const SESSION_ID_KEY = 'zuzoo_active_shop_session_id'

export const SESSION_MODE = {
  EDIT: 'edit',
  READ: 'read',
}

export const DEFAULT_SHOP_SESSION_SETTINGS = {
  maxEditors: 1,
  maxViewers: 3,
  timeoutMinutes: 10,
  overflowMode: 'readonly',
}

function nowIso() {
  return new Date().toISOString()
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.floor(n)))
}

function getTabSessionId() {
  try {
    const existing = sessionStorage.getItem(SESSION_ID_KEY)
    if (existing) return existing
    const id = crypto?.randomUUID?.() ?? `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
    sessionStorage.setItem(SESSION_ID_KEY, id)
    return id
  } catch {
    return `session-${Date.now()}`
  }
}

export function getShopSessionSettings() {
  const stored = readJson(SETTINGS_KEY, {})
  return {
    ...DEFAULT_SHOP_SESSION_SETTINGS,
    ...stored,
    maxEditors: clampNumber(stored.maxEditors, 1, 20, DEFAULT_SHOP_SESSION_SETTINGS.maxEditors),
    maxViewers: clampNumber(stored.maxViewers, 0, 100, DEFAULT_SHOP_SESSION_SETTINGS.maxViewers),
    timeoutMinutes: clampNumber(stored.timeoutMinutes, 1, 240, DEFAULT_SHOP_SESSION_SETTINGS.timeoutMinutes),
    overflowMode: stored.overflowMode === 'block' ? 'block' : 'readonly',
  }
}

export function saveShopSessionSettings(settings) {
  const next = {
    maxEditors: clampNumber(settings.maxEditors, 1, 20, DEFAULT_SHOP_SESSION_SETTINGS.maxEditors),
    maxViewers: clampNumber(settings.maxViewers, 0, 100, DEFAULT_SHOP_SESSION_SETTINGS.maxViewers),
    timeoutMinutes: clampNumber(settings.timeoutMinutes, 1, 240, DEFAULT_SHOP_SESSION_SETTINGS.timeoutMinutes),
    overflowMode: settings.overflowMode === 'block' ? 'block' : 'readonly',
  }
  writeJson(SETTINGS_KEY, next)
  return next
}

export function getShopSessionsRaw() {
  const sessions = readJson(SESSIONS_KEY, [])
  return Array.isArray(sessions) ? sessions : []
}

export function isSessionActive(session, settings = getShopSessionSettings()) {
  if (!session || session.endedAt) return false
  const lastSeen = new Date(session.lastSeenAt || session.startedAt || 0).getTime()
  if (!Number.isFinite(lastSeen)) return false
  return Date.now() - lastSeen <= settings.timeoutMinutes * 60 * 1000
}

export function getActiveShopSessions(shopId = null, settings = getShopSessionSettings()) {
  return getShopSessionsRaw().filter((session) =>
    (!shopId || session.shopId === shopId) && isSessionActive(session, settings)
  )
}

export function pruneExpiredShopSessions(settings = getShopSessionSettings()) {
  const timestamp = nowIso()
  const next = getShopSessionsRaw().map((session) =>
    !session.endedAt && !isSessionActive(session, settings)
      ? { ...session, endedAt: timestamp, endReason: 'inactive_timeout' }
      : session
  )
  writeJson(SESSIONS_KEY, next)
  return next
}

export function getShopSessionSummary(shopId, settings = getShopSessionSettings()) {
  const active = getActiveShopSessions(shopId, settings)
  const editors = active.filter((session) => session.mode === SESSION_MODE.EDIT)
  const viewers = active.filter((session) => session.mode === SESSION_MODE.READ)
  const stale = getShopSessionsRaw().filter((session) => session.shopId === shopId && !session.endedAt && !isSessionActive(session, settings))
  return {
    active,
    editors,
    viewers,
    stale,
    activeCount: active.length,
    editorCount: editors.length,
    viewerCount: viewers.length,
    staleCount: stale.length,
    canEdit: editors.length < settings.maxEditors,
    canRead: viewers.length < settings.maxViewers,
  }
}

export function startShopSession(shopId, shopName, user, settings = getShopSessionSettings()) {
  pruneExpiredShopSessions(settings)
  const sessionId = getTabSessionId()
  const sessions = getShopSessionsRaw()
  const active = sessions.filter((session) =>
    session.id !== sessionId && session.shopId === shopId && isSessionActive(session, settings)
  )
  const editorCount = active.filter((session) => session.mode === SESSION_MODE.EDIT).length
  const viewerCount = active.filter((session) => session.mode === SESSION_MODE.READ).length
  let mode = SESSION_MODE.EDIT

  if (editorCount >= settings.maxEditors) {
    if (settings.overflowMode === 'readonly' && viewerCount < settings.maxViewers) {
      mode = SESSION_MODE.READ
    } else {
      return { ok: false, blocked: true, reason: 'session_limit_reached', active }
    }
  }

  const timestamp = nowIso()
  const session = {
    id: sessionId,
    shopId,
    shopName,
    userId: user?.id ?? 'unknown',
    username: user?.username ?? '',
    displayName: user?.displayName ?? 'Unknown',
    role: user?.role ?? '',
    mode,
    startedAt: timestamp,
    lastSeenAt: timestamp,
    endedAt: null,
    endReason: null,
  }

  const next = [
    ...sessions.filter((item) => item.id !== sessionId),
    session,
  ].slice(-300)
  writeJson(SESSIONS_KEY, next)
  return { ok: true, session, mode }
}

export function heartbeatShopSession(shopId, user) {
  const sessionId = getTabSessionId()
  const timestamp = nowIso()
  const next = getShopSessionsRaw().map((session) =>
    session.id === sessionId && session.shopId === shopId && !session.endedAt
      ? {
          ...session,
          userId: user?.id ?? session.userId,
          username: user?.username ?? session.username,
          displayName: user?.displayName ?? session.displayName,
          role: user?.role ?? session.role,
          lastSeenAt: timestamp,
        }
      : session
  )
  writeJson(SESSIONS_KEY, next)
}

export function endCurrentShopSession(reason = 'left_shop') {
  const sessionId = getTabSessionId()
  const timestamp = nowIso()
  const next = getShopSessionsRaw().map((session) =>
    session.id === sessionId && !session.endedAt
      ? { ...session, endedAt: timestamp, endReason: reason, lastSeenAt: timestamp }
      : session
  )
  writeJson(SESSIONS_KEY, next)
}

export function forceEndShopSession(sessionId, reason = 'force_released') {
  const timestamp = nowIso()
  const next = getShopSessionsRaw().map((session) =>
    session.id === sessionId && !session.endedAt
      ? { ...session, endedAt: timestamp, endReason: reason, lastSeenAt: timestamp }
      : session
  )
  writeJson(SESSIONS_KEY, next)
}
