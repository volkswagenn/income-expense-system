import { useEffect, useState } from 'react'
import Popup from './Popup'

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

  // ข้อความหลายบรรทัดถูกแยกเป็นย่อหน้าละบรรทัดตามแบบ ไม่ใช่ก้อนเดียวที่ตัดบรรทัดเอง
  // เพราะแต่ละบรรทัดคือผลลัพธ์คนละอย่างที่จะเกิดขึ้น ต้องอ่านทีละข้อได้
  const lines = String(message ?? '').split('\n').filter((l) => l.trim() !== '')

  return (
    <Popup
      title={title}
      sub={danger ? 'ยืนยันก่อนทำรายการนี้' : 'ตรวจสอบก่อนยืนยัน'}
      icon={danger ? 'delete_sweep' : 'error'}
      headTone={danger ? 'danger' : 'note'}
      width={420}
      onClose={onCancel}
      onConfirm={confirm}
      busy={busy}
      danger={danger}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
    >
      {lines.map((l, i) => (
        <p key={i} className="flex-none text-[12.5px] text-muted leading-[1.75]">{l}</p>
      ))}
    </Popup>
  )
}
