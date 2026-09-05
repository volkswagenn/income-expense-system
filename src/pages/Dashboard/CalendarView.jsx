import { useState, useEffect, useMemo } from 'react'
import { format } from 'date-fns'

import useTransactionStore from '../../store/useTransactionStore'
import usePendingStore from '../../store/usePendingStore'
import useCategoryStore from '../../store/useCategoryStore'
import useNoteStore from '../../store/useNoteStore'
import useRecurringStore from '../../store/useRecurringStore'
import useCreditCardStore from '../../store/useCreditCardStore'
import CalendarDayCell from './CalendarDayCell'
import CalendarNotePopup from './CalendarNotePopup'
import YearlyRecurringPopup from './YearlyRecurringPopup'
import Icon from '../../components/shared/Icon'
import { isYearly, pauseInfo } from '../../lib/recurringSchedule'
import { clampedDate, toDateString, formatThaiDate } from '../../lib/cardCycle'
import { localMonthStr } from '../../lib/dateUtils'

const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]
const DAY_HEADERS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

// สิ่งที่เลือกแสดง/ซ่อนบนปฏิทินได้
const LAYERS = [
  { key: 'income',        label: 'รายรับ',        dot: 'bg-emerald-500' },
  { key: 'expense',       label: 'รายจ่าย',       dot: 'bg-red-500' },
  { key: 'pending',       label: 'ค้างชำระ',      dot: 'bg-amber-500' },
  { key: 'pendingIncome', label: 'รอรับเงิน',     dot: 'bg-blue-500' },
  { key: 'tax',           label: 'ใบกำกับภาษี',   dot: 'bg-orange-500' },
  { key: 'recurring',     label: 'รายการประจำ',   dot: 'bg-purple-500' },
  { key: 'cardBill',      label: 'บิลบัตรเครดิต', dot: 'bg-rose-500' },
  { key: 'note',          label: 'โน้ต',          dot: 'bg-gray-400' },
]

const ALL_ON = Object.fromEntries(LAYERS.map((l) => [l.key, true]))

function buildCells(year, month) {
  const firstDow = new Date(year, month, 1).getDay()
  const gridStart = new Date(year, month, 1 - firstDow)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    return d
  })
}

/**
 * @param selectedDate  วันที่แผงรายละเอียดข้างขวากำลังแสดง (แถบไฮไลต์บนปฏิทิน)
 * @param onSelectDate  กดวัน = เลือกวันนั้น
 * @param openDayDate   วันที่ต้องเปิดกล่องรายละเอียด (แผงข้างขวาสั่งเปิดได้ด้วย)
 * @param onCloseDay    ปิดกล่องรายละเอียด
 */
