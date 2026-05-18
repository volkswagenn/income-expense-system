import { useState } from 'react'
import { format } from 'date-fns'

export default function ReceiveIncomeDatePopup({ open, item, method, onConfirm, onCancel }) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [receivedDate, setReceivedDate] = useState(today)

  if (!open || !item) return null

  const methodLabel = method === 'cash' ? 'เงินสด' : 'เงินโอน'
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

          <div>
            <label className="label">วันที่ได้รับเงิน {isToday && <span className="text-blue-500">(วันนี้)</span>}</label>
            <input
              type="date"
              className="input"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
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
            onClick={() => onConfirm(receivedDate)}
            disabled={!receivedDate}
          >
            ยืนยันรับเงิน
          </button>
        </div>
      </div>
    </div>
  )
}
