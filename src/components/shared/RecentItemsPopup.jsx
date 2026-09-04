import { useMemo, useState } from 'react'
import Popup from './Popup'
import Icon from './Icon'
import UiIcon from './UiIcon'
import AppIcon from './AppIcon'
import useCategoryStore from '../../store/useCategoryStore'

/**
 * เลือกจากรายการที่บันทึกไว้ — กดใบเดียวเติมชื่อรายการกับหมวดหมู่ให้ทันที
 *
 * ทำไมเป็นป๊อปอัปไม่ใช่แถบกางลง
 *   รายการที่บันทึกไว้ของร้านที่ใช้จริงมีหลายสิบใบ ถ้ากางอยู่ในฟอร์มจะดันช่องอื่น
 *   ลงไปจนต้องเลื่อนหา และไม่มีที่พอให้ช่องค้นหา ซึ่งเป็นสิ่งที่ต้องมีเมื่อรายการเยอะ
 *
 * onPick({ name, categoryId })
 */
export default function RecentItemsPopup({ items = [], currentName = '', onPick, onSaveCurrent, onClose }) {
  const [q, setQ] = useState('')
  const getCategoryPath = useCategoryStore((s) => s.getCategoryPath)

  const kw = q.trim().toLowerCase()
  const shown = useMemo(
    () => (kw ? items.filter((i) => i.name.toLowerCase().includes(kw)) : items),
    [items, kw],
  )

  // ชื่อที่พิมพ์ไว้แล้วแต่ยังไม่ได้บันทึกเป็นรายการประจำใช้ — เสนอให้บันทึกไว้ใช้อีก
  const canSaveCurrent =
    currentName.trim().length > 0 &&
    !items.some((i) => i.name.trim() === currentName.trim())

  return (
    <Popup
      title="รายการที่บันทึกไว้"
      sub={`${items.length} รายการ · กดใบเดียวเติมชื่อและหมวดหมู่ให้`}
      icon="bolt"
      width={520}
      onClose={onClose}
      footer={
        <div className="flex-none flex items-center gap-2 px-[17px] py-3 border-t border-[#EFEDE7] bg-[#FAF9F6]">
          <span className="flex-1 min-w-0 text-[11px] text-faint leading-relaxed">
            รายการที่บันทึกไว้มาจากที่คุณบันทึกซ้ำบ่อย เพิ่มหรือลบได้ที่ จัดการข้อมูล → รายการที่บันทึกไว้
          </span>
          {canSaveCurrent && (
            <button
              onClick={() => onSaveCurrent?.(currentName.trim())}
              className="flex-none h-8 px-3 rounded-[9px] border border-hairline bg-white text-[12px] font-semibold flex items-center gap-1.5 hover:bg-paper"
            >
              <UiIcon name="plus" size={13} />
              บันทึกรายการนี้ไว้ใช้อีก
            </button>
          )}
        </div>
      }
    >
      <div className="flex-none h-10 px-3 border border-hairline rounded-[11px] bg-white flex items-center gap-2">
        <Icon name="search" size={18} className="text-faint flex-none" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหาชื่อรายการที่บันทึกไว้"
          className="flex-1 min-w-0 bg-transparent outline-none text-[12.5px]"
        />
      </div>

      {shown.length === 0 ? (
        <p className="text-[12.5px] text-faint text-center py-8">
          {items.length === 0
            ? 'ยังไม่มีรายการที่บันทึกไว้ — บันทึกรายจ่ายสักครั้งแล้วกด "บันทึกรายการนี้ไว้ใช้อีก"'
            : `ไม่พบรายการที่ตรงกับ “${q.trim()}”`}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 content-start overflow-y-auto max-h-[320px]">
          {shown.map((it) => (
            <button
              key={it.id}
              onClick={() => onPick({ name: it.name, categoryId: it.categoryId ?? null })}
              className="flex items-center gap-[9px] border border-hairline rounded-[11px] px-[11px] py-[9px] text-left bg-white hover:bg-[#F2FAD9] hover:border-ink transition"
            >
              <span className="w-7 h-7 flex-none rounded-[9px] bg-expense-soft flex items-center justify-center">
                <AppIcon value={it.icon} size={16} color="#D0483C" fallback="receipt_long" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold truncate">{it.name}</span>
                <span className="block text-[11px] text-faint truncate">
                  {it.categoryId ? getCategoryPath(it.categoryId) : 'ยังไม่ได้ตั้งหมวดหมู่'}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Popup>
  )
}
