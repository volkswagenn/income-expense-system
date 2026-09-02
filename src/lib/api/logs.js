import { supabase, unwrap } from '../supabase'
import { getShopId } from './context'
import { fromRow, fromRows } from './_map'

/**
 * ประวัติการใช้งาน
 *
 * ต่างจากของเดิม 2 อย่าง:
 *  • ไม่มีเพดาน 5,000 รายการแล้ว (ของเดิมตัดทิ้งเพราะโควตา localStorage)
 *    → ต้องใช้ pagination เสมอ ห้ามดึงทั้งตาราง
 *  • แก้ย้อนหลังไม่ได้ RLS อนุญาตแค่ insert / select และให้ owner ลบได้
 */

const PAGE_SIZE = 100

/** โหลดทีละหน้า — คืน { logs, hasMore } */
export async function listLogs({ page = 0, pageSize = PAGE_SIZE } = {}) {
  const from = page * pageSize
  const rows = await unwrap(
    supabase
      .from('activity_logs')
      .select('*')
      .eq('shop_id', getShopId())
      .order('timestamp', { ascending: false })
      .range(from, from + pageSize) // ขอเกินมา 1 แถวเพื่อรู้ว่ายังมีหน้าถัดไปไหม
  )
  const hasMore = (rows?.length ?? 0) > pageSize
  return { logs: fromRows('activity_logs', rows.slice(0, pageSize)), hasMore }
}

export async function countLogs() {
  const { count, error } = await supabase
    .from('activity_logs')
    .select('id', { count: 'exact', head: true })
    .eq('shop_id', getShopId())
  if (error) throw new Error(error.message)
  return count ?? 0
}

/**
 * เขียน log 1 รายการ
 *
 * งานที่แตะเงินไม่ควรเรียกตัวนี้ตรงๆ — ให้ส่ง log ไปกับ RPC (post_transaction ฯลฯ)
 * เพื่อให้บันทึกรายการกับเขียน log จบใน transaction เดียว ถ้าเน็ตหลุดกลางทางจะได้ไม่เพี้ยน
 */
export async function writeLog(entry) {
  // RPC write_log ใส่ auth.uid() ให้เอง แต่ทางนี้ insert ตรง ต้องใส่ผู้เขียนเอง
  // ไม่งั้นประวัติจากหน้ากระเป๋าเงิน (ฝาก/ถอน/ย้ายเงิน) จะไม่รู้ว่าใครทำ
  const { data: sessionData } = await supabase.auth.getSession()
  const row = {
    shop_id: getShopId(),
    user_id: sessionData?.session?.user?.id ?? null,
    activity_type: entry.activityType,
    description: entry.description ?? null,
    old_value: entry.oldValue ?? null,
    new_value: entry.newValue ?? null,
    change_note: entry.changeNote ?? null,
    wallet_effect: entry.walletEffect ?? null,
    status: entry.status ?? 'success',
    error_message: entry.errorMessage ?? null,
    device_info: navigator.userAgent,
    session_id: sessionStorage.getItem('sessionId') ?? 'unknown',
  }
  return fromRow('activity_logs', await unwrap(
    supabase.from('activity_logs').insert(row).select().single()
  ))
}

/** ลบ log ที่เก่ากว่า keepDays วัน — เฉพาะ owner (RLS บังคับอีกชั้น) */
export async function clearOldLogs(keepDays = 365) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - keepDays)
  await unwrap(
    supabase
      .from('activity_logs')
      .delete()
      .eq('shop_id', getShopId())
      .lt('timestamp', cutoff.toISOString())
  )
}

/**
 * ดึงทั้งหมดเพื่อส่งออกไฟล์ — วนทีละหน้าเพื่อไม่ให้ชนเพดานแถวของ PostgREST
 *
 * ⚠ pageSize ต้องต่ำกว่าเพดาน max-rows ของ PostgREST (ค่าตั้งต้นของ Supabase = 1000)
 *   อยู่พอสมควร เพราะ listLogs ขอเกินมา 1 แถวเพื่อเช็คว่ามีหน้าถัดไปไหม
 *   ถ้าตั้ง 1000 เซิร์ฟเวอร์จะตัดเหลือ 1000 พอดี → hasMore เป็น false → หยุดวนตั้งแต่
 *   หน้าแรกและได้ไฟล์ที่ข้อมูลขาดไปเงียบๆ โดยไม่มี error อะไรเลย
 */
const EXPORT_PAGE_SIZE = 500

export async function listAllLogsForExport() {
  const all = []
  for (let page = 0; ; page++) {
    const { logs, hasMore } = await listLogs({ page, pageSize: EXPORT_PAGE_SIZE })
    all.push(...logs)
    if (!hasMore) break
  }
  return all
}
