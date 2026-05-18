import { useState, useEffect } from 'react'
import useNoteStore from '../../store/useNoteStore'
import useLogStore from '../../store/useLogStore'
import { buildLogEntry } from '../../lib/logBuilder'

const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

function formatThaiDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return `${THAI_DAYS[d.getDay()]}ที่ ${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`
}

export default function CalendarNotePopup({ date, onClose }) {
  const { notes, setNote, deleteNote } = useNoteStore()
  const { addLog } = useLogStore()
  const existing = notes[date] || ''
  const [text, setText] = useState(existing)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSave = () => {
    const next = text.trim()
    if (next) {
      setNote(date, next)
      addLog(buildLogEntry({
        activityType: existing ? 'CALENDAR_NOTE_UPDATE' : 'CALENDAR_NOTE_CREATE',
        description: `${existing ? 'แก้ไข' : 'สร้าง'}โน้ตปฏิทินวันที่ ${date}`,
        oldValue: existing ? { date, text: existing } : null,
        newValue: { date, text: next },
      }))
    } else {
      deleteNote(date)
      if (existing) {
        addLog(buildLogEntry({
          activityType: 'CALENDAR_NOTE_DELETE',
          description: `ลบโน้ตปฏิทินวันที่ ${date}`,
          oldValue: { date, text: existing },
        }))
      }
    }
    onClose()
  }

  const handleDelete = () => {
    deleteNote(date)
    addLog(buildLogEntry({
      activityType: 'CALENDAR_NOTE_DELETE',
      description: `ลบโน้ตปฏิทินวันที่ ${date}`,
      oldValue: { date, text: existing },
    }))
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b bg-yellow-50 border-yellow-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800 text-sm">📝 โน้ต</h3>
            <p className="text-xs text-gray-500 mt-0.5">{formatThaiDate(date)}</p>
          </div>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onClose}>×</button>
        </div>

        <div className="p-4">
          <textarea
            className="input resize-none text-sm leading-relaxed"
            rows={4}
            placeholder="พิมพ์โน้ตที่นี่..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleSave() }}
          />
          <p className="text-xs text-gray-400 mt-1">Ctrl+Enter เพื่อบันทึก</p>
        </div>

        <div className="px-4 pb-4 flex items-center justify-between">
          {existing
            ? <button className="btn btn-danger text-sm" onClick={handleDelete}>🗑️ ลบโน้ต</button>
            : <span />}
          <div className="flex gap-2">
            <button className="btn btn-secondary text-sm" onClick={onClose}>ยกเลิก</button>
            <button className="btn btn-primary text-sm" onClick={handleSave}>บันทึก ✓</button>
          </div>
        </div>
      </div>
    </div>
  )
}
