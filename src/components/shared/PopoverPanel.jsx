import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const MARGIN = 8

/**
 * แผงลอยที่เกาะกับปุ่มต้นทาง
 *
 * render ผ่าน portal ไปที่ body เพื่อไม่ให้โดน overflow-hidden ของป๊อปอัปแม่ตัดขาด
 * และคำนวณตำแหน่งใหม่ทุกครั้งที่เปิด/ย่อขยาย/เลื่อนจอ เพื่อไม่ให้ตกขอบจอ
 *
 * props:
 *   anchorRef – ref ของปุ่มที่กด
 *   align     – 'start' ชิดซ้ายปุ่ม | 'end' ชิดขวาปุ่ม (ค่าเริ่มต้นเลือกให้เองตามพื้นที่)
 */
export default function PopoverPanel({ anchorRef, align, children }) {
  const panelRef = useRef(null)
  const [pos, setPos] = useState({ left: -9999, top: -9999, ready: false })

  useLayoutEffect(() => {
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect()
      const p = panelRef.current?.getBoundingClientRect()
      if (!a || !p) return

      // เลือกด้านที่มีที่ว่างพอ ถ้าไม่ระบุมา
      const side = align ?? (a.left + p.width + MARGIN > window.innerWidth ? 'end' : 'start')
      let left = side === 'end' ? a.right - p.width : a.left
      left = Math.max(MARGIN, Math.min(left, window.innerWidth - p.width - MARGIN))

      // ปกติกางลงล่าง ถ้าล่างไม่พอให้พลิกขึ้นบน
      let top = a.bottom + 6
      if (top + p.height > window.innerHeight - MARGIN) {
        const above = a.top - p.height - 6
        top = above >= MARGIN ? above : Math.max(MARGIN, window.innerHeight - p.height - MARGIN)
      }

      setPos({ left, top, ready: true })
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchorRef, align, children])

  return createPortal(
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        visibility: pos.ready ? 'visible' : 'hidden',
        maxHeight: `calc(100vh - ${MARGIN * 2}px)`,
        overflowY: 'auto',
      }}
      className="z-[95]"
      data-popover-panel=""
      // กันไม่ให้ตัวตรวจ "คลิกนอกพื้นที่" ปิดแผงตัวเอง (แผงอยู่คนละที่ใน DOM แล้ว)
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  )
}
