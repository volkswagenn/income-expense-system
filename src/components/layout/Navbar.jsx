import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import useTransactionStore from '../../store/useTransactionStore'
import useCreditCardStore from '../../store/useCreditCardStore'
import useDebtStore from '../../store/useDebtStore'
import useObligationRows from '../../pages/PendingTasks/useObligationRows'
import Icon from '../shared/Icon'
import { PAGE_HEADS } from './navConfig'
import { thaiFullDate, localDateStr, localMonthStr } from '../../lib/dateUtils'
import { useAuth } from '../../auth/AuthProvider'

/** ชื่อ + คำอธิบายของหน้าปัจจุบัน — เทียบเส้นทางแบบยาวสุดก่อน (/manage/cards ก่อน /manage) */
function useHead(pathname) {
  if (PAGE_HEADS[pathname]) return PAGE_HEADS[pathname]
  const base = '/' + pathname.split('/').filter(Boolean)[0]
  return PAGE_HEADS[base] ?? { title: 'JodFlow' }
}

/**
 * ยอดที่ยังต้องจ่ายภายในเดือนนี้ — ใช้บนคำอธิบายใต้ชื่อหน้าภาพรวม
 * และจำนวนงานทั้งหมดที่รออยู่ — ใช้กับจุดแดงบนกระดิ่ง/ป้ายเลขบนหัวหน้ารอดำเนินการ (มือถือ)
 */
function useDueSummary() {
  const rows = useObligationRows()
  return useMemo(() => {
    const month = localMonthStr()
    const monthDue = rows
      .filter((r) => r.kind !== 'income' && r.kind !== 'receivable' && r.kind !== 'tax')
      .filter((r) => !r.due || String(r.due).slice(0, 7) <= month)
      .reduce((s, r) => s + (Number(r.amount) || 0), 0)
    return { monthDue, count: rows.length }
  }, [rows])
}

