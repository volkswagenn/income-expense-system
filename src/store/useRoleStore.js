import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuid } from 'uuid'
import { DEFAULT_ROLES } from '../lib/permissions'

const useRoleStore = create(
  persist(
    (set, get) => ({
      roles: [],

      // Called on app init — seeds defaults and removes obsolete system roles
      initRoles: () => {
        const existing = get().roles
        if (existing.length === 0) {
          set({ roles: DEFAULT_ROLES })
          return
        }
        // Add any new system roles that don't exist yet (e.g. after upgrade)
        const existingIds = new Set(existing.map((r) => r.id))
        const missing = DEFAULT_ROLES.filter((r) => !existingIds.has(r.id))
        if (missing.length > 0) {
          set((s) => ({ roles: [...missing, ...s.roles] }))
        }
        // Sync permissions for current system roles and drop old system roles.
        const defaultMap = Object.fromEntries(DEFAULT_ROLES.map((r) => [r.id, r]))
        set((s) => ({
          roles: s.roles
            .filter((r) => !r.isSystem || defaultMap[r.id])
            .map((r) =>
              r.isSystem && defaultMap[r.id]
                ? { ...defaultMap[r.id], ...r, permissions: defaultMap[r.id].permissions, locked: defaultMap[r.id].locked }
                : r
            ),
        }))
      },

      createRole: ({ label, icon, badgeClass, permissions, desc, shopId }) => {
        const role = {
          id: `custom_${uuid().slice(0, 8)}`,
          label: label.trim(),
          icon: icon || '👤',
          badgeClass: badgeClass || 'bg-gray-100 text-gray-700',
          permissions: permissions ?? [],
          desc: (desc || '').trim(),
          isSystem: false,
          locked: false,
          ...(shopId ? { shopId } : {}),
        }
        set((s) => ({ roles: [...s.roles, role] }))
        return role
      },

      updateRole: (id, { label, icon, badgeClass, permissions, desc }) => {
        set((s) => ({
          roles: s.roles.map((r) => {
            if (r.id !== id || r.locked) return r
            return {
              ...r,
              ...(label !== undefined ? { label: label.trim() } : {}),
              ...(icon !== undefined ? { icon } : {}),
              ...(badgeClass !== undefined ? { badgeClass } : {}),
              ...(permissions !== undefined ? { permissions } : {}),
              ...(desc !== undefined ? { desc: desc.trim() } : {}),
            }
          }),
        }))
        return { success: true }
      },

      deleteRole: (id) => {
        const role = get().roles.find((r) => r.id === id)
        if (!role) return { success: false, error: 'ไม่พบ Role' }
        if (role.isSystem) return { success: false, error: 'ไม่สามารถลบ Role ระบบได้' }
        set((s) => ({ roles: s.roles.filter((r) => r.id !== id) }))
        return { success: true }
      },

      getRole: (id) => get().roles.find((r) => r.id === id) ?? null,
    }),
    {
      name: 'zuzoo_roles_v1',
    }
  )
)

export default useRoleStore
