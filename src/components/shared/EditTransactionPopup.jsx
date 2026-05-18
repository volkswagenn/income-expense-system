import { useState } from 'react'
import useTransactionStore from '../../store/useTransactionStore'
import useWalletStore from '../../store/useWalletStore'
import usePendingStore from '../../store/usePendingStore'
import useCategoryStore from '../../store/useCategoryStore'
import useLogStore from '../../store/useLogStore'
import { buildLogEntry } from '../../lib/logBuilder'
import ConfirmPopup from './ConfirmPopup'

function walletAffected(method) {
  return method === 'cash' || method === 'transfer'
}

function applyWalletDelta(ws, method, delta) {
  if (method === 'cash') {
    if (delta > 0) ws.addCash(delta)
    else ws.deductCash(-delta)
  } else if (method === 'transfer') {
    if (delta > 0) ws.addTransfer(delta)
    else ws.deductTransfer(-delta)
  }
}

export default function EditTransactionPopup({ transaction, onClose }) {
  const { updateTransaction } = useTransactionStore()
  const {
    pendingPayments, taxInvoices,
    addPending, deletePendingByTxId, syncPendingByTxId,
    addTaxInvoice, deleteTaxInvoiceByTxId, syncTaxInvoiceByTxId,
  } = usePendingStore()
  const { addLog } = useLogStore()
  const { getCategories } = useCategoryStore()
  const [form, setForm] = useState({ ...transaction })
  const [confirm, setConfirm] = useState(false)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const expenseCategories = getCategories('expense')

  // Linked records for banner
  const linkedPending = pendingPayments.find(
    (p) => p.transactionId === transaction.id && p.status === 'pending'
  )
  const linkedTax = taxInvoices.find(
    (t) => t.transactionId === transaction.id && t.status === 'waiting'
  )

  const handleConfirm = () => {
    const ws = useWalletStore.getState()
    const oldAmt = Number(transaction.amount)
    const newAmt = Number(form.amount)

    // ── Reverse the original wallet effect ──
    if (transaction.type === 'income' && walletAffected(transaction.method)) {
      applyWalletDelta(ws, transaction.method, -oldAmt)
    } else if (transaction.type === 'expense' && transaction.method !== 'pending' && walletAffected(transaction.method)) {
      applyWalletDelta(ws, transaction.method, +oldAmt)
    }

    // ── Apply the new wallet effect ──
    if (form.type === 'income' && walletAffected(form.method)) {
      applyWalletDelta(ws, form.method, +newAmt)
    } else if (form.type === 'expense' && form.method !== 'pending' && walletAffected(form.method)) {
      applyWalletDelta(ws, form.method, -newAmt)
    }

    const walletDesc = []
    if (transaction.method !== form.method || oldAmt !== newAmt) {
      if (walletAffected(transaction.method) && transaction.method !== 'pending') {
        walletDesc.push(`คืน ${oldAmt.toLocaleString()} → ${transaction.method === 'cash' ? 'เงินสด' : 'เงินโอน'}`)
      }
      if (walletAffected(form.method) && form.method !== 'pending') {
        walletDesc.push(`หัก ${newAmt.toLocaleString()} จาก${form.method === 'cash' ? 'เงินสด' : 'เงินโอน'}`)
      }
    }

    updateTransaction(transaction.id, {
      date: form.date,
      amount: newAmt,
      method: form.method,
      itemName: form.itemName,
      category: form.category,
      vendor: form.vendor,
      receiptNo: form.receiptNo,
      taxStatus: form.taxStatus,
      dueDate: form.dueDate,
      taxDueDate: form.taxDueDate,
      note: form.note,
      detail: form.detail,
      otherIncomeType: form.otherIncomeType,
    })

    // ── Pending payment sync (4-case) ──
    const oldMethod = transaction.method
    const newMethod = form.method
    if (oldMethod === 'pending' && newMethod !== 'pending') {
      deletePendingByTxId(transaction.id)
      addLog(buildLogEntry({
        activityType: 'DELETE_PENDING',
        description: `ยกเลิกบิลค้างชำระ: "${form.itemName}" (เปลี่ยนวิธีชำระเป็น${newMethod === 'cash' ? 'เงินสด' : 'เงินโอน'})`,
        oldValue: { transactionId: transaction.id, itemName: transaction.itemName },
      }))
    } else if (oldMethod !== 'pending' && newMethod === 'pending') {
      addPending({
        transactionId: transaction.id,
        amount: newAmt,
        dueDate: form.dueDate || null,
        description: form.itemName,
        openDate: form.date,
      })
      addLog(buildLogEntry({
        activityType: 'CREATE_PENDING',
        description: `สร้างบิลค้างชำระ: "${form.itemName}" ${newAmt.toLocaleString()} บาท`,
        newValue: { transactionId: transaction.id, amount: newAmt },
      }))
    } else if (oldMethod === 'pending' && newMethod === 'pending') {
      syncPendingByTxId(transaction.id, {
        description: form.itemName,
        amount: newAmt,
        dueDate: form.dueDate,
      })
    }

    // ── Tax invoice sync (4-case) ──
    const oldTax = transaction.taxStatus
    const newTax = form.taxStatus
    if (newTax === 'waiting' && oldTax !== 'waiting') {
      addTaxInvoice({
        transactionId: transaction.id,
        itemName: form.itemName,
        receiptNo: form.receiptNo,
        amount: newAmt,
        dueDate: form.taxDueDate || null,
        createdAt: new Date().toISOString(),
      })
      addLog(buildLogEntry({
        activityType: 'CREATE_TAX_INVOICE',
        description: `สร้างการ์ดรอใบกำกับภาษี: "${form.itemName}" ${newAmt.toLocaleString()} บาท`,
        newValue: { transactionId: transaction.id, itemName: form.itemName },
      }))
    } else if (oldTax === 'waiting' && newTax !== 'waiting') {
      deleteTaxInvoiceByTxId(transaction.id)
      addLog(buildLogEntry({
        activityType: 'DELETE_TAX_INVOICE',
        description: `ยกเลิกการรอใบกำกับภาษี: "${form.itemName}"`,
        oldValue: { transactionId: transaction.id, itemName: transaction.itemName },
      }))
    } else if (oldTax === 'waiting' && newTax === 'waiting') {
      syncTaxInvoiceByTxId(transaction.id, {
        itemName: form.itemName,
        receiptNo: form.receiptNo,
        amount: newAmt,
        dueDate: form.taxDueDate || null,
      })
    }

    addLog(buildLogEntry({
      activityType: form.type === 'income' ? 'EDIT_INCOME' : 'EDIT_EXPENSE',
      description: `แก้ไขรายการ "${form.itemName}" ${oldAmt.toLocaleString()} → ${newAmt.toLocaleString()} บาท (${transaction.method} → ${form.method})${walletDesc.length ? ' · ' + walletDesc.join(', ') : ''}`,
      oldValue: transaction,
      newValue: { ...form, amount: newAmt },
      walletEffect: walletAffected(form.method) ? {
        target: form.method,
        delta: form.type === 'income' ? newAmt : -newAmt,
      } : null,
    }))

    setConfirm(false)
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div className={`px-5 py-4 border-b flex items-center justify-between flex-shrink-0 ${form.type === 'income' ? 'bg-emerald-50' : 'bg-red-50'}`}>
            <h3 className="font-semibold text-base">
              แก้ไขรายการ{form.type === 'income' ? 'รายรับ' : 'รายจ่าย'}
              <span className="ml-2 text-xs font-normal text-gray-500">(การแก้ไขจะปรับยอดกระเป๋าอัตโนมัติ)</span>
            </h3>
            <button className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onClose}>×</button>
          </div>

          {/* Linked records banner */}
          {(linkedPending || linkedTax) && (
            <div className="px-5 pt-3 flex flex-col gap-1.5 flex-shrink-0">
              {linkedPending && (
                <div className="text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-3 py-1.5">
                  ⚠️ มีบิลค้างชำระที่เชื่อมอยู่ — {linkedPending.amount.toLocaleString()} บาท (ยังไม่ชำระ)
                </div>
              )}
              {linkedTax && (
                <div className="text-xs bg-orange-50 border border-orange-200 text-orange-700 rounded-lg px-3 py-1.5">
                  📋 มีใบกำกับภาษีที่รอรับอยู่
                </div>
              )}
            </div>
          )}

          {/* Body */}
          <div className="p-5 space-y-3 overflow-y-auto flex-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">วันที่</label>
                <input type="date" className="input" value={form.date} onChange={(e) => set('date', e.target.value)} />
              </div>
              <div>
                <label className="label">จำนวนเงิน (บาท)</label>
                <input type="number" className="input text-right" min="0" value={form.amount} onChange={(e) => set('amount', e.target.value)} />
              </div>
            </div>

            <div>
              <label className="label">รายการ</label>
              <input className="input" value={form.itemName ?? ''} onChange={(e) => set('itemName', e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">วิธีชำระ</label>
                <select className="input" value={form.method ?? 'cash'} onChange={(e) => set('method', e.target.value)}>
                  {form.type === 'income' ? (
                    <>
                      <option value="cash">💵 เงินสด</option>
                      <option value="transfer">🏦 เงินโอน</option>
                      <option value="other">อื่นๆ</option>
                    </>
                  ) : (
                    <>
                      <option value="cash">💵 เงินสด</option>
                      <option value="transfer">🏦 เงินโอน</option>
                      <option value="pending">⏳ ค้างชำระ</option>
                    </>
                  )}
                </select>
              </div>
              {form.type === 'expense' && (
                <div>
                  <label className="label">หมวดหมู่</label>
                  <select className="input" value={form.category ?? ''} onChange={(e) => set('category', e.target.value)}>
                    <option value="">ไม่ระบุ</option>
                    {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              {form.type === 'income' && form.method === 'other' && (
                <div>
                  <label className="label">ประเภทรายรับอื่นๆ</label>
                  <input className="input" value={form.otherIncomeType ?? ''} onChange={(e) => set('otherIncomeType', e.target.value)} />
                </div>
              )}
            </div>

            {form.type === 'expense' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">ผู้ขาย/ร้านค้า</label>
                    <input className="input" value={form.vendor ?? ''} onChange={(e) => set('vendor', e.target.value)} />
                  </div>
                  <div>
                    <label className="label">เลขที่ใบเสร็จ</label>
                    <input className="input" value={form.receiptNo ?? ''} onChange={(e) => set('receiptNo', e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">ใบกำกับภาษี</label>
                    <select className="input" value={form.taxStatus ?? 'none'} onChange={(e) => set('taxStatus', e.target.value)}>
                      <option value="none">ไม่ต้องการ</option>
                      <option value="received">มีใบกำกับภาษี</option>
                      <option value="waiting">รอใบกำกับภาษี</option>
                    </select>
                  </div>
                  {form.method === 'pending' && (
                    <div>
                      <label className="label">วันครบกำหนดชำระ</label>
                      <input type="date" className="input" value={form.dueDate ?? ''} onChange={(e) => set('dueDate', e.target.value)} />
                    </div>
                  )}
                </div>
                {form.taxStatus === 'waiting' && (
                  <div>
                    <label className="label">วันที่คาดว่าจะได้รับใบกำกับภาษี</label>
                    <input type="date" className="input" value={form.taxDueDate ?? ''} onChange={(e) => set('taxDueDate', e.target.value)} />
                  </div>
                )}
              </>
            )}

            <div>
              <label className="label">หมายเหตุ</label>
              <input className="input" value={form.note ?? ''} onChange={(e) => set('note', e.target.value)} />
            </div>
            {form.type === 'income' && (
              <div>
                <label className="label">รายละเอียด</label>
                <textarea className="input resize-none" rows={2} value={form.detail ?? ''} onChange={(e) => set('detail', e.target.value)} />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t bg-gray-50 flex gap-2 justify-end flex-shrink-0">
            <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
            <button className="btn btn-primary" onClick={() => setConfirm(true)}>ยืนยันการแก้ไข</button>
          </div>
        </div>
      </div>

      <ConfirmPopup
        open={confirm}
        title="ยืนยันการแก้ไขรายการ"
        message={`แก้ไขรายการ "${form.itemName}"\nจาก ${Number(transaction.amount).toLocaleString()} บาท → ${Number(form.amount).toLocaleString()} บาท\nระบบจะปรับยอดกระเป๋าเงินอัตโนมัติ`}
        onConfirm={handleConfirm}
        onCancel={() => setConfirm(false)}
        confirmLabel="ยืนยันแก้ไข"
      />
    </>
  )
}
