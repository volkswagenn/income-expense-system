import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { format, differenceInDays, parseISO } from 'date-fns'
import { th } from 'date-fns/locale'
import usePendingStore from '../../store/usePendingStore'
import useTransactionStore from '../../store/useTransactionStore'
import useAppStore from '../../store/useAppStore'
import StatusBadge from '../../components/shared/StatusBadge'
import PayPendingDatePopup from '../../components/shared/PayPendingDatePopup'
import { AttachmentButton, getAttachments, getPrimaryAttachment } from '../../components/shared/AttachmentViewer'
import { willGoNegative, deductWallet } from '../../lib/walletEngine'

function getAlertClass(dueDate, notifyDays) {
  if (!dueDate) return { bg: 'bg-gray-50 border-gray-100', text: 'text-gray-800' }
  try {
    const diff = differenceInDays(parseISO(dueDate), new Date())
    if (diff < 0) return { bg: 'bg-red-100 border-red-400', text: 'text-red-800', label: `เกินกำหนด ${Math.abs(diff)} วัน` }
    if (diff <= notifyDays) return { bg: 'bg-red-50 border-red-300', text: 'text-red-700', label: `อีก ${diff} วัน` }
  } catch { /* pass */ }
  return { bg: 'bg-gray-50 border-gray-100', text: 'text-gray-800' }
}

export default function PendingPaymentSummary({ fullPage = false }) {
  const { pendingPayments, payPending, getPendingUnpaid, getPendingTotal } = usePendingStore()
  const { addTransaction } = useTransactionStore()
  const { notifyDaysBefore } = useAppStore()
  const navigate = useNavigate()
  const [payConfirm, setPayConfirm] = useState(null)  // { id, method, amount, description }
  const [negConfirm, setNegConfirm] = useState(null)

  const unpaid = getPendingUnpaid()
  const total = getPendingTotal()
  const list = fullPage ? pendingPayments : unpaid.slice(0, 5)

  const requestPay = (id, method) => {
    const item = pendingPayments.find((p) => p.id === id)
    if (!item) return
    const payload = { id, method, amount: item.amount, description: item.description }
    if (willGoNegative(method, item.amount)) {
      setNegConfirm(payload)
    } else {
      setPayConfirm(payload)
    }
  }

  const executePay = (id, method, amount, description, paidDate) => {
    const item = pendingPayments.find((p) => p.id === id)
    const tx = addTransaction({
      date: paidDate,
      type: 'expense',
      amount,
      method,
      category: item?.category,
      itemName: item?.itemName || description || 'ชำระค้างจ่าย',
      vendor: item?.vendor,
      receiptNo: item?.receiptNo,
      taxStatus: item?.taxStatus || 'none',
      dueDate: null,
      note: item?.note ?? '',
      ...(item?.recurringEntryId ? { recurringEntryId: item.recurringEntryId } : {}),
      ...(item?.attachments?.length ? { attachments: item.attachments } : {}),
      ...(item?.documentPath ? { documentPath: item.documentPath, documentType: item.documentType, documentLabel: item.documentLabel } : {}),
    })
    deductWallet(method, amount, {
      activityType: 'PAY_PENDING',
      description: `ชำระค้างชำระ "${description}" ${amount.toLocaleString()} บาท (${method === 'cash' ? 'เงินสด' : 'เงินโอน'}) วันที่ ${paidDate}`,
      newValue: { pendingId: id, transactionId: tx.id, paidDate },
    })
    payPending(id, method, tx.id)
    setPayConfirm(null)
    setNegConfirm(null)
  }

  if (!fullPage && unpaid.length === 0) {
    return <div className="text-center py-4 text-gray-400 text-sm">ไม่มีรายการค้างชำระ</div>
  }

  return (
    <>
      {!fullPage && (
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-gray-500">ค้างชำระทั้งหมด</p>
            <p className="text-xl font-bold text-amber-600">
              {total.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
            </p>
          </div>
          {unpaid.length > 5 && (
            <button className="btn btn-secondary text-xs" onClick={() => navigate('/pending-tasks')}>
              ดูทั้งหมด ({unpaid.length})
            </button>
          )}
        </div>
      )}

      <div className="space-y-2">
        {list.map((item) => {
          const alert = getAlertClass(item.dueDate, notifyDaysBefore)
          return (
            <div key={item.id} className={`rounded-xl border p-3 gap-2 ${alert.bg}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${alert.text}`}>{item.description ?? 'ค้างชำระ'}</p>
                  <p className="text-xs text-gray-500">
                    วันที่สร้าง: {item.createdAt ? format(new Date(item.createdAt), 'd MMM yyyy HH:mm', { locale: th }) : '—'}
                  </p>
                  <p className="text-xs text-gray-500">
                    วันที่เปิดบิล: {
                      item.openDate
                        ? format(new Date(item.openDate + 'T00:00:00'), 'd MMM yyyy', { locale: th })
                        : item.createdAt
                          ? format(new Date(item.createdAt), 'd MMM yyyy', { locale: th })
                          : '—'
                    }
                  </p>
                  <p className="text-xs text-gray-500">
                    ครบกำหนด: {item.dueDate ? format(parseISO(item.dueDate), 'd MMM yyyy', { locale: th }) : '—'}
                    {alert.label && <span className={`ml-2 font-semibold ${alert.text}`}>{alert.label}</span>}
                  </p>
                  <p className={`text-sm font-bold mt-0.5 ${alert.text}`}>{item.amount.toLocaleString()} บาท</p>
                  {getPrimaryAttachment(item) && (
                    <div className="mt-2">
                      <AttachmentButton attachment={getPrimaryAttachment(item)} attachments={getAttachments(item)} compact />
                    </div>
                  )}
                </div>
                <StatusBadge status={item.status} label={item.status === 'pending' ? 'รอจ่ายเงิน' : undefined} />
              </div>
              {item.status === 'pending' && (
                <div className="flex gap-1">
                  <button className="btn btn-success text-xs py-1 px-2 flex-1" onClick={() => requestPay(item.id, 'cash')}>💵 จ่ายสด</button>
                  <button className="btn btn-primary text-xs py-1 px-2 flex-1" onClick={() => requestPay(item.id, 'transfer')}>🏦 โอน</button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <PayPendingDatePopup
        open={!!payConfirm}
        item={payConfirm}
        method={payConfirm?.method}
        onConfirm={(paidDate) => executePay(payConfirm.id, payConfirm.method, payConfirm.amount, payConfirm.description, paidDate)}
        onCancel={() => setPayConfirm(null)}
      />

      <PayPendingDatePopup
        open={!!negConfirm}
        item={negConfirm}
        method={negConfirm?.method}
        danger
        onConfirm={(paidDate) => executePay(negConfirm.id, negConfirm.method, negConfirm.amount, negConfirm.description, paidDate)}
        onCancel={() => setNegConfirm(null)}
      />
    </>
  )
}
