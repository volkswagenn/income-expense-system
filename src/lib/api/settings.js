import { supabase, unwrap } from '../supabase'
import { getShopId } from './context'

// ตั้งค่าระดับร้าน — แก้ได้เฉพาะ owner (บังคับด้วย RLS)

export async function loadSettings() {
  const row = await unwrap(
    supabase.from('shop_settings').select('*').eq('shop_id', getShopId()).maybeSingle()
  )
  return { notifyDaysBefore: Number(row?.notify_days_before ?? 3) }
}

export async function saveNotifyDaysBefore(days) {
  const row = await unwrap(
    supabase
      .from('shop_settings')
      .update({ notify_days_before: Number(days) || 0, updated_at: new Date().toISOString() })
      .eq('shop_id', getShopId())
      .select()
      .single()
  )
  return { notifyDaysBefore: Number(row.notify_days_before) }
}

/** ล้างข้อมูลทั้งร้าน — เฉพาะ owner (ตรวจซ้ำที่ฝั่งฐานข้อมูลด้วย) */
export async function clearShopData() {
  await unwrap(supabase.rpc('clear_shop_data', { p_shop: getShopId() }))
}

/**
 * ล้างเฉพาะรายการเดินบัญชี — เก็บหมวดหมู่ บัญชีธนาคาร บัตร กระเป๋าย่อย
 * และแม่แบบรายการประจำไว้ แล้วตั้งยอดทุกก้อนเป็น 0 เพื่อเริ่มใส่ใหม่
 * (ดู reset_shop_ledger ใน supabase/reset-data.sql)
 */
export async function resetShopLedger() {
  await unwrap(supabase.rpc('reset_shop_ledger', { p_shop: getShopId() }))
}
