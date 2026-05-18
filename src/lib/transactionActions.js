import useWalletStore from '../store/useWalletStore'
import usePendingStore from '../store/usePendingStore'
import useTransactionStore from '../store/useTransactionStore'
import useLogStore from '../store/useLogStore'
import { buildLogEntry } from './logBuilder'

export function describeTxCancelEffects(tx, pendingPayments) {
  const effects = []
  if (tx.type === 'income') {
    if (tx.method === 'cash') effects.push(`หัก ${tx.amount.toLocaleString()} บาท จากเงินสด`)
    else if (tx.method === 'transfer') effects.push(`หัก ${tx.amount.toLocaleString()} บาท จากเงินโอน`)
    else effects.push('ไม่มีผลต่อยอดเงิน')
  } else if (tx.type === 'expense') {
    if (tx.method === 'cash') effects.push(`คืน ${tx.amount.toLocaleString()} บาท เข้าเงินสด`)
    else if (tx.method === 'transfer') effects.push(`คืน ${tx.amount.toLocaleString()} บาท เข้าเงินโอน`)
    else if (tx.method === 'pending') {
      const paid = pendingPayments.find((p) => p.transactionId === tx.id && p.status === 'paid')
      if (paid) {
        effects.push(`คืน ${paid.amount.toLocaleString()} บาท เข้า${paid.paidMethod === 'cash' ? 'เงินสด' : 'เงินโอน'}`)
        effects.push('ลบรายการค้างชำระ')
      } else {
        effects.push('ลบรายการค้างชำระ (ยังไม่ได้ชำระ — ไม่มีผลต่อยอดเงิน)')
      }
    }
  }
  return effects
}

export function cancelTransaction(tx) {
  const ws = useWalletStore.getState()
  const ps = usePendingStore.getState()

  if (tx.type === 'income') {
    if (tx.method === 'cash') ws.deductCash(tx.amount)
    else if (tx.method === 'transfer') ws.deductTransfer(tx.amount)
  } else if (tx.type === 'expense') {
    if (tx.method === 'cash') ws.addCash(tx.amount)
    else if (tx.method === 'transfer') ws.addTransfer(tx.amount)
    else if (tx.method === 'pending') {
      const paid = ps.pendingPayments.find((p) => p.transactionId === tx.id && p.status === 'paid')
      if (paid) {
        if (paid.paidMethod === 'cash') ws.addCash(paid.amount)
        else if (paid.paidMethod === 'transfer') ws.addTransfer(paid.amount)
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
