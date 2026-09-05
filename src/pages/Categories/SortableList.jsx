import { useState } from 'react'

/**
 * รายการที่ลากจัดลำดับได้ พร้อมช่องว่างที่เปิดออกให้เห็นว่าจะไปลงตรงไหน
 *
 * ทำไมต้องมีช่องว่าง: ถ้าลากแล้วหน้าจอนิ่งเฉย ผู้ใช้จะเดาไม่ออกว่าปล่อยตรงนี้แล้ว
 * ของจะไปแทรกก่อนหรือหลังตัวที่ชี้อยู่ ต้องเห็นที่ว่างเปิดรอไว้ก่อนถึงจะมั่นใจ
 *
 * ช่องว่างใช้ transition ของความสูง ตัวที่อยู่ใต้ลงไปจึงค่อยๆ เลื่อนลงตามแทนที่จะ
 * กระโดดทีเดียว
 *
 * ลากได้เฉพาะภายในชุดเดียวกัน (หมวดหลักสลับกับหมวดหลัก หมวดย่อยสลับกันในแม่เดียวกัน)
 * การย้ายข้ามแม่เป็นการ "เปลี่ยนสังกัด" คนละเรื่องกับการเรียงลำดับ
 */
export default function SortableList({ items, renderItem, onReorder, gapHeight = 38 }) {
  const [dragIndex, setDragIndex] = useState(null)
  const [overIndex, setOverIndex] = useState(null)

  const reset = () => { setDragIndex(null); setOverIndex(null) }

  const drop = () => {
    if (dragIndex == null || overIndex == null) return reset()
    // ตัดตัวที่ลากออกก่อน ดัชนีปลายทางจึงต้องขยับตามถ้าลากลงข้างล่าง
    const target = overIndex > dragIndex ? overIndex - 1 : overIndex
    if (target !== dragIndex) {
      const next = [...items]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(target, 0, moved)
      onReorder(next.map((x) => x.id))
    }
    reset()
  }

  const Gap = ({ show }) => (
    <div
      className="overflow-hidden transition-all duration-150"
      style={{ height: show ? gapHeight : 0 }}
    >
      <div className="h-full rounded-lg border-2 border-dashed border-blue-300 bg-blue-50/60" />
    </div>
  )

  // ลิสต์หมวดย่อยซ้อนอยู่ในลิสต์หมวดหลัก อีเวนต์การลากจึงลอยขึ้นไปถึงชั้นนอกด้วย
  // ผลคือลากหมวดย่อยตัวเดียว แต่ชั้นนอกนึกว่ากำลังลากแถวหมวดหลักของมันไปพร้อมกัน
  // ทั้งหน้าเลยจางและเปิดช่องว่างพร้อมกันหมด แถมปล่อยแล้วยังสลับลำดับหมวดหลักตามไปด้วย
  //
  // กติกาที่ใช้แก้: "ลิสต์ที่เป็นคนเริ่มลากเท่านั้นที่กลืนอีเวนต์" ลิสต์อื่นปล่อยผ่านขึ้นไป
  // จะกลืนทุกกรณีไม่ได้ เพราะตอนลากหมวดหลัก เมาส์ต้องผ่านแถวหมวดย่อยของหมวดอื่น
  // ถ้าชั้นในกลืนไว้ตอนนั้น ชั้นนอกจะไม่รู้ว่าเมาส์อยู่ตรงไหนแล้วค้างไปเฉยๆ
  const dragging = dragIndex !== null
  const stopIfMine = (e) => { if (dragging) e.stopPropagation() }

  return (
    <div
      onDragOver={(e) => { stopIfMine(e); e.preventDefault() }}
      onDrop={(e) => { if (!dragging) return; e.stopPropagation(); e.preventDefault(); drop() }}
      onDragEnd={(e) => { if (!dragging) return; e.stopPropagation(); reset() }}
      // กรอบบางๆ ตอนลาก = ขอบเขตที่ปล่อยได้จริง ย้ายออกนอกชุดนี้ไม่ได้
      className={dragging ? 'rounded-lg ring-1 ring-blue-200 bg-blue-50/30' : ''}
    >
      {items.map((item, i) => (
        <div key={item.id}>
          <Gap show={overIndex === i && dragging} />
          <div
            draggable
            onDragStart={(e) => {
              // ตัวที่อยู่ในสุดเป็นเจ้าของการลากเสมอ ไม่งั้นลากหมวดย่อยแล้วชั้นนอก
              // จะนึกว่ากำลังลากหมวดหลักของมันไปพร้อมกัน
              e.stopPropagation()
              e.dataTransfer.effectAllowed = 'move'
              // Firefox ไม่เริ่มลากถ้าไม่มีข้อมูลติดไปด้วย
              e.dataTransfer.setData('text/plain', item.id)
              setDragIndex(i)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              // ลิสต์นี้ไม่ได้เป็นคนเริ่มลาก = ของที่ลากมาจากชุดอื่น ห้ามเปิดช่องรับ
              // และต้องปล่อยอีเวนต์ขึ้นไปให้ลิสต์เจ้าของใช้หาตำแหน่งปล่อยของมันเอง
              if (dragIndex === null) return
              e.stopPropagation()
              const r = e.currentTarget.getBoundingClientRect()
              // ชี้ครึ่งบน = แทรกก่อนตัวนี้ ครึ่งล่าง = แทรกหลังตัวนี้
              setOverIndex(e.clientY < r.top + r.height / 2 ? i : i + 1)
            }}
            className={`transition-opacity ${dragIndex === i ? 'opacity-30' : 'opacity-100'}`}
          >
            {renderItem(item, i)}
          </div>
        </div>
      ))}
      <Gap show={overIndex === items.length && dragging} />
    </div>
  )
}
