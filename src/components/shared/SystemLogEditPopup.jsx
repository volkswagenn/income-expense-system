import { useState } from 'react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import useLogStore from '../../store/useLogStore'
import useWalletStore from '../../store/useWalletStore'
import usePendingStore from '../../store/usePendingStore'
import useTransactionStore from '../../store/useTransactionStore'
import { ACTIVITY_LABELS } from '../../lib/logBuilder'

// tx-type logs are audit records only — wallet was already adjusted by cancelTransaction
const TX_AUDIT_TYPES = new Set([
  'ADD_INCOME', 'ADD_INCOME_MAIN', 'ADD_OTHER_INCOME',
  'ADD_EXPENSE', 'EDIT_INCOME', 'EDIT_EXPENSE',
  'CANCEL_TRANSACTION', 'DELETE_TRANSACTION',
])

// ── Helpers ───────────────────────────────────────────────────────────────────

function applyWalletTarget(ws, target, delta, transferAccountId = null) {
  if (!target || delta === 0) return
  if (target === 'cash') delta > 0 ? ws.addCash(delta) : ws.deductCash(-delta)
  else if (target === 'transfer') {
    // เงินโอนต้องกลับเข้าบัญชีธนาคารเดิมที่เคยเคลื่อนไหว
    delta > 0 ? ws.addTransfer(delta, transferAccountId) : ws.deductTransfer(-delta, transferAccountId)
  }
  else if (target?.startsWith('sub:')) ws.updateSubWallet(target.slice(4), delta)
}

function targetLabel(target) {
  if (target === 'cash') return 'เงินสด'
  if (target === 'transfer') return 'เงินโอน'
  if (target?.startsWith('sub:')) return 'กระเป๋าตังค์'
  return target ?? ''
}

function typeBadgeColor(type) {
  if (type === 'OPEN_BILL') return 'bg-red-100 text-red-700'
  if (type === 'PAY_PENDING') return 'bg-amber-100 text-amber-700'
  if (type === 'RECEIVE_TAX_INVOICE') return 'bg-blue-100 text-blue-700'
  if (type?.startsWith('SUB_')) return 'bg-purple-100 text-purple-700'
  if (['CASH_DEPOSIT', 'TRANSFER_TO_WALLET', 'WITHDRAW_FROM_TRANSFER'].includes(type))
    return 'bg-emerald-100 text-emerald-700'
  if (type === 'IMPORT_DATA') return 'bg-indigo-100 text-indigo-700'
  return 'bg-gray-100 text-gray-600'
}

// ── Compute what "delete" will undo ──────────────────────────────────────────

function computeDeleteEffects(log, loans) {
  const lines = []
  const { activityType, walletEffect, newValue } = log

  if (walletEffect && !TX_AUDIT_TYPES.has(activityType)) {
    const { target, delta } = walletEffect
    const reversal = -delta
    lines.push(`${targetLabel(target)}: ${reversal > 0 ? '+' : ''}${reversal.toLocaleString()} บาท`)

    if (activityType === 'TRANSFER_TO_WALLET')
      lines.push(`เงินโอน: ${delta.toLocaleString()} บาท`)
    else if (activityType === 'WITHDRAW_FROM_TRANSFER')
      lines.push(`เงินสด: ${delta.toLocaleString()} บาท`)

    // SUB_DEPOSIT: main wallet gets refunded
    if (activityType === 'SUB_DEPOSIT' && newValue?.fromMethod) {
      const method = newValue.fromMethod === 'cash' ? 'เงินสด' : 'เงินโอน'
      lines.push(`${method}: +${delta.toLocaleString()} บาท (คืนกลับ)`)
    }
    // SUB_WITHDRAW: main wallet gets deducted
    if (activityType === 'SUB_WITHDRAW' && newValue?.toMethod) {
      const method = newValue.toMethod === 'cash' ? 'เงินสด' : 'เงินโอน'
      lines.push(`${method}: ${delta.toLocaleString()} บาท (หักคืน)`)
    }
    // SUB_TRANSFER: destination wallet gets deducted
    if (activityType === 'SUB_TRANSFER' && newValue?.toId) {
      lines.push(`กระเป๋าตังค์ปลายทาง: ${delta.toLocaleString()} บาท (หักคืน)`)
    }

    if (activityType === 'SUB_BORROW' && newValue?.loanId) {
      const loan = loans.find((l) => l.id === newValue.loanId)
      if (loan)
        lines.push(`${loan.method === 'cash' ? 'เงินสด' : 'เงินโอน'}: -${loan.amount.toLocaleString()} บาท`)
      lines.push('ลบรายการยืมเงินที่เชื่อมโยง')
    }
    if (activityType === 'SUB_RETURN' && newValue?.loanId) {
      const loan = loans.find((l) => l.id === newValue.loanId)
      if (loan)
        lines.push(`กระเป๋าตังค์: -${loan.amount.toLocaleString()} บาท (คืนค่า)`)
    }
  }

  if (activityType === 'OPEN_BILL') lines.push('ลบรายการค้างชำระที่เชื่อมโยง')
  if (activityType === 'OPEN_BILL_INCOME') lines.push('ลบรายการรอรับเงินที่เชื่อมโยง')
  if (activityType === 'PAY_PENDING') lines.push('ย้อนสถานะค้างชำระเป็น "ยังไม่ชำระ"')
  if (activityType === 'RECEIVE_TAX_INVOICE') lines.push('ย้อนสถานะใบกำกับภาษีเป็น "รอรับ"')
  // Legacy logs (created before this fix) may lack newValue — warn user
  if (activityType === 'SUB_DEPOSIT' && !newValue?.fromMethod)
    lines.push('⚠️ ไม่ทราบ source — ยอดกระเป๋าหลักจะไม่ถูกคืน (log เก่า)')
  if (activityType === 'SUB_WITHDRAW' && !newValue?.toMethod)
    lines.push('⚠️ ไม่ทราบ destination — ยอดกระเป๋าหลักจะไม่ถูกปรับ (log เก่า)')
  if (activityType === 'SUB_TRANSFER' && !newValue?.toId)
    lines.push('⚠️ ไม่ทราบกระเป๋าปลายทาง — ยอดจะไม่ถูกหักคืน (log เก่า)')
  if (activityType === 'SUB_DELETE') lines.push('⚠️ ไม่สามารถกู้คืนกระเป๋าที่ถูกลบได้')
  if (activityType === 'SUB_RENAME') lines.push('ไม่มีผลต่อยอดเงิน (เฉพาะชื่อกระเป๋า)')

  return lines
}

