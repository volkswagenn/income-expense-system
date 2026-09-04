import { useState, useEffect } from 'react'
import Popup from '../../components/shared/Popup'
import UiIcon from '../../components/shared/UiIcon'
import useNoteStore from '../../store/useNoteStore'
import useLogStore from '../../store/useLogStore'
import { buildLogEntry } from '../../lib/logBuilder'
import { methodLabel } from '../../lib/walletEngine'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

function formatThaiDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return `${THAI_DAYS[d.getDay()]}ที่ ${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`
}

/** หนึ่งบรรทัดของรายการจริงที่เกิดขึ้นในวันนั้น */
function TxRow({ tx, getCategoryName }) {
  const isIncome = tx.type === 'income'
  const sub = [
    getCategoryName?.(tx.category),
    methodLabel(tx.method),
    tx.vendor,
  ].filter((s) => s && s !== '—').join(' · ')

  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-gray-50 last:border-0">
      <div className="min-w-0">
        <p className="text-sm text-gray-800 truncate">{tx.itemName || '(ไม่ได้ตั้งชื่อรายการ)'}</p>
        {sub && <p className="text-[11px] text-gray-400 truncate">{sub}</p>}
      </div>
      <span className={`text-sm font-semibold tabular-nums shrink-0 ${isIncome ? 'text-emerald-600' : 'text-red-600'}`}>
        {isIncome ? '+' : '−'}{fmt(tx.amount)}
      </span>
    </div>
  )
}

/**
 * โน้ตของวัน + รายละเอียดว่าวันนั้นมีเงินเข้าออกอะไรบ้าง
 *
 * ทูลทิปตอนชี้เมาส์สรุปให้แค่ยอดรวมต่อหมวดหมู่ พอเห็นว่า "จ่าย 12,721" แล้วอยากรู้ว่า
 * จ่ายค่าอะไร ต้องออกไปหน้าประวัติแล้วกรองวันเอง — กล่องนี้เลยกางรายการของวันนั้นให้ครบ
 */
