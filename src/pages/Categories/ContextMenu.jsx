import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * เมนูคลิกขวาแบบลอย วางตามตำแหน่งเมาส์และดันกลับเข้าจอถ้าล้นขอบ
 *
 * props:
 *   x, y     – ตำแหน่งเมาส์ (clientX / clientY)
 *   items    – [{ key, label, danger?, disabled?, onSelect() }] ใช้ key ขึ้นต้น 'sep' เพื่อคั่นเส้น
 *   onClose()
 */
export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const margin = 8
    setPos({
      left: Math.max(margin, Math.min(x, window.innerWidth - width - margin)),
      top: Math.max(margin, Math.min(y, window.innerHeight - height - margin)),
    })
  }, [x, y, items])

  useEffect(() => {
    // คลิกในเมนูต้องไม่ปิดเมนู — ตัวฟังนี้อยู่ชั้น capture ที่ window จึงทำงาน "ก่อน"
    // ถึงตัวปุ่มเสมอ (e.stopPropagation() ของ React ที่กล่องเมนูกันไม่ได้) ถ้าปิดทันที
    // ตอน mousedown ปุ่มจะหลุด DOM ก่อนถึง mouseup เบราว์เซอร์เลยไม่ยิง click
    // → กดเมนู "สร้างหมวดหมู่ย่อย / เปลี่ยนชื่อ / ลบ" แล้วไม่มีอะไรเกิดขึ้น
    const close = (e) => { if (ref.current?.contains(e.target)) return; onClose() }
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    // capture เพื่อให้ปิดก่อนที่คลิกจะไปโดนอย่างอื่น
    window.addEventListener('mousedown', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-[80] min-w-52 bg-white rounded-xl border border-gray-200 shadow-xl py-1.5"
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) =>
        item.key.startsWith('sep') ? (
          <div key={item.key} className="my-1.5 border-t border-gray-100" />
        ) : (
          <button
            key={item.key}
            role="menuitem"
            disabled={item.disabled}
            className={`w-full text-left px-3.5 py-2 text-sm flex items-center gap-2.5 transition-colors ${
              item.disabled
                ? 'text-gray-300 cursor-not-allowed'
                : item.danger
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-gray-700 hover:bg-gray-100'
            }`}
            onClick={() => { if (!item.disabled) { onClose(); item.onSelect() } }}
          >
            {item.label}
          </button>
        )
      )}
    </div>
  )
}
