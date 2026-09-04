import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import IncomeForm from './IncomeForm'
import ExpenseForm from './ExpenseForm'
import DebtForm from './DebtForm'
import RecurringPage from '../Recurring'
import TransactionHistoryPanel from './TransactionHistoryPanel'
import TodayPanel from './TodayPanel'
import BeforeSavePanel from './BeforeSavePanel'
import Icon from '../../components/shared/Icon'
import useRecurringStore from '../../store/useRecurringStore'

/**
 * บันทึกรายการ — ฟอร์มกรอกอยู่ซ้าย ข้อมูลประกอบการตัดสินใจอยู่ขวา
 *
 * แท็บอยู่ในหัวการ์ดเดียวกับฟอร์ม ไม่ได้ลอยอยู่เหนือการ์ด เพราะแท็บคือการสลับ
 * "สิ่งที่กำลังกรอก" ไม่ใช่การสลับหน้า ถ้าวางแยกกันจะดูเหมือนคนละหน้ากัน
 *
 * แผงขวามีทุกแท็บ ไม่ใช่เฉพาะแท็บที่เป็นฟอร์ม — เปลี่ยนหัวข้อไปตามสิ่งที่กำลังทำ
 * (ก่อนกดบันทึก / เดือนนี้ / ช่วงที่ดูอยู่) จอกว้างแผงขวาแบ่งเป็นสองคอลัมน์
 */
const TABS = [
  { key: 'expense', label: 'รายจ่าย', icon: 'arrow_upward' },
  { key: 'income', label: 'รายรับ', icon: 'arrow_downward' },
  { key: 'debt', label: 'หนี้สิน', icon: 'database' },
  { key: 'recurring', label: 'รายการประจำ', icon: 'history' },
  { key: 'history', label: 'ค้นหารายการ', icon: 'search' },
]
const TAB_KEYS = TABS.map((t) => t.key)

/** หัวข้อของแผงขวา เปลี่ยนตามแท็บที่เปิดอยู่ */
const SIDE_HEAD = {
  expense: { kicker: 'ก่อนกดบันทึก', title: 'ระบบจะทำสิ่งนี้' },
  income: { kicker: 'ก่อนกดบันทึก', title: 'ระบบจะทำสิ่งนี้' },
  debt: { kicker: 'ก่อนกดบันทึก', title: 'ระบบจะทำสิ่งนี้' },
  recurring: { kicker: 'เดือนนี้', title: 'รายการประจำที่ยังไม่จ่าย' },
  history: { kicker: 'ช่วงที่ดูอยู่', title: 'สรุปช่วงที่เลือก' },
}

export default function TransactionsPage() {
  // แท็บผูกกับ URL เพื่อให้ลิงก์จากหน้าอื่น (เช่น "ไปจ่าย" ของรายการประจำ) พามาถูกที่
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab = TAB_KEYS.includes(tabParam) ? tabParam : 'expense'
  const selectTab = (key) => setParams(key === 'expense' ? {} : { tab: key }, { replace: true })

  const recurringPendingCount = useRecurringStore((s) => s.getPendingCountCurrentMonth())

  // สถานะฟอร์มที่ ExpenseForm ส่งขึ้นมา ใช้คำนวณยอดก่อน/หลังในแผงข้างขวา
  // (useCallback เพื่อไม่ให้ effect ในฟอร์มวนรอบไม่จบ)
  const [preview, setPreviewState] = useState(null)
  const setPreview = useCallback((p) => setPreviewState(p), [])

  const head = SIDE_HEAD[tab] ?? SIDE_HEAD.expense

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_316px] wide:grid-cols-[minmax(0,1fr)_632px] gap-3.5 items-start">
      {/* ไม่ใส่ overflow-hidden — ไม่งั้นแถบบันทึกท้ายฟอร์มรายจ่ายที่เป็น sticky จะไม่เกาะขอบล่างจอ */}
      <div className="card flex flex-col min-w-0">
        {/* หัวการ์ด: กลุ่มแท็บซ้าย ที่เหลือแล้วแต่แท็บ */}
        <div className="flex items-center gap-2.5 flex-wrap gap-y-2 px-3 sm:px-5 pt-3.5 pb-3 border-b border-[#F2F0EA]">
          {/* มือถือแถบแท็บเลื่อนซ้าย-ขวาได้ 3 ฟอร์มอยู่หน้าสุดตามแบบ ปุ่มสูง 36px ให้นิ้วกดง่าย */}
          <div className="flex bg-paper rounded-[11px] p-[3px] flex-none max-w-full overflow-x-auto [scrollbar-width:none]">
            {TABS.map((t) => {
              const on = tab === t.key
              const badge = t.key === 'recurring' ? recurringPendingCount : 0
              return (
                <button
                  key={t.key}
                  onClick={() => selectTab(t.key)}
                  className={`h-9 lg:h-8 px-3 rounded-[9px] text-[12.5px] flex items-center gap-1.5 whitespace-nowrap transition ${
                    on ? 'bg-white text-ink font-semibold shadow-[0_1px_2px_rgba(22,24,29,.08)]' : 'text-muted hover:text-ink'
                  }`}
                >
                  <Icon name={t.icon} size={16} />
                  {t.label}
                  {badge > 0 && (
                    <span
                      className={`text-[10.5px] font-bold rounded-full min-w-[17px] h-[17px] px-[5px] flex items-center justify-center tabular-nums ${
                        on ? 'bg-ink text-lime' : 'bg-hairline text-muted'
                      }`}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* เนื้อในเลื่อนได้เอง หัวการ์ดกับแถบบันทึกจึงอยู่กับที่ตลอด */}
        <div className="flex-1 min-h-0">
          {tab === 'expense' && <ExpenseForm onPreviewChange={setPreview} />}
          {tab === 'income' && <IncomeForm onPreviewChange={setPreview} />}
          {tab === 'debt' && <DebtForm onPreviewChange={setPreview} />}
          {tab === 'recurring' && <div className="p-4 sm:p-5"><RecurringPage /></div>}
          {tab === 'history' && <div className="p-4 sm:p-5"><TransactionHistoryPanel /></div>}
        </div>
      </div>

      <aside className="grid grid-cols-1 wide:grid-cols-2 content-start gap-3 min-w-0">
        <BeforeSavePanel preview={preview} kicker={head.kicker} title={head.title} tab={tab} />
        <TodayPanel />
      </aside>
    </div>
  )
}
