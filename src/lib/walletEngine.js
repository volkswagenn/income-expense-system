import { v4 as uuid } from 'uuid'
import useWalletStore from '../store/useWalletStore'
import useLogStore from '../store/useLogStore'
import { buildLogEntry } from './logBuilder'

/**
 * เงินโอนถูกเก็บแยกเป็นบัญชีธนาคาร ทุกฟังก์ชันที่แตะเงินโอนจึงรับ accountId
 * ถ้าไม่ส่งมาและมีบัญชีเดียว ระบบจะใช้บัญชีนั้นให้อัตโนมัติ
 */
function transferAccountOf(accountId) {
  return useWalletStore.getState().resolveTransferAccountId(accountId)
}

export function hasTransferAccount() {
  return useWalletStore.getState().transferAccounts.length > 0
}

export function methodLabel(method) {
  return method === 'cash' ? 'เงินสด' : 'เงินโอน'
}

export function willGoNegative(method, amount, accountId) {
  const { cash, transferAccounts } = useWalletStore.getState()
  if (method === 'cash') return cash - amount < 0
  if (method === 'transfer') {
    const id = transferAccountOf(accountId)
    const account = transferAccounts.find((a) => a.id === id)
    return account ? account.balance - amount < 0 : false
  }
  return false
}

export function deductWallet(method, amount, logData = {}, accountId = null) {
  const store = useWalletStore.getState()
  let accountLabel = ''
  if (method === 'cash') {
    store.deductCash(amount)
  } else if (method === 'transfer') {
    const id = transferAccountOf(accountId)
    if (!id) return false
    store.adjustTransferAccount(id, -amount)
    accountLabel = ` [${store.getTransferAccountLabel(id)}]`
    accountId = id
  }
  useLogStore.getState().addLog(
    buildLogEntry({
      activityType: logData.activityType ?? 'ADD_EXPENSE',
      description: (logData.description ?? `ตัดเงิน${methodLabel(method)} ${amount.toLocaleString()} บาท`) + accountLabel,
      walletEffect: { target: method, delta: -amount, transferAccountId: method === 'transfer' ? accountId : null },
      oldValue: logData.oldValue,
      newValue: logData.newValue,
      changeNote: logData.changeNote,
    })
  )
  return true
}

export function addToWallet(method, amount, logData = {}, accountId = null) {
  const store = useWalletStore.getState()
  let accountLabel = ''
  if (method === 'cash') {
    store.addCash(amount)
  } else if (method === 'transfer') {
    const id = transferAccountOf(accountId)
    if (!id) return false
    store.adjustTransferAccount(id, amount)
    accountLabel = ` [${store.getTransferAccountLabel(id)}]`
    accountId = id
  }
  useLogStore.getState().addLog(
    buildLogEntry({
      activityType: logData.activityType ?? 'ADD_INCOME',
      description: (logData.description ?? `รับเงิน${methodLabel(method)} ${amount.toLocaleString()} บาท`) + accountLabel,
      walletEffect: { target: method, delta: +amount, transferAccountId: method === 'transfer' ? accountId : null },
      oldValue: logData.oldValue,
      newValue: logData.newValue,
      changeNote: logData.changeNote,
    })
  )
  return true
}

/**
 * ถอนผลกระทบต่อกระเป๋าเงินของ transaction หนึ่งรายการ (ไม่บันทึก log)
 * ใช้ตอนลบ/เขียนทับข้อมูลเป็นชุด เพื่อไม่ให้ยอดเงินถูกนับซ้ำ
 * method 'other' และ 'pending' ไม่เคยแตะกระเป๋าเงิน จึงไม่ต้องถอน
 */
export function reverseTransactionWalletEffect(tx) {
  const store = useWalletStore.getState()
  const amount = Number(tx?.amount) || 0
  if (amount <= 0) return
  const sign = tx.type === 'income' ? -1 : tx.type === 'expense' ? 1 : 0
  if (sign === 0) return
  if (tx.method === 'cash') {
    if (sign > 0) store.addCash(amount)
    else store.deductCash(amount)
  } else if (tx.method === 'transfer') {
    const id = transferAccountOf(tx.transferAccountId)
    if (id) store.adjustTransferAccount(id, sign * amount)
  }
}

export function transferBetweenWallets(from, to, amount, logData = {}, accountId = null) {
  const store = useWalletStore.getState()
  const id = transferAccountOf(accountId)
  if (!id) return false
  const label = store.getTransferAccountLabel(id)

  if (from === 'cash') {
    store.deductCash(amount)
    store.adjustTransferAccount(id, amount)
  } else {
    store.adjustTransferAccount(id, -amount)
    store.addCash(amount)
  }

  useLogStore.getState().addLog(
    buildLogEntry({
      activityType: from === 'cash' ? 'TRANSFER_TO_WALLET' : 'WITHDRAW_FROM_TRANSFER',
      description: logData.description
        ?? `ย้ายเงิน ${amount.toLocaleString()} บาท จาก${methodLabel(from)} → ${methodLabel(to)} [${label}]`,
      walletEffect: { target: from, delta: -amount, transferAccountId: id },
    })
  )
  return true
}

