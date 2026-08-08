import { supabase, unwrap } from '../supabase'
import { getShopId } from './context'
import { fromRow, fromRows, toRow } from './_map'

/**
 * ค้างชำระ / รอรับเงิน / รอใบกำกับภาษี
 *
 * หมายเหตุสำคัญ: การ "กดจ่าย" และ "กดรับเงิน" เป็นงานหลายสเต็ป
 * (สร้าง transaction + ปิดรายการค้าง + ขยับยอด + เขียน log) ซึ่งต้องจบในครั้งเดียว
 * ตอนนี้ยังไม่มี RPC รองรับ → เฟส 4 จะเพิ่ม pay_pending_payment / receive_pending_income
 * แล้วย้ายมาเรียกที่นี่ ไฟล์นี้จึงมีแต่ CRUD ล้วนไปก่อน
 */

// ── ค้างชำระ ────────────────────────────────────────────────────────────────

export async function listPendingPayments() {
  return fromRows('pending_payments', await unwrap(
    supabase.from('pending_payments').select('*').eq('shop_id', getShopId())
      .order('created_at', { ascending: false })
  ))
}

export async function createPendingPayment(data) {
  const row = toRow('pending_payments', { ...data, shopId: getShopId(), status: data.status ?? 'pending' })
  return fromRow('pending_payments', await unwrap(
    supabase.from('pending_payments').insert(row).select().single()
  ))
}

export async function updatePendingPayment(id, changes) {
  return fromRow('pending_payments', await unwrap(
    supabase.from('pending_payments').update(toRow('pending_payments', changes)).eq('id', id).select().single()
  ))
}

export async function deletePendingPayment(id) {
  await unwrap(supabase.from('pending_payments').delete().eq('id', id))
}

export async function deletePendingPaymentByTxId(transactionId) {
  await unwrap(
    supabase.from('pending_payments').delete().eq('shop_id', getShopId()).eq('transaction_id', transactionId)
  )
}

// ── รอรับเงิน ───────────────────────────────────────────────────────────────

export async function listPendingIncomes() {
  return fromRows('pending_incomes', await unwrap(
    supabase.from('pending_incomes').select('*').eq('shop_id', getShopId())
      .order('created_at', { ascending: false })
  ))
}

export async function createPendingIncome(data) {
  const row = toRow('pending_incomes', { ...data, shopId: getShopId(), status: data.status ?? 'pending' })
  return fromRow('pending_incomes', await unwrap(
    supabase.from('pending_incomes').insert(row).select().single()
  ))
}

export async function updatePendingIncome(id, changes) {
  return fromRow('pending_incomes', await unwrap(
    supabase.from('pending_incomes').update(toRow('pending_incomes', changes)).eq('id', id).select().single()
  ))
}

export async function deletePendingIncome(id) {
  await unwrap(supabase.from('pending_incomes').delete().eq('id', id))
}

// ── รอใบกำกับภาษี ───────────────────────────────────────────────────────────

export async function listTaxInvoices() {
  return fromRows('tax_invoices', await unwrap(
    supabase.from('tax_invoices').select('*').eq('shop_id', getShopId())
      .order('created_at', { ascending: false })
  ))
}

export async function createTaxInvoice(data) {
  const row = toRow('tax_invoices', { ...data, shopId: getShopId(), status: data.status ?? 'waiting' })
  return fromRow('tax_invoices', await unwrap(
    supabase.from('tax_invoices').insert(row).select().single()
  ))
}

export async function updateTaxInvoice(id, changes) {
  return fromRow('tax_invoices', await unwrap(
    supabase.from('tax_invoices').update(toRow('tax_invoices', changes)).eq('id', id).select().single()
  ))
}

export async function receiveTaxInvoice(id, filePath = null) {
  const changes = { status: 'received', received_at: new Date().toISOString() }
  if (filePath) changes.file_path = filePath
  return fromRow('tax_invoices', await unwrap(
    supabase.from('tax_invoices').update(changes).eq('id', id).select().single()
  ))
}

export async function unreceiveTaxInvoice(id) {
  return fromRow('tax_invoices', await unwrap(
    supabase.from('tax_invoices')
      .update({ status: 'waiting', received_at: null, file_path: null })
      .eq('id', id).select().single()
  ))
}

export async function deleteTaxInvoice(id) {
  await unwrap(supabase.from('tax_invoices').delete().eq('id', id))
}

export async function deleteTaxInvoiceByTxId(transactionId) {
  await unwrap(
    supabase.from('tax_invoices').delete().eq('shop_id', getShopId()).eq('transaction_id', transactionId)
  )
}
