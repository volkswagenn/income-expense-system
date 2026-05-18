import { v4 as uuid } from 'uuid'
import useWalletStore from '../store/useWalletStore'
import useLogStore from '../store/useLogStore'
import { buildLogEntry } from './logBuilder'

export function willGoNegative(method, amount) {
  const { cash, transfer } = useWalletStore.getState()
  if (method === 'cash') return cash - amount < 0
  if (method === 'transfer') return transfer - amount < 0
  return false
}

export function deductWallet(method, amount, logData = {}) {
  const store = useWalletStore.getState()
  if (method === 'cash') store.deductCash(amount)
  else if (method === 'transfer') store.deductTransfer(amount)
  useLogStore.getState().addLog(
    buildLogEntry({
      activityType: logData.activityType ?? 'ADD_EXPENSE',
      description: logData.description ?? `ตัดเงิน${method === 'cash' ? 'สด' : 'โอน'} ${amount.toLocaleString()} บาท`,
      walletEffect: { target: method, delta: -amount },
      oldValue: logData.oldValue,
      newValue: logData.newValue,
      changeNote: logData.changeNote,
    })
  )
}

export function addToWallet(method, amount, logData = {}) {
  const store = useWalletStore.getState()
  if (method === 'cash') store.addCash(amount)
  else if (method === 'transfer') store.addTransfer(amount)
  useLogStore.getState().addLog(
    buildLogEntry({
      activityType: logData.activityType ?? 'ADD_INCOME',
      description: logData.description ?? `รับเงิน${method === 'cash' ? 'สด' : 'โอน'} ${amount.toLocaleString()} บาท`,
      walletEffect: { target: method, delta: +amount },
      oldValue: logData.oldValue,
      newValue: logData.newValue,
      changeNote: logData.changeNote,
    })
  )
}

export function transferBetweenWallets(from, to, amount, logData = {}) {
  const store = useWalletStore.getState()
  if (from === 'cash') store.deductCash(amount)
  else store.deductTransfer(amount)
  if (to === 'cash') store.addCash(amount)
  else store.addTransfer(amount)
  useLogStore.getState().addLog(
    buildLogEntry({
      activityType: from === 'cash' ? 'TRANSFER_TO_WALLET' : 'WITHDRAW_FROM_TRANSFER',
      description: logData.description ?? `ย้ายเงิน ${amount.toLocaleString()} บาท จาก${from === 'cash' ? 'เงินสด' : 'เงินโอน'} → ${to === 'cash' ? 'เงินสด' : 'เงินโอน'}`,
      walletEffect: { target: from, delta: -amount },
    })
  )
}

export function depositToSubWallet(subId, amount, fromMethod, logData = {}) {
  const store = useWalletStore.getState()
  if (fromMethod === 'cash') store.deductCash(amount)
  else store.deductTransfer(amount)
  store.updateSubWallet(subId, amount)
  useLogStore.getState().addLog(
    buildLogEntry({
      activityType: 'SUB_DEPOSIT',
      description: logData.description ?? `ฝากเงินเข้ากระเป๋า ${amount.toLocaleString()} บาท`,
      walletEffect: { target: `sub:${subId}`, delta: +amount },
      newValue: { fromMethod },
    })
  )
}

export function withdrawFromSubWallet(subId, amount, toMethod, logData = {}) {
  const store = useWalletStore.getState()
  store.updateSubWallet(subId, -amount)
  if (toMethod === 'cash') store.addCash(amount)
  else store.addTransfer(amount)
  useLogStore.getState().addLog(
    buildLogEntry({
      activityType: 'SUB_WITHDRAW',
      description: logData.description ?? `ถอนเงินจากกระเป๋า ${amount.toLocaleString()} บาท`,
      walletEffect: { target: `sub:${subId}`, delta: -amount },
      newValue: { toMethod },
    })
  )
}

export function transferBetweenSubWallets(fromId, toId, amount) {
  const store = useWalletStore.getState()
  store.updateSubWallet(fromId, -amount)
  store.updateSubWallet(toId, amount)
  useLogStore.getState().addLog(
    buildLogEntry({
      activityType: 'SUB_TRANSFER',
      description: `โอนเงิน ${amount.toLocaleString()} บาท ระหว่างกระเป๋าตังค์`,
      walletEffect: { target: `sub:${fromId}`, delta: -amount },
      newValue: { toId },
    })
  )
}

export function borrowFromSubWallet(subId, amount, toMethod, subName) {
  const store = useWalletStore.getState()
  store.updateSubWallet(subId, -amount)
  if (toMethod === 'cash') store.addCash(amount)
  else store.addTransfer(amount)

  const loan = {
    id: uuid(),
    subWalletId: subId,
    subName,
    amount,
    method: toMethod,
    borrowedAt: new Date().toISOString(),
    returned: false,
  }
  store.addLoan(loan)

  useLogStore.getState().addLog(
    buildLogEntry({
      activityType: 'SUB_BORROW',
      description: `ยืมเงิน ${amount.toLocaleString()} บาท จากกระเป๋า "${subName}" → ${toMethod === 'cash' ? 'เงินสด' : 'เงินโอน'}`,
      walletEffect: { target: `sub:${subId}`, delta: -amount },
      newValue: { loanId: loan.id },
    })
  )
}

export function returnLoan(loanId, returnMethod) {
  const store = useWalletStore.getState()
  const loan = store.loans.find((l) => l.id === loanId)
  if (!loan || loan.returned) return

  if (returnMethod === 'cash') store.deductCash(loan.amount)
  else store.deductTransfer(loan.amount)
  store.updateSubWallet(loan.subWalletId, loan.amount)
  store.returnLoanById(loanId, returnMethod)

  useLogStore.getState().addLog(
    buildLogEntry({
      activityType: 'SUB_RETURN',
      description: `คืนเงิน ${loan.amount.toLocaleString()} บาท จาก${returnMethod === 'cash' ? 'เงินสด' : 'เงินโอน'} → กระเป๋า "${loan.subName}"`,
      walletEffect: { target: returnMethod, delta: -loan.amount },
      newValue: { loanId },
    })
  )
}
