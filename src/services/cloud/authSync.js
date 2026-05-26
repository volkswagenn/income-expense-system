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
  // เริ่มจาก local ก่อน แล้ว cloud จะ override ถ้าใหม่กว่า
  const map = new Map(local.map((item) => [item.id, item]))
  for (const cloudItem of cloud) {
    const localItem = map.get(cloudItem.id)
    if (!localItem || isNewer(cloudItem, localItem)) {
      map.set(cloudItem.id, cloudItem)
    }
  }
  // ลบ user ที่ cloud ส่ง deletedAt มา (ถูกลบบนเครื่องอื่น)
  // และลบ user ที่ไม่มีอยู่ใน cloud เลย (แปลว่าถูกลบก่อนช่วงเวลาที่ query ครอบคลุม)
  const cloudIds = new Set(cloud.map((item) => item.id))
  return Array.from(map.values()).filter((item) => {
    if (item.deletedAt) return false          // มี deletedAt → ถูกลบแล้ว
    if (cloudIds.size > 0 && !cloudIds.has(item.id)) return false  // ไม่มีใน cloud เลย → ถูกลบ
    return true
  })
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
    // Bug fix: ดึงทั้ง active และ deleted users เพื่อให้ mergeById รู้ว่ามีการลบเกิดขึ้น
    // ไม่กรอง deleted_at=is.null อีกต่อไป
    const [usersRes, rolesRes] = await Promise.all([
      fetch(`${url}/rest/v1/app_users?select=*&order=updated_at.asc`, { headers }),
      fetch(`${url}/rest/v1/app_roles?select=*&order=updated_at.asc`, { headers }),
    ])

    if (!usersRes.ok || !rolesRes.ok) {
      return { ok: false, reason: 'fetch-failed' }
    }

    const [userRows, roleRows] = await Promise.all([usersRes.json(), rolesRes.json()])

    // Bug fix: map deleted_at จาก row เข้าไปใน payload
    // เพราะ deleteUserFromCloud อัปเดตแค่ column deleted_at ของ row ไม่ได้อัปเดต payload JSON
    const cloudUsers = userRows
      .map((r) => r.payload ? { ...r.payload, deletedAt: r.deleted_at ?? r.payload.deletedAt ?? null } : null)
      .filter(Boolean)
    const cloudRoles = roleRows
      .map((r) => r.payload ? { ...r.payload, deletedAt: r.deleted_at ?? r.payload.deletedAt ?? null } : null)
      .filter(Boolean)

    // merge เสมอ ไม่ต้องรอว่า cloud จะมีข้อมูลหรือเปล่า
    // เพราะถ้า cloud มีแค่ deleted records → local ต้องลบออกด้วย
    const current = useAuthStore.getState().users
    const merged = mergeById(current, cloudUsers)
    useAuthStore.setState({ users: merged })

    const currentRoles = useRoleStore.getState().roles
    const systemRoles = currentRoles.filter((r) => r.isSystem)
    const customLocal = currentRoles.filter((r) => !r.isSystem)
    const customCloud = cloudRoles.filter((r) => !r.isSystem)
    const mergedCustom = mergeById(customLocal, customCloud)
    useRoleStore.setState({ roles: [...systemRoles, ...mergedCustom] })

    const activeUsers = cloudUsers.filter((u) => !u.deletedAt)
    const activeRoles = cloudRoles.filter((r) => !r.deletedAt)
    return { ok: true, users: activeUsers.length, roles: activeRoles.length }
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
    // Bug fix: อัปเดต payload.deletedAt ด้วย ไม่ใช่แค่ column deleted_at
    // เพราะ fetchAuthBootstrap ดึง payload มา ถ้า payload ไม่มี deletedAt → Machine อื่นจะไม่รู้ว่าถูกลบ
    const { data: existing } = await supabase
      .from('app_users')
      .select('payload')
      .eq('id', userId)
      .single()
    const updatedPayload = existing?.payload
      ? { ...existing.payload, deletedAt: now, updatedAt: now }
      : { deletedAt: now, updatedAt: now }
    await supabase
      .from('app_users')
      .update({ deleted_at: now, updated_at: now, payload: updatedPayload })
      .eq('id', userId)
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
    const { data: existing } = await supabase
      .from('app_roles')
      .select('payload')
      .eq('id', roleId)
      .single()
    const updatedPayload = existing?.payload
      ? { ...existing.payload, deletedAt: now, updatedAt: now }
      : { deletedAt: now, updatedAt: now }
    await supabase
      .from('app_roles')
      .update({ deleted_at: now, updated_at: now, payload: updatedPayload })
      .eq('id', roleId)
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
