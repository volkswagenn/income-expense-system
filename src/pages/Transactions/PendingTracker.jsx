import { useState } from 'react'
import { format, differenceInDays, parseISO } from 'date-fns'
import { th } from 'date-fns/locale'
import usePendingStore from '../../store/usePendingStore'
import useTransactionStore from '../../store/useTransactionStore'
import useLogStore from '../../store/useLogStore'
import useAppStore from '../../store/useAppStore'
import EditTransactionPopup from '../../components/shared/EditTransactionPopup'
import StatusBadge from '../../components/shared/StatusBadge'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import PayPendingDatePopup from '../../components/shared/PayPendingDatePopup'
import ReceiveIncomeDatePopup from '../../components/shared/ReceiveIncomeDatePopup'
import FileUploadPopup from '../../components/shared/FileUploadPopup'
import { willGoNegative, deductWallet, addToWallet } from '../../lib/walletEngine'
import { buildLogEntry } from '../../lib/logBuilder'

function dueSoonDays(dueDate) {
  if (!dueDate) return null
  try { return differenceInDays(parseISO(dueDate), new Date()) } catch { return null }
}

function PendingItem({ item, notifyDays, onPay, onDelete, onEdit }) {
  const diff = dueSoonDays(item.dueDate)
  const isOverdue = diff !== null && diff < 0
  const isDueSoon = diff !== null && diff >= 0 && diff <= notifyDays

  const alertBg = isOverdue ? 'bg-red-100 border-red-400' : isDueSoon ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-200'
  const alertText = isOverdue ? 'text-red-800' : isDueSoon ? 'text-red-700' : 'text-amber-800'

  return (
    <div className={`border rounded-xl p-4 space-y-2 ${alertBg}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className={`font-semibold text-sm ${alertText}`}>{item.description ?? 'ค้างชำระ'}</p>
          {item.createdAt && (
            <p className="text-xs text-gray-500">
              สร้างเมื่อ: {format(new Date(item.createdAt), 'd MMM yyyy HH:mm', { locale: th })}
            </p>
          )}
          <p className="text-xs text-gray-600">
            ครบกำหนด: {item.dueDate ? format(parseISO(item.dueDate), 'd MMMM yyyy', { locale: th }) : '—'}
            {isOverdue && <span className="ml-2 text-red-600 font-semibold">เกินกำหนด {Math.abs(diff)} วัน!</span>}
            {isDueSoon && !isOverdue && <span className="ml-2 text-red-500 font-semibold">อีก {diff} วัน</span>}
          </p>
          <p className={`text-lg font-bold mt-1 ${alertText}`}>{item.amount.toLocaleString()} บาท</p>
        </div>
        <StatusBadge status="pending" label="รอจ่ายเงิน" />
      </div>
      <div className="flex gap-2">
        <button className="btn btn-success text-xs flex-1" onClick={() => onPay(item, 'cash')}>💵 จ่ายเงินสด</button>
        <button className="btn btn-primary text-xs flex-1" onClick={() => onPay(item, 'transfer')}>🏦 จ่ายเงินโอน</button>
        {onEdit && item.transactionId && (
          <button className="btn btn-secondary text-xs px-2" onClick={() => onEdit(item)} title="แก้ไขรายการ">✏️</button>
        )}
        <button className="btn btn-ghost text-xs px-2 text-red-400" onClick={() => onDelete(item.id)}>ลบ</button>
      </div>
    </div>
  )
}

function PendingIncomeItem({ item, onReceive, onDelete }) {
  const dateModeBadge = item.recordDateMode === 'bill'
    ? <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">บันทึกวันที่เปิดบิล</span>
    : <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">บันทึกวันที่รับเงิน</span>

  return (
    <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm text-emerald-800">{item.description ?? 'รอรับเงิน'}</p>
            {dateModeBadge}
          </div>
          {item.note && <p className="text-xs text-gray-500">{item.note}</p>}
          <p className="text-xs text-gray-500">
            สร้างเมื่อ: {format(new Date(item.createdAt), 'd MMM yyyy HH:mm', { locale: th })}
          </p>
          <p className="text-lg font-bold text-emerald-700">{item.amount.toLocaleString()} บาท</p>
        </div>
        <StatusBadge status="pending" />
      </div>
      <div className="flex gap-2">
        <button className="btn btn-success text-xs flex-1" onClick={() => onReceive(item, 'cash')}>💵 รับเงินสด</button>
        <button className="btn btn-primary text-xs flex-1" onClick={() => onReceive(item, 'transfer')}>🏦 รับเงินโอน</button>
        <button className="btn btn-ghost text-xs px-2 text-red-400" onClick={() => onDelete(item.id)}>ลบ</button>
      </div>
    </div>
  )
}

export default function PendingTracker() {
  const {
    pendingPayments, taxInvoices, pendingIncomes,
    payPending, receiveTaxInvoice, deletePending, deleteTaxInvoice,
    receivePendingIncome, deletePendingIncome,
  } = usePendingStore()
  const { addTransaction, updateTransaction, transactions } = useTransactionStore()
  const { addLog } = useLogStore()
  const { notifyDaysBefore, setNotifyDaysBefore } = useAppStore()

  const [tab, setTab] = useState('payment')
  const [payConfirm, setPayConfirm] = useState(null)
  const [negConfirm, setNegConfirm] = useState(null)
  const [taxUpload, setTaxUpload] = useState(null)
  const [receiveConfirm, setReceiveConfirm] = useState(null)
  const [deletePendingId, setDeletePendingId] = useState(null)
  const [deletePendingIncomeId, setDeletePendingIncomeId] = useState(null)
  const [deleteTaxId, setDeleteTaxId] = useState(null)
  const [settingOpen, setSettingOpen] = useState(false)
  const [notifyInput, setNotifyInput] = useState(String(notifyDaysBefore))
  const [editingTx, setEditingTx] = useState(null)

  const unpaid = pendingPayments.filter((p) => p.status === 'pending')
  const paid = pendingPayments.filter((p) => p.status === 'paid')
  const taxWaiting = taxInvoices.filter((t) => t.status === 'waiting')
  const taxReceived = taxInvoices.filter((t) => t.status === 'received')
  const pendingIncomeUnpaid = (pendingIncomes ?? []).filter((p) => p.status === 'pending')
  const pendingIncomeReceived = (pendingIncomes ?? []).filter((p) => p.status === 'received')

  const requestPay = (item, method) => {
    // เช็คยอดติดลบกับบัญชีที่ผูกไว้ตอนตั้งค่า
    if (willGoNegative(method, item.amount, item.defaultTransferAccountId)) setNegConfirm({ item, method })
    else setPayConfirm({ item, method })
  }

  const executePay = (item, method, paidDate, accountId = null) => {
    const tx = addTransaction({
      date: paidDate,
      type: 'expense',
      amount: item.amount,
      method,
      ...(accountId ? { transferAccountId: accountId } : {}),
      category: item.category,
      itemName: item.itemName || item.description || 'ชำระค้างจ่าย',
      vendor: item.vendor,
      receiptNo: item.receiptNo,
      taxStatus: item.taxStatus || 'none',
      dueDate: null,
      note: item.note ?? '',
      ...(item.recurringEntryId ? { recurringEntryId: item.recurringEntryId } : {}),
    })
    deductWallet(method, item.amount, {
      activityType: 'PAY_PENDING',
      description: `ชำระค้างชำระ "${item.description}" ${item.amount.toLocaleString()} บาท (${method === 'cash' ? 'เงินสด' : 'เงินโอน'}) วันที่ ${paidDate}`,
      newValue: { pendingId: item.id, transactionId: tx.id, paidDate, transferAccountId: accountId },
    }, accountId)
    payPending(item.id, method, tx.id, accountId)
    if (item.transactionId && item.transactionId !== tx.id) {
      updateTransaction(item.transactionId, { method, transferAccountId: accountId })
    }
    setPayConfirm(null)
    setNegConfirm(null)
  }

  const executeReceive = (item, method, receivedDate, accountId = null) => {
    const tx = addTransaction({
      date: receivedDate,
      type: 'income',
      amount: item.amount,
      method,
      ...(accountId ? { transferAccountId: accountId } : {}),
      itemName: item.description ?? 'รายรับรอรับ',
      note: item.note ?? '',
      ...(item.otherIncomeType ? { otherIncomeType: item.otherIncomeType } : {}),
    })
    addToWallet(method, item.amount, {
      activityType: 'RECEIVE_INCOME',
      description: `รับเงิน "${item.description}" ${item.amount.toLocaleString()} บาท (${method === 'cash' ? 'เงินสด' : 'เงินโอน'}) วันที่ ${receivedDate}`,
      newValue: { pendingIncomeId: item.id, transactionId: tx.id, receivedDate, transferAccountId: accountId },
    }, accountId)
    receivePendingIncome(item.id, method, tx.id, accountId)
    setReceiveConfirm(null)
  }

  const handleEditPending = (item) => {
    const tx = transactions.find((t) => t.id === item.transactionId)
    if (tx) setEditingTx(tx)
  }

  const handleDelete = (id) => setDeletePendingId(id)
  const handleDeletePendingIncome = (id) => setDeletePendingIncomeId(id)

  const confirmReceiveTax = (savedPath) => {
    const item = taxUpload
    const paths = Array.isArray(savedPath) ? savedPath : (savedPath ? [savedPath] : [])
    const firstPath = paths[0] ?? null
    setTaxUpload(null)
    receiveTaxInvoice(item.id, firstPath)
    addLog(buildLogEntry({
      activityType: 'RECEIVE_TAX_INVOICE',
      description: `รับใบกำกับภาษี: "${item.itemName ?? 'ไม่ระบุ'}"${item.receiptNo ? ` เลขที่ ${item.receiptNo}` : ''}${item.amount ? ` ${item.amount.toLocaleString()} บาท` : ''}${firstPath ? ` (ไฟล์: ${firstPath.split(/[\\/]/).pop()}${paths.length > 1 ? ` +${paths.length - 1}` : ''})` : ''}`,
      newValue: { taxInvoiceId: item.id, itemName: item.itemName, receiptNo: item.receiptNo, filePath: firstPath, filePaths: paths },
    }))
  }

  const saveNotifySetting = () => {
    setNotifyDaysBefore(notifyInput)
    setSettingOpen(false)
  }

  return (
    <>
      <div className="space-y-4">
        {/* Sub-tabs */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex gap-2 flex-wrap">
            <button className={`btn text-sm ${tab === 'payment' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('payment')}>
              ค้างชำระ {unpaid.length > 0 && <span className="badge badge-red ml-1">{unpaid.length}</span>}
            </button>
            <button className={`btn text-sm ${tab === 'tax' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('tax')}>
              รอใบกำกับภาษี {taxWaiting.length > 0 && <span className="badge badge-amber ml-1">{taxWaiting.length}</span>}
            </button>
            <button className={`btn text-sm ${tab === 'income' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('income')}>
              รอรับเงิน {pendingIncomeUnpaid.length > 0 && <span className="badge badge-green ml-1">{pendingIncomeUnpaid.length}</span>}
            </button>
          </div>
          {tab === 'payment' && (
            <button className="text-xs text-gray-400 hover:text-gray-600" onClick={() => { setNotifyInput(String(notifyDaysBefore)); setSettingOpen((o) => !o) }}>
              ⚙️ แจ้งเตือนก่อน {notifyDaysBefore} วัน
            </button>
          )}
        </div>

        {/* Notify days setting */}
        {settingOpen && tab === 'payment' && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl border border-blue-100">
            <span className="text-sm text-gray-700">แจ้งเตือนก่อนครบกำหนด</span>
            <input
              className="input w-16 text-center py-1 text-sm"
              type="number" min="0" max="90"
              value={notifyInput}
              onChange={(e) => setNotifyInput(e.target.value)}
            />
            <span className="text-sm text-gray-700">วัน</span>
            <button className="btn btn-primary text-xs py-1 px-3" onClick={saveNotifySetting}>บันทึก</button>
            <button className="btn btn-secondary text-xs py-1 px-2" onClick={() => setSettingOpen(false)}>ยกเลิก</button>
          </div>
        )}

        {/* Pending payments tab */}
        {tab === 'payment' && (
          <div className="space-y-3">
            {unpaid.length === 0 ? (
              <p className="text-center text-gray-400 py-4 text-sm">ไม่มีรายการค้างชำระ</p>
            ) : (
              unpaid.map((item) => (
                <PendingItem
                  key={item.id}
                  item={item}
                  notifyDays={notifyDaysBefore}
                  onPay={requestPay}
                  onDelete={handleDelete}
                  onEdit={handleEditPending}
                />
              ))
            )}
            {paid.length > 0 && (
              <details className="cursor-pointer">
                <summary className="text-sm text-gray-500 hover:text-gray-700">ชำระแล้ว ({paid.length} รายการ)</summary>
                <div className="mt-2 space-y-2">
                  {paid.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm">
                      <div>
                        <span className="text-gray-700 font-medium">{item.description ?? 'ค้างชำระ'}</span>
                        {item.paidAt && (
                          <p className="text-xs text-gray-400">ชำระเมื่อ {format(new Date(item.paidAt), 'd MMM yyyy', { locale: th })} ({item.paidMethod === 'cash' ? 'เงินสด' : 'เงินโอน'})</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-800 font-medium">{item.amount.toLocaleString()} บาท</span>
                        <StatusBadge status="paid" />
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* Tax invoice tab */}
        {tab === 'tax' && (
          <div className="space-y-3">
            {taxWaiting.length === 0 ? (
              <p className="text-center text-gray-400 py-4 text-sm">ไม่มีรายการรอใบกำกับภาษี</p>
            ) : (
              taxWaiting.map((item) => (
                <div key={item.id} className="border border-orange-200 bg-orange-50 rounded-xl p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-800">{item.itemName ?? '(ไม่ระบุรายการ)'}</p>
                      {item.receiptNo && <p className="text-xs text-gray-600">เลขที่ใบเสร็จ: {item.receiptNo}</p>}
                      {item.amount && <p className="text-sm font-bold text-orange-700 mt-0.5">{item.amount.toLocaleString()} บาท</p>}
                      {item.dueDate && <p className="text-xs text-gray-500">คาดรับใบ: {format(parseISO(item.dueDate), 'd MMMM yyyy', { locale: th })}</p>}
                      {item.createdAt && <p className="text-xs text-gray-400">สร้างเมื่อ {format(new Date(item.createdAt), 'd MMM yyyy', { locale: th })}</p>}
                    </div>
                    <StatusBadge status="waiting" />
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-success text-xs flex-1" onClick={() => setTaxUpload(item)}>✓ ได้รับใบกำกับภาษีแล้ว</button>
                    <button className="btn btn-ghost text-xs px-2 text-red-400"
                      onClick={() => setDeleteTaxId(item.id)}>ลบ</button>
                  </div>
                </div>
              ))
            )}
            {taxReceived.length > 0 && (
              <p className="text-sm text-gray-400 text-center">ได้รับใบกำกับภาษีแล้ว {taxReceived.length} รายการ</p>
            )}
          </div>
        )}

        {/* Pending income tab */}
        {tab === 'income' && (
          <div className="space-y-3">
            {pendingIncomeUnpaid.length === 0 ? (
              <p className="text-center text-gray-400 py-4 text-sm">ไม่มีรายการรอรับเงิน</p>
            ) : (
              pendingIncomeUnpaid.map((item) => (
                <PendingIncomeItem
                  key={item.id}
                  item={item}
                  onReceive={(i, m) => setReceiveConfirm({ item: i, method: m })}
                  onDelete={handleDeletePendingIncome}
                />
              ))
            )}
            {pendingIncomeReceived.length > 0 && (
              <details className="cursor-pointer">
                <summary className="text-sm text-gray-500 hover:text-gray-700">รับเงินแล้ว ({pendingIncomeReceived.length} รายการ)</summary>
                <div className="mt-2 space-y-2">
                  {pendingIncomeReceived.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm">
                      <div>
                        <span className="text-gray-700 font-medium">{item.description ?? 'รอรับเงิน'}</span>
                        {item.receivedAt && (
                          <p className="text-xs text-gray-400">
                            รับเมื่อ {format(new Date(item.receivedAt), 'd MMM yyyy', { locale: th })} ({item.receivedMethod === 'cash' ? 'เงินสด' : 'เงินโอน'})
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-700 font-medium">{item.amount.toLocaleString()} บาท</span>
                        <StatusBadge status="paid" />
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      {/* Expense pay confirm */}
      <PayPendingDatePopup
        open={!!payConfirm}
        item={payConfirm?.item}
        method={payConfirm?.method}
        onConfirm={(paidDate, accountId) => executePay(payConfirm.item, payConfirm.method, paidDate, accountId)}
        onCancel={() => setPayConfirm(null)}
      />
      <PayPendingDatePopup
        open={!!negConfirm}
        item={negConfirm?.item}
        method={negConfirm?.method}
        danger
        onConfirm={(paidDate, accountId) => executePay(negConfirm.item, negConfirm.method, paidDate, accountId)}
        onCancel={() => setNegConfirm(null)}
      />

      {/* Pending income receive confirm */}
      <ReceiveIncomeDatePopup
        open={!!receiveConfirm}
        item={receiveConfirm?.item}
        method={receiveConfirm?.method}
        onConfirm={(receivedDate, accountId) => executeReceive(receiveConfirm.item, receiveConfirm.method, receivedDate, accountId)}
        onCancel={() => setReceiveConfirm(null)}
      />

      <ConfirmPopup
        open={!!deletePendingId}
        title="ลบรายการค้างชำระ"
        message="ลบรายการค้างชำระนี้?"
        onConfirm={() => { deletePending(deletePendingId); setDeletePendingId(null) }}
        onCancel={() => setDeletePendingId(null)}
        confirmLabel="ลบ"
        danger
      />
      <ConfirmPopup
        open={!!deletePendingIncomeId}
        title="ลบรายการรอรับเงิน"
        message="ลบรายการรอรับเงินนี้?"
        onConfirm={() => { deletePendingIncome(deletePendingIncomeId); setDeletePendingIncomeId(null) }}
        onCancel={() => setDeletePendingIncomeId(null)}
        confirmLabel="ลบ"
        danger
      />
      <ConfirmPopup
        open={!!deleteTaxId}
        title="ลบรายการใบกำกับภาษี"
        message="ลบรายการนี้?"
        onConfirm={() => { deleteTaxInvoice(deleteTaxId); setDeleteTaxId(null) }}
        onCancel={() => setDeleteTaxId(null)}
        confirmLabel="ลบ"
        danger
      />

      {/* Tax invoice file upload */}
      {taxUpload && (
        <FileUploadPopup
          title="อัปโหลดใบกำกับภาษี"
          description={`${taxUpload.itemName ?? ''}${taxUpload.receiptNo ? ` · เลขที่ ${taxUpload.receiptNo}` : ''}${taxUpload.amount ? ` · ${taxUpload.amount.toLocaleString()} บาท` : ''}`}
          createdAt={taxUpload.createdAt}
          filenamePrefix="taxinvoice"
          folderBase="taxinvoices"
          onConfirm={confirmReceiveTax}
          onCancel={() => setTaxUpload(null)}
        />
      )}

      {/* Edit transaction popup from pending card */}
      {editingTx && (
        <EditTransactionPopup transaction={editingTx} onClose={() => setEditingTx(null)} />
      )}
    </>
  )
}
