const CONFIG_KEY = 'zuzoo_cloud_config_v1'

const DEFAULT_CONFIG = {
  enabled: false,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_API_BASE_URL || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '',
  accessToken: null,
  refreshToken: null,
  lastHealthCheckAt: null,
  lastHealthStatus: null,
  lastSyncAt: null,
  lastSyncError: null,
}

export function getCloudConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    return { ...DEFAULT_CONFIG, ...(raw ? JSON.parse(raw) : {}) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveCloudConfig(changes) {
  const normalized = { ...changes }
  if (Object.prototype.hasOwnProperty.call(normalized, 'apiBaseUrl') && !normalized.supabaseUrl) {
    normalized.supabaseUrl = normalized.apiBaseUrl
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'supabaseUrl')) {
    normalized.supabaseUrl = String(normalized.supabaseUrl || '').trim().replace(/\/+$/, '')
    normalized.apiBaseUrl = normalized.supabaseUrl
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'supabaseAnonKey')) {
    normalized.supabaseAnonKey = String(normalized.supabaseAnonKey || '').trim()
  }
  const next = { ...getCloudConfig(), ...normalized }
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(next))
  } catch {
    // Config save failure must not interrupt offline usage.
  }
  window.dispatchEvent(new CustomEvent('zuzoo:cloud-config-changed', { detail: next }))
  return next
}

export function clearCloudSession() {
  return saveCloudConfig({ accessToken: null, refreshToken: null })
}

export function getApiBaseUrl() {
  return getSupabaseUrl()
}

export function getSupabaseUrl() {
  const config = getCloudConfig()
  return String(config.supabaseUrl || config.apiBaseUrl || '').replace(/\/+$/, '')
}

export function getSupabaseAnonKey() {
  return String(getCloudConfig().supabaseAnonKey || '')
}

export function isCloudEnabled() {
  // Auto-enable เมื่อ env vars ถูกฝังมาจาก Vercel (ไม่ต้องตั้งค่าเอง)
  if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) return true
  // Fallback: ตรวจสอบ manual config จาก Settings
  const config = getCloudConfig()
  return Boolean(config.enabled && (config.supabaseUrl || config.apiBaseUrl) && config.supabaseAnonKey)
}
