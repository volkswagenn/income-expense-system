import { supabase, unwrap } from '../supabase'
import { getShopId } from './context'
import { fromRow, fromRows, toRow } from './_map'
import { selectAll } from './_page'

/**
 * ธุรกรรม
 *
 * การบันทึกรายการ 1 ครั้ง = insert รายการ + ขยับยอดเงิน + เขียน log
 * ทั้งสามอย่างต้องจบใน transaction เดียวที่ฝั่งฐานข้อมูล จึงเรียกผ่าน RPC `post_transaction`
 * ถ้าแยกยิง 3 คำสั่งแล้วเน็ตหลุดกลางทาง จะได้รายการที่ไม่ตัดเงิน หรือเงินหายโดยไม่มีรายการ
 */

/** จำนวนเดือนย้อนหลังที่โหลดตอนเปิดแอป — ตารางโตขึ้นเรื่อยๆ ห้ามดึงทั้งตาราง */
const DEFAULT_MONTHS_BACK = 24

export function defaultRangeStart(monthsBack = DEFAULT_MONTHS_BACK) {
  const d = new Date()
  d.setMonth(d.getMonth() - monthsBack)
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

export async function listTransactions({ from = defaultRangeStart(), to = null } = {}) {
  // ต้องดึงครบทุกแถวในช่วง ไม่ใช่แค่ 1,000 แถวแรกที่ PostgREST ยอมคืนต่อ request
  // ไม่งั้นร้านที่มีรายการเยอะจะเห็นข้อมูลเก่าหายไปเฉยๆ ทั้งที่ยังอยู่ในฐานข้อมูล
  const build = () => {
    let q = supabase
      .from('transactions')
      .select('*')
      .eq('shop_id', getShopId())
      .gte('date', from)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id')
    if (to) q = q.lte('date', to)
    return q
  }
  return fromRows('transactions', await selectAll(build))
}

/**
 * บันทึกรายการ + ขยับยอด + log ในครั้งเดียว
 *
 * @param tx      ข้อมูลรายการแบบที่หน้าจอใช้ (camelCase)
 * @param effect  { target, delta } — target เป็น 'cash' | `transfer:<id>` | `sub:<id>`
 *                ใส่ null ได้ถ้ารายการนี้ไม่แตะกระเป๋าเงิน (เช่น method 'pending' หรือ 'other')
 * @param log     log entry จาก buildLogEntry() — เขียนพร้อมกันใน transaction เดียวกัน
 */
export async function createTransaction(tx, { effect = null, log = null } = {}) {
  const row = await unwrap(
    supabase.rpc('post_transaction', {
      p_shop: getShopId(),
      p_tx: toRow('transactions', tx),
      p_target: effect?.target ?? null,
      p_delta: effect?.delta ?? 0,
      p_log: log ?? null,
    })
  )
  return fromRow('transactions', row)
}

export async function updateTransaction(id, changes) {
  const row = toRow('transactions', { ...changes, updatedAt: new Date().toISOString() })
  return fromRow('transactions', await unwrap(
    supabase.from('transactions').update(row).eq('id', id).select().single()
  ))
}

/**
 * แก้ไขรายการที่กระทบยอดเงิน — ย้อนเงินของยอด/วิธีเดิม + ตัด/เพิ่มเงินของยอดใหม่
 * + แก้แถว + เขียน log จบใน RPC เดียว (edit_transaction)
 *
 * ของเดิมยิง adjust_* หลายตัวแยกกันแล้วค่อย update ถ้าเน็ตหลุดคั่นกลางยอดจะเพี้ยน
 * โดยไม่มีทางรู้ว่าขาดขั้นไหน
 *
 * @param reverse { target, delta } ที่ต้องย้อนของเดิม (null ถ้าของเดิมไม่แตะกระเป๋า)
 * @param apply   { target, delta } ของยอดใหม่ (null ถ้าไม่แตะกระเป๋า)
 */
export async function editTransaction(id, changes, { reverse = null, apply = null, log = null } = {}) {
  const row = await unwrap(
    supabase.rpc('edit_transaction', {
      p_tx_id: id,
      p_changes: toRow('transactions', changes),
      p_reverse_target: reverse?.target ?? null,
      p_reverse_delta: reverse?.delta ?? 0,
      p_apply_target: apply?.target ?? null,
      p_apply_delta: apply?.delta ?? 0,
      p_log: log ?? null,
    })
  )
  return fromRow('transactions', row)
}

/**
 * ยกเลิกรายการ — คืนเงิน + ลบรายการค้าง/ใบกำกับที่ผูกอยู่ + ย้อนสถานะรอรับเงิน
 * ทั้งหมดจบในคำสั่งเดียวที่ฐานข้อมูล (ดู cancel_transaction ใน functions.sql)
 */
export async function cancelTransaction(id, { effect = null, log = null } = {}) {
  await unwrap(
    supabase.rpc('cancel_transaction', {
      p_tx_id: id,
      p_target: effect?.target ?? null,
      p_delta: effect?.delta ?? 0,
      p_log: log ?? null,
    })
  )
}

/**
 * ปลายทางของเงินในรูปแบบที่ RPC เข้าใจ
 *
 * 'card:<id>' เป็นปลายทางที่สี่ ฝั่งฐานข้อมูลกลับเครื่องหมายให้เอง (outstanding - delta)
 * ผู้เรียกจึงส่ง delta เหมือนกระเป๋าอื่นทุกประการ คือรายจ่ายติดลบ รายรับเป็นบวก
 */
export function walletTarget(method, { transferAccountId = null, subWalletId = null, cardId = null } = {}) {
  if (method === 'cash') return 'cash'
  if (method === 'transfer') return transferAccountId ? `transfer:${transferAccountId}` : null
  if (method === 'sub') return subWalletId ? `sub:${subWalletId}` : null
  if (method === 'card') return cardId ? `card:${cardId}` : null
  return null // 'pending' และ 'other' ไม่แตะกระเป๋าเงิน
}
