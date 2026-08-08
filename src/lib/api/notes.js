import { supabase, unwrap } from '../supabase'
import { getShopId } from './context'

// โน้ตบนปฏิทิน — 1 วันมีได้ 1 โน้ต (primary key คือ shop_id + date)
// หน้าจอเก็บเป็น object { '2026-08-08': 'ข้อความ' } จึงแปลงให้ตรงรูปนั้นตั้งแต่ชั้นนี้

export async function listNotes() {
  const rows = await unwrap(
    supabase.from('calendar_notes').select('date, text').eq('shop_id', getShopId())
  )
  return Object.fromEntries((rows ?? []).map((r) => [r.date, r.text]))
}

/** ข้อความว่าง = ลบโน้ตทิ้ง ไม่ใช่เก็บแถวเปล่าไว้ */
export async function setNote(date, text) {
  const shopId = getShopId()

  if (!text?.trim()) {
    await unwrap(supabase.from('calendar_notes').delete().eq('shop_id', shopId).eq('date', date))
    return null
  }

  return await unwrap(
    supabase
      .from('calendar_notes')
      .upsert(
        { shop_id: shopId, date, text, updated_at: new Date().toISOString() },
        { onConflict: 'shop_id,date' }
      )
      .select()
      .single()
  )
}

export async function deleteNote(date) {
  await unwrap(supabase.from('calendar_notes').delete().eq('shop_id', getShopId()).eq('date', date))
}
