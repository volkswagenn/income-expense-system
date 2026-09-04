import useWalletStore from '../store/useWalletStore'
import { writeLog } from './api/logs'
import { buildLogEntry } from './logBuilder'

/**
 * งานที่แตะยอดเงินทั้งหมด
 *
 * ต่างจากเวอร์ชันเดิมตรงที่ **ทุกฟังก์ชันเป็น async และรอผลจริงจากเซิร์ฟเวอร์**
 * ยอดเงินไม่ได้คำนวณใน JS อีกต่อไป — ฐานข้อมูลเป็นคนบวกลบให้ (balance = balance + delta)
 * เพราะถ้าสองเครื่องกดพร้อมกัน วิธีเดิม (อ่านยอด → บวกใน JS → เขียนทับ) จะทำให้เงินหาย
 *
 * งานที่ย้ายเงินสองก้อน (ฝาก/ถอน/ยืม/คืน/ย้ายบัญชี) เรียก RPC ตัวเดียวที่ทำทั้งขาออก
 * และขาเข้าใน transaction เดียว ถ้าเน็ตหลุดกลางทางจะไม่มีสภาพ "ตัดแล้วไม่เข้า"
 */

function transferAccountOf(accountId) {
  return useWalletStore.getState().resolveTransferAccountId(accountId)
}

/**
 * ขาของการเคลื่อนไหวเงิน — ใช้กับงานที่ขยับเงินสองก้อนพร้อมกัน
 *
 * `walletEffect` เดิมบันทึกได้ขาเดียว (เช่น ย้ายเงินจากบัญชี ก → ข เก็บแค่ delta 0 ที่บัญชี ก)
 * ซึ่งพอเอามาไล่ทำใบแจ้งยอดรายบัญชีแล้วยอดไม่ตรง เพราะฝั่งที่เงินเข้าไม่ถูกบันทึกไว้เลย
 * จึงเพิ่ม `legs` เก็บทุกขาไว้ข้างใน โดยยังคง delta ขาหลักไว้ที่เดิม
 * หน้าประวัติที่อ่าน `walletEffect.delta` อยู่แล้วจึงไม่ต้องแก้
 *
 * target: 'cash' | 'transfer' | `sub:<id>` | 'card'
 */
export function walletLeg(target, delta, transferAccountId = null) {
  return { target, delta, transferAccountId }
}

export function methodLabel(method) {
  if (method === 'cash') return 'เงินสด'
  if (method === 'card') return 'บัตรเครดิต'
  return 'เงินโอน'
}

/**
 * บัตรเครดิตตั้งใจไม่ตรวจตรงนี้ — รูดเกินวงเงินก็ยังบันทึกได้
 * วงเงินจริงมีการปรับชั่วคราว และถ้าธนาคารคิดค่าปรับ ผู้ใช้บันทึกเป็นรายจ่ายได้เอง
 * ระบบไม่ควรขวางการบันทึกสิ่งที่เกิดขึ้นจริงไปแล้ว
 */
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

// ── ขยับยอดก้อนเดียว ────────────────────────────────────────────────────────

async function adjustOne(method, delta, accountId) {
  const store = useWalletStore.getState()
  if (method === 'cash') {
    await store.adjustCash(delta)
    return { ok: true, accountId: null, label: '' }
  }
  if (method === 'transfer') {
    const id = transferAccountOf(accountId)
    if (!id) return { ok: false }
    await store.adjustTransferAccount(id, delta)
    return { ok: true, accountId: id, label: ` [${store.getTransferAccountLabel(id)}]` }
  }
  // 'other' และ 'pending' ไม่แตะกระเป๋าเงิน
  return { ok: true, accountId: null, label: '' }
}

export async function deductWallet(method, amount, logData = {}, accountId = null) {
  const result = await adjustOne(method, -amount, accountId)
  if (!result.ok) return false

  await writeLog(buildLogEntry({
    activityType: logData.activityType ?? 'ADD_EXPENSE',
    description: (logData.description ?? `ตัดเงิน${methodLabel(method)} ${amount.toLocaleString()} บาท`) + result.label,
    walletEffect: { target: method, delta: -amount, transferAccountId: result.accountId },
    oldValue: logData.oldValue,
    newValue: logData.newValue,
    changeNote: logData.changeNote,
  }))
  return true
}

