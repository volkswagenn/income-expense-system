import { useState } from 'react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import useWalletStore from '../../store/useWalletStore'
import { returnLoan } from '../../lib/walletEngine'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import TransferAccountPicker from '../../components/shared/TransferAccountPicker'
import { useNegativeConfirm } from '../../hooks/useNegativeConfirm'

function ReturnModal({ loan, onClose }) {
  const [method, setMethod] = useState(loan.method === 'transfer' ? 'transfer' : 'cash')
  // คืนเข้าบัญชีเดิมที่ยืมออกมาเป็นค่าเริ่มต้น
  const [accountId, setAccountId] = useState(loan.transferAccountId ?? '')
  const [regularConfirm, setRegularConfirm] = useState(false)
  const { warning, check, proceed, cancel } = useNegativeConfirm()
  const resolveAccount = useWalletStore((s) => s.resolveTransferAccountId)

  const needsAccount = method === 'transfer'
  const resolvedAccountId = needsAccount ? resolveAccount(accountId) : null

  const doReturn = () => {
    returnLoan(loan.id, method, resolvedAccountId)
    setRegularConfirm(false)
    onClose()
  }

  const handleReturnClick = () => {
    if (needsAccount && !resolvedAccountId) return
    const store = useWalletStore.getState()
    const balance = method === 'cash'
      ? store.cash
      : (store.transferAccounts.find((a) => a.id === resolvedAccountId)?.balance ?? 0)
    if (balance - loan.amount < 0) {
      check({ method, amount: loan.amount, accountId: resolvedAccountId, onConfirm: doReturn })
    } else {
      setRegularConfirm(true)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs mx-4 overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h3 className="font-semibold">คืนเงินกระเป๋า "{loan.subName}"</h3>
            <button className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onClose}>×</button>
          </div>
          <div className="p-5 space-y-4">
            <div className="bg-purple-50 rounded-xl p-3 text-sm">
              <p className="text-gray-500">ยอดที่ยืม</p>
              <p className="text-xl font-bold text-purple-700">{loan.amount.toLocaleString()} บาท</p>
            </div>
            <div>
              <label className="label">หักจากกระเป๋า</label>
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="cash">💵 กระเป๋าเงินสด</option>
                <option value="transfer">🏦 กระเป๋าเงินโอน</option>
              </select>
            </div>
            {needsAccount && (
              <TransferAccountPicker value={accountId} onChange={setAccountId} label="ตัดจากบัญชี" />
            )}
            <div className="flex gap-2 justify-end">
              <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
              <button
                className="btn bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                onClick={handleReturnClick}
                disabled={needsAccount && !resolvedAccountId}
              >
                คืนเงิน
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmPopup
        open={regularConfirm}
        title="ยืนยันการคืนเงิน"
        message={`คืนเงิน ${loan.amount.toLocaleString()} บาท จากกระเป๋า${method === 'cash' ? 'เงินสด' : 'เงินโอน'} → กระเป๋า "${loan.subName}"\nยืนยันหรือไม่?`}
        onConfirm={doReturn}
        onCancel={() => setRegularConfirm(false)}
        confirmLabel="ยืนยันคืนเงิน"
      />

      <ConfirmPopup
        open={!!warning}
        title="⚠️ ยอดเงินจะติดลบ"
        message={warning?.message ?? ''}
        onConfirm={proceed}
        onCancel={cancel}
        confirmLabel="ยืนยันคืนเงิน (ติดลบ)"
        danger
      />
    </>
  )
}

export default function LoanSummary() {
  const loans = useWalletStore((s) => s.loans)
  const [returning, setReturning] = useState(null)

  const active = loans.filter((l) => !l.returned)
  const total = active.reduce((s, l) => s + l.amount, 0)

  if (active.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-2">ไม่มีการยืมเงินจากกระเป๋าตังค์</p>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500">ยืมจากกระเป๋าตังค์ทั้งหมด</p>
        <p className="font-bold text-purple-600">{total.toLocaleString()} บาท</p>
      </div>
      <div className="space-y-2">
        {active.map((loan) => (
          <div key={loan.id} className="rounded-xl border border-purple-200 bg-purple-50 p-3">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-purple-800 truncate">{loan.subName}</p>
                <p className="text-xs text-gray-500">
                  วันที่สร้าง: {format(new Date(loan.borrowedAt), 'd MMM yyyy HH:mm', { locale: th })}
                </p>
                <p className="text-xs text-gray-500">
                  วันที่ยืม: {format(new Date(loan.borrowedAt), 'd MMM yyyy', { locale: th })}
                </p>
                <p className="text-xs text-gray-500">
                  รายละเอียด: ยืมไปยัง{loan.method === 'cash' ? 'เงินสด' : 'เงินโอน'}
                </p>
                <p className="text-sm font-bold text-purple-700 mt-0.5">{loan.amount.toLocaleString()} บาท</p>
              </div>
            </div>
            <button
              className="btn text-xs py-1 px-2 w-full bg-purple-100 text-purple-700 hover:bg-purple-200 border-0"
              onClick={() => setReturning(loan)}
            >
              💜 คืนเงิน
            </button>
          </div>
        ))}
      </div>

      {returning && <ReturnModal loan={returning} onClose={() => setReturning(null)} />}
    </div>
  )
}
