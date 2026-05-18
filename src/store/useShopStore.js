import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuid } from 'uuid'
import { assignMissingShopCodes, getNextShopCode } from '../lib/shopIdentity'

export const SHOP_COLORS = [
  { id: 'blue',    bg: 'bg-blue-500',    ring: 'ring-blue-400',    card: 'bg-blue-50 border-blue-200',       text: 'text-blue-700',    dot: 'bg-blue-400' },
  { id: 'emerald', bg: 'bg-emerald-500', ring: 'ring-emerald-400', card: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-400' },
  { id: 'purple',  bg: 'bg-purple-500',  ring: 'ring-purple-400',  card: 'bg-purple-50 border-purple-200',   text: 'text-purple-700',  dot: 'bg-purple-400' },
  { id: 'orange',  bg: 'bg-orange-500',  ring: 'ring-orange-400',  card: 'bg-orange-50 border-orange-200',   text: 'text-orange-700',  dot: 'bg-orange-400' },
  { id: 'rose',    bg: 'bg-rose-500',    ring: 'ring-rose-400',    card: 'bg-rose-50 border-rose-200',       text: 'text-rose-700',    dot: 'bg-rose-400' },
  { id: 'teal',    bg: 'bg-teal-500',    ring: 'ring-teal-400',    card: 'bg-teal-50 border-teal-200',       text: 'text-teal-700',    dot: 'bg-teal-400' },
]

const useShopStore = create(
  persist(
    (set, get) => ({
      shops: [],
      activeShopId: null,

      createShop: (name, colorId = 'blue') => {
        const shop = {
          id: uuid(),
          code: getNextShopCode(get().shops),
          name: name.trim(),
          colorId,
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
        }
        set((s) => ({ shops: [...s.shops, shop] }))
        return shop
      },

      recoverShop: (id, name, colorId = 'blue') => {
        const existing = get().shops.find((shop) => shop.id === id)
        if (existing) return existing
        const shop = {
          id,
          code: getNextShopCode(get().shops),
          name: name.trim(),
          colorId,
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
        }
        set((s) => ({ shops: [...s.shops, shop] }))
        return shop
      },

      deleteShop: (id) =>
        set((s) => ({
          shops: s.shops.filter((sh) => sh.id !== id),
          activeShopId: s.activeShopId === id ? null : s.activeShopId,
        })),

      renameShop: (id, name) =>
        set((s) => ({
          shops: s.shops.map((sh) => (sh.id === id ? { ...sh, name: name.trim() } : sh)),
        })),

      updateShop: (id, changes) =>
        set((s) => ({
          shops: s.shops.map((sh) =>
            sh.id === id
              ? {
                  ...sh,
                  ...changes,
                  ...(changes.name != null ? { name: changes.name.trim() } : {}),
                }
              : sh
          ),
        })),

      setActiveShop: (id) =>
        set((s) => ({
          activeShopId: id,
          shops: s.shops.map((sh) =>
            sh.id === id ? { ...sh, lastUsedAt: new Date().toISOString() } : sh
          ),
        })),

      clearActiveShop: () => set({ activeShopId: null }),

      getActiveShop: () => {
        const { shops, activeShopId } = get()
        return shops.find((s) => s.id === activeShopId) ?? null
      },

      getColor: (colorId) => SHOP_COLORS.find((c) => c.id === colorId) ?? SHOP_COLORS[0],
    }),
    {
      name: 'zuzoo_shop_registry',
      version: 1,
      migrate: (state) => ({
        ...state,
        shops: assignMissingShopCodes(state?.shops ?? []),
      }),
    }
  )
)

export default useShopStore
