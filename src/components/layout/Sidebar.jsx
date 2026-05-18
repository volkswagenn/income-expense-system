import { NavLink } from 'react-router-dom'
import usePendingStore from '../../store/usePendingStore'
import useRecurringStore from '../../store/useRecurringStore'
import useShopStore, { SHOP_COLORS } from '../../store/useShopStore'
import useAuthStore from '../../store/useAuthStore'
import useRoleStore from '../../store/useRoleStore'
import { checkPermission, P } from '../../lib/permissions'

const MENU = [
  { to: '/dashboard',    icon: '📊', label: 'Dashboard',              permission: P.VIEW_DASHBOARD },
  { to: '/wallet',       icon: '👛', label: 'กระเป๋าเงินหลัก',        permission: P.VIEW_WALLET },
  { to: '/transactions', icon: '📝', label: 'บันทึกรายรับ-รายจ่าย',   permission: [P.MANAGE_INCOME, P.MANAGE_EXPENSE, P.MANAGE_RECURRING], badges: ['recurring'] },
  { to: '/pending-tasks', icon: '⏳', label: 'รายการรอดำเนินการ',     permission: [P.VIEW_PENDING_TASKS, P.VIEW_PENDING_PAYMENT, P.VIEW_PENDING_INCOME], badges: ['pending', 'income'] },
  { to: '/reports',      icon: '📈', label: 'รายงาน',                 permission: P.VIEW_REPORTS },
  { to: '/history',      icon: '🕐', label: 'ประวัติทั้งหมด',         permission: P.VIEW_HISTORY },
  { to: '/import',       icon: '📥', label: 'นำเข้าข้อมูล',           permission: P.IMPORT_DATA },
  { to: '/backup',       icon: '💾', label: 'สำรองข้อมูล',            permission: P.MANAGE_BACKUP },
  { to: '/store-users',  icon: '👥', label: 'จัดการผู้ใช้งาน',        permission: [P.MANAGE_STORE_USERS, P.MANAGE_STORE_ROLES] },
]

function Badge({ count }) {
  if (!count) return null
  return <span className="badge badge-red ml-auto">{count > 99 ? '99+' : count}</span>
}

function MenuItem({ item, badgeCounts, onClose, pinned }) {
  const total = (item.badges ?? []).reduce((a, k) => a + (badgeCounts[k] ?? 0), 0)
  return (
    <NavLink
      to={item.to}
      onClick={() => { if (!pinned) onClose() }}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-blue-50 text-blue-700'
            : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
        }`
      }
    >
      <span className="text-lg">{item.icon}</span>
      <span className="flex-1">{item.label}</span>
      <Badge count={total} />
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
  const activeShop = useShopStore((s) => s.shops.find((sh) => sh.id === s.activeShopId) ?? null)
  const color = useShopStore((s) => {
    const shop = s.shops.find((sh) => sh.id === s.activeShopId)
    return shop ? SHOP_COLORS.find((c) => c.id === shop.colorId) ?? SHOP_COLORS[0] : null
  })
  const role = useAuthStore((s) => s.currentUser?.role)
  const roles = useRoleStore((s) => s.roles)

  const badgeCounts = { pending: pendingCount, income: incomeCount, recurring: recurringCount, tax: taxCount }

  const visibleMenu = MENU.filter((item) => checkPermission(roles, role, item.permission))

  return (
    <>
      {open && !pinned && (
        <div className="fixed inset-0 z-20 bg-black/20 lg:hidden" onClick={onClose} />
      )}
      <aside className={`
        fixed top-14 left-0 bottom-0 z-30 w-60 bg-white border-r border-gray-200 flex flex-col
        transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {visibleMenu.map((item) => (
            <MenuItem
              key={item.to}
              item={item}
              badgeCounts={badgeCounts}
              onClose={onClose}
              pinned={pinned}
            />
          ))}
        </nav>

        <div className="border-t border-gray-100 px-4 py-3">
          {activeShop && color && (
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2.5 h-2.5 rounded-full ${color.dot} flex-shrink-0`} />
              <p className={`text-xs font-medium truncate ${color.text}`}>{activeShop.name}</p>
            </div>
          )}
          <p className="text-xs text-gray-400">บันทึกรายรับ-รายจ่าย</p>
        </div>
      </aside>
    </>
  )
}
