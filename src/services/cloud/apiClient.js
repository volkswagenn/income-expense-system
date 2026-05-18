import { createClient } from '@supabase/supabase-js'
import { clearCloudSession, getCloudConfig, getSupabaseAnonKey, getSupabaseUrl, saveCloudConfig } from './cloudConfig'

let cachedClient = null
let cachedKey = ''

export class CloudApiError extends Error {
  constructor(message, status = 0, details = null) {
    super(message)
    this.name = 'CloudApiError'
    this.status = status
    this.details = details
  }
}

function clientKey(config) {
  return [
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    config.accessToken || '',
  ].join('|')
}

function requireSupabaseConfig() {
  const config = getCloudConfig()
  const supabaseUrl = getSupabaseUrl()
  const supabaseAnonKey = getSupabaseAnonKey()

  if (!supabaseUrl) throw new CloudApiError('Missing Supabase URL')
  if (!supabaseAnonKey) throw new CloudApiError('Missing Supabase anon key')

  return { config, supabaseUrl, supabaseAnonKey }
}

export function getSupabaseClient() {
  const { config, supabaseUrl, supabaseAnonKey } = requireSupabaseConfig()
  const nextKey = clientKey(config)
  if (cachedClient && cachedKey === nextKey) return cachedClient

  cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${config.accessToken || supabaseAnonKey}`,
      },
    },
  })
  cachedKey = nextKey
  return cachedClient
}

function throwIfError(error, fallbackMessage) {
  if (!error) return
  throw new CloudApiError(error.message || fallbackMessage, error.status || error.code || 0, error)
}

export async function refreshSupabaseSession() {
  const config = getCloudConfig()
  if (!config.refreshToken) return false

  const supabase = getSupabaseClient()
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: config.refreshToken })
  if (error) {
    clearCloudSession()
    return false
  }

  saveCloudConfig({
    accessToken: data?.session?.access_token ?? null,
    refreshToken: data?.session?.refresh_token ?? config.refreshToken,
  })
  cachedClient = null
  cachedKey = ''
  return Boolean(data?.session?.access_token)
}

export async function supabaseUpsertRows(tableName, rows, options = {}) {
  if (!rows.length) return []
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from(tableName)
    .upsert(rows, { onConflict: options.onConflict || 'id' })
    .select('id')

  throwIfError(error, `Failed to upsert ${tableName}`)
  return data || []
}

export async function supabaseSoftDeleteRows(tableName, deletes) {
  if (!deletes.length) return []
  const supabase = getSupabaseClient()
  const deleted = []

  for (const item of deletes) {
    // Keep deletes sequential so each queue item can be marked precisely.
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from(tableName)
      .update({
        deleted_at: item.deleted_at,
        updated_at: item.updated_at,
        device_id: item.device_id,
      })
      .eq('id', item.id)
      .select('id')

    throwIfError(error, `Failed to delete ${tableName}`)
    if (data?.length) deleted.push(...data)
  }

  return deleted
}

export async function supabaseSelectRows(tableName, filters = {}) {
  const supabase = getSupabaseClient()
  let query = supabase.from(tableName).select('*')

  if (filters.shopId) query = query.eq('shop_id', filters.shopId)
  if (filters.since) query = query.gt('updated_at', filters.since)
  if (filters.excludeDeviceId) query = query.neq('device_id', filters.excludeDeviceId)
  query = query.order('updated_at', { ascending: true })

  const { data, error } = await query
  throwIfError(error, `Failed to select ${tableName}`)
  return data || []
}

export async function checkCloudHealth() {
  const supabaseUrl = getSupabaseUrl()
  const supabaseAnonKey = getSupabaseAnonKey()
  if (!supabaseUrl) throw new CloudApiError('Missing Supabase URL')
  if (!supabaseAnonKey) throw new CloudApiError('Missing Supabase anon key')

  const response = await fetch(`${supabaseUrl}/rest/v1/shops?select=id&limit=1`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText)
    throw new CloudApiError(`Health check failed (${response.status}): ${text}`)
  }
  return { status: 'ok' }
}
