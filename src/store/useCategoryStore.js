import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuid } from 'uuid'
import { activeShopId } from '../lib/activeShop'
import { enqueueCloudDelete, enqueueCloudUpsert, touchCloudMetadata, withCloudMetadata } from '../lib/cloudSyncMetadata'

const DEFAULT_CATEGORIES = [
  { id: 'cat-1', name: 'ต้นทุนสินค้า', type: 'expense', deleted: false },
  { id: 'cat-2', name: 'ค่าไฟ', type: 'expense', deleted: false },
  { id: 'cat-3', name: 'ค่าน้ำ', type: 'expense', deleted: false },
  { id: 'cat-4', name: 'ค่าเช่า', type: 'expense', deleted: false },
  { id: 'cat-5', name: 'ค่าแรง', type: 'expense', deleted: false },
  { id: 'cat-6', name: 'ค่าขนส่ง', type: 'expense', deleted: false },
  { id: 'cat-7', name: 'อุปกรณ์สำนักงาน', type: 'expense', deleted: false },
  { id: 'cat-8', name: 'อื่นๆ', type: 'expense', deleted: false },
]

const DEFAULT_VENDORS = [
  { id: 'v-1', name: 'การไฟฟ้า', deleted: false },
  { id: 'v-2', name: 'การประปา', deleted: false },
]

export const INITIAL = {
  categories: DEFAULT_CATEGORIES,
  vendors: DEFAULT_VENDORS,
  quickItems: [],
}

const useCategoryStore = create(
  persist(
    (set, get) => ({
      ...INITIAL,
      _reset: () => set(INITIAL),

      addCategory: (name, type) => {
        const item = withCloudMetadata({ id: uuid(), name, type, deleted: false }, 'categories')
        set((s) => ({ categories: [...s.categories, item] }))
        enqueueCloudUpsert('categories', item)
        return item
      },
      updateCategory: (id, name) =>
        set((s) => ({
          categories: s.categories.map((c) => {
            if (c.id !== id) return c
            const updated = touchCloudMetadata({ ...c, name }, 'categories')
            enqueueCloudUpsert('categories', updated)
            return updated
          }),
        })),
      softDeleteCategory: (id) =>
        set((s) => ({
          categories: s.categories.map((c) => {
            if (c.id !== id) return c
            const updated = touchCloudMetadata({ ...c, deleted: true, deletedAt: new Date().toISOString() }, 'categories')
            enqueueCloudUpsert('categories', updated)
            enqueueCloudDelete('categories', updated)
            return updated
          }),
        })),

      getCategories: (type) =>
        get().categories.filter((c) => !c.deleted && (!type || c.type === type)),

      getCategoryName: (id) => {
        const c = get().categories.find((c) => c.id === id)
        if (!c) return '—'
        return c.deleted ? '[ลบแล้ว]' : c.name
      },

      addVendor: (name) => {
        const item = withCloudMetadata({ id: uuid(), name, deleted: false }, 'vendors')
        set((s) => ({ vendors: [...s.vendors, item] }))
        enqueueCloudUpsert('vendors', item)
        return item
      },
      updateVendor: (id, name) =>
        set((s) => ({
          vendors: s.vendors.map((v) => {
            if (v.id !== id) return v
            const updated = touchCloudMetadata({ ...v, name }, 'vendors')
            enqueueCloudUpsert('vendors', updated)
            return updated
          }),
        })),
      softDeleteVendor: (id) =>
        set((s) => ({
          vendors: s.vendors.map((v) => {
            if (v.id !== id) return v
            const updated = touchCloudMetadata({ ...v, deleted: true, deletedAt: new Date().toISOString() }, 'vendors')
            enqueueCloudUpsert('vendors', updated)
            enqueueCloudDelete('vendors', updated)
            return updated
          }),
        })),
      getVendors: () => get().vendors.filter((v) => !v.deleted),

      addQuickItem: (name, categoryId) => {
        const item = withCloudMetadata({ id: uuid(), name, categoryId, deleted: false }, 'quick_items')
        set((s) => ({ quickItems: [...s.quickItems, item] }))
        enqueueCloudUpsert('quick_items', item)
        return item
      },
      updateQuickItem: (id, changes) =>
        set((s) => ({
          quickItems: s.quickItems.map((q) => {
            if (q.id !== id) return q
            const updated = touchCloudMetadata({ ...q, ...changes }, 'quick_items')
            enqueueCloudUpsert('quick_items', updated)
            return updated
          }),
        })),
      softDeleteQuickItem: (id) =>
        set((s) => ({
          quickItems: s.quickItems.map((q) => {
            if (q.id !== id) return q
            const updated = touchCloudMetadata({ ...q, deleted: true, deletedAt: new Date().toISOString() }, 'quick_items')
            enqueueCloudUpsert('quick_items', updated)
            enqueueCloudDelete('quick_items', updated)
            return updated
          }),
        })),
      getQuickItems: () => get().quickItems.filter((q) => !q.deleted),
    }),
    { name: activeShopId ? `${activeShopId}_categories_data` : 'default_categories_data' }
  )
)

export default useCategoryStore
