import useWalletStore from '../store/useWalletStore'
import usePendingStore from '../store/usePendingStore'
import useTransactionStore from '../store/useTransactionStore'
import useRecurringStore from '../store/useRecurringStore'
import { buildLogEntry } from './logBuilder'

// ชื่อบัญชีเงินโอนสำหรับต่อท้ายข้อความอธิบายผล
function accountSuffix(method, accountId) {
  if (method !== 'transfer') return ''
  const label = useWalletStore.getState().getTransferAccountLabel(accountId)
  return ` (${label})`
}

/**
 * เงินก้อนที่ต้องคืนเมื่อยกเลิกรายการนี้ — { target, delta } ตามรูปแบบที่ RPC เข้าใจ
 *
 * รายจ่ายแบบ 'pending' ตัวรายการเองไม่เคยแตะกระเป๋าเงิน เงินออกไปตอน "กดจ่าย"
 * ผ่าน pending_payments ต่างหาก ปลายทางที่ต้องคืนจึงมาจาก paidMethod ของรายการค้างนั้น
 * ไม่ใช่ method ของ transaction — ถ้าอ่านผิดตัว เงินจะคืนผิดกระเป๋า
 */
export function reverseEffectOf(tx, pendingPayments = []) {
  const amount = Number(tx.amount) || 0
  if (amount <= 0) return null

  if (tx.type === 'income') {
    if (tx.method === 'cash') return { target: 'cash', delta: -amount }
    if (tx.method === 'transfer' && tx.transferAccountId) {
      return { target: `transfer:${tx.transferAccountId}`, delta: -amount }
    }
    return null // 'other' ไม่เคยเข้ากระเป๋าเงิน จึงไม่มีอะไรต้องถอน
  }

  if (tx.type === 'expense') {
    if (tx.method === 'cash') return { target: 'cash', delta: +amount }
    if (tx.method === 'transfer' && tx.transferAccountId) {
      return { target: `transfer:${tx.transferAccountId}`, delta: +amount }
    }
    if (tx.method === 'pending') {
      const paid = pendingPayments.find((p) => p.transactionId === tx.id && p.status === 'paid')
      if (!paid) return null // ยังไม่ได้จ่าย = เงินยังไม่ออก
      const paidAmount = Number(paid.amount) || 0
      if (paid.paidMethod === 'cash') return { target: 'cash', delta: +paidAmount }
      if (paid.paidMethod === 'transfer' && paid.transferAccountId) {
        return { target: `transfer:${paid.transferAccountId}`, delta: +paidAmount }
      }
    }
  }
  return null
}

/**
 * อธิบายผลลัพธ์ทั้งหมดของการยกเลิก transaction ให้ตรงกับสิ่งที่ cancelTransaction ทำจริง
 * (ยอดเงิน + รายการค้างจ่าย + ใบกำกับภาษี + รายการรอรับเงินที่ผูกอยู่)
 */
