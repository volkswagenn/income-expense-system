import { useState } from 'react'
import useShopStore from '../../store/useShopStore'
import useLogStore from '../../store/useLogStore'
import { downloadJson } from '../../lib/shopKeys'
import { switchToShop } from '../../lib/shopSwitch'
import { buildLogEntry } from '../../lib/logBuilder'

function readKey(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
}

export default function BackupSettings() {
  const { getActiveShop } = useShopStore()
  const { addLog } = useLogStore()
  const [errMsg, setErrMsg] = useState('')

  const activeShop = getActiveShop()

  const settingKeys = activeShop
    ? [`${activeShop.id}_app_settings`, `${activeShop.id}_categories_data`]
    : []

  const handleBackup = () => {
    const data = { _type: 'settings_only', _shopId: activeShop?.id, _backupAt: new Date().toISOString() }
    settingKeys.forEach((k) => { data[k] = readKey(k) })
    downloadJson(data, `backup_settings_${new Date().toISOString().slice(0, 10)}.json`)
    addLog(buildLogEntry({
      activityType: 'SETTINGS_BACKUP',
      description: `สำรองการตั้งค่าร้าน "${activeShop?.name ?? 'ไม่ทราบร้าน'}"`,
      newValue: { shopId: activeShop?.id, keys: settingKeys },
    }))
  }

  const handleRestore = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        if (data._type !== 'settings_only') {
          setErrMsg('ไฟล์นี้ไม่ใช่ backup settings กรุณาเลือกไฟล์ที่ถูกต้อง')
          return
        }
        // Restore settings — remap to current shop ID if different
        const srcShopId = data._shopId
        settingKeys.forEach((destKey) => {
          const srcKey = srcShopId ? destKey.replace(activeShop.id, srcShopId) : destKey
          if (data[srcKey] != null) localStorage.setItem(destKey, JSON.stringify(data[srcKey]))
          else if (data[destKey] != null) localStorage.setItem(destKey, JSON.stringify(data[destKey]))
        })
        if (activeShop) switchToShop(activeShop.id)
        addLog(buildLogEntry({
          activityType: 'SETTINGS_RESTORE',
          description: `กู้คืนการตั้งค่าร้าน "${activeShop?.name ?? 'ไม่ทราบร้าน'}" จากไฟล์ ${file.name}`,
          newValue: { shopId: activeShop?.id, fileName: file.name },
        }))
        setErrMsg('')
      } catch {
        setErrMsg('ไฟล์ไม่ถูกต้อง')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        บันทึกเฉพาะการตั้งค่าและหมวดหมู่ของร้านนี้ (ไม่รวมรายการบันทึก)
      </p>
      <button className="btn btn-secondary w-full" onClick={handleBackup}>
        ⚙️ ดาวน์โหลด Backup Settings
      </button>
      <div className="border-t border-gray-100 pt-4 space-y-2">
        <p className="text-sm font-medium text-gray-700">กู้คืน Settings</p>
        <label className="btn btn-ghost w-full cursor-pointer text-center block border border-gray-200">
          📂 เลือกไฟล์ Settings (.json)
          <input type="file" accept=".json" className="hidden" onChange={handleRestore} />
        </label>
        {errMsg && <p className="text-xs text-red-600">{errMsg}</p>}
      </div>
    </div>
  )
}
