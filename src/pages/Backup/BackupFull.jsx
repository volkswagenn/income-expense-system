import { useState } from 'react'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import useLogStore from '../../store/useLogStore'
import { buildLogEntry, createLogRecord } from '../../lib/logBuilder'
import { APP_DATA_KEYS, LOG_KEY, downloadJson, removeAllAppData } from '../../lib/appDataKeys'
import { localDateStr } from '../../lib/dateUtils'

function readKey(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
}

function buildBackupPayload() {
  const data = { _backupType: 'app', _backupAt: new Date().toISOString() }
  APP_DATA_KEYS.forEach((k) => { data[k] = readKey(k) })
  return data
}

/**
 * แทรก log การกู้คืนลงในก้อนข้อมูล log ที่กำลังจะเขียนกลับ
 * เรียก addLog หลังเขียน localStorage ไม่ได้ เพราะ zustand persist จะเขียน log
 * ที่ค้างอยู่ในหน่วยความจำทับข้อมูลที่เพิ่งกู้คืนทันที
 */
function withRestoreLog(persistedLogState, record) {
  if (!persistedLogState || typeof persistedLogState !== 'object') return persistedLogState
  const logs = persistedLogState.state?.logs
  if (!Array.isArray(logs)) return persistedLogState
  return { ...persistedLogState, state: { ...persistedLogState.state, logs: [record, ...logs] } }
}

export function BackupFull() {
  const { addLog } = useLogStore()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [fileError, setFileError] = useState('')

  const handleBackup = () => {
    downloadJson(buildBackupPayload(), `backup_${localDateStr()}.json`)
    addLog(buildLogEntry({ activityType: 'BACKUP_DATA', description: 'สำรองข้อมูลทั้งหมด' }))
  }

  const handleRestore = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        if (data._backupType !== 'app') {
          setFileError('ไฟล์นี้ไม่ใช่ backup ที่ถูกต้อง กรุณาเลือกไฟล์ backup ที่ถูกต้อง')
          return
        }
        // สำรองข้อมูลปัจจุบันไว้ก่อน — ดาวน์โหลดอย่างเดียว ไม่แตะ store
        // เพราะการเขียน store จะทำให้ persist เขียนทับข้อมูลที่กำลังจะกู้คืน
        downloadJson(buildBackupPayload(), `backup_ก่อนกู้คืน_${localDateStr()}.json`)

        const restoreRecord = createLogRecord(
          buildLogEntry({ activityType: 'RESTORE_BACKUP', description: `กู้คืนข้อมูลจากไฟล์ ${file.name}` })
        )

        APP_DATA_KEYS.forEach((key) => {
          if (data[key] == null) return
          const value = key === LOG_KEY ? withRestoreLog(data[key], restoreRecord) : data[key]
          localStorage.setItem(key, JSON.stringify(value))
        })

        setFileError('')
        window.location.reload()
      } catch {
        setFileError('ไฟล์ไม่ถูกต้อง กรุณาเลือกไฟล์ backup ที่ถูกต้อง')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleDeleteAllData = () => {
    removeAllAppData()
    setConfirmDelete(false)
    window.location.reload()
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        สำรองข้อมูลทั้งหมด — รายการบันทึก กระเป๋าเงิน หมวดหมู่ รายการประจำ และ log
      </p>
      <button className="btn btn-primary w-full" onClick={handleBackup}>
        📥 ดาวน์โหลด Backup
      </button>

      <div className="border-t border-gray-100 pt-4 space-y-2">
        <p className="text-sm font-medium text-gray-700">กู้คืนข้อมูล (Restore)</p>
        <p className="text-xs text-amber-600">⚠️ ข้อมูลปัจจุบันจะถูกเขียนทับ ระบบจะ backup อัตโนมัติก่อน</p>
        <label className="btn btn-secondary w-full cursor-pointer text-center block">
          📂 เลือกไฟล์ Backup (.json)
          <input type="file" accept=".json" className="hidden" onChange={handleRestore} />
        </label>
        {fileError && <p className="text-xs text-red-600">{fileError}</p>}
      </div>

      <div className="border-t border-gray-100 pt-4 space-y-2">
        <p className="text-sm font-medium text-red-700">ล้างข้อมูลทั้งหมด</p>
        <p className="text-xs text-red-500">⚠️ ลบข้อมูลทั้งหมด ไม่สามารถกู้คืนได้</p>
        <button className="btn btn-danger w-full" onClick={() => setConfirmDelete(true)}>
          🗑️ ล้างข้อมูลทั้งหมด
        </button>
      </div>

      <ConfirmPopup
        open={confirmDelete}
        title="⚠️ ล้างข้อมูลทั้งหมด"
        message="ข้อมูลทั้งหมดจะถูกลบอย่างถาวร\nยืนยันหรือไม่?"
        onConfirm={handleDeleteAllData}
        onCancel={() => setConfirmDelete(false)}
        confirmLabel="ล้างข้อมูล"
        danger
      />
    </div>
  )
}

export default BackupFull