// ── Delete confirmation overlay ───────────────────────────────────────────────

function DeleteConfirmOverlay({ log, effects, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-red-50 px-6 py-4 border-b border-red-100">
          <h3 className="font-semibold text-red-700">ยืนยันการลบรายการ</h3>
          <p className="text-xs text-red-500 mt-0.5">รายการนี้จะถูกลบออกจากประวัติถาวร</p>
        </div>

        <div className="p-5 space-y-3">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-500 font-medium mb-1">รายการที่จะลบ</p>
            <p className="text-sm text-gray-800 leading-relaxed">{log.description}</p>
          </div>

          {effects.length > 0 ? (
            <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
              <p className="text-xs font-semibold text-amber-700 mb-2">เงินที่จะถูกคืน / ผลที่จะเกิดขึ้น</p>
              <div className="space-y-1.5">
                {effects.map((effect, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-amber-500 text-sm mt-0.5 flex-shrink-0">↩</span>
                    <span className="text-sm text-amber-800">{effect}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-1">(ไม่มีผลต่อยอดเงิน)</p>
          )}
        </div>

        <div className="px-5 pb-5 flex gap-3 justify-end">
          <button className="btn btn-secondary" onClick={onCancel}>ยกเลิก</button>
          <button className="btn btn-danger" onClick={onConfirm}>ยืนยันลบ</button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SystemLogEditPopup({ log, onClose }) {
  const { deleteLog } = useLogStore()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const ws = () => useWalletStore.getState()
  const ps = () => usePendingStore.getState()
  const tx = () => useTransactionStore.getState()
  const loans = useWalletStore((s) => s.loans)

  const deleteEffects = computeDeleteEffects(log, loans)

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = () => {
    const store = ws()
    const pending = ps()
    const { activityType, walletEffect, newValue } = log

    if (walletEffect && !TX_AUDIT_TYPES.has(activityType)) {
      const { target, delta, transferAccountId } = walletEffect
      const acct = transferAccountId ?? newValue?.transferAccountId ?? null
      applyWalletTarget(store, target, -delta, acct)

      if (activityType === 'TRANSFER_TO_WALLET')
        applyWalletTarget(store, 'transfer', delta, acct)
      else if (activityType === 'WITHDRAW_FROM_TRANSFER')
        applyWalletTarget(store, 'cash', delta)
      // SUB_DEPOSIT: refund main wallet (delta = +amount → main wallet lost +amount → restore +amount)
      else if (activityType === 'SUB_DEPOSIT' && newValue?.fromMethod)
        applyWalletTarget(store, newValue.fromMethod, delta, newValue?.transferAccountId)
      // SUB_WITHDRAW: deduct main wallet (delta = -amount → main wallet gained amount → take back)
      else if (activityType === 'SUB_WITHDRAW' && newValue?.toMethod)
        applyWalletTarget(store, newValue.toMethod, delta, newValue?.transferAccountId)
      // SUB_TRANSFER: deduct destination sub wallet (delta = -amount → destination gained amount → take back)
      else if (activityType === 'SUB_TRANSFER' && newValue?.toId)
        store.updateSubWallet(newValue.toId, delta)

      if (activityType === 'SUB_BORROW' && newValue?.loanId) {
        const loan = store.loans.find((l) => l.id === newValue.loanId)
        if (loan) {
          if (loan.method === 'cash') store.deductCash(loan.amount)
          else store.deductTransfer(loan.amount, loan.transferAccountId)
        }
        store.deleteLoanById(newValue.loanId)
      }

      if (activityType === 'SUB_RETURN' && newValue?.loanId) {
        const loan = store.loans.find((l) => l.id === newValue.loanId)
        if (loan) {
          store.updateSubWallet(loan.subWalletId, -loan.amount)
          store.unReturnLoanById(loan.id)
        }
      }
    }

    if (activityType === 'OPEN_BILL') {
      if (newValue?.pendingId) pending.deletePending(newValue.pendingId)
      if (newValue?.transactionId) {
        const item = pending.pendingPayments.find((p) => p.transactionId === newValue.transactionId)
        if (item) pending.deletePending(item.id)
      }
    }
    if (activityType === 'OPEN_BILL_INCOME' && newValue?.pendingIncomeId)
      pending.deletePendingIncome(newValue.pendingIncomeId)
    if (activityType === 'PAY_PENDING' && newValue?.pendingId) {
      if (newValue?.transactionId) tx().deleteTransaction(newValue.transactionId)
      pending.unPayPending(newValue.pendingId)
    }
    if (activityType === 'RECEIVE_TAX_INVOICE' && newValue?.taxInvoiceId)
      pending.unreceiveTaxInvoice(newValue.taxInvoiceId)

    deleteLog(log.id)
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden">

          {/* Header */}
          <div className="px-5 py-4 border-b bg-gray-50 flex items-start justify-between flex-shrink-0">
            <div className="space-y-1.5">
              <h3 className="font-semibold text-base text-gray-900">รายละเอียดรายการ</h3>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeBadgeColor(log.activityType)}`}>
                  {ACTIVITY_LABELS[log.activityType] ?? log.activityType}
                </span>
                <span className="text-xs text-gray-400">
                  {format(new Date(log.timestamp), 'd MMM yyyy HH:mm', { locale: th })}
                </span>
              </div>
            </div>
            <button className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-3 flex-shrink-0" onClick={onClose}>×</button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-3 overflow-y-auto flex-1">

            {/* Description */}
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-500 font-medium mb-1">คำอธิบาย</p>
              <p className="text-sm text-gray-800 leading-relaxed">{log.description}</p>
            </div>

            {/* Wallet effect */}
            {log.walletEffect && (
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-500 font-medium mb-1">ผลต่อกระเป๋า (เดิม)</p>
                <p className={`font-semibold text-sm ${log.walletEffect.delta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {log.walletEffect.delta > 0 ? '+' : ''}{log.walletEffect.delta.toLocaleString()} บาท
                  <span className="text-gray-500 font-normal ml-1">({targetLabel(log.walletEffect.target)})</span>
                </p>
              </div>
            )}

            {/* Reversal preview — shown upfront so user knows before clicking delete */}
            {deleteEffects.length > 0 && (
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                <p className="text-xs font-semibold text-amber-700 mb-2">หากลบรายการนี้ ระบบจะ</p>
                <div className="space-y-1.5">
                  {deleteEffects.map((effect, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-amber-400 text-xs mt-0.5 flex-shrink-0">↩</span>
                      <span className="text-sm text-amber-800">{effect}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {deleteEffects.length === 0 && (
              <p className="text-xs text-gray-400 text-center">(การลบรายการนี้ไม่มีผลต่อยอดเงิน)</p>
            )}
          </div>

          {/* Footer — read-only, delete only */}
          <div className="px-5 py-4 border-t bg-gray-50 flex items-center justify-between flex-shrink-0">
            <button
              className="btn btn-danger text-sm"
              onClick={() => setConfirmDelete(true)}
            >
              🗑️ ลบรายการ
            </button>
            <button className="btn btn-secondary" onClick={onClose}>ปิด</button>
          </div>
        </div>
      </div>

      {/* Delete confirmation overlay */}
      {confirmDelete && (
        <DeleteConfirmOverlay
          log={log}
          effects={deleteEffects}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}
