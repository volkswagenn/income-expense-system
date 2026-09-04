import { useState, useRef } from 'react'
import Popup from './Popup'
import Icon from './Icon'
import UiIcon from './UiIcon'
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
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)
  const [dragging, setDragging] = useState(false)

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

  const KB = (n) => (n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)
  const extOf = (name) => (name.includes('.') ? name.split('.').pop().toUpperCase().slice(0, 4) : 'FILE')
  const TINT = {
    PDF: 'bg-expense-soft text-[#A93A2E]',
    JPG: 'bg-income-soft text-[#0F6A50]',
    JPEG: 'bg-income-soft text-[#0F6A50]',
    PNG: 'bg-transfer-soft text-transfer',
  }

  return (
    <Popup
      title={title}
      sub={description}
      icon="upload_file"
      width={460}
      onClose={onCancel}
      busy={saving}
      error={error}
      footer={
        <div className="flex-none flex items-center gap-2 justify-end px-[17px] py-3 border-t border-[#EFEDE7] bg-[#FAF9F6]">
          <button
            onClick={onCancel}
            disabled={saving}
            className="h-[38px] px-4 rounded-[11px] border border-hairline bg-white text-[13px] font-semibold hover:bg-paper disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={() => onConfirm(null)}
            disabled={saving}
            className="h-[38px] px-4 rounded-[11px] text-[13px] text-muted hover:bg-paper disabled:opacity-50"
          >
            ข้ามไป
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="h-[38px] px-[18px] rounded-[11px] bg-ink text-white text-[13px] font-semibold hover:brightness-125 disabled:opacity-50"
          >
            {saving ? 'กำลังอัปโหลด…' : files.length > 0 ? `อัปโหลด ${files.length} ไฟล์` : 'ยืนยัน'}
          </button>
        </div>
      }
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple
        accept="image/*,.pdf,.jpg,.jpeg,.png,.webp"
        onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); setError('') }}
      />

      {/* กล่องลากวาง — รับทั้งลากมาวางและกดเลือก เพราะบนคอมคนลากไฟล์จากโฟลเดอร์เร็วกว่า */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const dropped = Array.from(e.dataTransfer?.files ?? [])
          if (dropped.length > 0) { setFiles(dropped); setError('') }
        }}
        className={`flex-none w-full border-[1.5px] border-dashed rounded-[14px] px-4 py-[22px] text-center transition ${
          dragging ? 'border-ink bg-[#F2FAD9]' : 'border-[#C9C5BA] bg-[#FAF9F6] hover:bg-[#F2FAD9] hover:border-ink'
        }`}
      >
        <Icon name="upload_file" size={30} className="text-muted" />
        <p className="text-[13px] font-semibold mt-1.5">ลากไฟล์มาวางที่นี่ หรือกดเพื่อเลือกไฟล์</p>
        <p className="text-[11.5px] text-faint leading-relaxed mt-[3px]">
          รูปใบเสร็จ ใบกำกับภาษี สลิปโอนเงิน · JPG PNG PDF ไม่เกิน 15 MB ต่อไฟล์ แนบได้หลายไฟล์ต่อรายการ
        </p>
      </button>

      {/* บนมือถือสองปุ่มนี้เปิดกล้องกับคลังรูปโดยตรง บนคอมจะเปิดหน้าต่างเลือกไฟล์ปกติ */}
      <div className="flex-none grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="h-10 rounded-[11px] border border-hairline bg-white text-[12.5px] font-semibold flex items-center justify-center gap-[7px] hover:bg-paper"
        >
          <UiIcon name="camera" size={15} />
          ถ่ายรูปจากกล้อง
        </button>
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          className="h-10 rounded-[11px] border border-hairline bg-white text-[12.5px] font-semibold flex items-center justify-center gap-[7px] hover:bg-paper"
        >
          <UiIcon name="gallery" size={15} />
          เลือกจากคลังรูป
        </button>
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); setError('') }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); setError('') }}
      />

      {files.length > 0 && (
        <div className="flex-none">
          <p className="text-[11.5px] font-semibold text-muted mb-1.5">ไฟล์ของรายการนี้ · {files.length} ไฟล์</p>
          <div className="flex flex-col gap-[7px]">
            {files.map((f, i) => {
              const ext = extOf(f.name)
              return (
                <div key={`${f.name}-${i}`} className="flex items-center gap-[9px] border border-hairline rounded-[11px] px-2.5 py-2">
                  <span className={`w-8 h-8 flex-none rounded-lg flex items-center justify-center text-[11px] font-bold ${TINT[ext] ?? 'bg-paper text-muted'}`}>
                    {ext}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12.5px] font-medium truncate">{f.name}</span>
                    <span className="tabular-nums block text-[11px] text-faint">
                      {KB(f.size)} · {saving ? 'กำลังอัปโหลด' : 'พร้อมอัปโหลด'}
                    </span>
                  </span>
                  <button
                    onClick={() => setFiles((list) => list.filter((_, x) => x !== i))}
                    disabled={saving}
                    className="flex-none w-7 h-7 rounded-lg flex items-center justify-center text-faint hover:bg-[#FEF6F5] hover:text-expense disabled:opacity-40"
                    title="เอาไฟล์นี้ออก"
                  >
                    <Icon name="close" size={17} />
                  </button>
                </div>
              )
            })}
          </div>
          <p className="text-[11px] text-faint leading-relaxed mt-2">
            ชื่อไฟล์ที่จะบันทึก: <span className="font-mono break-all">{filenames.join(' · ')}</span>
          </p>
        </div>
      )}

      <p className="flex-none text-[11px] text-faint leading-relaxed">
        ไฟล์ผูกกับรายการนี้ เปิดดูย้อนหลังได้จากหน้าประวัติและรายงาน · ลบรายการแล้วไฟล์จะถูกลบตามไปด้วย
      </p>
    </Popup>
  )
}