export async function addToWallet(method, amount, logData = {}, accountId = null) {
  const result = await adjustOne(method, +amount, accountId)
  if (!result.ok) return false

  await writeLog(buildLogEntry({
    activityType: logData.activityType ?? 'ADD_INCOME',
    description: (logData.description ?? `รับเงิน${methodLabel(method)} ${amount.toLocaleString()} บาท`) + result.label,
    walletEffect: { target: method, delta: +amount, transferAccountId: result.accountId },
    oldValue: logData.oldValue,
    newValue: logData.newValue,
    changeNote: logData.changeNote,
  }))
  return true
}

// ── ย้ายเงินสองก้อน (RPC เดียวจบ) ───────────────────────────────────────────

export async function transferBetweenWallets(from, to, amount, logData = {}, accountId = null) {
  const store = useWalletStore.getState()
  const id = transferAccountOf(accountId)
  if (!id) return false
  const label = store.getTransferAccountLabel(id)

  await store.moveCashTransfer({
    accountId: id,
    amount,
    to: from === 'cash' ? 'transfer' : 'cash',
    log: buildLogEntry({
      activityType: from === 'cash' ? 'TRANSFER_TO_WALLET' : 'WITHDRAW_FROM_TRANSFER',
      description: logData.description
        ?? `ย้ายเงิน ${amount.toLocaleString()} บาท จาก${methodLabel(from)} → ${methodLabel(to)} [${label}]`,
      walletEffect: {
        target: from, delta: -amount, transferAccountId: id,
        legs: [walletLeg(from, -amount, id), walletLeg(to, +amount, id)],
      },
    }),
  })
  return true
}

export async function moveBetweenTransferAccounts(fromId, toId, amount) {
  const store = useWalletStore.getState()
  const fromLabel = store.getTransferAccountLabel(fromId)
  const toLabel = store.getTransferAccountLabel(toId)

  await store.moveBetweenTransferAccounts(fromId, toId, amount)
  await writeLog(buildLogEntry({
    activityType: 'TRANSFER_ACCOUNT_MOVE',
    description: `ย้ายเงิน ${amount.toLocaleString()} บาท จาก "${fromLabel}" → "${toLabel}"`,
    // ยอดรวมกระเป๋าเงินโอนไม่ขยับ (delta 0) แต่รายบัญชีขยับคนละทาง จึงต้องมี legs
    walletEffect: {
      target: 'transfer', delta: 0, transferAccountId: fromId,
      legs: [walletLeg('transfer', -amount, fromId), walletLeg('transfer', +amount, toId)],
    },
    newValue: { fromId, toId, amount },
  }))
}

export async function depositToSubWallet(subId, amount, fromMethod, logData = {}, accountId = null) {
  const store = useWalletStore.getState()
  let resolvedAccountId = null
  if (fromMethod !== 'cash') {
    resolvedAccountId = transferAccountOf(accountId)
    if (!resolvedAccountId) return false
  }

  await store.moveSubWallet({
    subId,
    amount,
    direction: 'in',
    method: fromMethod === 'cash' ? 'cash' : 'transfer',
    accountId: resolvedAccountId,
    log: buildLogEntry({
      activityType: 'SUB_DEPOSIT',
      description: logData.description ?? `ฝากเงินเข้ากระเป๋า ${amount.toLocaleString()} บาท`,
      walletEffect: {
        target: `sub:${subId}`, delta: +amount,
        legs: [
          walletLeg(`sub:${subId}`, +amount),
          walletLeg(fromMethod === 'cash' ? 'cash' : 'transfer', -amount, resolvedAccountId),
        ],
      },
      newValue: { fromMethod, transferAccountId: resolvedAccountId },
    }),
  })
  return true
}

