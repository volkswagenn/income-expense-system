import useTransactionStore from '../store/useTransactionStore'
import useWalletStore from '../store/useWalletStore'
import usePendingStore from '../store/usePendingStore'
import { walletTarget } from './api/transactions'
import { reverseEffectOf } from './transactionActions'
import { buildLogEntry } from './logBuilder'

/**
 * ตัวรันการนำเข้าข้อมูลของทุกแบบฟอร์ม
 *
 * ที่ต้องมีไฟล์นี้: โค้ดเดิมในหน้านำเข้าวน forEach แล้วยิง addTransaction กับ
 * addToWallet ทิ้งไว้โดยไม่ await สักตัว ซึ่งพังได้ 3 ทางพร้อมกัน
 *   1. ลบข้อมูลวันเดิม (deleteByDate) ยังทำไม่เสร็จ แต่รายการใหม่ถูกยิงเข้าไปแล้ว
 *      → คำสั่งลบที่ตามมาทีหลังลบรายการที่เพิ่งนำเข้าทิ้งไปด้วย
 *   2. บันทึกรายการกับตัดเงินเป็นคนละคำสั่ง ถ้าอันหลังล้ม จะได้รายการที่เงินไม่ตรง
 *   3. หน้าจอขึ้น "นำเข้าสำเร็จ" ทันทีโดยไม่รู้ว่าคำสั่งไหนล้มบ้าง
 *
 * ที่นี่จึงบันทึกทีละแถวและรอให้จบจริง โดยส่ง effect + log ไปกับ post_transaction
 * ให้ฐานข้อมูลทำ insert + ขยับยอด + เขียน log จบในทรานแซกชันเดียว
 */

/** สร้างรายการนำเข้า 1 แถว — คืนรูปแบบที่ runImport รับ */
export function importEntry(tx, description) {
  return { tx, description }
}

/**
 * ลบรายการทั้งหมดของวันที่ระบุ (ใช้ตอนนำเข้าทับข้อมูลเดิม)
 * คืนเงินให้ถูกกระเป๋าผ่าน RPC เดียวกับตอนยกเลิกรายการ ไม่คำนวณเองใน JS
 */
export async function clearDates(dates) {
  const { deleteByDate } = useTransactionStore.getState()
  let removed = 0
  for (const date of dates) {
    removed += await deleteByDate(date, {
      reverseEffect: (tx) => reverseEffectOf(tx, usePendingStore.getState().pendingPayments),
    })
  }
  return removed
}

/**
 * บันทึกรายการที่นำเข้าทีละแถวจนครบ
 * ถ้าแถวไหนล้ม จะหยุดแล้วโยน error ที่บอกว่าล้มที่แถวไหน — แถวก่อนหน้าที่บันทึกไปแล้ว
 * ยังอยู่ครบ (แต่ละแถวจบในตัวเอง) ผู้ใช้จึงแก้ไฟล์แล้วนำเข้าเฉพาะส่วนที่เหลือได้
 */
export async function runImport(entries, onProgress) {
  const { addTransaction } = useTransactionStore.getState()
  let saved = 0

  for (const { tx, description } of entries) {
    const target = walletTarget(tx.method, { transferAccountId: tx.transferAccountId })
    const amount = Number(tx.amount) || 0
    const effect = target
      ? { target, delta: tx.type === 'income' ? amount : -amount }
      : null // 'other' ไม่เข้ากระเป๋าเงิน จึงไม่มี effect

    try {
      await addTransaction(tx, {
        effect,
        log: buildLogEntry({
          activityType: 'IMPORT_DATA',
          description,
          walletEffect: effect,
          newValue: { date: tx.date, amount, method: tx.method },
        }),
      })
    } catch (err) {
      // แถวก่อนหน้าขยับยอดไปแล้ว ต้องดึงยอดจริงกลับมาก่อนโยน error
      // ไม่งั้นหน้าจอโชว์ยอดเก่าจนกว่าจะรีโหลด
      await useWalletStore.getState().refresh().catch(() => {})
      throw new Error(`นำเข้าไม่สำเร็จที่แถววันที่ ${tx.date} (บันทึกไปแล้ว ${saved} รายการ) — ${err.message}`)
    }
    saved += 1
    onProgress?.(saved, entries.length)
  }

  // ยอดเงินถูกฐานข้อมูลขยับไปหลายรอบ ดึงกลับมาทั้งชุดให้ตรงกับของจริง
  await useWalletStore.getState().refresh()
  return saved
}

/** วันแรกสุดในชุดแถวที่นำเข้า — ใช้บอก store ให้โหลดรายการย้อนหลังถึงวันนั้นก่อนตรวจซ้ำ */
export function earliestDate(rows) {
  return (rows ?? []).reduce((min, r) => (r?.date && (!min || r.date < min) ? r.date : min), null)
}
