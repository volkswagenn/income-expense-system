import { useEffect, useState } from 'react'

/**
 * กล่องยืนยันที่ใช้ร่วมกันทั้งแอป
 *
 * onConfirm ของหลายจอเป็นงาน async ที่ต้องรอเซิร์ฟเวอร์ (ลบรายการ จ่ายเงิน ยกเลิกบิล)
 * ระหว่างรอ กล่องยังเปิดอยู่และปุ่มยังกดได้ ถ้าไม่ล็อกไว้ผู้ใช้ที่เห็นว่ากดแล้วเงียบ
 * จะกดซ้ำ แล้วคำสั่งถูกยิงสองรอบ — ลบซ้ำยังพอทน แต่จ่ายเงินซ้ำคือเงินหายจริง
 */
export default function ConfirmPopup({
  open, title, message, onConfirm, onCancel,
  confirmLabel = 'ยืนยัน', cancelLabel = 'ยกเลิก', danger = false,
}) {
  const [busy, setBusy] = useState(false)

  // เปิดกล่องใหม่ต้องเริ่มจากสถานะว่าง ไม่งั้นถ้ารอบก่อนล้มค้างไว้จะกดอะไรไม่ได้เลย
  useEffect(() => { if (open) setBusy(false) }, [open])

  if (!open) return null

  const confirm = async () => {
    if (busy) return
    setBusy(true)
    try {
      await onConfirm?.()
    } finally {
      // ปลดล็อกเสมอ แม้คำสั่งจะล้ม ผู้ใช้จะได้ลองใหม่หรือกดยกเลิกได้
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className={`px-6 py-4 border-b ${danger ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
          <h3 className={`font-semibold text-base ${danger ? 'text-red-700' : 'text-amber-700'}`}>
            {title}
          </h3>
        </div>
        <div className="px-6 py-4 text-sm text-gray-700 leading-relaxed whitespace-pre-line">{message}</div>
        <div className="px-6 pb-5 flex gap-3 justify-end">
          <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-warning'}`}
            onClick={confirm}
            disabled={busy}
          >
            {busy ? 'กำลังทำรายการ…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
