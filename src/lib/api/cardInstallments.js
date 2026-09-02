import { supabase, unwrap, toThaiError } from '../supabase'
import { getShopId } from './context'
import { fromRow, fromRows } from './_map'
import { toDateString } from '../cardCycle'

/**
 * ผ่อนชำระผ่านบัตรเครดิต
 *
 * ตอนสร้างไม่แตะยอดหนี้และไม่สร้างรายจ่าย — บันทึกแค่สัญญากับตารางงวด
 * งวดจะกลายเป็นรายจ่ายทีละงวดตอนปิดรอบ (ดู close_card_statement ใน
 * supabase/card_installment.sql) เพราะเงินไหลออกจริงทีละงวด
 */

function isMissingTable(error) {
  return error?.code === '42P01' || error?.code === 'PGRST205'
}

/** สัญญาผ่อนทั้งหมดพร้อมงวด — กลืน error เฉพาะกรณีตารางยังไม่ถูกสร้าง */
export async function listInstallments() {
  const shopId = getShopId()
  const [insRes, entRes] = await Promise.all([
    supabase.from('card_installments').select('*').eq('shop_id', shopId).order('created_at', { ascending: false }),
    supabase.from('card_installment_entries').select('*').eq('shop_id', shopId).order('seq'),
  ])

  for (const res of [insRes, entRes]) {
    if (res.error) {
      if (isMissingTable(res.error)) {
        console.warn('ยังไม่มีตารางผ่อนชำระ — รัน supabase/card_installment.sql ก่อนจึงจะใช้การผ่อนได้')
        return { installments: [], entries: [] }
      }
      throw new Error(toThaiError(res.error))
    }
  }

  return {
    installments: fromRows('card_installments', insRes.data),
    entries: fromRows('card_installment_entries', entRes.data),
  }
}

/**
 * สร้างสัญญาผ่อนพร้อมงวดทั้งหมดในคำสั่งเดียว
 * @param schedule ผลจาก installmentSchedule() ใน cardCycle.js
 */
export async function createInstallment(cardId, data, schedule, log = null) {
  const row = await unwrap(supabase.rpc('create_card_installment', {
    p_shop: getShopId(),
    p_card: cardId,
    p_data: {
      name: data.name,
      vendor: data.vendor || null,
      category_id: data.categoryId || null,
      note: data.note || null,
      principal_amount: data.principalAmount ?? data.totalAmount,
      total_amount: data.totalAmount,
      months: data.months,
      monthly_amount: data.monthlyAmount,
      interest_rate: data.interestRate ?? 0,
      purchase_date: data.purchaseDate,
      first_cycle: schedule[0].cycle,
    },
    p_entries: schedule.map((e) => ({
      seq: e.seq,
      cycle: e.cycle,
      due_date: toDateString(e.dueDate),
      amount: e.amount,
    })),
    p_log: log,
  }))
  return fromRow('card_installments', row)
}

/** ปิดยอดคงเหลือก่อนกำหนด — รวมงวดที่เหลือเป็นรายการเดียวเข้ารอบที่เปิดอยู่ */
export async function settleInstallment(installmentId, { date, fee = 0, log = null }) {
  const row = await unwrap(supabase.rpc('settle_card_installment', {
    p_installment: installmentId,
    p_date: date,
    p_fee: fee,
    p_log: log,
  }))
  return fromRow('card_installments', row)
}

/** ยกเลิกงวดที่เหลือ — งวดที่เรียกเก็บไปแล้วยังอยู่ เพราะเกิดขึ้นจริง */
export async function cancelInstallment(installmentId, log = null) {
  const row = await unwrap(supabase.rpc('cancel_card_installment', {
    p_installment: installmentId,
    p_log: log,
  }))
  return fromRow('card_installments', row)
}

/** แก้ได้เฉพาะข้อมูลอธิบาย — ยอดและงวดที่เรียกเก็บไปแล้วแตะไม่ได้ */
export async function updateInstallment(id, { name, vendor, categoryId, note }) {
  const row = await unwrap(
    supabase
      .from('card_installments')
      .update({
        name, vendor: vendor || null, category_id: categoryId || null, note: note || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()
  )
  return fromRow('card_installments', row)
}
