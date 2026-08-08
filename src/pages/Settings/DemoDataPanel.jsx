import { useState } from 'react'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import Icon from '../../components/shared/Icon'
import { seedDemoData, clearDemoData, hasDemoData } from '../../lib/demoData'

/**
 * แผงสร้าง/ลบข้อมูลทดสอบ — ใช้ตรวจว่าทุกหน้าทำงานถูกโดยไม่ต้องกรอกเอง
 * ข้อมูลจริงกับข้อมูลทดสอบอยู่ที่เดียวกัน จึงต้องยืนยันก่อนเขียนทับเสมอ
 */
export default function DemoDataPanel() {
  const [confirmSeed, setConfirmSeed] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [result, setResult] = useState(null)
  const exists = hasDemoData()

  const doSeed = () => {
    const r = seedDemoData()
    setResult(r)
    setConfirmSeed(false)
    setTimeout(() => window.location.reload(), 600)
  }

  const doClear = () => {
    clearDemoData()
    setConfirmClear(false)
    window.location.reload()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 p-3.5 rounded-panel bg-pending-soft border border-pending-line">
        <Icon name="science" size={18} className="text-pending mt-0.5" />
        <div className="text-[12.5px] text-pending">
          <p className="font-medium">ชุดข้อมูลตัวอย่างสำหรับทดสอบระบบ</p>
          <p className="mt-1 leading-relaxed">
            สร้างบัญชีธนาคาร หมวดหมู่ 2 ชั้น รายการย้อนหลัง 45 วัน ค้างชำระ รอรับเงิน
            ใบกำกับภาษี รายการประจำ กระเป๋าตังค์ และโน้ตปฏิทิน เพื่อดูว่าทุกหน้าทำงานถูกต้อง
          </p>
          <p className="mt-1 font-medium">⚠️ การสร้างจะเขียนทับข้อมูลปัจจุบันทั้งหมด</p>
        </div>
      </div>

      {result && (
        <div className="p-3.5 rounded-panel bg-income-soft text-income text-[12.5px]">
          ✓ สร้างข้อมูลทดสอบแล้ว — รายการ {result.transactions} · หมวดหมู่ {result.categories} ·
          บัญชี {result.accounts} · รายการรอ {result.pending} · รายการประจำ {result.recurring}
          <span className="block mt-0.5 text-[11.5px]">กำลังโหลดหน้าใหม่...</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={() => setConfirmSeed(true)}>
          <Icon name="science" size={18} />
          สร้างข้อมูลทดสอบ
        </button>
        <button className="btn btn-danger" onClick={() => setConfirmClear(true)}>
          <Icon name="delete_sweep" size={18} />
          ลบข้อมูลทดสอบ
        </button>
        {exists && (
          <span className="self-center text-[12px] text-pending">มีข้อมูลทดสอบอยู่ในระบบ</span>
        )}
      </div>

      <ConfirmPopup
        open={confirmSeed}
        title="สร้างข้อมูลทดสอบ"
        message={'ข้อมูลปัจจุบันทั้งหมดจะถูกเขียนทับด้วยชุดตัวอย่าง\n\nถ้ามีข้อมูลจริงอยู่ ให้ไปสำรองข้อมูลก่อน\n\nยืนยันหรือไม่?'}
        onConfirm={doSeed}
        onCancel={() => setConfirmSeed(false)}
        confirmLabel="สร้างข้อมูล"
        danger
      />
      <ConfirmPopup
        open={confirmClear}
        title="ลบข้อมูลทดสอบ"
        message={'ลบข้อมูลทั้งหมดในระบบและเริ่มใหม่จากศูนย์\n\nยืนยันหรือไม่?'}
        onConfirm={doClear}
        onCancel={() => setConfirmClear(false)}
        confirmLabel="ลบทั้งหมด"
        danger
      />
    </div>
  )
}
