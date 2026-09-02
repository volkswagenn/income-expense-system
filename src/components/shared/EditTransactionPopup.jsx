import { useState } from 'react'
import useTransactionStore from '../../store/useTransactionStore'
import useWalletStore from '../../store/useWalletStore'
import useCreditCardStore from '../../store/useCreditCardStore'
import usePendingStore from '../../store/usePendingStore'
import useLogStore from '../../store/useLogStore'
import { walletTarget } from '../../lib/api/transactions'
import { methodLabel } from '../../lib/walletEngine'
import { buildLogEntry } from '../../lib/logBuilder'
import ConfirmPopup from './ConfirmPopup'
import CategorySelect from './CategorySelect'
import TransferAccountPicker from './TransferAccountPicker'
import CreditCardPicker from './CreditCardPicker'
import DatePicker from './DatePicker'

/** วิธีชำระที่ขยับยอดจริง — 'pending' และ 'other' ไม่แตะอะไรเลย */
function walletAffected(method) {
  return method === 'cash' || method === 'transfer' || method === 'card'
}

export default function EditTransactionPopup({ transaction, onClose }) {
  const { editTransaction } = useTransactionStore()
  const {
    pendingPayments, taxInvoices,
    addPending, deletePendingByTxId, syncPendingByTxId,
    addTaxInvoice, deleteTaxInvoiceByTxId, syncTaxInvoiceByTxId,
  } = usePendingStore()
  const { addLog } = useLogStore()
  const [form, setForm] = useState({ ...transaction })
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  // Linked records for banner
  const linkedPending = pendingPayments.find(
    (p) => p.transactionId === transaction.id && p.status === 'pending'
  )
  const linkedTax = taxInvoices.find(
    (t) => t.transactionId === transaction.id && t.status === 'waiting'
  )

  /**
   * แก้ไขรายการ — ย้อนเงินของยอด/วิธีเดิม + ตัด/เพิ่มเงินของยอดใหม่ + แก้แถว + log
   * จบใน RPC เดียว (edit_transaction) แล้วค่อยซิงก์รายการค้าง/ใบกำกับที่ผูกอยู่
   *
   * ของเดิมยิง adjust_* 2–4 ตัวแยกกันโดยไม่ await แล้วค่อย update — เน็ตหลุดคั่นกลาง
   * = ยอดเพี้ยนครึ่งทาง และ addTransfer คืน false เงียบๆ เมื่อหาบัญชีไม่เจอ
   */
  const handleConfirm = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const ws = useWalletStore.getState()
      const oldAmt = Number(transaction.amount)
      const newAmt = Number(form.amount)
      if (!(newAmt > 0)) throw new Error('กรุณาใส่จำนวนเงินให้ถูกต้อง')

      // เงินโอนต้องถอนคืนบัญชีเดิม แล้วลงบัญชีใหม่ที่ผู้ใช้เลือก
      const oldAccountId = transaction.transferAccountId ?? null
      const newAccountId = form.method === 'transfer' ? ws.resolveTransferAccountId(form.transferAccountId) : null
      if (form.method === 'transfer' && !newAccountId) throw new Error('กรุณาเลือกบัญชีเงินโอน')

      // บัตรเครดิตทำงานแบบเดียวกัน คือคืนหนี้ให้ใบเดิม แล้วไปเพิ่มหนี้ที่ใบใหม่
      const cs = useCreditCardStore.getState()
      const oldCardId = transaction.cardId ?? null
      const newCardId = form.method === 'card' ? cs.resolveCardId(form.cardId) : null
      if (form.method === 'card' && !newCardId) throw new Error('กรุณาเลือกบัตรเครดิต')

      const sign = (type) => (type === 'income' ? 1 : -1)
      // 'pending' และ 'other' ไม่เคยแตะกระเป๋าเงิน → walletTarget คืน null
      const oldTarget = walletAffected(transaction.method)
        ? walletTarget(transaction.method, { transferAccountId: oldAccountId, cardId: oldCardId }) : null
      const newTarget = walletAffected(form.method)
        ? walletTarget(form.method, { transferAccountId: newAccountId, cardId: newCardId }) : null
      const reverse = oldTarget ? { target: oldTarget, delta: -sign(transaction.type) * oldAmt } : null
      const apply = newTarget ? { target: newTarget, delta: sign(form.type) * newAmt } : null

      const walletDesc = []
      if (transaction.method !== form.method || oldAmt !== newAmt
          || oldAccountId !== newAccountId || oldCardId !== newCardId) {
        if (reverse) walletDesc.push(`คืน ${oldAmt.toLocaleString()} → ${methodLabel(transaction.method)}`)
        if (apply) walletDesc.push(`หัก ${newAmt.toLocaleString()} จาก${methodLabel(form.method)}`)
      }

      await editTransaction(transaction.id, {
        date: form.date,
        amount: newAmt,
        method: form.method,
        itemName: form.itemName,
        category: form.category || null,
        vendor: form.vendor ?? null,
        receiptNo: form.receiptNo ?? null,
        taxStatus: form.taxStatus ?? null,
        dueDate: form.dueDate || null,
        taxDueDate: form.taxDueDate || null,
        note: form.note ?? null,
        detail: form.detail ?? null,
        otherIncomeType: form.otherIncomeType ?? null,
        transferAccountId: newAccountId,
        cardId: newCardId,
      }, {
        reverse,
        apply,
        log: buildLogEntry({
          activityType: form.type === 'income' ? 'EDIT_INCOME' : 'EDIT_EXPENSE',
          description: `แก้ไขรายการ "${form.itemName}" ${oldAmt.toLocaleString()} → ${newAmt.toLocaleString()} บาท (${transaction.method} → ${form.method})${walletDesc.length ? ' · ' + walletDesc.join(', ') : ''}`,
          oldValue: transaction,
          newValue: { ...form, amount: newAmt, transferAccountId: newAccountId, cardId: newCardId, transactionId: transaction.id },
          walletEffect: apply ? { target: form.method, delta: apply.delta, transferAccountId: newAccountId, cardId: newCardId } : null,
        }),
      })

      // ── Pending payment sync (4-case) ──
      const oldMethod = transaction.method
      const newMethod = form.method
      if (oldMethod === 'pending' && newMethod !== 'pending') {
        await deletePendingByTxId(transaction.id)
        addLog(buildLogEntry({
          activityType: 'DELETE_PENDING',
          description: `ยกเลิกบิลค้างชำระ: "${form.itemName}" (เปลี่ยนวิธีชำระเป็น${methodLabel(newMethod)})`,
          oldValue: { transactionId: transaction.id, itemName: transaction.itemName },
        }))
      } else if (oldMethod !== 'pending' && newMethod === 'pending') {
        await addPending({
          transactionId: transaction.id,
          amount: newAmt,
          dueDate: form.dueDate || null,
          description: form.itemName,
          itemName: form.itemName,
          openDate: form.date,
        })
        addLog(buildLogEntry({
          activityType: 'CREATE_PENDING',
          description: `สร้างบิลค้างชำระ: "${form.itemName}" ${newAmt.toLocaleString()} บาท`,
          newValue: { transactionId: transaction.id, amount: newAmt },
        }))
      } else if (oldMethod === 'pending' && newMethod === 'pending') {
        await syncPendingByTxId(transaction.id, {
          description: form.itemName,
          itemName: form.itemName,
          amount: newAmt,
          dueDate: form.dueDate || null,
        })
      }

      // ── Tax invoice sync (4-case) ──
      const oldTax = transaction.taxStatus
      const newTax = form.taxStatus
      if (newTax === 'waiting' && oldTax !== 'waiting') {
        await addTaxInvoice({
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
        await deleteTaxInvoiceByTxId(transaction.id)
        addLog(buildLogEntry({
          activityType: 'DELETE_TAX_INVOICE',
          description: `ยกเลิกการรอใบกำกับภาษี: "${form.itemName}"`,
          oldValue: { transactionId: transaction.id, itemName: transaction.itemName },
        }))
      } else if (oldTax === 'waiting' && newTax === 'waiting') {
        await syncTaxInvoiceByTxId(transaction.id, {
          itemName: form.itemName,
          receiptNo: form.receiptNo,
          amount: newAmt,
          dueDate: form.taxDueDate || null,
        })
      }

      // ยอดถูกฐานข้อมูลปรับแล้ว ดึงค่าจริงกลับมาแสดง
      // ดึงทั้งสองชุดเสมอ เพราะการแก้อาจย้ายเงินข้ามระหว่างกระเป๋ากับบัตร
      await Promise.all([ws.refresh(), cs.refresh()])
      setConfirm(false)
      onClose()
    } catch (err) {
      setConfirm(false)
      setError(err.message)
    } finally {
      setBusy(false)
    }
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
                <DatePicker value={form.date} onChange={(v) => set('date', v)} />
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
                      {/* รายรับที่เข้าบัตร = เงินคืน หรือเงินคืนสินค้า ทำให้หนี้ลดลง */}
                      <option value="card">💳 บัตรเครดิต</option>
                      <option value="other">อื่นๆ</option>
                    </>
                  ) : (
                    <>
                      <option value="cash">💵 เงินสด</option>
                      <option value="transfer">🏦 เงินโอน</option>
                      <option value="card">💳 บัตรเครดิต</option>
                      <option value="pending">⏳ ค้างชำระ</option>
                    </>
                  )}
                </select>
                {form.method === 'transfer' && (
                  <div className="mt-2">
                    <TransferAccountPicker
                      value={form.transferAccountId}
                      onChange={(v) => set('transferAccountId', v)}
                      label={form.type === 'income' ? 'เข้าบัญชี' : 'ตัดจากบัญชี'}
                    />
                  </div>
                )}
                {form.method === 'card' && (
                  <div className="mt-2">
                    <CreditCardPicker
                      value={form.cardId}
                      onChange={(v) => set('cardId', v)}
                      label={form.type === 'income' ? 'เงินคืนเข้าบัตร' : 'รูดบัตร'}
                    />
                  </div>
                )}
              </div>
              {(form.type === 'expense' || form.type === 'income') && (
                <div>
                  <label className="label">หมวดหมู่</label>
                  <CategorySelect
                    type={form.type}
                    value={form.category}
                    onChange={(v) => set('category', v)}
                    placeholder="ไม่ระบุ"
                  />
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
                      <DatePicker value={form.dueDate ?? ''} onChange={(v) => set('dueDate', v)} placeholder="ไม่ระบุ" />
                    </div>
                  )}
                </div>
                {form.taxStatus === 'waiting' && (
                  <div>
                    <label className="label">วันที่คาดว่าจะได้รับใบกำกับภาษี</label>
                    <DatePicker value={form.taxDueDate ?? ''} onChange={(v) => set('taxDueDate', v)} placeholder="ไม่ระบุ" />
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

          {/* ผลลัพธ์ที่ล้ม ต้องเห็นในป๊อปอัพ ไม่ใช่ปิดเงียบเหมือนสำเร็จ */}
          {error && (
            <p className="mx-5 mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex-shrink-0">
              แก้ไขไม่สำเร็จ — {error}
            </p>
          )}

          {/* Footer */}
          <div className="px-5 py-4 border-t bg-gray-50 flex gap-2 justify-end flex-shrink-0">
            <button className="btn btn-secondary" onClick={onClose} disabled={busy}>ยกเลิก</button>
            <button className="btn btn-primary" onClick={() => setConfirm(true)} disabled={busy}>
              {busy ? 'กำลังบันทึก…' : 'ยืนยันการแก้ไข'}
            </button>
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
