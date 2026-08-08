import { supabase, unwrap } from '../supabase'
import { getShopId } from './context'
import { fromRow, fromRows, toRow } from './_map'

// หมวดหมู่ / ผู้ขาย / รายการด่วน — ข้อมูลอ้างอิงที่ทุกหน้าใช้ร่วมกัน
// ทั้งสามตารางใช้ soft delete (deleted = true) เพื่อไม่ให้รายการเก่าเสียชื่อที่เคยเลือกไว้

// ── หมวดหมู่ ────────────────────────────────────────────────────────────────

export async function listCategories() {
  return fromRows('categories', await unwrap(
    supabase.from('categories').select('*').eq('shop_id', getShopId()).order('created_at')
  ))
}

export async function createCategory({ name, type, parentId = null }) {
  const row = toRow('categories', { shopId: getShopId(), name, type, parentId, deleted: false })
  return fromRow('categories', await unwrap(
    supabase.from('categories').insert(row).select().single()
  ))
}

export async function renameCategory(id, name) {
  return fromRow('categories', await unwrap(
    supabase.from('categories').update({ name }).eq('id', id).select().single()
  ))
}

/** ลบหมวดหมู่หลักต้องพาหมวดหมู่ย่อยไปด้วย ไม่งั้นย่อยจะลอยอยู่โดยไม่มีหัว */
export async function softDeleteCategory(id) {
  const deletedAt = new Date().toISOString()
  return fromRows('categories', await unwrap(
    supabase
      .from('categories')
      .update({ deleted: true, deleted_at: deletedAt })
      .eq('shop_id', getShopId())
      .or(`id.eq.${id},parent_id.eq.${id}`)
      .select()
  ))
}

/**
 * หา "อื่นๆ" ของประเภทที่ต้องการ — trigger สร้างให้ตอนสร้างร้าน
 * ของเดิมฮาร์ดโค้ด id ไว้ (cat-8 / cat-income-1) ซึ่งใช้ไม่ได้แล้วเพราะ id เป็น uuid ที่ Postgres สร้าง
 */
export async function findFallbackCategory(type) {
  const rows = await unwrap(
    supabase
      .from('categories')
      .select('*')
      .eq('shop_id', getShopId())
      .eq('type', type)
      .eq('name', 'อื่นๆ')
      .is('parent_id', null)
      .eq('deleted', false)
      .limit(1)
  )
  return rows?.[0] ? fromRow('categories', rows[0]) : null
}

// ── ผู้ขาย ──────────────────────────────────────────────────────────────────

export async function listVendors() {
  return fromRows('vendors', await unwrap(
    supabase.from('vendors').select('*').eq('shop_id', getShopId()).order('created_at')
  ))
}

export async function createVendor(name) {
  return fromRow('vendors', await unwrap(
    supabase.from('vendors').insert({ shop_id: getShopId(), name, deleted: false }).select().single()
  ))
}

export async function renameVendor(id, name) {
  return fromRow('vendors', await unwrap(
    supabase.from('vendors').update({ name }).eq('id', id).select().single()
  ))
}

export async function softDeleteVendor(id) {
  return fromRow('vendors', await unwrap(
    supabase
      .from('vendors')
      .update({ deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
  ))
}

// ── รายการด่วน ──────────────────────────────────────────────────────────────

export async function listQuickItems() {
  return fromRows('quick_items', await unwrap(
    supabase.from('quick_items').select('*').eq('shop_id', getShopId()).order('created_at')
  ))
}

export async function createQuickItem({ name, categoryId = null }) {
  const row = toRow('quick_items', { shopId: getShopId(), name, categoryId, deleted: false })
  return fromRow('quick_items', await unwrap(
    supabase.from('quick_items').insert(row).select().single()
  ))
}

export async function updateQuickItem(id, changes) {
  return fromRow('quick_items', await unwrap(
    supabase.from('quick_items').update(toRow('quick_items', changes)).eq('id', id).select().single()
  ))
}

export async function softDeleteQuickItem(id) {
  return fromRow('quick_items', await unwrap(
    supabase
      .from('quick_items')
      .update({ deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
  ))
}
