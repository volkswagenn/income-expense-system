import { create } from 'zustand'
import * as categoriesApi from '../lib/api/categories'

// หมวดหมู่รองรับ 2 ชั้น: parentId = null คือหมวดหมู่หลัก, มี parentId คือหมวดหมู่ย่อย
// หมวดหมู่แยกตามประเภท: 'expense' กับ 'income' ไม่ปนกัน
//
// ระบบแถมมาให้แค่ "อื่นๆ" ของแต่ละประเภท ซึ่ง trigger ในฐานข้อมูลสร้างให้ตอนสร้างร้าน
// ของเดิมฮาร์ดโค้ด id ไว้ (cat-8 / cat-income-1) — ใช้ไม่ได้แล้วเพราะ id เป็น uuid
// ที่ Postgres สร้าง ต้องหาด้วยชื่อ+ประเภทแทน (ดู getFallbackCategoryId)

export const INITIAL = { categories: [], vendors: [], quickItems: [] }

/**
 * แปลงรายการหมวดหมู่แบนๆ เป็นโครงสร้างต้นไม้ [{ ...หลัก, children: [ย่อย] }]
 * แยกออกมาเป็นฟังก์ชันบริสุทธิ์เพื่อให้คอมโพเนนต์ห่อด้วย useMemo ได้
 */
export function buildCategoryTree(categories, type) {
  const active = categories.filter((c) => !c.deleted && (!type || c.type === type))
  return active
    .filter((c) => !c.parentId)
    .map((main) => ({ ...main, children: active.filter((c) => c.parentId === main.id) }))
}

/**
 * รายการ id ที่ต้องนับเมื่อกรองด้วยหมวดหมู่นี้
 * - หมวดหมู่หลัก → รวมหมวดหมู่ย่อยทั้งหมดที่อยู่ข้างใน
 * - หมวดหมู่ย่อย → เฉพาะตัวเอง
 */
export function resolveCategoryFilterIds(categories, id) {
  if (!id) return []
  const cat = categories.find((c) => c.id === id)
  if (!cat) return [id]
  if (cat.parentId) return [id]
  return [id, ...categories.filter((c) => c.parentId === id).map((c) => c.id)]
}

const useCategoryStore = create((set, get) => ({
  ...INITIAL,
  _reset: () => set(INITIAL),

  _hydrate: ({ categories, vendors, quickItems }) =>
    set({
      categories: categories ?? [],
      vendors: vendors ?? [],
      quickItems: quickItems ?? [],
    }),

  /** ดึงใหม่ทั้งชุด — ใช้เมื่อ realtime แจ้งว่าเครื่องอื่นแก้หมวดหมู่/ผู้ขาย/รายการด่วน */
  refresh: async () => {
    const [categories, vendors, quickItems] = await Promise.all([
      categoriesApi.listCategories(),
      categoriesApi.listVendors(),
      categoriesApi.listQuickItems(),
    ])
    set({ categories, vendors, quickItems })
  },

  // ── หมวดหมู่ ──────────────────────────────────────────────────────────────

  addCategory: async (name, type, parentId = null) => {
    // อนุญาตแค่ 2 ชั้น — ถ้าพยายามสร้างใต้หมวดหมู่ย่อย ให้ไปอยู่ใต้หมวดหมู่หลักของมันแทน
    const parent = parentId ? get().categories.find((c) => c.id === parentId) : null
    const resolvedParentId = parent ? (parent.parentId ?? parent.id) : null

    const item = await categoriesApi.createCategory({ name, type, parentId: resolvedParentId })
    set((s) => ({ categories: [...s.categories, item] }))
    return item
  },

  updateCategory: async (id, name) => {
    const item = await categoriesApi.renameCategory(id, name)
    set((s) => ({ categories: s.categories.map((c) => (c.id === id ? { ...c, ...item } : c)) }))
    return item
  },

  // ลบหมวดหมู่หลักจะลบหมวดหมู่ย่อยข้างในตามไปด้วย
  softDeleteCategory: async (id) => {
    await categoriesApi.softDeleteCategory(id)
    const deletedAt = new Date().toISOString()
    set((s) => ({
      categories: s.categories.map((c) =>
        c.id === id || c.parentId === id ? { ...c, deleted: true, deletedAt } : c
      ),
    }))
  },

  getCategories: (type) =>
    get().categories.filter((c) => !c.deleted && (!type || c.type === type)),

  getMainCategories: (type) =>
    get().categories.filter((c) => !c.deleted && !c.parentId && (!type || c.type === type)),

  getSubCategories: (parentId) =>
    get().categories.filter((c) => !c.deleted && c.parentId === parentId),

  getCategoryTree: (type) => buildCategoryTree(get().categories, type),

  getCategoryFilterIds: (id) => resolveCategoryFilterIds(get().categories, id),

  /** id ของหมวดหมู่ "อื่นๆ" ที่ใช้เป็นค่า fallback เวลาผู้ใช้ไม่ได้เลือกหมวดหมู่ */
  getFallbackCategoryId: (type = 'expense') =>
    get().categories.find(
      (c) => !c.deleted && c.type === type && !c.parentId && c.name === 'อื่นๆ'
    )?.id ?? null,

  getCategoryName: (id) => {
    const c = get().categories.find((c) => c.id === id)
    if (!c) return '—'
    return c.deleted ? '[ลบแล้ว]' : c.name
  },

  // ชื่อเต็มพร้อมหมวดหมู่หลัก เช่น "ค่าไฟ › สาขา 2"
  getCategoryPath: (id) => {
    const c = get().categories.find((x) => x.id === id)
    if (!c) return '—'
    if (c.deleted) return '[ลบแล้ว]'
    if (!c.parentId) return c.name
    const parent = get().categories.find((x) => x.id === c.parentId)
    return parent ? `${parent.name} › ${c.name}` : c.name
  },

  // ── ผู้ขาย ────────────────────────────────────────────────────────────────

  addVendor: async (name) => {
    const item = await categoriesApi.createVendor(name)
    set((s) => ({ vendors: [...s.vendors, item] }))
    return item
  },

  updateVendor: async (id, name) => {
    const item = await categoriesApi.renameVendor(id, name)
    set((s) => ({ vendors: s.vendors.map((v) => (v.id === id ? { ...v, ...item } : v)) }))
    return item
  },

  softDeleteVendor: async (id) => {
    await categoriesApi.softDeleteVendor(id)
    set((s) => ({
      vendors: s.vendors.map((v) =>
        v.id === id ? { ...v, deleted: true, deletedAt: new Date().toISOString() } : v
      ),
    }))
  },

  getVendors: () => get().vendors.filter((v) => !v.deleted),

  // ── รายการด่วน ────────────────────────────────────────────────────────────

  addQuickItem: async (name, categoryId) => {
    const item = await categoriesApi.createQuickItem({ name, categoryId })
    set((s) => ({ quickItems: [...s.quickItems, item] }))
    return item
  },

  updateQuickItem: async (id, changes) => {
    const item = await categoriesApi.updateQuickItem(id, changes)
    set((s) => ({ quickItems: s.quickItems.map((q) => (q.id === id ? { ...q, ...item } : q)) }))
    return item
  },

  softDeleteQuickItem: async (id) => {
    await categoriesApi.softDeleteQuickItem(id)
    set((s) => ({
      quickItems: s.quickItems.map((q) =>
        q.id === id ? { ...q, deleted: true, deletedAt: new Date().toISOString() } : q
      ),
    }))
  },

  getQuickItems: () => get().quickItems.filter((q) => !q.deleted),
}))

export default useCategoryStore
