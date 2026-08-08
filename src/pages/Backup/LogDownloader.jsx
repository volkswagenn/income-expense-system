import { useState } from 'react'
import useLogStore, { MAX_LOGS } from '../../store/useLogStore'
import { exportLog } from '../../lib/excelExporter'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import { buildLogEntry } from '../../lib/logBuilder'

export default function LogDownloader() {
  const { logs, clearOldLogs, getLogsCount, addLog } = useLogStore()
  const [confirmClear, setConfirmClear] = useState(false)

  const handleExport = (format) => {
    exportLog(logs, format)
    addLog(buildLogEntry({
      activityType: 'LOG_EXPORT',
      description: `ดาวน์โหลดประวัติการใช้งานเป็นไฟล์ ${format.toUpperCase()}`,
      newValue: { format, count: logs.length },
    }))
  }

  const handleClearOld = () => {
    const beforeCount = getLogsCount()
    addLog(buildLogEntry({
      activityType: 'LOG_CLEAR_OLD',
      description: 'ล้างประวัติเก่ากว่า 1 ปี',
      oldValue: { countBefore: beforeCount },
    }))
    clearOldLogs(365)
    setConfirmClear(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          จำนวน log ทั้งหมด: <span className="font-semibold">{getLogsCount()}</span> รายการ
          <span className="text-xs text-gray-400"> (เก็บสูงสุด {MAX_LOGS.toLocaleString()} รายการ)</span>
        </p>
        {getLogsCount() > MAX_LOGS * 0.8 && (
          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">⚠️ ใกล้เต็ม log เก่าสุดจะถูกตัดทิ้งอัตโนมัติ — แนะนำให้ดาวน์โหลดเก็บไว้</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={() => handleExport('json')}>
          📋 ดาวน์โหลด Log (.json)
        </button>
        <button className="btn btn-secondary" onClick={() => handleExport('xlsx')}>
          📊 ดาวน์โหลด Log (.xlsx)
        </button>
        <button
          className="btn btn-ghost text-amber-600 border border-amber-200 hover:bg-amber-50"
          onClick={() => setConfirmClear(true)}
        >
          🗑️ ล้าง log เก่า (&gt;1 ปี)
        </button>
      </div>

      <ConfirmPopup
        open={confirmClear}
        title="ล้าง log เก่า"
        message="ลบ log ที่เก่ากว่า 1 ปี? ข้อมูลจะหายถาวร"
        onConfirm={handleClearOld}
        onCancel={() => setConfirmClear(false)}
        confirmLabel="ลบ log เก่า"
        danger
      />
    </div>
  )
}
