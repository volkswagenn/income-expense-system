import { supabase, unwrap } from '../supabase'
import { getShopId } from './context'
import { fromRow, fromRows, toRow } from './_map'

/**
 * ยอดเงินทั้งหมด — เงินสด / บัญชีเงินโอน / กระเป๋าย่อย / รายการยืม
 *
 * กติกาเหล็ก: **ห้ามอ่านยอดมาบวกลบใน JS แล้วเขียนทับ**
 * ทุกการขยับยอดต้องผ่าน RPC ที่ทำ `balance = balance + delta` ที่ฝั่ง Postgres
 * ไม่งั้นสองคนกดพร้อมกันแล้วเงินหาย (คนหลังเขียนทับคนแรก)
 *
 * ฟังก์ชันสร้าง/ลบบัญชีใช้ insert/update ตรงได้ เพราะไม่ได้แข่งกันแก้ยอดเดียวกัน
 */

// ── โหลดยอดทั้งชุด ──────────────────────────────────────────────────────────

export async function loadWallet() {
  const shopId = getShopId()
  const [state, accounts, subs, loans] = await Promise.all([
    unwrap(supabase.from('wallet_state').select('*').eq('shop_id', shopId).maybeSingle()),
    unwrap(supabase.from('transfer_accounts').select('*').eq('shop_id', shopId).order('sort_order').order('created_at')),
    unwrap(supabase.from('sub_wallets').select('*').eq('shop_id', shopId).order('sort_order').order('created_at')),
    unwrap(supabase.from('loans').select('*').eq('shop_id', shopId).order('borrowed_at', { ascending: false })),
  ])

  return {
    cash: Number(state?.cash ?? 0),
    transferAccounts: fromRows('transfer_accounts', accounts),
    subWallets: fromRows('sub_wallets', subs),
    loans: fromRows('loans', loans),
  }
}

// ── ขยับยอด (ต้องผ่าน RPC เท่านั้น) ─────────────────────────────────────────

/** คืนยอดเงินสดล่าสุดหลังบวก delta */
export async function adjustCash(delta) {
  return Number(await unwrap(supabase.rpc('adjust_cash', { p_shop: getShopId(), p_delta: delta })))
}

export async function adjustTransferAccount(accountId, delta) {
  return Number(await unwrap(supabase.rpc('adjust_transfer_account', { p_account: accountId, p_delta: delta })))
}

export async function adjustSubWallet(subId, delta) {
  return Number(await unwrap(supabase.rpc('adjust_sub_wallet', { p_sub: subId, p_delta: delta })))
}

export async function moveBetweenTransferAccounts(fromId, toId, amount) {
  await unwrap(supabase.rpc('move_between_transfer_accounts', { p_from: fromId, p_to: toId, p_amount: amount }))
}

// ── บัญชีเงินโอน ────────────────────────────────────────────────────────────

export async function createTransferAccount({ bankName = '', name = '', initialBalance = 0 }) {
  const row = toRow('transfer_accounts', {
    shopId: getShopId(), bankName, name, balance: Number(initialBalance) || 0,
  })
  return fromRow('transfer_accounts', await unwrap(
    supabase.from('transfer_accounts').insert(row).select().single()
  ))
}

/** แก้ได้เฉพาะชื่อ/ธนาคาร/ลำดับ — ยอดต้องไปทาง adjustTransferAccount เท่านั้น */
export async function updateTransferAccount(id, { bankName, name, sortOrder }) {
  const row = toRow('transfer_accounts', { bankName, name, sortOrder })
  return fromRow('transfer_accounts', await unwrap(
    supabase.from('transfer_accounts').update(row).eq('id', id).select().single()
  ))
}

export async function deleteTransferAccount(id) {
  await unwrap(supabase.from('transfer_accounts').delete().eq('id', id))
}

// ── กระเป๋าตังค์ย่อย ────────────────────────────────────────────────────────

export async function createSubWallet({ name, initialBalance = 0 }) {
  const row = toRow('sub_wallets', { shopId: getShopId(), name, balance: Number(initialBalance) || 0 })
  return fromRow('sub_wallets', await unwrap(
    supabase.from('sub_wallets').insert(row).select().single()
  ))
}

export async function renameSubWallet(id, name) {
  return fromRow('sub_wallets', await unwrap(
    supabase.from('sub_wallets').update({ name }).eq('id', id).select().single()
  ))
}

export async function deleteSubWallet(id) {
  await unwrap(supabase.from('sub_wallets').delete().eq('id', id))
}

export async function reorderSubWallets(orderedIds) {
  const shopId = getShopId()
  await Promise.all(
    orderedIds.map((id, index) =>
      unwrap(supabase.from('sub_wallets').update({ sort_order: index }).eq('id', id).eq('shop_id', shopId))
    )
  )
}

// ── รายการยืม ───────────────────────────────────────────────────────────────

export async function listLoans() {
  return fromRows('loans', await unwrap(
    supabase.from('loans').select('*').eq('shop_id', getShopId()).order('borrowed_at', { ascending: false })
  ))
}

export async function deleteLoan(id) {
  await unwrap(supabase.from('loans').delete().eq('id', id))
}
