import { getSupabaseClient, supabaseUpsertRows } from './apiClient'
import { getSupabaseAnonKey, getSupabaseUrl, isCloudEnabled } from './cloudConfig'
import useAuthStore from '../../store/useAuthStore'
import useRoleStore from '../../store/useRoleStore'

function hasCloudConfig() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey())
}

function isNewer(incoming, local) {
  if (!local?.updatedAt) return true
  if (!incoming?.updatedAt) return false
  return new Date(incoming.updatedAt).getTime() > new Date(local.updatedAt).getTime()
}

function mergeById(local, cloud) {
  const map = new Map(local.map((item) => [item.id, item]))
  for (const cloudItem of cloud) {
    const localItem = map.get(cloudItem.id)
    if (!localItem || isNewer(cloudItem, localItem)) {
      map.set(cloudItem.id, cloudItem)
    }
  }
  return Array.from(map.values()).filter((item) => !item.deletedAt)
}

function sanitizeUser(user) {
  // eslint-disable-next-line no-unused-vars
  const { passwordPlain, pinPlain, ...safe } = user
  return safe
}

// ── Bootstrap (ก่อน login — ใช้ anon key ไม่ต้องการ session) ──────────────

export async function fetchAuthBootstrap() {
  if (!hasCloudConfig()) return { ok: false, reason: 'no-config' }

  const url = getSupabaseUrl()
  const key = getSupabaseAnonKey()
  const headers = { apikey: key, Authorization: `Bearer ${key}` }

  try {
    const [usersRes, rolesRes] = await Promise.all([
      fetch(`${url}/rest/v1/app_users?select=*&deleted_at=is.null&order=updated_at.asc`, { headers }),
      fetch(`${url}/rest/v1/app_roles?select=*&deleted_at=is.null&order=updated_at.asc`, { headers }),
    ])

    if (!usersRes.ok || !rolesRes.ok) {
      return { ok: false, reason: 'fetch-failed' }
    }

    const [userRows, roleRows] = await Promise.all([usersRes.json(), rolesRes.json()])

    const cloudUsers = userRows.map((r) => r.payload).filter(Boolean)
    const cloudRoles = roleRows.map((r) => r.payload).filter(Boolean)

    if (cloudUsers.length > 0) {
      const current = useAuthStore.getState().users
      const merged = mergeById(current, cloudUsers)
      useAuthStore.setState({ users: merged })
    }

    if (cloudRoles.length > 0) {
      const current = useRoleStore.getState().roles
      const systemRoles = current.filter((r) => r.isSystem)
      const customLocal = current.filter((r) => !r.isSystem)
      const customCloud = cloudRoles.filter((r) => !r.isSystem)
      const mergedCustom = mergeById(customLocal, customCloud)
      useRoleStore.setState({ roles: [...systemRoles, ...mergedCustom] })
    }

    return { ok: true, users: cloudUsers.length, roles: cloudRoles.length }
  } catch (err) {
    console.warn('[authSync] bootstrap failed:', err.message)
    return { ok: false, reason: 'error', error: err.message }
  }
}

// ── Push / Delete (หลัง login — ต้องการ isCloudEnabled) ──────────────────

export async function pushUserToCloud(user) {
  if (!isCloudEnabled()) return
  const now = new Date().toISOString()
  const safe = sanitizeUser(user)
  try {
    await supabaseUpsertRows('app_users', [{
      id: user.id,
      payload: { ...safe, updatedAt: now },
      updated_at: now,
      deleted_at: null,
    }])
  } catch (err) {
    console.warn('[authSync] pushUser failed:', err.message)
  }
}

export async function deleteUserFromCloud(userId) {
  if (!isCloudEnabled()) return
  const now = new Date().toISOString()
  try {
    const supabase = getSupabaseClient()
    await supabase.from('app_users').update({ deleted_at: now, updated_at: now }).eq('id', userId)
  } catch (err) {
    console.warn('[authSync] deleteUser failed:', err.message)
  }
}

export async function pushRoleToCloud(role) {
  if (!isCloudEnabled() || role.isSystem) return
  const now = new Date().toISOString()
  try {
    await supabaseUpsertRows('app_roles', [{
      id: role.id,
      payload: { ...role, updatedAt: now },
      updated_at: now,
      deleted_at: null,
    }])
  } catch (err) {
    console.warn('[authSync] pushRole failed:', err.message)
  }
}

export async function deleteRoleFromCloud(roleId) {
  if (!isCloudEnabled()) return
  const now = new Date().toISOString()
  try {
    const supabase = getSupabaseClient()
    await supabase.from('app_roles').update({ deleted_at: now, updated_at: now }).eq('id', roleId)
  } catch (err) {
    console.warn('[authSync] deleteRole failed:', err.message)
  }
}

// ── Push all (สำหรับ initial admin sync) ─────────────────────────────────

export async function pushAllUsersToCloud() {
  if (!isCloudEnabled()) return { ok: false }
  const users = useAuthStore.getState().users
  const now = new Date().toISOString()
  const rows = users.map((u) => ({
    id: u.id,
    payload: { ...sanitizeUser(u), updatedAt: now },
    updated_at: now,
    deleted_at: null,
  }))
  try {
    await supabaseUpsertRows('app_users', rows)
    return { ok: true, count: rows.length }
  } catch (err) {
    console.warn('[authSync] pushAllUsers failed:', err.message)
    return { ok: false, error: err.message }
  }
}

export async function pushAllRolesToCloud() {
  if (!isCloudEnabled()) return { ok: false }
  const roles = useRoleStore.getState().roles.filter((r) => !r.isSystem)
  if (roles.length === 0) return { ok: true, count: 0 }
  const now = new Date().toISOString()
  const rows = roles.map((r) => ({
    id: r.id,
    payload: { ...r, updatedAt: now },
    updated_at: now,
    deleted_at: null,
  }))
  try {
    await supabaseUpsertRows('app_roles', rows)
    return { ok: true, count: rows.length }
  } catch (err) {
    console.warn('[authSync] pushAllRoles failed:', err.message)
    return { ok: false, error: err.message }
  }
}
