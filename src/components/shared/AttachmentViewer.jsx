import { useEffect, useMemo, useState } from 'react'

function fileNameFromPath(path = '') {
  return String(path).split(/[\\/]/).filter(Boolean).pop() || 'ไฟล์แนบ'
}

function isImagePath(path = '') {
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(path)
}

function isPdfPath(path = '') {
  return /\.pdf$/i.test(path)
}

export function getPrimaryAttachment(record) {
  const attachments = getAttachments(record)
  if (attachments.length > 0) return attachments[0]
  return null
}

export function getAttachments(record) {
  if (!record) return []
  if (Array.isArray(record.attachments) && record.attachments.length > 0) {
    return record.attachments
      .filter((item) => item?.path)
      .map((item, index) => ({
        path: item.path,
        type: item.type || item.documentType || 'receipt',
        label: item.label || item.documentLabel || `เอกสารแนบ ${index + 1}`,
        uploadedAt: item.uploadedAt ?? null,
      }))
  }
  const path =
    record.documentPath ||
    record.receiptPath ||
    record.taxInvoicePath ||
    record.filePath ||
    record.attachmentPath
  if (!path) return []
  return [{
    path,
    type: record.documentType || (record.taxInvoicePath || record.filePath ? 'taxinvoice' : 'receipt'),
    label: record.documentLabel || (record.taxInvoicePath || record.filePath ? 'ใบกำกับภาษี' : 'ใบเสร็จ'),
  }]
}

export function AttachmentButton({ attachment, attachments, compact = false }) {
  const [open, setOpen] = useState(false)
  const list = attachments?.length ? attachments : (attachment?.path ? [attachment] : [])
  if (list.length === 0) return null

  return (
    <>
      <button
        type="button"
        className={`btn btn-secondary ${compact ? 'text-xs py-1 px-2' : 'text-xs'}`}
        onClick={() => setOpen(true)}
      >
        📎 ดูบิล{list.length > 1 ? ` ${list.length} ไฟล์` : ''}
      </button>
      {open && <AttachmentViewerPopup attachments={list} onClose={() => setOpen(false)} />}
    </>
  )
}

export default function AttachmentViewerPopup({ attachment, attachments, onClose }) {
  const attachmentList = attachments?.length ? attachments : (attachment?.path ? [attachment] : [])
  const [activeIndex, setActiveIndex] = useState(0)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const activeAttachment = attachmentList[activeIndex] ?? attachmentList[0]
  const fileName = fileNameFromPath(activeAttachment?.path)
  const canUseElectron = Boolean(window.electronAPI)

  const canPreviewByPath = useMemo(
    () => isImagePath(activeAttachment?.path) || isPdfPath(activeAttachment?.path),
    [activeAttachment?.path]
  )

  useEffect(() => {
    let cancelled = false
    async function loadPreview() {
      setPreview(null)
      setError('')
      if (!activeAttachment?.path || !window.electronAPI?.readFileDataUrl || !canPreviewByPath) return
      setLoading(true)
      const result = await window.electronAPI.readFileDataUrl(activeAttachment.path)
      if (cancelled) return
      setLoading(false)
      if (result?.success) setPreview(result)
      else setError(result?.error || 'ไม่สามารถโหลดไฟล์ตัวอย่างได้')
    }
    loadPreview()
    return () => { cancelled = true }
  }, [activeAttachment?.path, canPreviewByPath])

  const openFile = async () => {
    if (window.electronAPI?.openPath) await window.electronAPI.openPath(activeAttachment.path)
  }

  const openFolder = async () => {
    if (window.electronAPI?.openContainingFolder) await window.electronAPI.openContainingFolder(activeAttachment.path)
  }

  const go = (delta) => {
    setActiveIndex((index) => {
      const next = index + delta
      if (next < 0) return attachmentList.length - 1
      if (next >= attachmentList.length) return 0
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b bg-gray-50 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900">{activeAttachment?.label || 'เอกสารแนบ'}</h3>
            <p className="text-xs text-gray-500 truncate mt-0.5">
              {attachmentList.length > 1 ? `${activeIndex + 1}/${attachmentList.length} · ` : ''}{fileName}
            </p>
          </div>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onClose}>×</button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 min-h-80 flex items-center justify-center overflow-hidden">
            {loading ? (
              <p className="text-sm text-gray-400">กำลังโหลดตัวอย่างไฟล์...</p>
            ) : preview?.dataUrl && preview.mimeType?.startsWith('image/') ? (
              <img src={preview.dataUrl} alt={fileName} className="max-w-full max-h-[62vh] object-contain" />
            ) : preview?.dataUrl && preview.mimeType === 'application/pdf' ? (
              <iframe title={fileName} src={preview.dataUrl} className="w-full h-[62vh] bg-white" />
            ) : (
              <div className="text-center px-6 py-10">
                <p className="text-5xl mb-3">📄</p>
                <p className="font-semibold text-gray-700">{canPreviewByPath ? 'ยังไม่สามารถแสดงตัวอย่างได้' : 'ไฟล์นี้ไม่รองรับการ preview'}</p>
                <p className="text-sm text-gray-400 mt-1">ใช้ปุ่มเปิดไฟล์หรือเปิดโฟลเดอร์ด้านล่าง</p>
                {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
              </div>
            )}
          </div>

          {attachmentList.length > 1 && (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2">
                <button className="btn btn-secondary text-sm" onClick={() => go(-1)}>ก่อนหน้า</button>
                <span className="text-sm text-gray-500">{activeIndex + 1} / {attachmentList.length}</span>
                <button className="btn btn-secondary text-sm" onClick={() => go(1)}>ถัดไป</button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {attachmentList.map((item, index) => (
                  <button
                    key={`${item.path}-${index}`}
                    className={`shrink-0 w-28 rounded-lg border px-2 py-2 text-left ${index === activeIndex ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}`}
                    onClick={() => setActiveIndex(index)}
                  >
                    <p className="text-xs font-medium text-gray-700 truncate">{item.label || `ไฟล์ ${index + 1}`}</p>
                    <p className="text-[11px] text-gray-400 truncate mt-0.5">{fileNameFromPath(item.path)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">ตำแหน่งไฟล์</p>
            <p className="font-mono text-xs text-gray-600 break-all">{activeAttachment.path}</p>
          </div>
        </div>

        <div className="px-5 py-4 border-t bg-gray-50 flex flex-wrap gap-2 justify-end">
          <button className="btn btn-secondary" onClick={onClose}>ปิด</button>
          <button className="btn btn-secondary" onClick={openFolder} disabled={!canUseElectron}>📂 เปิดโฟลเดอร์</button>
          <button className="btn btn-primary" onClick={openFile} disabled={!canUseElectron}>เปิดไฟล์</button>
        </div>
      </div>
    </div>
  )
}
