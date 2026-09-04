import { useNavigate } from 'react-router-dom'
import useObligationRows from '../PendingTasks/useObligationRows'
import Icon from '../../components/shared/Icon'
import { daysUntil } from '../../lib/cardCycle'
import { THAI_MONTH_SHORT, localDateStr } from '../../lib/dateUtils'

/**
 * แถบ "ครบกำหนดถัดไป" — ดึงจากชุดเดียวกับหน้ารอดำเนินการ ตัวเลขจึงตรงกันเสมอ
 *
 * จอกว้าง แถบนี้ไปอยู่คอลัมน์ซ้ายใต้การ์ดตัวเลข จึงเรียงเป็นรายการลงมาได้ 6 อัน
 * จอแคบ แถบอยู่ใต้ปฏิทินเป็นแนวนอน มีที่พอแค่ 3 อัน
 *
 * เรนเดอร์ 6 อันเสมอแล้วซ่อน 3 อันท้ายด้วย CSS แทนการอ่านความกว้างจอด้วย JS
 * เพราะการอ่านความกว้างทำให้ต้อง re-render ทุกครั้งที่ลากขยายหน้าต่าง
 */
export default function UpcomingStrip() {
  const navigate = useNavigate()
  const all = useObligationRows().filter(
    (r) => r.kind !== 'income' && r.kind !== 'receivable' && r.kind !== 'tax',
  )

  // นับเฉพาะที่ครบกำหนดภายใน 30 วัน ให้ตรงกับข้อความ "รายการใน 30 วัน"
  const limit = localDateStr(new Date(Date.now() + 30 * 86400000))
  const within30 = all.filter((r) => !r.due || r.due <= limit).length
  const rows = all.slice(0, 6)

  if (rows.length === 0) return null

  return (
    <div className="bg-white border border-hairline rounded-[14px] px-3 py-1.5 wide:px-3 wide:pt-2.5 wide:pb-3 flex flex-row wide:flex-col items-center wide:items-stretch gap-[11px] min-w-0">
      <div className="flex-none flex items-center gap-1.5">
        <Icon name="pending_actions" size={16} className="text-pending" />
        <span className="text-[12.5px] font-semibold whitespace-nowrap">ครบกำหนดถัดไป</span>
        <span className="text-[11px] text-faint whitespace-nowrap">
          <span className="hidden wide:inline">{within30} รายการใน 30 วัน</span>
          <span className="wide:hidden">{Math.min(rows.length, 3)} รายการใกล้สุด</span>
        </span>
      </div>

      <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 wide:grid-cols-1 content-start gap-2">
        {rows.map((r, i) => {
          const d = new Date(r.due + 'T00:00:00')
          const left = daysUntil(d)
          const tone = left < 0 ? 'text-expense' : left <= 7 ? 'text-pending' : 'text-ink'
          return (
            <button
              key={r.key}
              onClick={() => navigate('/pending-tasks')}
              className={`flex items-center gap-[7px] border border-[#EFEDE7] rounded-[10px] px-[7px] py-[3px] min-w-0 text-left hover:bg-[#FAF9F6] hover:border-[#D8D4C9] ${
                i >= 3 ? 'hidden wide:flex' : ''
              }`}
            >
              <span className="flex-none text-center w-[26px]">
                <span className={`tabular-nums block text-sm font-bold leading-[1.1] ${tone}`}>{d.getDate()}</span>
                <span className="block text-[9.5px] text-faint">{THAI_MONTH_SHORT[d.getMonth()]}</span>
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[11.5px] font-medium truncate">{r.title}</span>
                <span className={`tabular-nums block text-[12px] font-bold ${tone}`}>
                  {Number(r.amount).toLocaleString('th-TH')}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
