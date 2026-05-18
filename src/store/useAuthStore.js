import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuid } from 'uuid'
import { migrateRole } from '../lib/permissions'

const SALT = 'zuzoo_auth_v2'
const BUILTIN_ADMIN_ID = 'admin'
const BUILTIN_ADMIN_DISPLAY = 'ผู้ดูแลระบบสูงสุด'
const DEFAULT_MAX_LOGIN_ATTEMPTS = 5
const BLOCKED_LOGIN_MESSAGE = 'บัญชีผู้ใช้ถูกบล็อกเนื่องจากใส่รหัสผ่านผิดเกินจำนวนที่กำหนด'
const PIN_LOCKED_MESSAGE = 'PIN ถูกล็อค กรุณาเข้าสู่ระบบด้วยชื่อผู้ใช้/รหัสผ่านเพื่อปลดล็อค'

export async function hashStr(str) {
  const encoder = new TextEncoder()
  const data = encoder.encode(SALT + str)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function makeSession(user) {
  const normalized = normalizeUser(user)
  return {
    id: normalized.id,
    username: normalized.username,
    displayName: normalized.displayName,
    role: normalized.role,
    shopAccess: normalized.shopAccess ?? null,
  }
}

function normalizeUser(user) {
  if (!user) return user
  if (user.id === BUILTIN_ADMIN_ID || user.username === BUILTIN_ADMIN_ID) {
    return {
      ...user,
      id: BUILTIN_ADMIN_ID,
      username: BUILTIN_ADMIN_ID,
      displayName: BUILTIN_ADMIN_DISPLAY,
      role: 'superadmin',
      shopAccess: null,
      isBlocked: false,
      blockedAt: null,
      blockedBy: null,
      blockedReason: null,
      failedPasswordCount: 0,
      lastFailedLoginAt: null,
      passwordPlain: 'admin',
      pinPlain: '000000',
    }
  }
  return {
    ...user,
    role: migrateRole(user.role),
    shopAccess: user.shopAccess !== undefined ? user.shopAccess : null,
    isBlocked: Boolean(user.isBlocked),
    blockedAt: user.blockedAt ?? null,
    blockedBy: user.blockedBy ?? null,
    blockedReason: user.blockedReason ?? null,
    // migrate legacy failedLoginCount → failedPasswordCount
    failedPasswordCount: Number(user.failedPasswordCount ?? user.failedLoginCount ?? 0),
    lastFailedLoginAt: user.lastFailedLoginAt ?? null,
    passwordPlain: user.passwordPlain ?? null,
    pinPlain: user.pinPlain ?? null,
  }
}

const useAuthStore = create(
  persist(
    (set, get) => ({
      users: [],
      currentUser: null,
      isAuthenticated: false,
      maxLoginAttempts: DEFAULT_MAX_LOGIN_ATTEMPTS,
      maxPinLoginAttempts: DEFAULT_MAX_LOGIN_ATTEMPTS,
      // ── Global PIN lock (not per-user) ───────────────────────
      pinFailCount: 0,
      pinLocked: false,

      // ── Init ────────────────────────────────────────────────

      initUsers: async () => {
        const { users } = get()

        if (users.length === 0) {
          const [pwHash, pinHash] = await Promise.all([hashStr('admin'), hashStr('000000')])
          set({
            users: [{
              id: 'admin',
              username: 'admin',
              displayName: BUILTIN_ADMIN_DISPLAY,
              passwordHash: pwHash,
              pinHash,
              passwordPlain: 'admin',
              pinPlain: '000000',
              role: 'superadmin',
              shopAccess: null,
              isBlocked: false,
              blockedAt: null,
              blockedBy: null,
              blockedReason: null,
              failedPasswordCount: 0,
              lastFailedLoginAt: null,
              createdAt: new Date().toISOString(),
            }],
          })
          return
        }

        const normalizedUsers = users.map(normalizeUser)
        const needsMigration = normalizedUsers.some((u, index) =>
          JSON.stringify(u) !== JSON.stringify(users[index])
        )
        if (needsMigration) {
          set((s) => ({
            users: s.users.map(normalizeUser),
            currentUser: s.currentUser ? makeSession(s.currentUser) : s.currentUser,
          }))
        }
      },

      // ── Login ────────────────────────────────────────────────

      loginByPassword: async (username, password) => {
        const { users, maxLoginAttempts } = get()
        const user = users.find(
          (u) => u.username.toLowerCase() === username.trim().toLowerCase()
        )
        if (!user) return { success: false, error: 'ไม่พบชื่อผู้ใช้นี้ในระบบ' }
        if (user.isBlocked) return { success: false, blocked: true, error: BLOCKED_LOGIN_MESSAGE }
        const hash = await hashStr(password)
        if (hash !== user.passwordHash) return get().recordLoginFailure(user.id, maxLoginAttempts)
        const sessionUser = normalizeUser(user)
        if (sessionUser !== user) {
          set((s) => ({ users: s.users.map((u) => (u.id === user.id ? sessionUser : u)) }))
        }
        get().resetLoginFailures(user.id)
        // any successful password login resets global PIN lock
        set({ pinFailCount: 0, pinLocked: false })
        set({ currentUser: makeSession(sessionUser), isAuthenticated: true })
        return { success: true }
      },

      loginByPin: async (userId, pin) => {
        const user = get().users.find((u) => u.id === userId)
        if (!user) return { success: false, error: 'ไม่พบผู้ใช้' }
        if (user.isBlocked) return { success: false, blocked: true, error: BLOCKED_LOGIN_MESSAGE }
        if (!user.pinHash) return { success: false, error: 'ผู้ใช้นี้ยังไม่ได้ตั้งรหัส PIN' }
        const hash = await hashStr(pin)
        if (hash !== user.pinHash) return { success: false, error: 'รหัส PIN ไม่ถูกต้อง' }
        const sessionUser = normalizeUser(user)
        if (sessionUser !== user) {
          set((s) => ({ users: s.users.map((u) => (u.id === user.id ? sessionUser : u)) }))
        }
        get().resetLoginFailures(user.id)
        set({ currentUser: makeSession(sessionUser), isAuthenticated: true })
        return { success: true }
      },

      loginByPinUsername: async (username, pin) => {
        const user = get().users.find(
          (u) => u.username.toLowerCase() === username.trim().toLowerCase()
        )
        if (!user) return { success: false, error: 'ไม่พบชื่อผู้ใช้นี้ในระบบ' }
        return get().loginByPin(user.id, pin)
      },

      // ── Anonymous PIN login with global lock ─────────────────

      loginByPinOnly: async (pin) => {
        const { pinLocked, pinFailCount, maxPinLoginAttempts } = get()

        if (pinLocked) return { success: false, pinLocked: true, error: PIN_LOCKED_MESSAGE }

        const hash = await hashStr(pin)
        const user = get().users.find((u) => u.pinHash === hash)

        if (!user) {
          const nextCount = pinFailCount + 1
          const shouldLock = nextCount >= maxPinLoginAttempts
          set({ pinFailCount: shouldLock ? 0 : nextCount, pinLocked: shouldLock })
          if (shouldLock) return { success: false, pinLocked: true, error: PIN_LOCKED_MESSAGE }
          const remain = Math.max(0, maxPinLoginAttempts - nextCount)
          return { success: false, error: `รหัส PIN ไม่ถูกต้อง (เหลือ ${remain} ครั้งก่อนถูกล็อค)` }
        }

        if (user.isBlocked) return { success: false, blocked: true, error: BLOCKED_LOGIN_MESSAGE }

        // correct PIN — reset global counter and login
        set({ pinFailCount: 0, pinLocked: false })
        get().resetLoginFailures(user.id)
        const sessionUser = normalizeUser(user)
        if (sessionUser !== user) {
          set((s) => ({ users: s.users.map((u) => (u.id === user.id ? sessionUser : u)) }))
        }
        set({ currentUser: makeSession(sessionUser), isAuthenticated: true })
        return { success: true }
      },

      // ── Failure tracking (password only) ─────────────────────

      recordLoginFailure: (userId, maxAttemptsArg) => {
        const maxAttempts = Math.max(1, Number(maxAttemptsArg ?? get().maxLoginAttempts ?? DEFAULT_MAX_LOGIN_ATTEMPTS))
        const user = get().users.find((u) => u.id === userId)
        if (!user) return { success: false, error: 'ไม่พบผู้ใช้' }

        const isAdmin = user.id === BUILTIN_ADMIN_ID
        const nextCount = Number(user.failedPasswordCount ?? 0) + 1
        const shouldBlock = !isAdmin && nextCount >= maxAttempts
        const now = new Date().toISOString()
        const reason = `ใส่รหัสผ่านผิดเกินจำนวนที่กำหนด (${maxAttempts} ครั้ง)`

        set((s) => ({
          users: s.users.map((u) =>
            u.id === userId
              ? {
                  ...u,
                  failedPasswordCount: shouldBlock ? 0 : nextCount,
                  lastFailedLoginAt: now,
                  isBlocked: shouldBlock ? true : u.isBlocked,
                  blockedAt: shouldBlock ? now : u.blockedAt,
                  blockedBy: shouldBlock ? 'system' : u.blockedBy,
                  blockedReason: shouldBlock ? reason : u.blockedReason,
                }
              : u
          ),
        }))

        if (shouldBlock) return { success: false, blocked: true, error: BLOCKED_LOGIN_MESSAGE }
        const remain = Math.max(0, maxAttempts - nextCount)
        return { success: false, error: `รหัสผ่านไม่ถูกต้อง (เหลือ ${remain} ครั้งก่อนถูกบล็อก)` }
      },

      resetLoginFailures: (userId) => {
        set((s) => ({
          users: s.users.map((u) =>
            u.id === userId
              ? { ...u, failedPasswordCount: 0, lastFailedLoginAt: null }
              : u
          ),
        }))
      },

      setMaxLoginAttempts: (value) => {
        const next = Math.max(1, Math.min(99, Number(value) || DEFAULT_MAX_LOGIN_ATTEMPTS))
        set({ maxLoginAttempts: next })
      },

      setMaxPinLoginAttempts: (value) => {
        const next = Math.max(1, Math.min(99, Number(value) || DEFAULT_MAX_LOGIN_ATTEMPTS))
        set({ maxPinLoginAttempts: next })
      },

      logout: () => set({ currentUser: null, isAuthenticated: false }),

      // ── User CRUD ────────────────────────────────────────────

      createUser: async ({ username, displayName, password, pin, role = 'admin', shopAccess = null }) => {
        const { users } = get()
        if (users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase())) {
          return { success: false, error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' }
        }
        const [pwHash, pinHash] = await Promise.all([
          hashStr(password),
          pin ? hashStr(pin) : Promise.resolve(null),
        ])
        const newUser = {
          id: uuid(),
          username: username.trim(),
          displayName: (displayName || username).trim(),
          passwordHash: pwHash,
          pinHash,
          passwordPlain: password,
          pinPlain: pin || null,
          role: migrateRole(role),
          shopAccess: migrateRole(role) === 'superadmin' ? null : shopAccess,
          isBlocked: false,
          blockedAt: null,
          blockedBy: null,
          blockedReason: null,
          failedPasswordCount: 0,
          lastFailedLoginAt: null,
          createdAt: new Date().toISOString(),
        }
        set((s) => ({ users: [...s.users, newUser] }))
        return { success: true, user: newUser }
      },

      updateUser: async (id, { displayName, role, password, pin, clearPin, shopAccess }) => {
        const updates = {}
        if (displayName !== undefined) updates.displayName = displayName.trim()
        if (role !== undefined) updates.role = migrateRole(role)
        if (shopAccess !== undefined) updates.shopAccess = shopAccess
        if (password) {
          updates.passwordHash = await hashStr(password)
          updates.passwordPlain = password
        }
        if (pin) {
          updates.pinHash = await hashStr(pin)
          updates.pinPlain = pin
        }
        if (clearPin) {
          updates.pinHash = null
          updates.pinPlain = null
        }
        if (id === BUILTIN_ADMIN_ID) {
          updates.role = 'superadmin'
          updates.shopAccess = null
        }

        set((s) => ({
          users: s.users.map((u) => (u.id === id ? { ...u, ...updates } : u)),
          currentUser:
            s.currentUser?.id === id
              ? { ...s.currentUser, ...makeSession({ ...s.users.find(u => u.id === id), ...updates }) }
              : s.currentUser,
        }))
        return { success: true }
      },

      deleteUser: (id) => {
        const { users, currentUser } = get()
        if (id === BUILTIN_ADMIN_ID) return { success: false, error: 'ไม่สามารถลบบัญชี admin หลักได้' }
        if (id === currentUser?.id) return { success: false, error: 'ไม่สามารถลบบัญชีของตัวเองได้' }
        const superadmins = users.filter((u) => u.role === 'superadmin')
        const target = users.find((u) => u.id === id)
        if (target?.role === 'superadmin' && superadmins.length <= 1) {
          return { success: false, error: 'ต้องมีผู้ดูแลสูงสุดอย่างน้อย 1 คน' }
        }
        set((s) => ({ users: s.users.filter((u) => u.id !== id) }))
        return { success: true }
      },

      setUserBlocked: (id, blocked, actorId = null, reason = '') => {
        const { currentUser } = get()
        if (id === BUILTIN_ADMIN_ID) return { success: false, error: 'ไม่สามารถบล็อกบัญชี admin หลักได้' }
        if (id === currentUser?.id) return { success: false, error: 'ไม่สามารถบล็อกบัญชีของตัวเองได้' }
        const target = get().users.find((u) => u.id === id)
        if (!target) return { success: false, error: 'ไม่พบผู้ใช้' }

        set((s) => ({
          users: s.users.map((u) =>
            u.id === id
              ? {
                  ...u,
                  isBlocked: Boolean(blocked),
                  blockedAt: blocked ? new Date().toISOString() : null,
                  blockedBy: blocked ? actorId : null,
                  blockedReason: blocked ? (reason || 'ผู้ดูแลระบบบล็อกด้วยตนเอง') : null,
                  failedPasswordCount: blocked ? u.failedPasswordCount : 0,
                  lastFailedLoginAt: blocked ? u.lastFailedLoginAt : null,
                }
              : u
          ),
        }))
        return { success: true }
      },

      // ── Shop access helpers ──────────────────────────────────

      getUserShopAccess: (userId) => {
        const user = get().users.find((u) => u.id === userId)
        return user?.shopAccess ?? null
      },
    }),
    {
      name: 'zuzoo_auth_v2',
      partialize: (s) => ({
        users: s.users,
        maxLoginAttempts: s.maxLoginAttempts,
        maxPinLoginAttempts: s.maxPinLoginAttempts,
        pinFailCount: s.pinFailCount,
        pinLocked: s.pinLocked,
      }),
    }
  )
)

export default useAuthStore
