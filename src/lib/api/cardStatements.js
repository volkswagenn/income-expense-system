import { supabase, unwrap, toThaiError } from '../supabase'
import { getShopId } from './context'
import { fromRow, fromRows } from './_map'
import { toDateString } from '../cardCycle'

/**
 * ใบแจ้งยอดบัตรเครดิต
 *
 * ตารางเก็บเฉพาะรอบที่ปิดแล้ว รอบที่กำลังเดินอยู่คำนวณสดจาก transactions
 * เพราะยอดของมันเปลี่ยนทุกครั้งที่รูด การเก็บไว้จะต้องคอยไล่อัปเดตแล้วเพี้ยนได้ง่าย
 *
 * การจ่ายบิลไม่สร้าง transactions โดยเจตนา — ดูเหตุผลใน supabase/card.sql
 */

function isMissingTable(error) {
  return error?.code === '42P01' || error?.code === 'PGRST205'
}

/**
 * ใบแจ้งยอดทั้งหมดของร้าน
 *
 * กลืน error เฉพาะกรณีตารางยังไม่ถูกสร้าง (ยังไม่ได้รัน card.sql)
 * ด้วยเหตุผลเดียวกับ listCreditCards คือ loadAllData ล้มทั้งชุด
 */
export async function listCardStatements() {
  const { data, error } = await supabase
    .from('card_statements')
    .select('*')
    .eq('shop_id', getShopId())
    .order('period_end', { ascending: false })

  if (error) {
    if (isMissingTable(error)) {
      console.warn('ยังไม่มีตาราง card_statements — รัน supabase/card.sql ก่อนจึงจะใช้รอบบิลได้')
      return []
    }
    throw new Error(toThaiError(error))
  }
  return fromRows('card_statements', data)
}

/**
 * ปิดรอบหนึ่งรอบ — เรียกซ้ำได้ ถ้าปิดไปแล้วจะคืนใบเดิมโดยไม่ทำอะไรเพิ่ม
 * @param period { cycle, start, end, due } จาก pendingCycles()
 */
export async function closeStatement(cardId, period) {
  const row = await unwrap(supabase.rpc('close_card_statement', {
    p_shop: getShopId(),
    p_card: cardId,
    p_cycle: period.cycle,
    p_start: toDateString(period.start),
    p_end: toDateString(period.end),
    p_due: toDateString(period.due),
  }))
  return fromRow('card_statements', row)
}

/** จ่ายบิล — ย้ายเงินสองขาในทรานแซกชันเดียว ไม่สร้างรายจ่ายใหม่ */
export async function payStatement(statementId, { method, accountId = null, amount, date, log = null }) {
  const row = await unwrap(supabase.rpc('pay_card_statement', {
    p_statement: statementId,
    p_method: method,
    p_account: accountId,
    p_amount: amount,
    p_date: date,
    p_log: log,
  }))
  return fromRow('card_statements', row)
}

/** ย้อนการจ่ายบิล — คืนเงินเข้ากระเป๋าเดิมและหนี้บัตรกลับมาเท่าเดิม */
export async function undoPayment(statementId, amount, log = null) {
  const row = await unwrap(supabase.rpc('undo_card_payment', {
    p_statement: statementId,
    p_amount: amount,
    p_log: log,
  }))
  return fromRow('card_statements', row)
}
