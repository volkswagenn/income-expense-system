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

  return (
    <div onDragOver={(e) => e.preventDefault()} onDrop={drop} onDragEnd={reset}>
      {items.map((item, i) => (
        <div key={item.id}>
          <Gap show={overIndex === i && dragIndex !== null} />
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              // Firefox ไม่เริ่มลากถ้าไม่มีข้อมูลติดไปด้วย
              e.dataTransfer.setData('text/plain', item.id)
              setDragIndex(i)
            }}
            onDragOver={(e) => {
              e.preventDefault()
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
      <Gap show={overIndex === items.length && dragIndex !== null} />
    </div>
  )
}