export function moveBetweenTransferAccounts(fromId, toId, amount) {
  const store = useWalletStore.getState()
  store.moveBetweenTransferAccounts(fromId, toId, amount)
  useLogStore.getState().addLog(
    buildLogEntry({
      activityType: 'TRANSFER_ACCOUNT_MOVE',
      description: `ย้ายเงิน ${amount.toLocaleString()} บาท จาก "${store.getTransferAccountLabel(fromId)}" → "${store.getTransferAccountLabel(toId)}"`,
      walletEffect: { target: 'transfer', delta: 0, transferAccountId: fromId },
      newValue: { fromId, toId, amount },
    })
  )
}

export function depositToSubWallet(subId, amount, fromMethod, logData = {}, accountId = null) {
  const store = useWalletStore.getState()
  let resolvedAccountId = null
  if (fromMethod === 'cash') {
    store.deductCash(amount)
  } else {
    resolvedAccountId = transferAccountOf(accountId)
    if (!resolvedAccountId) return false
    store.adjustTransferAccount(resolvedAccountId, -amount)
  }
  store.updateSubWallet(subId, amount)
  useLogStore.getState().addLog(
    buildLogEntry({
      activityType: 'SUB_DEPOSIT',
      description: logData.description ?? `ฝากเงินเข้ากระเป๋า ${amount.toLocaleString()} บาท`,
      walletEffect: { target: `sub:${subId}`, delta: +amount },
      newValue: { fromMethod, transferAccountId: resolvedAccountId },
    })
  )
  return true
}

export function withdrawFromSubWallet(subId, amount, toMethod, logData = {}, accountId = null) {
  const store = useWalletStore.getState()
  let resolvedAccountId = null
  if (toMethod !== 'cash') {
    resolvedAccountId = transferAccountOf(accountId)
    if (!resolvedAccountId) return false
  }
  store.updateSubWallet(subId, -amount)
  if (toMethod === 'cash') store.addCash(amount)
  else store.adjustTransferAccount(resolvedAccountId, amount)
  useLogStore.getState().addLog(
    buildLogEntry({
      activityType: 'SUB_WITHDRAW',
      description: logData.description ?? `ถอนเงินจากกระเป๋า ${amount.toLocaleString()} บาท`,
      walletEffect: { target: `sub:${subId}`, delta: -amount },
      newValue: { toMethod, transferAccountId: resolvedAccountId },
    })
  )
  return true
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

export function borrowFromSubWallet(subId, amount, toMethod, subName, accountId = null) {
  const store = useWalletStore.getState()
  let resolvedAccountId = null
  if (toMethod !== 'cash') {
    resolvedAccountId = transferAccountOf(accountId)
    if (!resolvedAccountId) return false
  }
  store.updateSubWallet(subId, -amount)
  if (toMethod === 'cash') store.addCash(amount)
  else store.adjustTransferAccount(resolvedAccountId, amount)

  const loan = {
    id: uuid(),
    subWalletId: subId,
    subName,
    amount,
    method: toMethod,
    transferAccountId: resolvedAccountId,
    borrowedAt: new Date().toISOString(),
    returned: false,
  }
  store.addLoan(loan)

  useLogStore.getState().addLog(
    buildLogEntry({
      activityType: 'SUB_BORROW',
      description: `ยืมเงิน ${amount.toLocaleString()} บาท จากกระเป๋า "${subName}" → ${methodLabel(toMethod)}`,
      walletEffect: { target: `sub:${subId}`, delta: -amount },
      newValue: { loanId: loan.id, transferAccountId: resolvedAccountId },
    })
  )
  return true
}

export function returnLoan(loanId, returnMethod, accountId = null) {
  const store = useWalletStore.getState()
  const loan = store.loans.find((l) => l.id === loanId)
  if (!loan || loan.returned) return false

  let resolvedAccountId = null
  if (returnMethod === 'cash') {
    store.deductCash(loan.amount)
  } else {
    resolvedAccountId = transferAccountOf(accountId ?? loan.transferAccountId)
    if (!resolvedAccountId) return false
    store.adjustTransferAccount(resolvedAccountId, -loan.amount)
  }
  store.updateSubWallet(loan.subWalletId, loan.amount)
  store.returnLoanById(loanId, returnMethod, resolvedAccountId)

  useLogStore.getState().addLog(
    buildLogEntry({
      activityType: 'SUB_RETURN',
      description: `คืนเงิน ${loan.amount.toLocaleString()} บาท จาก${methodLabel(returnMethod)} → กระเป๋า "${loan.subName}"`,
      walletEffect: { target: returnMethod, delta: -loan.amount, transferAccountId: resolvedAccountId },
      newValue: { loanId, transferAccountId: resolvedAccountId },
    })
  )
  return true
}
