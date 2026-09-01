import { useEffect, useState } from 'react'
import useLogStore from '../../store/useLogStore'
import { exportLog } from '../../lib/excelExporter'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import { buildLogEntry } from '../../lib/logBuilder'

export default function LogDownloader() {
  const { clearOldLogs, getLogsCount, addLog, loadFirstPage, fetchAllForExport } = useLogStore()
  const [confirmClear, setConfirmClear] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // ประวัติไม่ได้ถูกโหลดตอนเปิดแอป (อาจมีเป็นหมื่นแถว) จึงโหลดตอนเปิดหน้านี้
  useEffect(() => {
    loadFirstPage().catch((err) => setError(err.message))
  }, [loadFirstPage])

  const handleExport = async (format) => {
    setBusy(true)
    setError(null)
    try {
      // ดึงทั้งหมดจากเซิร์ฟเวอร์ ไม่ใช่แค่หน้าแรกที่แสดงอยู่ ไม่งั้นไฟล์จะไม่ครบ
      const all = await fetchAllForExport()
      exportLog(all, format)
      await addLog(buildLogEntry({
        activityType: 'LOG_EXPORT',
        description: `ดาวน์โหลดประวัติการใช้งานเป็นไฟล์ ${format.toUpperCase()}`,
        newValue: { format, count: all.length },
      }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleClearOld = async () => {
    setConfirmClear(false)
    setBusy(true)
    setError(null)
    try {
      await addLog(buildLogEntry({
        activityType: 'LOG_CLEAR_OLD',
        description: 'ล้างประวัติเก่ากว่า 1 ปี',
        oldValue: { countBefore: getLogsCount() },
      }))
      await clearOldLogs(365)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        จำนวน log ทั้งหมด: <span className="font-semibold">{getLogsCount().toLocaleString()}</span> รายการ
        <span className="text-xs text-gray-400"> (เก็บบนคลาวด์ ไม่มีเพดานแล้ว)</span>
      </p>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{error}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={() => handleExport('json')} disabled={busy}>
          📋 ดาวน์โหลด Log (.json)
        </button>
        <button className="btn btn-secondary" onClick={() => handleExport('xlsx')} disabled={busy}>
          📊 ดาวน์โหลด Log (.xlsx)
        </button>
        <button
          className="btn btn-ghost text-amber-600 border border-amber-200 hover:bg-amber-50"
          onClick={() => setConfirmClear(true)}
          disabled={busy}
        >
          🗑️ ล้าง log เก่า (&gt;1 ปี)
        </button>
      </div>

      {busy && <p className="text-xs text-gray-500">กำลังทำงาน…</p>}

      <ConfirmPopup
        open={confirmClear}
        title="ล้าง log เก่า"
        message="ลบ log ที่เก่ากว่า 1 ปี? ข้อมูลจะหายถาวร ควรดาวน์โหลดเก็บไว้ก่อน"
        onConfirm={handleClearOld}
        onCancel={() => setConfirmClear(false)}
        confirmLabel="ลบ log เก่า"
        danger
      />
    </div>
  )
}
