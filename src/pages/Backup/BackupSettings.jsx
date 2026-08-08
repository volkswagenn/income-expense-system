import { useState } from 'react'
import useLogStore from '../../store/useLogStore'
import { downloadJson } from '../../lib/appDataKeys'
import { buildLogEntry } from '../../lib/logBuilder'
import { localDateStr } from '../../lib/dateUtils'

function readKey(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
}

const SETTING_KEYS = ['default_app_settings', 'default_categories_data']

export default function BackupSettings() {
  const { addLog } = useLogStore()
  const [errMsg, setErrMsg] = useState('')

  const handleBackup = () => {
    const data = { _type: 'settings_only', _backupAt: new Date().toISOString() }
    SETTING_KEYS.forEach((k) => { data[k] = readKey(k) })
    downloadJson(data, `backup_settings_${localDateStr()}.json`)
    addLog(buildLogEntry({
      activityType: 'SETTINGS_BACKUP',
      description: 'สำรองการตั้งค่า',
      newValue: { keys: SETTING_KEYS },
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
        SETTING_KEYS.forEach((key) => {
          if (data[key] != null) localStorage.setItem(key, JSON.stringify(data[key]))
        })
        addLog(buildLogEntry({
          activityType: 'SETTINGS_RESTORE',
          description: `กู้คืนการตั้งค่าจากไฟล์ ${file.name}`,
          newValue: { fileName: file.name },
        }))
        setErrMsg('')
        window.location.reload()
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
        บันทึกเฉพาะการตั้งค่าและหมวดหมู่ (ไม่รวมรายการบันทึก)
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
