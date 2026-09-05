import { useMemo, useState } from 'react'
import Popup from './Popup'
import Icon from './Icon'
import UiIcon from './UiIcon'
import AppIcon from './AppIcon'
import CategorySelect from './CategorySelect'
import useCategoryStore from '../../store/useCategoryStore'

/**
 * เลือกจากรายการที่บันทึกไว้ — กดใบเดียวเติมชื่อรายการกับหมวดหมู่ให้ทันที
 *
 * ทำไมเป็นป๊อปอัปไม่ใช่แถบกางลง
 *   รายการที่บันทึกไว้ของร้านที่ใช้จริงมีหลายสิบใบ ถ้ากางอยู่ในฟอร์มจะดันช่องอื่น
 *   ลงไปจนต้องเลื่อนหา และไม่มีที่พอให้ช่องค้นหา ซึ่งเป็นสิ่งที่ต้องมีเมื่อรายการเยอะ
 *
 * ทำไมแก้และลบต้องทำได้ที่นี่
 *   ที่นี่เป็นที่เดียวที่เห็นรายการที่บันทึกไว้พร้อมหมวดหมู่ของมันครบทุกใบ ของเดิม
 *   ต้องไปกดแก้ในแถบกางลงของช่องชื่อรายการ ซึ่งแก้ได้แค่ชื่อ เปลี่ยนหมวดหมู่ไม่ได้เลย
 *   ใบที่ผูกหมวดหมู่ผิดไว้ตั้งแต่แรกจึงเติมหมวดหมู่ผิดให้ทุกครั้งที่กดใช้ไปตลอด
 *
 * onPick({ name, categoryId })
 * onUpdate(id, { name, categoryId })  – ไม่ส่งมา = ไม่แสดงปุ่มแก้ไข
 * onDelete(id)                        – ไม่ส่งมา = ไม่แสดงปุ่มลบ
 */