export default function CalendarNotePopup({
  date, onClose,
  transactions = [], recurringItems = [], pendingItems = [], pendingIncomeItems = [],
  getCategoryName,
}) {
  const { notes, setNote, deleteNote } = useNoteStore()
  const { addLog } = useLogStore()
  const existing = notes[date] || ''
  const [text, setText] = useState(existing)

  const income = transactions.filter((t) => t.type === 'income')
  const expense = transactions.filter((t) => t.type === 'expense')
  const totalIncome = income.reduce((s, t) => s + Number(t.amount || 0), 0)
  const totalExpense = expense.reduce((s, t) => s + Number(t.amount || 0), 0)

  // สิ่งที่ครบกำหนดวันนี้แต่ยังไม่มีเงินออกจริง — รวมสามอย่างเป็นรายการเดียวกัน
  // รอบรายการประจำที่จ่ายแล้วไม่ต้องขึ้นซ้ำ เพราะมันไปโผล่เป็นรายจ่ายด้านบนแล้ว
  const waiting = [
    ...recurringItems
      .filter(({ entry }) => entry.status === 'pending')
      .map(({ entry, item }) => ({
        key: `r-${entry.id}`, label: item.name, amount: Number(entry.amount || 0), kind: 'รายการประจำ · รอจ่าย',
      })),
    ...pendingItems.map((p) => ({
      key: `p-${p.id}`, label: p.itemName || p.description || 'ค้างชำระ', amount: Number(p.amount || 0), kind: 'ค้างชำระ · ครบกำหนด',
    })),
    ...pendingIncomeItems.map((p) => ({
      key: `i-${p.id}`, label: p.description || 'บิลรอรับเงิน', amount: Number(p.amount || 0), kind: 'รอรับเงิน',
    })),
  ]

  const hasAnything = transactions.length > 0 || waiting.length > 0

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSave = () => {
    const next = text.trim()
    if (next) {
      setNote(date, next)
      addLog(buildLogEntry({
        activityType: existing ? 'CALENDAR_NOTE_UPDATE' : 'CALENDAR_NOTE_CREATE',
        description: `${existing ? 'แก้ไข' : 'สร้าง'}โน้ตปฏิทินวันที่ ${date}`,
        oldValue: existing ? { date, text: existing } : null,
        newValue: { date, text: next },
      }))
    } else {
      deleteNote(date)
      if (existing) {
        addLog(buildLogEntry({
          activityType: 'CALENDAR_NOTE_DELETE',
          description: `ลบโน้ตปฏิทินวันที่ ${date}`,
          oldValue: { date, text: existing },
        }))
      }
    }
    onClose()
  }

  const handleDelete = () => {
    deleteNote(date)
    addLog(buildLogEntry({
      activityType: 'CALENDAR_NOTE_DELETE',
      description: `ลบโน้ตปฏิทินวันที่ ${date}`,
      oldValue: { date, text: existing },
    }))
    onClose()
  }

  return (
    <Popup
      title="รายละเอียดของวัน"
      sub={formatThaiDate(date)}
      icon="sticky_note_2"
      headTone="note"
      width={460}
      onClose={onClose}
      onConfirm={handleSave}
      confirmLabel="บันทึกโน้ต"
      footer={
        <div className="flex-none flex items-center gap-2 px-[17px] py-3 border-t border-[#EFEDE7] bg-[#FAF9F6]">
          {existing ? (
            <button
              onClick={handleDelete}
              className="flex-none h-[30px] px-[11px] rounded-[9px] border border-[#F0C4BE] bg-[#FEF6F5] text-expense text-[11.5px] font-semibold flex items-center gap-1.5 hover:brightness-95"
            >
              <UiIcon name="trash" size={14} />
              ลบโน้ต
            </button>
          ) : (
            <span className="flex-none text-[11px] text-[#A5A199]">Ctrl+Enter เพื่อบันทึก</span>
          )}
          <button
            onClick={onClose}
            className="ml-auto h-[38px] px-4 rounded-[11px] border border-hairline bg-white text-[13px] font-semibold hover:bg-paper"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSave}
            className="h-[38px] px-[18px] rounded-[11px] bg-ink text-white text-[13px] font-semibold hover:brightness-125"
          >
            บันทึกโน้ต
          </button>
        </div>
      }
    >
      {hasAnything ? (
        <>
          {/* ยอดรวมของวัน — ตัวเลขสองตัวที่คนดูปฏิทินอยากรู้ก่อนเสมอ */}
          <div className="flex-none grid grid-cols-2 gap-[9px]">
            <div className="rounded-ctl border border-[#BFE0D2] bg-income-soft px-3 py-[9px]">
              <p className="text-[11px] text-[#0F6A50]">รวมรับ</p>
              <p className="tabular-nums text-[18px] font-bold text-income mt-0.5">{fmt(totalIncome)}</p>
            </div>
            <div className="rounded-ctl border border-[#F0C4BE] bg-expense-soft px-3 py-[9px]">
              <p className="text-[11px] text-[#A93A2E]">รวมจ่าย</p>
              <p className="tabular-nums text-[18px] font-bold text-expense mt-0.5">{fmt(totalExpense)}</p>
            </div>
          </div>

          {income.length > 0 && (
            <div className="flex-none">
              <p className="text-[11.5px] font-semibold text-income mb-1">รายรับ {income.length} รายการ</p>
              <div className="rounded-ctl border border-[#F2F0EA] px-3 py-0.5">
                {income.map((t) => <TxRow key={t.id} tx={t} getCategoryName={getCategoryName} />)}
              </div>
            </div>
          )}

          {expense.length > 0 && (
            <div className="flex-none">
              <p className="text-[11.5px] font-semibold text-[#A93A2E] mb-1">รายจ่าย {expense.length} รายการ</p>
              <div className="rounded-ctl border border-[#F2F0EA] px-3 py-0.5">
                {expense.map((t) => <TxRow key={t.id} tx={t} getCategoryName={getCategoryName} />)}
              </div>
            </div>
          )}

          {/* ยังไม่เกิดเงินออกจริง แยกกล่องไว้ไม่ให้ปนกับยอดที่จ่ายไปแล้ว */}
          {waiting.length > 0 && (
            <div className="flex-none">
              <p className="text-[11.5px] font-semibold text-[#8A6A15] mb-1">ที่ต้องจัดการวันนี้</p>
              <div className="rounded-ctl border border-pending-line bg-[#FDFAF2] px-3 py-0.5">
                {waiting.map((w) => (
                  <div key={w.key} className="flex items-center justify-between gap-2.5 py-[7px]">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] truncate">{w.label}</span>
                      <span className="block text-[10.5px] text-faint">{w.kind}</span>
                    </span>
                    {w.amount > 0 && (
                      <span className="tabular-nums flex-none text-[12.5px] font-semibold text-[#8A6A15]">{fmt(w.amount)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="flex-none text-[12.5px] text-faint text-center py-2">วันนี้ยังไม่มีรายการเงินเข้าออก</p>
      )}

      <div className="flex-none">
        <p className="text-[11.5px] font-semibold text-muted mb-[5px]">โน้ต</p>
        <textarea
          className="w-full border border-hairline rounded-ctl px-3 py-2.5 min-h-[64px] text-[12.5px] leading-relaxed outline-none resize-none focus:border-ink"
          rows={3}
          placeholder="พิมพ์โน้ตที่นี่..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleSave() }}
        />
        <p className="text-[11px] text-[#A5A199] mt-1.5">Ctrl+Enter เพื่อบันทึก</p>
      </div>
    </Popup>
  )
}
