import { useState } from 'react'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import useShopStore from '../../store/useShopStore'
import useLogStore from '../../store/useLogStore'
import { buildLogEntry } from '../../lib/logBuilder'
import { shopDataKeys, downloadJson } from '../../lib/shopKeys'
import { switchToShop } from '../../lib/shopSwitch'

function readKey(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
}

// ── Per-shop backup ────────────────────────────────────────────────────────────
export function BackupCurrentShop() {
  const { getActiveShop, shops } = useShopStore()
  const { addLog } = useLogStore()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [fileError, setFileError] = useState('')

  const activeShop = getActiveShop()

  const handleBackup = () => {
    if (!activeShop) return
    const data = { _backupType: 'shop', _shopId: activeShop.id, _shopName: activeShop.name, _backupAt: new Date().toISOString() }
    shopDataKeys(activeShop.id).forEach((k) => { data[k] = readKey(k) })
    downloadJson(data, `backup_${activeShop.name}_${new Date().toISOString().slice(0, 10)}.json`)
    addLog(buildLogEntry({ activityType: 'RESTORE_BACKUP', description: `สำรองข้อมูลร้าน "${activeShop.name}"` }))
  }

  const handleRestore = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        if (data._backupType !== 'shop') {
          setFileError('ไฟล์นี้ไม่ใช่ backup ของร้านเดียว กรุณาเลือกไฟล์ที่ถูกต้อง')
          return
        }
        // Backup current state first
        handleBackup()
        // Restore — map keys from backup shop ID → current active shop ID
        const backupShopId = data._shopId
        shopDataKeys(backupShopId).forEach((srcKey) => {
          if (data[srcKey] != null) {
            const destKey = srcKey.replace(backupShopId, activeShop.id)
            localStorage.setItem(destKey, JSON.stringify(data[srcKey]))
          }
        })
        addLog(buildLogEntry({ activityType: 'RESTORE_BACKUP', description: `กู้คืนข้อมูลร้าน "${activeShop.name}" จากไฟล์ ${file.name}` }))
        setFileError('')
        // Reload stores for current shop
        switchToShop(activeShop.id)
      } catch {
        setFileError('ไฟล์ไม่ถูกต้อง กรุณาเลือกไฟล์ backup ที่ถูกต้อง')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleDeleteShopData = () => {
    if (!activeShop) return
    shopDataKeys(activeShop.id).forEach((k) => localStorage.removeItem(k))
    switchToShop(activeShop.id)
    setConfirmDelete(false)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        สำรองข้อมูลเฉพาะร้านนี้ — รายการบันทึก กระเป๋าเงิน หมวดหมู่ รายการประจำ และ log
      </p>
      <button className="btn btn-primary w-full" onClick={handleBackup}>
        📥 ดาวน์โหลด Backup ร้านนี้
      </button>

      <div className="border-t border-gray-100 pt-4 space-y-2">
        <p className="text-sm font-medium text-gray-700">กู้คืนข้อมูลร้านนี้ (Restore)</p>
        <p className="text-xs text-amber-600">⚠️ ข้อมูลปัจจุบันจะถูกเขียนทับ ระบบจะ backup อัตโนมัติก่อน</p>
        <label className="btn btn-secondary w-full cursor-pointer text-center block">
          📂 เลือกไฟล์ Backup ร้าน (.json)
          <input type="file" accept=".json" className="hidden" onChange={handleRestore} />
        </label>
        {fileError && <p className="text-xs text-red-600">{fileError}</p>}
      </div>

      <div className="border-t border-gray-100 pt-4 space-y-2">
        <p className="text-sm font-medium text-red-700">ล้างข้อมูลร้านนี้</p>
        <p className="text-xs text-red-500">⚠️ ลบข้อมูลทั้งหมดของร้านนี้ ไม่สามารถกู้คืนได้</p>
        <button className="btn btn-danger w-full" onClick={() => setConfirmDelete(true)}>
          🗑️ ล้างข้อมูลร้านนี้
        </button>
      </div>

      <ConfirmPopup
        open={confirmDelete}
        title="⚠️ ล้างข้อมูลร้านนี้"
        message={`ข้อมูลทั้งหมดของ "${activeShop?.name}" จะถูกลบอย่างถาวร\nยืนยันหรือไม่?`}
        onConfirm={handleDeleteShopData}
        onCancel={() => setConfirmDelete(false)}
        confirmLabel="ล้างข้อมูล"
        danger
      />
    </div>
  )
}

