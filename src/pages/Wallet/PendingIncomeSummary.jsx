import { useState } from 'react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import usePendingStore from '../../store/usePendingStore'
import useTransactionStore from '../../store/useTransactionStore'
import StatusBadge from '../../components/shared/StatusBadge'
import ReceiveIncomeDatePopup from '../../components/shared/ReceiveIncomeDatePopup'
import { AttachmentButton, getAttachments, getPrimaryAttachment } from '../../components/shared/AttachmentViewer'
import { addToWallet } from '../../lib/walletEngine'

export default function PendingIncomeSummary({ fullPage = false }) {
  const { pendingIncomes = [], receivePendingIncome, getPendingIncomeTotal } = usePendingStore()
  const { addTransaction } = useTransactionStore()
  const [receiveConfirm, setReceiveConfirm] = useState(null) // { item, method }

  const unpaid = pendingIncomes.filter((p) => p.status === 'pending')
  const total = getPendingIncomeTotal()
  const list = fullPage ? unpaid : unpaid.slice(0, 5)

  const executeReceive = (item, method, receivedDate) => {
    const tx = addTransaction({
      date: receivedDate,
      type: 'income',
      amount: item.amount,
      method,
      itemName: item.description ?? 'รายรับรอรับ',
      note: item.note ?? '',
      ...(item.otherIncomeType ? { otherIncomeType: item.otherIncomeType } : {}),
      ...(item.attachments?.length ? { attachments: item.attachments } : {}),
      ...(item.documentPath ? { documentPath: item.documentPath, documentType: item.documentType, documentLabel: item.documentLabel } : {}),
    })
    addToWallet(method, item.amount, {
      activityType: 'RECEIVE_INCOME',
      description: `รับเงิน "${item.description}" ${item.amount.toLocaleString()} บาท (${method === 'cash' ? 'เงินสด' : 'เงินโอน'}) วันที่ ${receivedDate}`,
      newValue: { pendingIncomeId: item.id, transactionId: tx.id, receivedDate },
    })
    receivePendingIncome(item.id, method, tx.id)
    setReceiveConfirm(null)
  }

  if (!fullPage && unpaid.length === 0) {
    return <div className="text-center py-4 text-gray-400 text-sm">ไม่มีรายการรอรับเงิน</div>
  }

  return (
    <>
      {!fullPage && (
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-gray-500">รอรับเงินทั้งหมด</p>
            <p className="text-xl font-bold text-emerald-600">
              {total.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {list.map((item) => (
          <div key={item.id} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-emerald-800 truncate">{item.description ?? 'รอรับเงิน'}</p>
                <p className="text-xs text-gray-500">
                  วันที่สร้าง: {item.createdAt ? format(new Date(item.createdAt), 'd MMM yyyy HH:mm', { locale: th }) : '—'}
                </p>
                <p className="text-xs text-gray-500">
                  วันที่เปิดบิล: {item.date ? format(new Date(item.date + 'T00:00:00'), 'd MMM yyyy', { locale: th }) : '—'}
                </p>
                {item.note && <p className="text-xs text-gray-500 truncate">รายละเอียด: {item.note}</p>}
                <p className="text-sm font-bold text-emerald-700 mt-0.5">{item.amount.toLocaleString()} บาท</p>
                {getPrimaryAttachment(item) && (
                  <div className="mt-2">
                    <AttachmentButton attachment={getPrimaryAttachment(item)} attachments={getAttachments(item)} compact />
                  </div>
                )}
              </div>
              <StatusBadge status="pending" />
            </div>
            <div className="flex gap-1">
              <button className="btn btn-success text-xs py-1 px-2 flex-1" onClick={() => setReceiveConfirm({ item, method: 'cash' })}>
                💵 รับสด
              </button>
              <button className="btn btn-primary text-xs py-1 px-2 flex-1" onClick={() => setReceiveConfirm({ item, method: 'transfer' })}>
                🏦 รับโอน
              </button>
            </div>
          </div>
        ))}

        {!fullPage && unpaid.length > 5 && (
          <p className="text-xs text-gray-400 text-center">และอีก {unpaid.length - 5} รายการ — ดูทั้งหมดที่แท็บ "รอรับเงิน"</p>
        )}
      </div>

      <ReceiveIncomeDatePopup
        open={!!receiveConfirm}
        item={receiveConfirm?.item}
        method={receiveConfirm?.method}
        onConfirm={(receivedDate) => executeReceive(receiveConfirm.item, receiveConfirm.method, receivedDate)}
        onCancel={() => setReceiveConfirm(null)}
      />
    </>
  )
}
