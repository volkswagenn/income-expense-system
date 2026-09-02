import { useState } from 'react'
import AmountInput from '../../components/shared/AmountInput'
import useWalletStore from '../../store/useWalletStore'
import SubWalletCard from './SubWalletCard'
import { buildLogEntry } from '../../lib/logBuilder'
import useLogStore from '../../store/useLogStore'
import ConfirmPopup from '../../components/shared/ConfirmPopup'

export default function SubWalletList() {
  const { subWallets, createSubWallet, deleteSubWallet, renameSubWallet, reorderSubWallets } = useWalletStore()
  const { addLog } = useLogStore()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [initBal, setInitBal] = useState('')
  const [isSorting, setIsSorting] = useState(false)
  const [sortOrder, setSortOrder] = useState([])
  const [sortConfirm, setSortConfirm] = useState(false)

  // ทุก action ต้องรอเซิร์ฟเวอร์ตอบก่อน — ของเดิมใช้ค่าที่คืนมาเป็น Promise
  // (w.balance เป็น undefined → พังกลางทาง ฟอร์มไม่ปิด กดซ้ำได้กระเป๋าซ้ำ)
  // และเขียน log ก่อนรู้ผล ทำให้ประวัติบอกว่าสำเร็จทั้งที่เซิร์ฟเวอร์ปฏิเสธ
  const handleCreate = async () => {
    if (!newName.trim()) return
    const w = await createSubWallet(newName.trim(), Number(initBal) || 0)
    addLog(buildLogEntry({
      activityType: 'SUB_CREATE',
      description: `สร้างกระเป๋า "${w.name}" ยอดเริ่มต้น ${Number(w.balance).toLocaleString()} บาท`,
      walletEffect: { target: `sub:${w.id}`, delta: Number(w.balance) || 0 },
    }))
    setNewName('')
    setInitBal('')
    setCreating(false)
  }

  const handleDelete = async (id) => {
    const w = subWallets.find((sw) => sw.id === id)
    if (!w) return
    await deleteSubWallet(id)
    addLog(buildLogEntry({
      activityType: 'SUB_DELETE',
      description: `ลบกระเป๋า "${w.name}" (ยอดคงเหลือ ${Number(w.balance).toLocaleString()} บาท)`,
      oldValue: { name: w.name, balance: w.balance, subWalletId: id },
    }))
  }

  const handleRename = async (id, newNameVal) => {
    const w = subWallets.find((sw) => sw.id === id)
    if (!w) return
    await renameSubWallet(id, newNameVal)
    addLog(buildLogEntry({
      activityType: 'SUB_RENAME',
      description: `เปลี่ยนชื่อกระเป๋า "${w.name}" → "${newNameVal}"`,
      oldValue: { name: w.name },
      newValue: { name: newNameVal, subWalletId: id },
    }))
  }

  const startSort = () => {
    setSortOrder(subWallets.map((w) => w.id))
    setIsSorting(true)
  }

  const cancelSort = () => {
    setIsSorting(false)
    setSortOrder([])
  }

  const moveUp = (idx) => {
    if (idx === 0) return
    const next = [...sortOrder]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    setSortOrder(next)
  }

  const moveDown = (idx) => {
    if (idx === sortOrder.length - 1) return
    const next = [...sortOrder]
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    setSortOrder(next)
  }

  const confirmSort = () => {
    reorderSubWallets(sortOrder)
    setIsSorting(false)
    setSortOrder([])
    setSortConfirm(false)
  }

  return (
    <div>
      <div className="flex justify-end gap-2 mb-4">
        {isSorting ? (
          <>
            <button className="btn btn-secondary text-sm" onClick={cancelSort}>ยกเลิก</button>
            <button className="btn btn-primary text-sm" onClick={() => setSortConfirm(true)}>💾 บันทึกลำดับ</button>
          </>
        ) : (
          <>
            {subWallets.length > 1 && (
              <button className="btn btn-secondary text-sm" onClick={startSort}>⇅ จัดเรียง</button>
            )}
            <button className="btn btn-primary text-sm" onClick={() => setCreating(true)}>+ สร้างกระเป๋า</button>
          </>
        )}
      </div>

      {creating && (
        <div className="card p-4 mb-4 space-y-3 border-blue-200 bg-blue-50">
          <h4 className="font-medium text-sm text-blue-800">สร้างกระเป๋าตังค์ใหม่</h4>
          <div>
            <label className="label">ชื่อกระเป๋า</label>
            <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="เช่น กองทุนฉุกเฉิน" autoFocus />
          </div>
          <div>
            <label className="label">ยอดเงินเริ่มต้น (บาท)</label>
            <AmountInput className="input" value={initBal} onChange={(e) => setInitBal(e.target.value)} placeholder="0" />
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn btn-secondary" onClick={() => setCreating(false)}>ยกเลิก</button>
            <button className="btn btn-primary" onClick={handleCreate}>สร้าง</button>
          </div>
        </div>
      )}

      {isSorting ? (
        <div className="space-y-2">
          {sortOrder.map((id, idx) => {
            const w = subWallets.find((sw) => sw.id === id)
            if (!w) return null
            return (
              <div key={id} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl">
                <span className="text-xs text-gray-400 w-5 text-center font-medium">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{w.name}</p>
                  <p className="text-xs text-gray-500">{w.balance.toLocaleString()} บาท</p>
                </div>
                <div className="flex gap-1">
                  <button
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-25 disabled:cursor-not-allowed transition-colors text-sm"
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                  >▲</button>
                  <button
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-25 disabled:cursor-not-allowed transition-colors text-sm"
                    onClick={() => moveDown(idx)}
                    disabled={idx === sortOrder.length - 1}
                  >▼</button>
                </div>
              </div>
            )
          })}
        </div>
      ) : subWallets.length === 0 && !creating ? (
        <div className="text-center py-8 text-gray-400">
          <p className="text-3xl mb-2">👜</p>
          <p className="text-sm">ยังไม่มีกระเป๋าตังค์ กดสร้างเพื่อเพิ่ม</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {subWallets.map((w) => (
            <SubWalletCard
              key={w.id}
              wallet={w}
              onDelete={handleDelete}
              onRename={handleRename}
            />
          ))}
        </div>
      )}

      <ConfirmPopup
        open={sortConfirm}
        title="ยืนยันการบันทึกลำดับ"
        message="บันทึกลำดับกระเป๋าตังค์ใหม่ตามที่จัดเรียงไว้?"
        onConfirm={confirmSort}
        onCancel={() => setSortConfirm(false)}
        confirmLabel="ยืนยัน"
      />
    </div>
  )
}