export default function Navbar({ onOpenSidebar, onOpenSearch }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const head = useHead(pathname)
  const { shop } = useAuth()

  // คำอธิบายใต้ชื่อหน้าเป็นตัวเลขจริงตามแบบ ไม่ใช่ข้อความตายตัว
  // สามหน้าที่ใช้ทุกวันจึงบอกสถานะได้ตั้งแต่ยังไม่ทันเลื่อนดูเนื้อหา
  const { monthDue, count: dueCount } = useDueSummary()
  const todayCount = useTransactionStore((s) => {
    const today = localDateStr()
    return s.transactions.filter((t) => t.date === today).length
  })
  const cardCount = useCreditCardStore((s) => s.cards.length)
  const viaCardCount = useCreditCardStore((s) => s.installments.filter((i) => i.status !== 'cancelled').length)
  const debtCount = useDebtStore((s) => s.debts.filter((d) => d.status === 'active').length)

  const sub = useMemo(() => {
    const today = thaiFullDate(new Date())
    if (pathname === '/' || pathname === '/dashboard') {
      return `${today} · เดือนนี้เหลือต้องจ่าย ${Math.round(monthDue).toLocaleString('th-TH')} บาท`
    }
    if (pathname === '/transactions') {
      return `${today} · บันทึกวันนี้แล้ว ${todayCount} รายการ`
    }
    if (pathname === '/cards') {
      return `${cardCount} บัตร · ${debtCount} สัญญาหนี้ที่ยังผ่อนอยู่ · ผ่อนผ่านบัตร ${viaCardCount} รายการ`
    }
    return head.sub ?? null
  }, [pathname, head.sub, monthDue, todayCount, cardCount, debtCount, viaCardCount])

  // หัวแบบมือถือ: หน้าภาพรวมเป็น "ชื่อร้าน + วันที่" เหมือนแบบ หน้าอื่นเป็นชื่อหน้า
  // ตัวย่อชื่อร้านทำหน้าที่ปุ่มเปิดเมนูแทนขีดสามขีด (แบบมือถือไม่มีปุ่มเมนู แต่หน้าที่
  // ไม่อยู่ในแถบล่างยังต้องเข้าถึงได้)
  const isHome = pathname === '/' || pathname === '/dashboard'
  const isPending = pathname === '/pending-tasks'
  const shopName = shop?.name?.trim() || 'JodFlow'
  const initial = shopName[0].toUpperCase()

  return (
    // เนื้อหาในแถบใช้เพดานกว้าง 1680px เท่ากับเนื้อหาข้างล่าง ขอบซ้ายของชื่อหน้าจะได้
    // ตรงกับขอบการ์ดแถวแรกพอดี ถ้าปล่อยให้แถบยืดเต็มจอ ชื่อหน้าจะลอยห่างออกไปทางซ้าย
    <header className="sticky top-0 z-20 h-[62px] flex-none bg-white border-b border-hairline">
      <div className="h-full w-full max-w-[1680px] mx-auto px-4 sm:px-6 flex items-center gap-3">
        <button
          className="lg:hidden w-9 h-9 rounded-[11px] bg-ink text-lime font-bold text-[15px] flex items-center justify-center flex-none"
          onClick={onOpenSidebar}
          title="เมนู"
        >
          {initial}
        </button>
        <div className="lg:hidden min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[15px] font-semibold text-ink truncate leading-tight">{isHome ? shopName : head.title}</span>
            {isPending && dueCount > 0 && (
              <span className="tabular-nums flex-none text-[11px] font-bold bg-ink text-lime rounded-full px-2 py-px">{dueCount}</span>
            )}
          </div>
          <div className="text-[11px] text-faint truncate">{isHome ? thaiFullDate(new Date()) : (sub ?? head.sub ?? '')}</div>
        </div>

        <h1 className="hidden lg:block text-[18px] font-semibold text-ink whitespace-nowrap">{head.title}</h1>
        {sub && <span className="hidden lg:block text-[12.5px] text-faint truncate">{sub}</span>}

        {/*
          มีแค่ค้นหากับปุ่มบันทึกตามแบบ — ของเดิมมีกระดิ่งแจ้งเตือนกับปุ่มชื่อผู้ใช้ด้วย
          กระดิ่งถูกแทนด้วยป้ายตัวเลขแดงบนเมนู "รอดำเนินการ"
          ชื่อผู้ใช้กับบทบาทถูกแทนด้วยกล่องท้ายเมนูซ้าย
          (บันทึกไว้ใน MOCKUP-NOTES.md ข้อ ก1 และ ก2 รอรีวิว)
        */}
        <div className="ml-auto flex items-center gap-2.5 flex-none">
          <button
            className={`w-[38px] h-[38px] rounded-ctl border border-hairline items-center justify-center hover:bg-paper ${
              isHome ? 'hidden lg:flex' : 'flex'
            }`}
            onClick={onOpenSearch}
            title="ค้นหา"
          >
            <Icon name="search" size={19} className="text-ink" />
          </button>

          {/* กระดิ่งมีเฉพาะหน้าภาพรวมบนมือถือ — จุดแดงเมื่อมีของต้องจ่ายหรือรอรับ */}
          {isHome && (
            <button
              className="lg:hidden relative w-[38px] h-[38px] rounded-ctl border border-hairline flex items-center justify-center hover:bg-paper"
              onClick={() => navigate('/pending-tasks')}
              title="รอดำเนินการ"
            >
              <Icon name="notifications" size={19} className="text-ink" />
              {dueCount > 0 && <span className="absolute top-[7px] right-[7px] w-2 h-2 rounded-full bg-expense ring-2 ring-white" />}
            </button>
          )}

          {/* ปุ่มบันทึกอยู่ในแถบล่างบนมือถือ (ปุ่มกลม lime ตรงกลาง) จึงซ่อนอันนี้ไว้ */}
          <button
            className="hidden lg:flex h-[38px] px-[15px] rounded-ctl bg-ink text-white text-[13px] font-semibold items-center gap-1.5 hover:bg-black"
            onClick={() => navigate('/transactions')}
          >
            <Icon name="add" size={18} />
            บันทึกรายการ
          </button>
        </div>
      </div>
    </header>
  )
}