export default function RecentItemsPopup({
  items = [], currentName = '', onPick, onSaveCurrent, onUpdate, onDelete, onClose,
}) {
  const [q, setQ] = useState('')
  // แก้ไขและยืนยันลบเกิดในใบของมันเอง ไม่เปิดป๊อปอัปซ้อนป๊อปอัป — ซ้อนแล้วกด Esc
  // ทีเดียวปิดทั้งสองชั้น ผู้ใช้จะแยกไม่ออกว่าเพิ่งยกเลิกอะไรไป
  const [editId, setEditId] = useState(null)
  const [draft, setDraft] = useState({ name: '', categoryId: '' })
  const [confirmId, setConfirmId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
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

  const startEdit = (it) => {
    setConfirmId(null)
    setErr('')
    setEditId(it.id)
    setDraft({ name: it.name ?? '', categoryId: it.categoryId ?? '' })
  }

  const saveEdit = async () => {
    if (busy) return
    const name = draft.name.trim()
    if (!name) return setErr('ใส่ชื่อรายการด้วย')
    setBusy(true)
    setErr('')
    try {
      await onUpdate(editId, { name, categoryId: draft.categoryId || null })
      setEditId(null)
    } catch (e) {
      // ไม่ปิดช่องแก้ไขเมื่อบันทึกไม่สำเร็จ ไม่งั้นสิ่งที่พิมพ์หายไปพร้อมกับเหตุผล
      setErr(e?.message ?? 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const doDelete = async (id) => {
    if (busy) return
    setBusy(true)
    setErr('')
    try {
      await onDelete(id)
      setConfirmId(null)
    } catch (e) {
      setErr(e?.message ?? 'ลบไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

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
            รายการที่บันทึกไว้มาจากที่คุณบันทึกซ้ำบ่อย · กดดินสอเพื่อแก้ชื่อหรือเปลี่ยนหมวดหมู่ · กดถังขยะเพื่อลบ
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
          {shown.map((it) => {
            // ── กำลังแก้ไขใบนี้ ── กินสองคอลัมน์ เพราะชื่อหมวดหมู่เต็มๆ ยาวเกินครึ่งแถว
            if (editId === it.id) {
              return (
                <div
                  key={it.id}
                  className="sm:col-span-2 border-2 border-ink rounded-[11px] px-[11px] py-[9px] bg-white flex flex-col gap-2"
                >
                  <input
                    autoFocus
                    className="input h-9 text-[12.5px]"
                    value={draft.name}
                    onChange={(e) => { setDraft((d) => ({ ...d, name: e.target.value })); setErr('') }}
                    onKeyDown={(e) => {
                      // จัดการเองทั้งคู่ ไม่ปล่อยให้ Enter ทะลุไปกดปุ่มอื่นของป๊อปอัป
                      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); saveEdit() }
                      if (e.key === 'Escape') { e.stopPropagation(); setEditId(null) }
                    }}
                    placeholder="ชื่อรายการ"
                  />
                  <CategorySelect
                    value={draft.categoryId}
                    onChange={(v) => { setDraft((d) => ({ ...d, categoryId: v })); setErr('') }}
                    className="input h-9 text-[12.5px]"
                    placeholder="ไม่ผูกหมวดหมู่"
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={saveEdit}
                      disabled={busy}
                      className="h-8 px-3 rounded-[9px] bg-ink text-white text-[12px] font-semibold hover:bg-black disabled:opacity-50"
                    >
                      {busy ? 'กำลังบันทึก…' : 'บันทึก'}
                    </button>
                    <button
                      onClick={() => { setEditId(null); setErr('') }}
                      className="h-8 px-3 rounded-[9px] border border-hairline bg-white text-[12px] hover:bg-paper"
                    >
                      ยกเลิก
                    </button>
                    <span className="text-[11px] text-faint">
                      แก้ที่นี่ไม่กระทบรายจ่ายที่เคยบันทึกไปแล้ว
                    </span>
                  </div>
                  {err && <p className="text-[11.5px] text-expense">{err}</p>}
                </div>
              )
            }

            // ── ยืนยันก่อนลบใบนี้ ──
            if (confirmId === it.id) {
              return (
                <div
                  key={it.id}
                  className="sm:col-span-2 border border-expense-line bg-expense-soft/50 rounded-[11px] px-[11px] py-[9px] flex items-center gap-2 flex-wrap"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-semibold truncate">ลบ “{it.name}” ออกจากรายการที่บันทึกไว้?</span>
                    <span className="block text-[11px] text-muted">
                      ลบแค่ทางลัดใบนี้ · รายจ่ายที่เคยบันทึกด้วยชื่อนี้ยังอยู่ในประวัติครบ
                    </span>
                  </span>
                  <button
                    onClick={() => doDelete(it.id)}
                    disabled={busy}
                    className="h-8 px-3 rounded-[9px] bg-expense text-white text-[12px] font-semibold hover:brightness-110 disabled:opacity-50"
                  >
                    {busy ? 'กำลังลบ…' : 'ลบ'}
                  </button>
                  <button
                    onClick={() => { setConfirmId(null); setErr('') }}
                    className="h-8 px-3 rounded-[9px] border border-hairline bg-white text-[12px] hover:bg-paper"
                  >
                    ยกเลิก
                  </button>
                  {err && <p className="w-full text-[11.5px] text-expense">{err}</p>}
                </div>
              )
            }

            // ── ใบปกติ ── ตัวใบยังเป็นปุ่มเลือกเหมือนเดิม ปุ่มแก้กับลบอยู่นอกปุ่มนั้น
            // เพราะปุ่มซ้อนในปุ่มผิดมาตรฐาน HTML และบางเบราว์เซอร์กดปุ่มในไม่ติด
            return (
              <div
                key={it.id}
                className="flex items-center gap-1 border border-hairline rounded-[11px] pr-1.5 bg-white hover:border-ink transition"
              >
                <button
                  onClick={() => onPick({ name: it.name, categoryId: it.categoryId ?? null })}
                  className="min-w-0 flex-1 flex items-center gap-[9px] px-[11px] py-[9px] text-left rounded-l-[11px] hover:bg-[#F2FAD9]"
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
                {/* ใช้ UiIcon ไม่ใช่ <Icon> เพราะฟอนต์ Material ในแอปโหลดมาเฉพาะไอคอนที่
                    ระบุไว้ใน index.html ซึ่งไม่มี edit กับ delete — ใส่ไปจะขึ้นเป็นคำว่า
                    "edit" "delete" ตัวหนังสือแทนรูป */}
                {onUpdate && (
                  <button
                    onClick={() => startEdit(it)}
                    title="แก้ชื่อหรือเปลี่ยนหมวดหมู่"
                    className="flex-none w-7 h-7 rounded-[8px] flex items-center justify-center hover:bg-paper"
                  >
                    <UiIcon name="edit" tone="gray" size={14} />
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => { setConfirmId(it.id); setEditId(null); setErr('') }}
                    title="ลบรายการที่บันทึกไว้ใบนี้"
                    className="flex-none w-7 h-7 rounded-[8px] flex items-center justify-center hover:bg-expense-soft"
                  >
                    <UiIcon name="trash" tone="gray" size={14} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Popup>
  )
}
