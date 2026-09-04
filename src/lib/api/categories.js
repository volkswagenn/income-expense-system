import { supabase, unwrap } from '../supabase'
import { getShopId } from './context'
import { fromRow, fromRows, toRow } from './_map'
import { selectAll } from './_page'

// หมวดหมู่ / ผู้ขาย / รายการด่วน — ข้อมูลอ้างอิงที่ทุกหน้าใช้ร่วมกัน
// ทั้งสามตารางใช้ soft delete (deleted = true) เพื่อไม่ให้รายการเก่าเสียชื่อที่เคยเลือกไว้

// ── หมวดหมู่ ────────────────────────────────────────────────────────────────

export async function listCategories() {
  return fromRows('categories', await selectAll(() =>
    supabase.from('categories').select('*').eq('shop_id', getShopId())
      .order('sort_order').order('created_at').order('id')
  ))
}

export async function createCategory({ name, type, parentId = null, icon = null }) {
  const row = toRow('categories', { shopId: getShopId(), name, type, parentId, icon, deleted: false })
  return fromRow('categories', await unwrap(
    supabase.from('categories').insert(row).select().single()
  ))
}

/**
 * แก้ไขหมวดหมู่ — ส่งเฉพาะฟิลด์ที่เปลี่ยน เช่น { name } หรือ { icon }
 * แยกจาก renameCategory เพราะตอนนี้มีมากกว่าชื่อให้แก้แล้ว
 * (ส่ง icon: null คือสั่งเอาไอคอนออก ไม่ใช่ "ไม่เปลี่ยน" — toRow ทิ้งเฉพาะ undefined)
 */
export async function updateCategory(id, changes) {
  return fromRow('categories', await unwrap(
    supabase.from('categories').update(toRow('categories', changes)).eq('id', id).select().single()
  ))
}

export async function renameCategory(id, name) {
  return updateCategory(id, { name })
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

// ── ผู้ขาย ──────────────────────────────────────────────────────────────────

export async function listVendors() {
  return fromRows('vendors', await selectAll(() =>
    supabase.from('vendors').select('*').eq('shop_id', getShopId()).order('created_at').order('id')
  ))
}

export async function createVendor(name, icon = null) {
  return fromRow('vendors', await unwrap(
    supabase.from('vendors').insert({ shop_id: getShopId(), name, icon, deleted: false }).select().single()
  ))
}

/** แก้ไขผู้ขาย — ส่งเฉพาะฟิลด์ที่เปลี่ยน เช่น { name } หรือ { icon } */
export async function updateVendor(id, changes) {
  return fromRow('vendors', await unwrap(
    supabase.from('vendors').update(toRow('vendors', changes)).eq('id', id).select().single()
  ))
}

export async function renameVendor(id, name) {
  return updateVendor(id, { name })
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
  return fromRows('quick_items', await selectAll(() =>
    supabase.from('quick_items').select('*').eq('shop_id', getShopId()).order('created_at').order('id')
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

/**
 * จัดลำดับหมวดหมู่ใหม่ทั้งชุด — ส่ง id เรียงตามลำดับที่ต้องการ
 * ทำเป็นคำสั่งเดียวที่ฐานข้อมูล ถ้าแยกอัปเดตทีละแถวแล้วเน็ตหลุดกลางทาง
 * จะได้ลำดับครึ่งเก่าครึ่งใหม่ที่ไม่มีใครรู้ว่าเพี้ยน
 */
export async function reorderCategories(ids) {
  await unwrap(supabase.rpc('reorder_categories', { p_shop: getShopId(), p_ids: ids }))
}
