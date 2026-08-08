import useWalletStore from '../store/useWalletStore'
import usePendingStore from '../store/usePendingStore'
import useTransactionStore from '../store/useTransactionStore'
import useLogStore from '../store/useLogStore'
import { buildLogEntry } from './logBuilder'

// ชื่อบัญชีเงินโอนสำหรับต่อท้ายข้อความอธิบายผล
function accountSuffix(method, accountId) {
  if (method !== 'transfer') return ''
  const label = useWalletStore.getState().getTransferAccountLabel(accountId)
  return ` (${label})`
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

export function cancelTransaction(tx) {
  const ws = useWalletStore.getState()
  const ps = usePendingStore.getState()

  // เงินโอนต้องคืนเข้าบัญชีธนาคารเดิมที่ตัดไป
  if (tx.type === 'income') {
    if (tx.method === 'cash') ws.deductCash(tx.amount)
    else if (tx.method === 'transfer') ws.deductTransfer(tx.amount, tx.transferAccountId)
  } else if (tx.type === 'expense') {
    if (tx.method === 'cash') ws.addCash(tx.amount)
    else if (tx.method === 'transfer') ws.addTransfer(tx.amount, tx.transferAccountId)
    else if (tx.method === 'pending') {
      const paid = ps.pendingPayments.find((p) => p.transactionId === tx.id && p.status === 'paid')
      if (paid) {
        if (paid.paidMethod === 'cash') ws.addCash(paid.amount)
        else if (paid.paidMethod === 'transfer') ws.addTransfer(paid.amount, paid.transferAccountId)
      }
    }
  }

  const linkedIncome = ps.pendingIncomes.find((p) => p.transactionId === tx.id)
  if (linkedIncome) ps.unReceivePendingIncome(linkedIncome.id)

  ps.deletePendingByTxId(tx.id)
  ps.deleteTaxInvoiceByTxId(tx.id)
  useTransactionStore.getState().deleteTransaction(tx.id)

  useLogStore.getState().addLog(buildLogEntry({
    activityType: 'CANCEL_TRANSACTION',
    description: `ยกเลิกรายการ "${tx.itemName}" ${tx.amount.toLocaleString()} บาท (${tx.date})`,
    oldValue: tx,
  }))
}
