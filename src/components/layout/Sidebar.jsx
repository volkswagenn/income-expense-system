import { NavLink } from 'react-router-dom'
import usePendingStore from '../../store/usePendingStore'
import useRecurringStore from '../../store/useRecurringStore'
import Icon from '../shared/Icon'

const MENU = [
  { to: '/dashboard',     icon: 'space_dashboard',        label: 'ภาพรวม' },
  { to: '/wallet',        icon: 'account_balance_wallet', label: 'กระเป๋าเงินหลัก' },
  { to: '/transactions',  icon: 'edit_note',              label: 'บันทึกรายรับ-รายจ่าย', badges: ['recurring'], badgeTone: 'amber' },
  { to: '/categories',    icon: 'category',               label: 'จัดการหมวดหมู่', sub: true },
  { to: '/pending-tasks', icon: 'pending_actions',        label: 'รายการรอดำเนินการ', badges: ['pending', 'income'], badgeTone: 'red' },
  { to: '/reports',       icon: 'bar_chart',              label: 'รายงาน' },
  { to: '/history',       icon: 'history',                label: 'ประวัติทั้งหมด' },
  { to: '/import',        icon: 'upload_file',            label: 'นำเข้าข้อมูล' },
  { to: '/backup',        icon: 'backup',                 label: 'สำรองข้อมูล' },
  { to: '/settings',      icon: 'settings',               label: 'ตั้งค่า' },
]

function NavBadge({ count, tone }) {
  if (!count) return null
  const cls = tone === 'amber' ? 'bg-[#E0A32B] text-ink' : 'bg-expense text-white'
  return (
    <span className={`ml-auto min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center ${cls}`}>
      {count > 99 ? '99+' : count}
    </span>
  )
}

function MenuItem({ item, badgeCounts, onClose, pinned }) {
  const total = (item.badges ?? []).reduce((a, k) => a + (badgeCounts[k] ?? 0), 0)

  return (
    <NavLink
      to={item.to}
      onClick={() => { if (!pinned) onClose() }}
      className={({ isActive }) =>
        `flex items-center gap-[11px] transition-colors ${
          item.sub
            ? 'h-9 ml-4 rounded-[10px] px-[11px] border-l-2 border-ink-line'
            : 'h-10 rounded-[11px] px-[11px]'
        } ${isActive ? 'bg-lime/[0.14]' : 'hover:bg-white/[0.06]'}`
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            name={item.icon}
            size={item.sub ? 18 : 20}
            fill={isActive}
            className={isActive ? 'text-lime' : 'text-ink-soft'}
          />
          <span
            className={`${item.sub ? 'text-[12.5px]' : 'text-[13.5px]'} ${
              isActive ? 'text-white font-semibold' : 'text-[#A9AFB7]'
            }`}
          >
            {item.label}
          </span>
          <NavBadge count={total} tone={item.badgeTone} />
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar({ open, pinned, onClose }) {
  const pendingCount = usePendingStore((s) =>
    s.pendingPayments.reduce((n, p) => n + (p.status === 'pending' ? 1 : 0), 0)
  )
  const taxCount = usePendingStore((s) =>
    s.taxInvoices.reduce((n, t) => n + (t.status === 'waiting' ? 1 : 0), 0)
  )
  const incomeCount = usePendingStore((s) =>
    s.pendingIncomes.reduce((n, p) => n + (p.status === 'pending' ? 1 : 0), 0)
  )
  const recurringCount = useRecurringStore((s) => s.getPendingCountCurrentMonth())

  const badgeCounts = { pending: pendingCount, income: incomeCount, recurring: recurringCount, tax: taxCount }

  return (
    <>
      {open && !pinned && (
        <div className="fixed inset-0 z-20 bg-ink/30 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={`fixed top-0 left-0 bottom-0 z-30 w-[238px] bg-ink flex flex-col px-3 py-[18px]
          transition-transform duration-200
          ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      >
        {/* โลโก้ */}
        <div className="flex items-center gap-2.5 px-2 pb-[18px]">
          <div className="w-[34px] h-[34px] rounded-[11px] bg-lime flex items-center justify-center text-[17px] font-bold text-ink">
            J
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-white leading-tight">JodFlow</div>
            <div className="text-[11px] text-ink-soft truncate">บันทึกรายรับ-รายจ่าย</div>
          </div>
        </div>

        {/* เมนู */}
        <nav className="flex flex-col gap-0.5 overflow-y-auto">
          {MENU.map((item) => (
            <MenuItem
              key={item.to}
              item={item}
              badgeCounts={badgeCounts}
              onClose={onClose}
              pinned={pinned}
            />
          ))}
        </nav>

        <div className="mt-auto pt-3 border-t border-ink-line">
          <p className="text-[10.5px] text-[#5A5F67] px-[11px]">JodFlow v3.0.0</p>
        </div>
      </aside>
    </>
  )
}
