import { useState } from 'react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import AmountDisplay from '../../components/shared/AmountDisplay'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import { depositToSubWallet, withdrawFromSubWallet, transferBetweenSubWallets, borrowFromSubWallet } from '../../lib/walletEngine'
import useWalletStore from '../../store/useWalletStore'
import { useNegativeConfirm } from '../../hooks/useNegativeConfirm'

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onClose}>×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function dateLabel(d) {
  try { return format(new Date(d + 'T00:00:00'), 'd MMM yyyy', { locale: th }) } catch { return d }
}

export default function SubWalletCard({ wallet, onDelete, onRename }) {
  const [modal, setModal] = useState(null)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [fromMethod, setFromMethod] = useState('cash')
  const [toMethod, setToMethod] = useState('cash')
  const [targetWalletId, setTargetWalletId] = useState('')
  const [editName, setEditName] = useState(false)
  const [nameVal, setNameVal] = useState(wallet.name)
  const { subWallets } = useWalletStore()

  const others = subWallets.filter((w) => w.id !== wallet.id)
  const { warning, check, proceed, cancel } = useNegativeConfirm()

  const openModal = (type) => {
    setAmount('')
    setDate(format(new Date(), 'yyyy-MM-dd'))
    setModal(type)
  }

  const handleAction = () => {
    const amt = Number(amount)
    if (!amt || amt <= 0) return
    const dl = ` (${dateLabel(date)})`

    const execute = () => {
      if (modal === 'deposit') depositToSubWallet(wallet.id, amt, fromMethod, { description: `ฝากเงินเข้า "${wallet.name}" ${amt.toLocaleString()} บาท${dl}` })
      if (modal === 'withdraw') withdrawFromSubWallet(wallet.id, amt, toMethod, { description: `ถอนเงินจาก "${wallet.name}" ${amt.toLocaleString()} บาท${dl}` })
      if (modal === 'transfer' && targetWalletId) transferBetweenSubWallets(wallet.id, targetWalletId, amt)
      if (modal === 'borrow') borrowFromSubWallet(wallet.id, amt, toMethod, wallet.name)
      setAmount('')
      setModal(null)
    }

    if (modal === 'deposit') {
      check({ method: fromMethod, amount: amt, onConfirm: execute })
    } else if (modal === 'withdraw') {
      check({ subWalletId: wallet.id, amount: amt, onConfirm: execute })
    } else if (modal === 'transfer') {
      if (!targetWalletId) return
      check({ subWalletId: wallet.id, amount: amt, onConfirm: execute })
    } else if (modal === 'borrow') {
      check({ subWalletId: wallet.id, amount: amt, onConfirm: execute })
    }
  }

  const DateField = () => (
    <div>
      <label className="label">วันที่</label>
      <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
    </div>
  )

  return (
    <>
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          {editName ? (
            <div className="flex gap-2 flex-1">
              <input className="input text-sm py-1 flex-1" value={nameVal} onChange={(e) => setNameVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { onRename(wallet.id, nameVal); setEditName(false) } }} autoFocus />
              <button className="btn btn-primary text-xs py-1" onClick={() => { onRename(wallet.id, nameVal); setEditName(false) }}>บันทึก</button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-1">
              <span className="text-lg">👜</span>
              <button className="font-semibold text-gray-800 hover:text-blue-600 text-left" onClick={() => setEditName(true)}>
                {wallet.name}
              </button>
            </div>
          )}
          <button className="text-xs text-red-400 hover:text-red-600 ml-2" onClick={() => { if (confirm(`ลบกระเป๋า "${wallet.name}"?`)) onDelete(wallet.id) }}>ลบ</button>
        </div>

        <div>
          <p className="text-xs text-gray-500">ยอดคงเหลือ</p>
          <AmountDisplay amount={wallet.balance} size="lg" />
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button className="btn btn-success text-xs" onClick={() => openModal('deposit')}>+ ฝากเงิน</button>
          <button className="btn btn-warning text-xs" onClick={() => openModal('withdraw')}>- ถอนเงิน</button>
          <button className="btn btn-secondary text-xs" onClick={() => openModal('transfer')}>→ โอน</button>
          <button className="btn btn-ghost text-xs border border-purple-200 text-purple-600 hover:bg-purple-50" onClick={() => openModal('borrow')}>
            ยืมเงิน
          </button>
        </div>
      </div>

      {modal === 'deposit' && (
        <Modal title={`ฝากเงินเข้า "${wallet.name}"`} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <DateField />
            <div>
              <label className="label">แหล่งเงิน</label>
              <select className="input" value={fromMethod} onChange={(e) => setFromMethod(e.target.value)}>
                <option value="cash">💵 กระเป๋าเงินสด</option>
                <option value="transfer">🏦 กระเป๋าเงินโอน</option>
              </select>
            </div>
            <div>
              <label className="label">จำนวนเงิน (บาท)</label>
              <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus />
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>ยกเลิก</button>
              <button className="btn btn-success" onClick={handleAction}>ฝากเงิน</button>
            </div>
          </div>
        </Modal>
      )}

      {modal === 'withdraw' && (
        <Modal title={`ถอนเงินจาก "${wallet.name}"`} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <DateField />
            <div>
              <label className="label">ถอนไปที่</label>
              <select className="input" value={toMethod} onChange={(e) => setToMethod(e.target.value)}>
                <option value="cash">💵 กระเป๋าเงินสด</option>
                <option value="transfer">🏦 กระเป๋าเงินโอน</option>
              </select>
            </div>
            <div>
              <label className="label">จำนวนเงิน (บาท)</label>
              <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus />
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>ยกเลิก</button>
              <button className="btn btn-warning" onClick={handleAction}>ถอนเงิน</button>
            </div>
          </div>
        </Modal>
      )}

      {modal === 'transfer' && (
        <Modal title={`โอนจาก "${wallet.name}"`} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <DateField />
            <div>
              <label className="label">โอนไปกระเป๋า</label>
              <select className="input" value={targetWalletId} onChange={(e) => setTargetWalletId(e.target.value)}>
                <option value="">เลือกกระเป๋า...</option>
                {others.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">จำนวนเงิน (บาท)</label>
              <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus />
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={handleAction}>โอน</button>
            </div>
          </div>
        </Modal>
      )}

      {modal === 'borrow' && (
        <Modal title={`ยืมเงินจาก "${wallet.name}"`} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <DateField />
            <div>
              <label className="label">ยืมเป็น</label>
              <select className="input" value={toMethod} onChange={(e) => setToMethod(e.target.value)}>
                <option value="cash">💵 เงินสด</option>
                <option value="transfer">🏦 เงินโอน</option>
              </select>
            </div>
            <div>
              <label className="label">จำนวนเงิน (บาท)</label>
              <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus />
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>ยกเลิก</button>
              <button className="btn bg-purple-600 text-white hover:bg-purple-700" onClick={handleAction}>ยืมเงิน</button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmPopup
        open={!!warning}
        title="⚠️ ยอดเงินจะติดลบ"
        message={warning?.message ?? ''}
        onConfirm={proceed}
        onCancel={cancel}
        confirmLabel="ยืนยัน (ติดลบ)"
        danger
      />
    </>
  )
}
