import { supabase, unwrap, toThaiError } from '../supabase'
import { getShopId } from './context'
import { fromRow, fromRows } from './_map'

/**
 * สลิป/หลักฐานการจ่ายเงิน — ตารางกลางที่ผูกกับการจ่ายได้ทุกชนิด
 *
 * ทำไมไม่เก็บเป็นคอลัมน์ในตารางของแต่ละชนิด: ดูเหตุผลใน supabase/slips.sql
 * ย่อสั้นๆ คือไฟล์แนบไม่กระทบยอดเงิน จึงไม่ควรไปแก้ signature ของ RPC ที่ขยับเงินจริง
 *
 * ตัวไฟล์อยู่บน Storage เหมือนใบเสร็จ (ดู api/attachments.js) ตารางนี้เก็บแค่พาธ
 */

function isMissingTable(error) {
  // PGRST205 = PostgREST ไม่รู้จักตารางนี้ · 42P01 = Postgres บอกว่าไม่มีตาราง
  // ข้อความดิบของ PGRST205 มีคำว่า "schema cache" ซึ่งไปชนกฎแปล error ของคอลัมน์ที่หายไป
  // แล้วได้ข้อความชี้ผิดไฟล์ จึงต้องดักตรงนี้ก่อนส่งให้ toThaiError
  return error?.code === '42P01' || error?.code === 'PGRST205'
}

const NOT_INSTALLED =
  'ยังไม่ได้ติดตั้งตารางสลิปในฐานข้อมูล — เปิด Supabase › SQL Editor แล้วรัน supabase/slips.sql '
  + '(ผลตรวจท้ายไฟล์ต้องได้ ✅ ครบ 3 บรรทัด) จากนั้นรีเฟรชหน้านี้'

/**
 * ตารางสลิปติดตั้งแล้วหรือยัง
 *
 * ตอนโหลดข้อมูลเรากลืน error ของตารางที่ยังไม่มี เพื่อไม่ให้ทั้งแอปพังเพราะฟีเจอร์เสริม
 * แต่ถ้าไม่จำสถานะไว้ หน้าจอจะดูปกติทุกอย่างจนกดแนบสลิป — ไฟล์ถูกอัปโหลดขึ้น Storage
 * เสร็จแล้วค่อยพังตอนบันทึกแถว กลายเป็นไฟล์ค้างที่ไม่ได้ผูกกับอะไรเลย
 */
let installed = true
export function slipsInstalled() {
  return installed
}

/**
 * สลิปทั้งหมดของร้าน
 *
 * กลืน error เฉพาะกรณียังไม่ได้รัน slips.sql ด้วยเหตุผลเดียวกับตารางบัตร —
 * ไม่งั้นการโหลดข้อมูลตอนเปิดแอปจะล้มทั้งชุดเพราะฟีเจอร์เสริมตัวเดียว
 */
export async function listPaymentSlips() {
  const { data, error } = await supabase
    .from('payment_slips')
    .select('*')
    .eq('shop_id', getShopId())
    .order('paid_at', { ascending: false })

  if (error) {
    if (isMissingTable(error)) {
      console.warn('ยังไม่มีตาราง payment_slips — รัน supabase/slips.sql ก่อนจึงจะแนบสลิปได้')
      installed = false
      return []
    }
    throw new Error(toThaiError(error))
  }
  return fromRows('payment_slips', data)
}

/**
 * บันทึกสลิปของการจ่ายหนึ่งครั้ง — มีอยู่แล้วก็ทับของเดิม
 * @param kind card_bill | card_installment | debt | pending | recurring
 * @param refId id ของแถวการจ่ายในตารางของชนิดนั้น
 */
export async function savePaymentSlip({ kind, refId, paidAt = null, attachments = [], note = null }) {
  const row = {
    shop_id: getShopId(),
    kind,
    ref_id: refId,
    paid_at: paidAt,
    attachments,
    note,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('payment_slips').upsert(row, { onConflict: 'kind,ref_id' }).select().single()
  if (error) {
    if (isMissingTable(error)) { installed = false; throw new Error(NOT_INSTALLED) }
    throw new Error(toThaiError(error))
  }
  installed = true
  return fromRow('payment_slips', data)
}

/** ลบสลิปออกจากการจ่ายนั้น (ไฟล์บน Storage ไม่ถูกลบ เผื่อยังต้องใช้เป็นหลักฐาน) */
export async function deletePaymentSlip(id) {
  const { error } = await supabase.from('payment_slips').delete().eq('id', id).select().single()
  if (error) {
    if (isMissingTable(error)) { installed = false; throw new Error(NOT_INSTALLED) }
    throw new Error(toThaiError(error))
  }
}