export async function withdrawFromSubWallet(subId, amount, toMethod, logData = {}, accountId = null) {
  const store = useWalletStore.getState()
  let resolvedAccountId = null
  if (toMethod !== 'cash') {
    resolvedAccountId = transferAccountOf(accountId)
    if (!resolvedAccountId) return false
  }

  await store.moveSubWallet({
    subId,
    amount,
    direction: 'out',
    method: toMethod === 'cash' ? 'cash' : 'transfer',
    accountId: resolvedAccountId,
    log: buildLogEntry({
      activityType: 'SUB_WITHDRAW',
      description: logData.description ?? `ถอนเงินจากกระเป๋า ${amount.toLocaleString()} บาท`,
      walletEffect: {
        target: `sub:${subId}`, delta: -amount,
        legs: [
          walletLeg(`sub:${subId}`, -amount),
          walletLeg(toMethod === 'cash' ? 'cash' : 'transfer', +amount, resolvedAccountId),
        ],
      },
      newValue: { toMethod, transferAccountId: resolvedAccountId },
    }),
  })
  return true
}

export async function transferBetweenSubWallets(fromId, toId, amount) {
  await useWalletStore.getState().moveBetweenSubWallets({
    fromId,
    toId,
    amount,
    log: buildLogEntry({
      activityType: 'SUB_TRANSFER',
      description: `โอนเงิน ${amount.toLocaleString()} บาท ระหว่างกระเป๋าตังค์`,
      walletEffect: {
        target: `sub:${fromId}`, delta: -amount,
        legs: [walletLeg(`sub:${fromId}`, -amount), walletLeg(`sub:${toId}`, +amount)],
      },
      newValue: { toId },
    }),
  })
}

export async function borrowFromSubWallet(subId, amount, toMethod, subName, accountId = null) {
  let resolvedAccountId = null
  if (toMethod !== 'cash') {
    resolvedAccountId = transferAccountOf(accountId)
    if (!resolvedAccountId) return false
  }

  await useWalletStore.getState().borrowFromSubWallet({
    subId,
    amount,
    method: toMethod === 'cash' ? 'cash' : 'transfer',
    accountId: resolvedAccountId,
    subName,
    log: buildLogEntry({
      activityType: 'SUB_BORROW',
      description: `ยืมเงิน ${amount.toLocaleString()} บาท จากกระเป๋า "${subName}" → ${methodLabel(toMethod)}`,
      walletEffect: {
        target: `sub:${subId}`, delta: -amount,
        legs: [
          walletLeg(`sub:${subId}`, -amount),
          walletLeg(toMethod === 'cash' ? 'cash' : 'transfer', +amount, resolvedAccountId),
        ],
      },
      newValue: { transferAccountId: resolvedAccountId },
    }),
  })
  return true
}

export async function returnLoan(loanId, returnMethod, accountId = null) {
  const store = useWalletStore.getState()
  const loan = store.loans.find((l) => l.id === loanId)
  if (!loan || loan.returned) return false

  let resolvedAccountId = null
  if (returnMethod !== 'cash') {
    resolvedAccountId = transferAccountOf(accountId ?? loan.transferAccountId)
    if (!resolvedAccountId) return false
  }

  await store.returnLoanById(loanId, returnMethod === 'cash' ? 'cash' : 'transfer', resolvedAccountId)
  await writeLog(buildLogEntry({
    activityType: 'SUB_RETURN',
    description: `คืนเงิน ${loan.amount.toLocaleString()} บาท จาก${methodLabel(returnMethod)} → กระเป๋า "${loan.subName}"`,
    walletEffect: {
      target: returnMethod, delta: -loan.amount, transferAccountId: resolvedAccountId,
      legs: [
        walletLeg(returnMethod === 'cash' ? 'cash' : 'transfer', -loan.amount, resolvedAccountId),
        walletLeg(`sub:${loan.subWalletId}`, +loan.amount),
      ],
    },
    newValue: { loanId, transferAccountId: resolvedAccountId },
  }))
  return true
}
