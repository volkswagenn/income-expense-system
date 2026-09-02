import { useState } from 'react'
import { format } from 'date-fns'
import TransferAccountPicker from './TransferAccountPicker'
import DateTimeField, { toTimestamp } from './DateTimeField'
import useWalletStore from '../../store/useWalletStore'

export default function ReceiveIncomeDatePopup({ open, item, method, onConfirm, onCancel }) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [receivedDate, setReceivedDate] = useState(today)
  const [receivedTime, setReceivedTime] = useState('')   // ว่าง = เที่ยงตรงของวันที่เลือก
  // ใช้บัญชีที่ผูกไว้ตอนเปิดบิลรอรับเงินเป็นค่าเริ่มต้น
  const [accountId, setAccountId] = useState(item?.defaultTransferAccountId ?? '')
  const resolveAccount = useWalletStore((s) => s.resolveTransferAccountId)

  if (!open || !item) return null

  const methodLabel = method === 'cash' ? 'เงินสด' : 'เงินโอน'
  const needsAccount = method === 'transfer'
  const resolvedAccountId = needsAccount ? resolveAccount(accountId) : null
  const isToday = receivedDate === today
  const billDate = item.date
  const isBillDate = billDate && receivedDate === billDate

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-base text-gray-900">ยืนยันการรับเงิน</h3>
            <p className="text-sm text-gray-500 truncate max-w-[260px]">{item.description}</p>
          </div>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onCancel}>×</button>
        </div>

        <div className="p-5 space-y-4 text-sm">
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 space-y-1">
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">ยอดรับ</span>
              <span className="font-bold text-gray-900">{item.amount?.toLocaleString('th-TH')} บาท</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">รับเข้า</span>
              <span className="font-medium text-gray-800">{methodLabel}</span>
            </div>
          </div>

          {needsAccount && (
            <TransferAccountPicker value={accountId} onChange={setAccountId} label="เข้าบัญชี" />
          )}

          <div>
            <DateTimeField
              label={isToday ? "วันที่ได้รับเงิน (วันนี้)" : "วันที่ได้รับเงิน"}
              date={receivedDate}
              time={receivedTime}
              onChange={({ date, time }) => { setReceivedDate(date); setReceivedTime(time) }}
            />
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                type="button"
                className={`btn text-xs py-1.5 ${isToday ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setReceivedDate(today)}
              >
                วันนี้
              </button>
              {billDate && (
                <button
                  type="button"
                  className={`btn text-xs py-1.5 ${isBillDate ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setReceivedDate(billDate)}
                >
                  รับเงินวันที่เปิดบิล
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button className="btn btn-secondary flex-1" onClick={onCancel}>ยกเลิก</button>
          <button
            className="btn btn-success flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => onConfirm(receivedDate, resolvedAccountId, toTimestamp(receivedDate, receivedTime))}
            disabled={!receivedDate || (needsAccount && !resolvedAccountId)}
          >
            ยืนยันรับเงิน
          </button>
        </div>
      </div>
    </div>
  )
}
