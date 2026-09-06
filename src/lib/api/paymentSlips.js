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
  return error?.code === '42P01' || error?.code === 'PGRST205'
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
  return fromRow('payment_slips', await unwrap(
    supabase.from('payment_slips').upsert(row, { onConflict: 'kind,ref_id' }).select().single()
  ))
}

/** ลบสลิปออกจากการจ่ายนั้น (ไฟล์บน Storage ไม่ถูกลบ เผื่อยังต้องใช้เป็นหลักฐาน) */
export async function deletePaymentSlip(id) {
  await unwrap(supabase.from('payment_slips').delete().eq('id', id).select().single())
}
