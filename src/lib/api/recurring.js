import { supabase, unwrap } from '../supabase'
import { getShopId } from './context'
import { fromRow, fromRows, toRow } from './_map'

// รายการประจำ (แม่แบบ) + entries รายเดือนที่งอกจากแม่แบบ

export async function listRecurringItems() {
  return fromRows('recurring_items', await unwrap(
    supabase.from('recurring_items').select('*').eq('shop_id', getShopId()).order('created_at')
  ))
}

export async function createRecurringItem(data) {
  const row = toRow('recurring_items', { ...data, shopId: getShopId() })
  return fromRow('recurring_items', await unwrap(
    supabase.from('recurring_items').insert(row).select().single()
  ))
}

export async function updateRecurringItem(id, changes) {
  const row = toRow('recurring_items', { ...changes, updatedAt: new Date().toISOString() })
  return fromRow('recurring_items', await unwrap(
    supabase.from('recurring_items').update(row).eq('id', id).select().single()
  ))
}

/** ลบแม่แบบ แต่เก็บ entries ที่จ่ายไปแล้วไว้เป็นประวัติ */
export async function deleteRecurringItem(id) {
  await unwrap(
    supabase.from('recurring_entries').delete()
      .eq('recurring_id', id).neq('status', 'paid')
  )
  await unwrap(supabase.from('recurring_items').delete().eq('id', id))
}

// ── entries รายเดือน ────────────────────────────────────────────────────────

export async function listRecurringEntries() {
  return fromRows('recurring_entries', await unwrap(
    supabase.from('recurring_entries').select('*').eq('shop_id', getShopId()).order('due_date')
  ))
}

/**
 * สร้าง entries ของเดือนที่ระบุ — เรียกซ้ำได้ไม่เกิดรายการซ้ำ
 * เพราะตาราง recurring_entries มี unique (recurring_id, month) และเราใช้ upsert
 * แบบ ignoreDuplicates ให้ฐานข้อมูลเป็นคนตัดสิน ไม่ใช่เช็คใน JS แล้วแข่งกันเขียน
 */
export async function generateEntries(month, computeDueDate) {
  const shopId = getShopId()
  const items = (await listRecurringItems()).filter((it) => it.enabled)
  if (items.length === 0) return []

  const [year, mon] = month.split('-').map(Number)
  const rows = items.map((item) => ({
    shop_id: shopId,
    recurring_id: item.id,
    month,
    due_date: computeDueDate(year, mon, item.billingDay),
    status: 'pending',
    amount: item.amountType === 'fixed' ? (item.fixedAmount ?? 0) : 0,
  }))

  return fromRows('recurring_entries', await unwrap(
    supabase
      .from('recurring_entries')
      .upsert(rows, { onConflict: 'recurring_id,month', ignoreDuplicates: true })
      .select()
  ))
}

export async function updateRecurringEntry(id, changes) {
  return fromRow('recurring_entries', await unwrap(
    supabase.from('recurring_entries').update(toRow('recurring_entries', changes)).eq('id', id).select().single()
  ))
}

export async function markEntrySkipped(id) {
  return updateRecurringEntry(id, { status: 'skipped' })
}
