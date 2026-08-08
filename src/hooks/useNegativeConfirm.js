import { useState } from 'react'
import useWalletStore from '../store/useWalletStore'

export function useNegativeConfirm() {
  const [warning, setWarning] = useState(null) // { message, onConfirm } | null

  const check = ({ method, amount, subWalletId, accountId, onConfirm }) => {
    const store = useWalletStore.getState()
    const { cash, subWallets, transferAccounts } = store
    let newBalance = null
    let label = null

    if (method === 'cash') {
      newBalance = cash - amount
      label = 'กระเป๋าเงินสด'
    } else if (method === 'transfer') {
      // เช็คยอดของบัญชีที่ถูกเลือก ไม่ใช่ยอดรวมทุกบัญชี
      const id = store.resolveTransferAccountId(accountId)
      const account = transferAccounts.find((a) => a.id === id)
      if (account) {
        newBalance = account.balance - amount
        label = `บัญชี "${account.name}"`
      }
    } else if (subWalletId) {
      const sub = subWallets.find((w) => w.id === subWalletId)
      if (sub) {
        newBalance = sub.balance - amount
        label = `กระเป๋า "${sub.name}"`
      }
    }

    if (newBalance !== null && newBalance < 0) {
      const fmt = newBalance.toLocaleString('th-TH', { minimumFractionDigits: 2 })
      setWarning({
        message: `${label} จะติดลบเป็น ${fmt} บาท ยืนยันดำเนินการต่อหรือไม่?`,
        onConfirm,
      })
    } else {
      onConfirm()
    }
  }

  const proceed = () => {
    warning?.onConfirm?.()
    setWarning(null)
  }

  const cancel = () => setWarning(null)

  return { warning, check, proceed, cancel }
}