export default function CalendarView({
  selectedDate, onSelectDate, openDayDate, onOpenDay, onCloseDay,
}) {
  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')

  const [viewYear, setViewYear] = useState(() => today.getFullYear())
  const [viewMonth, setViewMonth] = useState(() => today.getMonth())
  const [noteDate, setNoteDate] = useState(null)
  const [showYearly, setShowYearly] = useState(false)
  const [show, setShow] = useState(ALL_ON)
  // มือถือเห็นชิปชั้นข้อมูล 4 อันแรกตามแบบ กดปุ่ม tune เพื่อกางที่เหลือ
  const [allChips, setAllChips] = useState(false)

  const toggleLayer = (key) => setShow((s) => ({ ...s, [key]: !s[key] }))
  const activeCount = LAYERS.filter((l) => show[l.key]).length

  const { transactions } = useTransactionStore()
  const { pendingPayments, taxInvoices, pendingIncomes } = usePendingStore()
  const { getCategoryName } = useCategoryStore()
  const { notes } = useNoteStore()
  const { entries: recurringEntries, items: recurringItems, generateEntries } = useRecurringStore()
  const cards = useCreditCardStore((s) => s.cards)
  const cardStatements = useCreditCardStore((s) => s.statements)
  const cardInstallmentEntries = useCreditCardStore((s) => s.entries)
  // ปฏิทินที่แคบ ใช้ชื่อสั้น (ชื่อบัตร + เลขท้าย) ไม่งั้นชื่อยาวจนล้นกล่อง
  const getCardShortLabel = useCreditCardStore((s) => s.getCardShortLabel)
  const getUpcomingBills = useCreditCardStore((s) => s.getUpcomingBills)

  // กด T ที่ไหนก็ได้เพื่อกลับมาเดือนปัจจุบัน — ป้าย kbd บนปุ่ม "วันนี้" บอกไว้
  // ข้ามเมื่อโฟกัสอยู่ในช่องกรอก ไม่งั้นพิมพ์ตัว t แล้วปฏิทินเด้งกลับเดือนนี้
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 't' && e.key !== 'T' && e.key !== 'ะ') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const el = e.target
      if (el?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName)) return
      setViewYear(today.getFullYear())
      setViewMonth(today.getMonth())
      onSelectDate?.(todayStr)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [todayStr, onSelectDate])

  // Generate recurring entries when calendar month changes (หรือเมื่อรายการประจำเปลี่ยน)
  useEffect(() => {
    const month = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`
    generateEntries(month)
  }, [viewYear, viewMonth, recurringItems])

  const cells = useMemo(() => buildCells(viewYear, viewMonth), [viewYear, viewMonth])

  // กล่องรายละเอียดของวัน เปิดได้จาก 2 ทาง: กดขวาบนช่องวัน หรือแผงข้างขวาสั่งเปิด
  const dayPopupDate = noteDate ?? openDayDate ?? null

  const txByDate = useMemo(() => {
    const map = {}
    transactions.forEach((tx) => {
      if (!map[tx.date]) map[tx.date] = []
      map[tx.date].push(tx)
    })
    return map
  }, [transactions])

  const pendingByDate = useMemo(() => {
    const map = {}
    pendingPayments
      .filter((p) => p.status === 'pending' && p.dueDate)
      .forEach((p) => {
        if (!map[p.dueDate]) map[p.dueDate] = []
        map[p.dueDate].push(p)
      })
    return map
  }, [pendingPayments])

  const pendingIncomeByDate = useMemo(() => {
    const map = {}
    ;(pendingIncomes ?? [])
      .filter((p) => p.status === 'pending' && p.date)
      .forEach((p) => {
        if (!map[p.date]) map[p.date] = []
        map[p.date].push(p)
      })
    return map
  }, [pendingIncomes])

  const taxByDate = useMemo(() => {
    const map = {}
    taxInvoices
      .filter((t) => t.status === 'waiting' && t.dueDate)
      .forEach((t) => {
        if (!map[t.dueDate]) map[t.dueDate] = []
        map[t.dueDate].push(t)
      })
    return map
  }, [taxInvoices])

  // รายปีโผล่ในปฏิทินแค่เดือนเดียวจาก 12 เดือน จึงต้องมีทางเห็นได้ทุกเดือน
  // (ปุ่มบนหัวปฏิทิน + ป้ายบนวันที่ 1 ของทุกเดือน)
  const yearlyItems = useMemo(
    () => recurringItems.filter((it) => it.enabled && !it.deleted && isYearly(it)),
    [recurringItems]
  )

  const yearlyDueThisMonth = useMemo(() => {
    const mon = viewMonth + 1
    return yearlyItems.filter((it) => Number(it.billingMonth) === mon && !pauseInfo(it, localMonthStr()))
  }, [yearlyItems, viewMonth])

  /**
   * บิลบัตรเครดิตตามวันครบกำหนด
   *
   * มีสองแบบและต้องแสดงคนละความหมาย
   *   ปิดรอบแล้ว  = ใบแจ้งยอดที่มีอยู่จริงในฐานข้อมูล ยอดแน่นอน รวมใบที่จ่ายแล้วด้วย
   *                 เพื่อให้ย้อนดูเดือนเก่าแล้วยังเห็นว่าเคยมีบิลวันไหน
   *   ประมาณการ   = รอบที่ยังไม่ปิด คำนวณสดจากรายการที่รูดไว้ ยอดยังขยับได้
   *
   * getUpcomingBills มองไปข้างหน้าจากวันนี้เท่านั้น เวลาเลื่อนปฏิทินไปเดือนถัดๆ ไป
   * จึงต้องขยายช่วงให้ครอบคลุมเดือนที่กำลังดู ไม่งั้นบิลของเดือนนั้นจะหายไปเฉยๆ
   */
  const cardBillsByDate = useMemo(() => {
    const map = {}
    const push = (date, row) => {
      if (!date) return
      if (!map[date]) map[date] = []
      map[date].push(row)
    }

    for (const s of cardStatements) {
      const remaining = Number(s.amount || 0) - Number(s.paidAmount || 0)
      push(s.dueDate, {
        key: `s-${s.id}`,
        cardName: getCardShortLabel(s.cardId),
        amount: s.status === 'paid' ? Number(s.amount || 0) : remaining,
        paid: s.status === 'paid',
        projected: false,
        overdue: s.status !== 'paid' && s.dueDate < todayStr,
      })
    }

    /**
     * วันสรุปยอดของรอบที่ยังไม่ปิด — ป้ายคนละความหมายกับวันครบกำหนด
     *
     * ค่างวดผ่อนของเดือนนี้ไม่มีวันไหนให้เห็นเลยในปฏิทิน เพราะเงินจริงออกวันครบ
     * กำหนดซึ่งเป็นเดือนถัดไป (รูดกับบัตรที่สรุปยอดสิ้นเดือน จ่ายวันที่ 10)
     * ผู้ใช้จึงเปิดปฏิทินเดือนนี้แล้วไม่เห็นยอดผ่อนสักบาท ทั้งที่มีงวดเดินอยู่
     * ป้ายวันสรุปยอดตอบว่า "ยอดของเดือนนี้ปิดวันนี้เท่านี้ แล้วไปจ่ายวันไหน"
     * ไม่ใช่รายการจ่ายจริง จึงไม่นับรวมในยอดรายจ่ายของวันและใช้สีอ่อนกว่า
     */
    const closingOf = (cardId, cycle) => {
      const card = cards.find((c) => c.id === cardId)
      const [y, m] = String(cycle).split('-').map(Number)
      if (!card || !y || !m) return null
      return toDateString(clampedDate(y, m - 1, card.closingDay))
    }

    const monthsAhead = Math.max(
      2,
      (viewYear - today.getFullYear()) * 12 + (viewMonth - today.getMonth()) + 1
    )
    const closedKeys = new Set(cardStatements.map((s) => `${s.cardId}|${s.cycle}`))
    for (const r of getUpcomingBills(monthsAhead).rows) {
      if (r.kind !== 'projected') continue
      if (closedKeys.has(`${r.cardId}|${r.cycle}`)) continue
      const cardName = getCardShortLabel(r.cardId)
      push(r.dueDate, {
        key: r.key,
        cardName,
        amount: r.amount,
        installment: r.installment ?? 0,
        paid: false,
        projected: true,
        overdue: false,
      })
      push(closingOf(r.cardId, r.cycle), {
        key: `c-${r.key}`,
        cardName,
        amount: r.amount,
        installment: r.installment ?? 0,
        closing: true,
        dueDate: r.dueDate,
        dueLabel: formatThaiDate(new Date(`${r.dueDate}T00:00:00`)),
        paid: false,
        projected: true,
        overdue: false,
      })
    }
    return map
  }, [cardStatements, cards, transactions, cardInstallmentEntries, viewYear, viewMonth, todayStr])

  const recurringByDate = useMemo(() => {
    const map = {}
    recurringEntries.forEach((entry) => {
      if (!entry.dueDate) return
      const item = recurringItems.find((it) => it.id === entry.recurringId)
      if (!item) return
      if (!map[entry.dueDate]) map[entry.dueDate] = []
      map[entry.dueDate].push({ entry, item })
    })
    return map
  }, [recurringEntries, recurringItems])

  const navigateMonth = (delta) => {
    let m = viewMonth + delta
    let y = viewYear
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setViewMonth(m)
    setViewYear(y)
  }

  const goToToday = () => {
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
    onSelectDate?.(todayStr)
  }

  // วันที่ผู้ใช้กดเลือก คือวันที่แผงข้างขวากำลังแสดงอยู่ — ต้องเห็นชัดว่าเป็นอันไหน
  //
  // เดิมยังไฮไลต์ตามช่วงวันที่ของแถบกรองด้านบนได้ด้วย แต่แถบกรองนั้นถูกถอดออกจาก
  // หน้าภาพรวมแล้ว (ย้ายไปหน้ารายงานซึ่งเป็นที่ของการเลือกช่วงเวลา) เหลือทางเดียวคือกดวัน
  const isHighlighted = (dateStr) => selectedDate === dateStr
  const isInCustomRange = () => false

  return (
    <div className="card flex flex-col overflow-hidden">
      {/* หัวปฏิทิน — เลื่อนเดือน / วันนี้ / จำนวนชั้นข้อมูลที่เปิดอยู่ */}
      <div className="flex items-center gap-2.5 px-4 pt-3 pb-2.5 flex-wrap">
        <div className="flex items-center gap-0.5">
          <button
            className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center text-muted hover:bg-paper hover:text-ink"
            onClick={() => navigateMonth(-1)}
            title="เดือนก่อนหน้า"
          >
            <Icon name="chevron_left" size={19} />
          </button>
          <h2 className="text-[15px] font-semibold min-w-[132px] text-center">
            {THAI_MONTHS_FULL[viewMonth]} {viewYear + 543}
          </h2>
          <button
            className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center text-muted hover:bg-paper hover:text-ink"
            onClick={() => navigateMonth(1)}
            title="เดือนถัดไป"
          >
            <Icon name="chevron_right" size={19} />
          </button>
        </div>

        {/* ป้าย T บอกปุ่มลัด กด T ที่ไหนก็ได้เพื่อกลับมาเดือนปัจจุบัน */}
        <button
          className="h-[34px] lg:h-[30px] px-3 rounded-[9px] bg-paper text-[12.5px] font-semibold flex items-center gap-[5px] hover:bg-hairline"
          onClick={goToToday}
        >
          วันนี้
          <kbd className="hidden lg:inline text-[10.5px] font-semibold rounded-[5px] px-1.5 py-0.5 bg-white text-faint">T</kbd>
        </button>

        {/* มือถือ: ปุ่ม tune กางชิปชั้นข้อมูลที่เหลือ (แบบมีชิปแค่ 4 อันแรกให้เห็น) */}
        <button
          className={`lg:hidden ml-auto w-[34px] h-[34px] rounded-[9px] border flex items-center justify-center ${
            allChips ? 'bg-ink border-ink text-lime' : 'border-hairline text-muted'
          }`}
          onClick={() => setAllChips((v) => !v)}
          title="ชั้นข้อมูลทั้งหมด"
        >
          <Icon name="tune" size={18} />
        </button>

        <span className="hidden lg:flex ml-auto h-[30px] px-2.5 rounded-[9px] border border-hairline text-[12.5px] text-muted items-center gap-1.5">
          <Icon name="tune" size={16} />
          ชั้นข้อมูล {activeCount}/{LAYERS.length}
        </span>
        <button
          className="hidden lg:flex h-[30px] px-2.5 rounded-[9px] border border-hairline text-[12.5px] font-semibold text-income hover:bg-income-soft hover:border-ink"
          onClick={() => setShow(activeCount === LAYERS.length ? {} : ALL_ON)}
        >
          {activeCount === LAYERS.length ? 'ซ่อนทั้งหมด' : 'แสดงทั้งหมด'}
        </button>
      </div>

      {/* ชั้นข้อมูลที่เลือกแสดงบนปฏิทิน */}
      {/* มือถือชิปอยู่แถวเดียวเลื่อนซ้าย-ขวา (แบบวาง 4 อันในแถวเดียว) จอใหญ่ห่อบรรทัดได้ */}
      <div className="flex flex-nowrap overflow-x-auto [scrollbar-width:none] lg:flex-wrap lg:overflow-visible items-center gap-1.5 px-4 pb-2">
        {LAYERS.map((l, i) => (
          <button
            key={l.key}
            onClick={() => toggleLayer(l.key)}
            className={`${i >= 4 && !allChips ? 'hidden lg:flex' : 'flex'} flex-none items-center gap-1.5 whitespace-nowrap text-[11.5px] h-[28px] lg:h-6 px-2.5 rounded-full border transition-colors ${
              show[l.key]
                ? 'bg-white border-hairline text-ink'
                : 'bg-transparent border-hairline text-[#C9C5BA] line-through'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${show[l.key] ? l.dot : 'bg-[#D6D3CA]'}`} />
            {l.label}
          </button>
        ))}
      </div>

      {/* หัวคอลัมน์วัน */}
      <div className="grid grid-cols-7 border-t border-[#EFEDE7] bg-[#FAF9F6]">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="text-center text-[11.5px] font-semibold text-faint py-[7px]">{d}</div>
        ))}
      </div>

      {/* ตารางวัน */}
      <div className="grid grid-cols-7 gap-1 p-1.5">
        {cells.map((date) => {
          const dateStr = format(date, 'yyyy-MM-dd')
          // ซ่อนตามตัวกรองด้านบน — ส่งเฉพาะชั้นข้อมูลที่เปิดอยู่
          const dayTx = (txByDate[dateStr] || []).filter(
            (t) => (t.type === 'income' ? show.income : show.expense)
          )
          return (
            <CalendarDayCell
              key={dateStr}
              date={date}
              dateStr={dateStr}
              isCurrentMonth={date.getMonth() === viewMonth}
              isToday={dateStr === todayStr}
              isHighlighted={isHighlighted(dateStr)}
              isInCustomRange={isInCustomRange(dateStr)}
              transactions={dayTx}
              pendingItems={show.pending ? (pendingByDate[dateStr] || []) : []}
              pendingIncomeItems={show.pendingIncome ? (pendingIncomeByDate[dateStr] || []) : []}
              taxItems={show.tax ? (taxByDate[dateStr] || []) : []}
              recurringItems={show.recurring ? (recurringByDate[dateStr] || []) : []}
              cardBills={show.cardBill ? (cardBillsByDate[dateStr] || []) : []}
              note={show.note ? (notes[dateStr] || '') : ''}
              onContextMenu={setNoteDate}
              // กดวัน = เลือกวันนั้นให้แผงข้างขวาแสดงรายละเอียด (ของเดิมเด้งไปหน้าบันทึกรายการทันที
              // ซึ่งทำให้ดูยอดของวันที่ผ่านมาไม่ได้เลย) — กดซ้ำหรือกดขวาเพื่อเปิดกล่องรายละเอียด
              onClick={() => (selectedDate === dateStr ? onOpenDay?.(dateStr) : onSelectDate?.(dateStr))}
              getCategoryName={getCategoryName}
              todayStr={todayStr}
              yearlyItems={date.getDate() === 1 && date.getMonth() === viewMonth ? yearlyItems : []}
              yearlyDueThisMonth={yearlyDueThisMonth}
              onYearlyClick={() => setShowYearly(true)}
            />
          )
        })}
      </div>

      {dayPopupDate && (
        // ส่งข้อมูลของวันนั้นแบบไม่กรองตามชั้นที่เปิด/ปิดอยู่ — กล่องนี้คือ "รายละเอียดทั้งวัน"
        // ถ้ากรองตามปุ่มด้านบนด้วย ผู้ใช้จะเปิดมาเห็นยอดขาดหายโดยไม่รู้ว่าเพราะปิดชั้นไว้
        <CalendarNotePopup
          date={dayPopupDate}
          transactions={txByDate[dayPopupDate] || []}
          recurringItems={recurringByDate[dayPopupDate] || []}
          pendingItems={pendingByDate[dayPopupDate] || []}
          pendingIncomeItems={pendingIncomeByDate[dayPopupDate] || []}
          getCategoryName={getCategoryName}
          onClose={() => { setNoteDate(null); onCloseDay?.() }}
        />
      )}
      {showYearly && (
        <YearlyRecurringPopup
          items={yearlyItems}
          entries={recurringEntries}
          onClose={() => setShowYearly(false)}
        />
      )}
    </div>
  )
}
