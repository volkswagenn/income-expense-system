import { useState, useRef } from 'react'
import useLogStore from '../../store/useLogStore'
import { buildLogEntry } from '../../lib/logBuilder'
import { getDatedAttachmentFolder } from '../../lib/attachmentPaths'
import { uploadAttachment } from '../../lib/api/attachments'

// ขนาดสูงสุดต่อไฟล์ — ใบเสร็จ/ใบกำกับที่ถ่ายจากมือถือปกติไม่เกินนี้ กันไฟล์วิดีโอหลุดมา
const MAX_FILE_BYTES = 15 * 1024 * 1024

/**
 * props:
 *   title        – popup header text
 *   description  – optional sub-text (e.g. item name / receipt no)
 *   createdAt    – ISO string used as the date portion of the saved filename
 *   filenamePrefix – e.g. 'taxinvoice' or 'receipt'
 *   folderBase   – e.g. 'taxinvoices' or 'receipts'
 *   onConfirm(savedPath|null) – called with saved path; null = confirmed without file
 *   onCancel()
 */
export default function FileUploadPopup({ title, description, createdAt, filenamePrefix, folderBase, onConfirm, onCancel }) {
  const { addLog } = useLogStore()
  const [files, setFiles] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const buildFilename = (f, index = 0) => {
    const ext = f.name.includes('.') ? f.name.split('.').pop().toLowerCase() : 'file'
    const base = new Date(createdAt ?? Date.now())
    const now = new Date()
    const dd = String(base.getDate()).padStart(2, '0')
    const mm = String(base.getMonth() + 1).padStart(2, '0')
    const yy = String(base.getFullYear()).slice(-2)
    const HH = String(now.getHours()).padStart(2, '0')
    const MM = String(now.getMinutes()).padStart(2, '0')
    // ใส่วินาทีด้วย ไม่งั้นสองรายการคนละบิลที่วันที่เดียวกันและอัปโหลดในนาทีเดียวกันจะได้ชื่อซ้ำ
    const SS = String(now.getSeconds()).padStart(2, '0')
    const suffix = files.length > 1 ? `_${String(index + 1).padStart(2, '0')}` : ''
    return `${filenamePrefix}_${dd}${mm}${yy}_${HH}${MM}${SS}${suffix}.${ext}`
  }

  const buildFolder = () => {
    return getDatedAttachmentFolder(folderBase, createdAt)
  }

  const filenames = files.map((file, index) => buildFilename(file, index))
  const folder = buildFolder()

  const handleConfirm = async () => {
    if (files.length === 0) {
      onConfirm(null)
      return
    }

    const tooBig = files.find((f) => f.size > MAX_FILE_BYTES)
    if (tooBig) {
      setError(`ไฟล์ "${tooBig.name}" ใหญ่เกิน ${MAX_FILE_BYTES / 1024 / 1024} MB`)
      return
    }

    setSaving(true)
    setError('')
    try {
      // อัปโหลดขึ้น Supabase Storage ทีละไฟล์ — คืนพาธที่เก็บจริงบนเซิร์ฟเวอร์
      // ทุกเครื่องในร้านจึงเปิดดูได้ (ของเดิมดาวน์โหลดลงเครื่องแล้วเก็บแค่ชื่อ)
      const savedPaths = []
      for (let i = 0; i < files.length; i += 1) {
        const path = await uploadAttachment(files[i], { folderBase, filename: filenames[i], createdAt })
        savedPaths.push(path)
      }
      onConfirm(savedPaths)
    } catch (err) {
      addLog(buildLogEntry({
        activityType: 'UPLOAD_FILE_FAILED',
        description: `อัปโหลดไฟล์ไม่สำเร็จ: ${title}`,
        status: 'error',
        errorMessage: err.message,
        newValue: { filenames: files.map((file) => file.name), folder, filenamePrefix },
      }))
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b bg-blue-50 flex items-center justify-between">
          <h3 className="font-semibold text-base text-blue-900">📎 {title}</h3>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onCancel}>×</button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {description && (
            <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{description}</p>
          )}

          {/* File picker */}
          <div>
            <label className="label">เลือกไฟล์</label>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                multiple
                accept="image/*,.pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); setError('') }}
              />
              <button
                className="btn btn-secondary text-sm"
                onClick={() => inputRef.current?.click()}
              >
                📂 เลือกไฟล์…
              </button>
              {files.length > 0 && (
                <span className="text-sm text-gray-700 truncate max-w-xs">
                  {files.length === 1 ? files[0].name : `${files.length} ไฟล์`}
                </span>
              )}
            </div>
          </div>

          {/* Filename preview */}
          {files.length > 0 && (
            <div className="bg-blue-50 rounded-xl px-4 py-3 text-sm space-y-1">
              <p className="text-blue-800 font-medium">ชื่อไฟล์ที่จะบันทึก:</p>
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {filenames.map((filename) => (
                  <p key={filename} className="font-mono text-blue-700 break-all">{filename}</p>
                ))}
              </div>
              <p className="text-blue-600 text-xs">
                ไฟล์จะถูกอัปโหลดขึ้นเซิร์ฟเวอร์ที่ {folder.replace(/^[^/]+\//, '')}/ — ทุกเครื่องในร้านเปิดดูได้
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">⚠️ {error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t bg-gray-50 flex gap-2 justify-end">
          <button className="btn btn-secondary" onClick={onCancel} disabled={saving}>ยกเลิก</button>
          <button
            className="btn btn-ghost text-gray-500"
            onClick={() => onConfirm(null)}
            disabled={saving}
          >
            ข้ามไป
          </button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={saving}
          >
            {saving ? 'กำลังอัปโหลด…' : files.length > 0 ? `☁️ อัปโหลด (${files.length})` : 'ยืนยัน'}
          </button>
        </div>
      </div>
    </div>
  )
}