export function describeTxCancelEffects(tx, { pendingPayments = [], taxInvoices = [], pendingIncomes = [] } = {}) {
  const effects = []

  const suffix = accountSuffix(tx.method, tx.transferAccountId)

  if (tx.type === 'income') {
    if (tx.method === 'cash') effects.push(`หัก ${tx.amount.toLocaleString()} บาท จากเงินสด`)
    else if (tx.method === 'transfer') effects.push(`หัก ${tx.amount.toLocaleString()} บาท จากเงินโอน${suffix}`)
    else effects.push('ไม่มีผลต่อยอดเงิน')
  } else if (tx.type === 'expense') {
    if (tx.method === 'cash') effects.push(`คืน ${tx.amount.toLocaleString()} บาท เข้าเงินสด`)
    else if (tx.method === 'transfer') effects.push(`คืน ${tx.amount.toLocaleString()} บาท เข้าเงินโอน${suffix}`)
    else if (tx.method === 'pending') {
      const paid = pendingPayments.find((p) => p.transactionId === tx.id && p.status === 'paid')
      if (paid) {
        effects.push(
          `คืน ${paid.amount.toLocaleString()} บาท เข้า${paid.paidMethod === 'cash' ? 'เงินสด' : 'เงินโอน'}` +
          accountSuffix(paid.paidMethod, paid.transferAccountId)
        )
      } else effects.push('ยังไม่ได้ชำระ — ไม่มีผลต่อยอดเงิน')
    }
  }

  // cancelTransaction ลบสิ่งเหล่านี้เสมอ ไม่ว่า method จะเป็นอะไร จึงต้องแจ้งให้ครบ
  const linkedPendingCount = pendingPayments.filter((p) => p.transactionId === tx.id).length
  if (linkedPendingCount > 0) effects.push(`ลบรายการค้างจ่ายที่เชื่อมโยง ${linkedPendingCount} รายการ`)

  const linkedTaxCount = taxInvoices.filter((t) => t.transactionId === tx.id).length
  if (linkedTaxCount > 0) effects.push(`ลบรายการรอใบกำกับภาษีที่เชื่อมโยง ${linkedTaxCount} รายการ`)

  if (pendingIncomes.some((p) => p.transactionId === tx.id)) {
    effects.push('ย้อนสถานะรายการรอรับเงินกลับเป็น "รอรับ"')
  }

  return effects
}

/**
 * ยกเลิกรายการ — **คำสั่งเดียวจบที่ฐานข้อมูล** (RPC `cancel_transaction`)
 *
 * ฝั่งฐานข้อมูลทำให้ครบในทรานแซกชันเดียว: คืนเงินตาม effect ที่ส่งไป, ย้อนสถานะ
 * รายการรอรับเงินและรายการประจำที่ผูกอยู่, ลบรายการค้างจ่าย/ใบกำกับภาษีที่ผูกอยู่,
 * ลบตัวรายการ แล้วเขียน log — ดู functions.sql
 *
 * ห้ามกลับไปสั่งทีละอย่างจาก client เหมือนเวอร์ชันออฟไลน์: ตอนนั้นโค้ดยิงคำสั่ง 6 ตัว
 * แบบไม่รอผล ทำให้ฐานข้อมูลกับ JS แย่งกันเก็บกวาดของชิ้นเดียวกัน (เช่น JS สั่งคืนเงิน
 * แล้ว RPC คืนซ้ำอีกรอบ) และหน้าจอขึ้นว่าสำเร็จทั้งที่คำสั่งอาจล้มไปแล้ว
 *
 * ยอดเงินหลังยกเลิกดึงใหม่จากเซิร์ฟเวอร์เสมอ ไม่คำนวณต่อใน JS เพราะอาจมีคนอื่น
 * ขยับยอดพร้อมกันอยู่
 */
export async function cancelTransaction(tx) {
  const { pendingPayments } = usePendingStore.getState()
  const effect = reverseEffectOf(tx, pendingPayments)

  await useTransactionStore.getState().deleteTransaction(tx.id, {
    effect,
    log: buildLogEntry({
      activityType: 'CANCEL_TRANSACTION',
      description: `ยกเลิกรายการ "${tx.itemName}" ${Number(tx.amount).toLocaleString()} บาท (${tx.date})`,
      oldValue: tx,
      walletEffect: effect,
    }),
  })

  // ฐานข้อมูลเพิ่งแก้ยอดเงิน สถานะรายการค้าง/รอรับเงิน และย้อนรอบรายการประจำ
  // ที่ผูกอยู่ไปหลายตาราง — ดึงกลับมาให้ตรงกันทั้งชุด แทนที่จะเดาว่าอะไรเปลี่ยนไปบ้าง
  await Promise.all([
    useWalletStore.getState().refresh(),
    usePendingStore.getState().refresh(),
    useRecurringStore.getState().refresh(),
  ])
}
