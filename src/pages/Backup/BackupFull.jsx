import { useState } from 'react'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import Icon from '../../components/shared/Icon'
import useLogStore from '../../store/useLogStore'
import { useAuth } from '../../auth/AuthProvider'
import { loadAllData } from '../../lib/api'
import { clearShopData } from '../../lib/api/settings'
import { listAllLogsForExport } from '../../lib/api/logs'
import { listTransactions } from '../../lib/api/transactions'
import { buildLogEntry } from '../../lib/logBuilder'
import { downloadJson } from '../../lib/downloadJson'
import { localDateStr } from '../../lib/dateUtils'
import { hydrateStores } from '../../store/hydrate'

/**
 * สำรองข้อมูลของร้าน
 *
 * เวอร์ชันเดิมอ่าน/เขียน localStorage ซึ่งเป็นที่เก็บข้อมูลสมัยยังทำงานออฟไลน์
 * พอย้ายข้อมูลจริงขึ้น Postgres แล้ว คีย์พวกนั้นไม่มีอยู่อีกเลย ผลคือ
 *   • ปุ่มสำรอง → ได้ไฟล์ที่ทุกคีย์เป็น null (ดูเหมือนสำเร็จ แต่ไม่มีข้อมูลจริงสักแถว)
 *   • ปุ่มกู้คืน → เขียนกลับลง localStorage ที่ไม่มีใครอ่าน แล้วรีโหลด = ไม่เกิดอะไรขึ้น
 *   • ปุ่มล้างข้อมูล → ลบคีย์ที่ไม่มีอยู่ ข้อมูลบนเซิร์ฟเวอร์ยังอยู่ครบ
 * ทั้งสามอย่างขึ้นว่าสำเร็จทุกครั้ง ซึ่งอันตรายกว่าไม่มีปุ่มเลย
 *
 * ตอนนี้จึงดึงจากเซิร์ฟเวอร์จริง และปุ่มล้างข้อมูลเรียก RPC `clear_shop_data`
 * ที่ตรวจสิทธิ์เจ้าของร้านซ้ำอีกชั้นในฐานข้อมูล
 */
export function BackupFull() {
  const { addLog } = useLogStore()
  const { isOwner, shop } = useAuth()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  const handleBackup = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    setOkMsg('')
    try {
      // ดึงสามชุดพร้อมกัน: ข้อมูลใช้งาน + รายการ "ทุกปี" + ประวัติการใช้งาน (ทีละหน้าจนครบ)
      // loadAllData โหลดรายการแค่ 24 เดือนล่าสุด (พอสำหรับเปิดแอป) แต่ไฟล์สำรอง
      // ต้องมีครบทุกปี ไม่งั้นไฟล์ที่เขียนว่า "ทั้งหมด" จะขาดข้อมูลเก่าไปเงียบๆ
      const [data, allTransactions, logs] = await Promise.all([
        loadAllData(),
        listTransactions({ from: '2000-01-01' }),
        listAllLogsForExport(),
      ])
      data.transactions = allTransactions
      const payload = {
        _backupType: 'jodflow-shop',
        _backupAt: new Date().toISOString(),
        _shop: { id: shop?.id ?? null, name: shop?.name ?? null },
        ...data,
        logs,
      }
      downloadJson(payload, `jodflow_backup_${localDateStr()}.json`)
      setOkMsg(
        `ดาวน์โหลดแล้ว — รายการ ${data.transactions.length.toLocaleString()} · ` +
        `ประวัติ ${logs.length.toLocaleString()} รายการ`
      )
      addLog(buildLogEntry({
        activityType: 'BACKUP_DATA',
        description: `สำรองข้อมูลทั้งหมด (${data.transactions.length} รายการ, ${logs.length} ประวัติ)`,
        newValue: { transactions: data.transactions.length, logs: logs.length },
      }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleClearAll = async () => {
    setConfirmClear(false)
    setBusy(true)
    setError('')
    setOkMsg('')
    try {
      await clearShopData()
      // ฐานข้อมูลเพิ่งลบข้อมูลไปทั้งร้าน ต้องโหลดใหม่ทั้งชุด
      // ไม่งั้นหน้าจอยังโชว์ข้อมูลเก่าที่ไม่มีอยู่จริงแล้ว
      await hydrateStores()
      setOkMsg('ล้างข้อมูลของร้านเรียบร้อยแล้ว')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        ดาวน์โหลดข้อมูลของร้านทั้งหมดเป็นไฟล์ JSON — รายการบันทึก กระเป๋าเงิน หมวดหมู่
        รายการค้าง รายการประจำ โน้ตปฏิทิน และประวัติการใช้งาน
      </p>

      <button className="btn btn-primary w-full" onClick={handleBackup} disabled={busy}>
        <Icon name="backup" size={18} />
        {busy ? 'กำลังเตรียมไฟล์…' : 'ดาวน์โหลด Backup'}
      </button>

      {okMsg && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
          ✓ {okMsg}
        </p>
      )}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
          {error}
        </p>
      )}

      <div className="border-t border-gray-100 pt-4 space-y-2">
        <p className="text-sm font-medium text-gray-700">กู้คืนข้อมูล</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          ยังไม่รองรับการกู้คืนจากไฟล์ — ข้อมูลอยู่บนเซิร์ฟเวอร์ซึ่งมีสำรองของตัวเองอยู่แล้ว
          ถ้าต้องกู้คืนจริง ให้ใช้ Point-in-time recovery ที่หน้า Supabase → Database → Backups
        </p>
      </div>

      {/* ล้างข้อมูลเป็นสิทธิ์ของเจ้าของร้านเท่านั้น — ฐานข้อมูลตรวจซ้ำให้อีกชั้น
          ซ่อนปุ่มไปเลยสำหรับคนอื่น จะได้ไม่ต้องกดแล้วเจอ error */}
      {isOwner && (
        <div className="border-t border-gray-100 pt-4 space-y-2">
          <p className="text-sm font-medium text-red-700">ล้างข้อมูลทั้งหมดของร้าน</p>
          <p className="text-xs text-red-500">
            ⚠️ ลบรายการ ยอดเงิน หมวดหมู่ และประวัติทั้งหมดของร้านนี้อย่างถาวร กู้คืนไม่ได้
          </p>
          <button className="btn btn-danger w-full" onClick={() => setConfirmClear(true)} disabled={busy}>
            <Icon name="delete_sweep" size={18} />
            ล้างข้อมูลทั้งหมด
          </button>
        </div>
      )}

      <ConfirmPopup
        open={confirmClear}
        title="⚠️ ล้างข้อมูลทั้งหมด"
        message={'ข้อมูลทั้งหมดของร้านนี้จะถูกลบถาวรจากเซิร์ฟเวอร์\n\nแนะนำให้กดดาวน์โหลด Backup ไว้ก่อน\n\nยืนยันหรือไม่?'}
        onConfirm={handleClearAll}
        onCancel={() => setConfirmClear(false)}
        confirmLabel="ล้างข้อมูล"
        danger
      />
    </div>
  )
}

export default BackupFull