// ── All-shops backup ───────────────────────────────────────────────────────────
export function BackupAllShops() {
  const { shops } = useShopStore()
  const { addLog } = useLogStore()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [fileError, setFileError] = useState('')

  const handleBackupAll = () => {
    const data = { _backupType: 'all_shops', _backupAt: new Date().toISOString() }
    // Registry
    data['zuzoo_shop_registry'] = readKey('zuzoo_shop_registry')
    // All shops' data
    shops.forEach((shop) => {
      shopDataKeys(shop.id).forEach((k) => { data[k] = readKey(k) })
    })
    downloadJson(data, `backup_all_shops_${new Date().toISOString().slice(0, 10)}.json`)
    addLog(buildLogEntry({ activityType: 'RESTORE_BACKUP', description: `สำรองข้อมูลทุกร้าน (${shops.length} ร้าน)` }))
  }

  const handleRestoreAll = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        if (data._backupType !== 'all_shops') {
          setFileError('ไฟล์นี้ไม่ใช่ backup ทุกร้าน กรุณาเลือกไฟล์ที่ถูกต้อง')
          return
        }
        // Backup first
        handleBackupAll()
        // Restore all keys
        Object.entries(data).forEach(([k, v]) => {
          if (!k.startsWith('_') && v != null) localStorage.setItem(k, JSON.stringify(v))
        })
        setFileError('')
        window.location.reload()
      } catch {
        setFileError('ไฟล์ไม่ถูกต้อง')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleDeleteAll = () => {
    shops.forEach((shop) => {
      shopDataKeys(shop.id).forEach((k) => localStorage.removeItem(k))
    })
    localStorage.removeItem('zuzoo_shop_registry')
    setConfirmDelete(false)
    window.location.reload()
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        สำรองข้อมูลทุกร้านพร้อมกัน ({shops.length} ร้าน) รวมถึงทะเบียนร้านทั้งหมด
      </p>
      <button className="btn btn-primary w-full" onClick={handleBackupAll}>
        🏪 ดาวน์โหลด Backup ทุกร้าน
      </button>

      <div className="border-t border-gray-100 pt-4 space-y-2">
        <p className="text-sm font-medium text-gray-700">กู้คืนข้อมูลทุกร้าน (Restore All)</p>
        <p className="text-xs text-amber-600">⚠️ ข้อมูลทุกร้านจะถูกเขียนทับ แอพจะ reload อัตโนมัติ</p>
        <label className="btn btn-secondary w-full cursor-pointer text-center block">
          📂 เลือกไฟล์ Backup ทุกร้าน (.json)
          <input type="file" accept=".json" className="hidden" onChange={handleRestoreAll} />
        </label>
        {fileError && <p className="text-xs text-red-600">{fileError}</p>}
      </div>

      <div className="border-t border-gray-100 pt-4 space-y-2">
        <p className="text-sm font-medium text-red-700">ลบข้อมูลทั้งหมด (รีเซ็ตระบบ)</p>
        <p className="text-xs text-red-500">⚠️ ลบข้อมูลทุกร้านและทะเบียนร้านทั้งหมด ไม่สามารถกู้คืนได้</p>
        <button className="btn btn-danger w-full" onClick={() => setConfirmDelete(true)}>
          💣 รีเซ็ตระบบทั้งหมด
        </button>
      </div>

      <ConfirmPopup
        open={confirmDelete}
        title="⚠️ รีเซ็ตระบบทั้งหมด"
        message={`ข้อมูลทุกร้าน (${shops.length} ร้าน) จะถูกลบอย่างถาวร\nแอพจะกลับสู่สถานะเริ่มต้น\n\nยืนยันหรือไม่?`}
        onConfirm={handleDeleteAll}
        onCancel={() => setConfirmDelete(false)}
        confirmLabel="รีเซ็ตระบบ"
        danger
      />
    </div>
  )
}

// Legacy default export (per-shop) for backward compat
export default BackupCurrentShop
