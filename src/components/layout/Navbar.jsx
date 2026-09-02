import { useLocation, useNavigate } from 'react-router-dom'
import usePendingStore from '../../store/usePendingStore'
import Icon from '../shared/Icon'
import { useAuth } from '../../auth/AuthProvider'

// ชื่อหน้าที่แสดงบน topbar ตาม route
const PAGE_TITLES = {
  '/': 'ภาพรวม',
  '/dashboard': 'ภาพรวม',
  '/wallet': 'กระเป๋าเงินหลัก',
  '/transactions': 'บันทึกรายรับ-รายจ่าย',
  '/manage': 'จัดการข้อมูล',
  '/manage/categories': 'จัดการข้อมูล · หมวดหมู่',
  '/manage/accounts': 'จัดการข้อมูล · บัญชีธนาคาร',
  '/manage/cards': 'จัดการข้อมูล · บัตรเครดิต',
  '/manage/debts': 'จัดการข้อมูล · หนี้สิน',
  '/categories': 'จัดการหมวดหมู่',
  '/pending-tasks': 'รายการรอดำเนินการ',
  '/reports': 'รายงาน',
  '/history': 'ประวัติทั้งหมด',
  '/import': 'นำเข้าข้อมูล',
  '/backup': 'สำรองข้อมูล',
  '/settings': 'ตั้งค่า',
}

export default function Navbar({ setSidebarOpen }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, profile, shop, role } = useAuth()

  // จุดแดงบนกระดิ่งเมื่อมีรายการค้างต้องจัดการ
  const alertCount = usePendingStore((s) =>
    s.pendingPayments.filter((p) => p.status === 'pending').length +
    s.pendingIncomes.filter((p) => p.status === 'pending').length +
    s.taxInvoices.filter((t) => t.status === 'waiting').length
  )

  const title = PAGE_TITLES[pathname] ?? 'JodFlow'

  return (
    <header className="sticky top-0 z-20 h-16 flex-none bg-white border-b border-hairline flex items-center px-6 gap-3.5">
      <button
        className="w-10 h-10 rounded-ctl border border-hairline flex items-center justify-center hover:bg-[#F6F5F1] lg:hidden"
        onClick={() => setSidebarOpen((o) => !o)}
        title="เมนู"
      >
        <Icon name="menu" size={20} className="text-ink" />
      </button>

      <h1 className="text-[17px] font-semibold text-ink truncate">{title}</h1>

      {shop && (
        <span className="hidden md:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-paper border border-hairline text-label text-muted">
          <Icon name="storefront" size={15} />
          {shop.name}
        </span>
      )}

      <div className="ml-auto flex items-center gap-2.5">
        <button
          className="h-10 pl-2.5 pr-3 rounded-ctl border border-hairline flex items-center gap-2 hover:bg-[#F6F5F1]"
          onClick={() => navigate('/settings')}
          title={`${user?.email ?? ''} — ไปหน้าบัญชีผู้ใช้`}
        >
          <span className="w-6 h-6 rounded-full bg-ink text-lime text-[11px] font-semibold flex items-center justify-center flex-none">
            {(profile?.display_name ?? user?.email ?? '?').charAt(0).toUpperCase()}
          </span>
          <span className="hidden sm:block text-label text-ink max-w-[130px] truncate">
            {profile?.display_name ?? user?.email}
          </span>
          {role === 'viewer' && (
            <span className="hidden sm:inline text-[11px] text-muted">(ดูอย่างเดียว)</span>
          )}
        </button>

        <button
          className="w-10 h-10 rounded-ctl border border-hairline flex items-center justify-center relative hover:bg-[#F6F5F1]"
          onClick={() => navigate('/pending-tasks')}
          title={alertCount > 0 ? `มี ${alertCount} รายการรอดำเนินการ` : 'ไม่มีรายการค้าง'}
        >
          <Icon name="notifications" size={20} className="text-ink" />
          {alertCount > 0 && (
            <span className="absolute top-2 right-2.5 w-[7px] h-[7px] rounded-full bg-expense border-[1.5px] border-white" />
          )}
        </button>

        <button
          className="h-10 px-4 rounded-ctl bg-lime text-ink text-[13.5px] font-semibold flex items-center gap-1.5 hover:bg-lime-dark"
          onClick={() => navigate('/transactions')}
        >
          <Icon name="add" size={19} />
          บันทึกรายการ
        </button>
      </div>
    </header>
  )
}
