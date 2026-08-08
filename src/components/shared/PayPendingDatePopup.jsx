import { useState } from 'react'
import { format } from 'date-fns'
import TransferAccountPicker from './TransferAccountPicker'
import DatePicker from './DatePicker'
import useWalletStore from '../../store/useWalletStore'

export default function PayPendingDatePopup({ open, item, method, danger = false, onConfirm, onCancel }) {
  const [paidDate, setPaidDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  // ใช้บัญชีที่ผูกไว้ตอนเปิดบิล/ตั้งรายการประจำเป็นค่าเริ่มต้น
  const [accountId, setAccountId] = useState(item?.defaultTransferAccountId ?? '')
  const resolveAccount = useWalletStore((s) => s.resolveTransferAccountId)

  if (!open || !item) return null

  const methodLabel = method === 'cash' ? 'เงินสด' : 'เงินโอน'
  const needsAccount = method === 'transfer'
  const resolvedAccountId = needsAccount ? resolveAccount(accountId) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className={`px-5 py-4 border-b flex items-center justify-between ${danger ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
          <div>
            <h3 className={`font-semibold text-base ${danger ? 'text-red-700' : 'text-gray-900'}`}>
              {danger ? 'ยอดเงินจะติดลบ' : 'ยืนยันการชำระเงิน'}
            </h3>
            <p className="text-sm text-gray-500 truncate max-w-[260px]">{item.description}</p>
          </div>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onCancel}>×</button>
        </div>

        <div className="p-5 space-y-4 text-sm">
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 space-y-1">
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">ยอดชำระ</span>
              <span className="font-bold text-gray-900">{item.amount?.toLocaleString('th-TH')} บาท</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">วิธีชำระ</span>
              <span className="font-medium text-gray-800">{methodLabel}</span>
            </div>
          </div>

          {danger && (
            <p className="text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              การชำระนี้จะทำให้ยอด{methodLabel}ติดลบ กรุณาตรวจสอบก่อนยืนยัน
            </p>
          )}

          {needsAccount && (
            <TransferAccountPicker value={accountId} onChange={setAccountId} label="ตัดจากบัญชี" />
          )}

          <div>
            <label className="label">วันที่จ่ายเงิน</label>
            <DatePicker value={paidDate} onChange={setPaidDate} />
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button className="btn btn-secondary flex-1" onClick={onCancel}>ยกเลิก</button>
          <button
            className={`btn flex-1 ${danger ? 'btn-danger' : 'btn-primary'} disabled:opacity-50 disabled:cursor-not-allowed`}
            onClick={() => onConfirm(paidDate, resolvedAccountId)}
            disabled={!paidDate || (needsAccount && !resolvedAccountId)}
          >
            ยืนยันชำระ
          </button>
        </div>
      </div>
    </div>
  )
}
