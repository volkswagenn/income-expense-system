import { NavLink, useNavigate } from 'react-router-dom'
import useAuthStore from '../../store/useAuthStore'
import useRoleStore from '../../store/useRoleStore'
import { checkPermission, P, getRoleInfo } from '../../lib/permissions'


const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-purple-500',
  'bg-orange-500', 'bg-rose-500', 'bg-teal-500',
]
function avatarColor(id) {
  const n = [...(id || '')].reduce((a, c) => a + c.charCodeAt(0), 0)
  return AVATAR_COLORS[n % AVATAR_COLORS.length]
}
function initials(name = '') {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

function SectionLabel({ children }) {
  return (
    <div className="px-3 pt-5 pb-1.5">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{children}</p>
    </div>
  )
}

const navClass = ({ isActive }) =>
  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full text-left ${
    isActive
      ? 'bg-blue-50 text-blue-700'
      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
  }`

export default function HomeSidebar({ open, onClose }) {
  const navigate = useNavigate()
  const { currentUser, logout } = useAuthStore()
  const roles = useRoleStore((s) => s.roles)
  const role = currentUser?.role
  const roleInfo = getRoleInfo(roles, role)

  const handleLock = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const close = () => onClose()

  const canManageUsers     = checkPermission(roles, role, P.MANAGE_USERS)
  const canManageSettings  = checkPermission(roles, role, P.MANAGE_SETTINGS)
  const canManageRoles     = checkPermission(roles, role, P.MANAGE_ROLES)
  const canViewGlobalHistory = checkPermission(roles, role, P.VIEW_GLOBAL_HISTORY)
  const canAccessUsersPage = canManageUsers || canManageRoles

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-20 bg-black/20 lg:hidden" onClick={onClose} />
      )}

      <aside className={`
        fixed top-14 left-0 bottom-0 z-30 w-60 bg-white border-r border-gray-200 flex flex-col
        transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>

        {/* User info panel */}
        {currentUser && (
          <div className="px-4 py-4 border-b border-gray-100 bg-gradient-to-br from-blue-50 to-indigo-50">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full ${avatarColor(currentUser.id)} flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm`}>
                {initials(currentUser.displayName)}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 text-sm truncate">{currentUser.displayName}</p>
                <p className="text-xs text-gray-500 truncate">@{currentUser.username}</p>
                <span className={`inline-block text-xs mt-0.5 px-1.5 py-0.5 rounded-full font-medium ${roleInfo.badgeClass}`}>
                  {roleInfo.icon} {roleInfo.label}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">

          <SectionLabel>หลัก</SectionLabel>
          <NavLink to="/" end className={navClass} onClick={close}>
            <span className="text-lg">🏪</span>
            <span className="flex-1">ร้านค้าทั้งหมด</span>
          </NavLink>

          {/* Management section */}
          {(canAccessUsersPage || canManageSettings || canViewGlobalHistory) && (
            <>
              <SectionLabel>การจัดการ</SectionLabel>
              {canAccessUsersPage && (
                <NavLink to="/users" className={navClass} onClick={close}>
                  <span className="text-lg">👥</span>
                  <span className="flex-1">จัดการผู้ใช้งานระบบหลัก</span>
                </NavLink>
              )}
              {canViewGlobalHistory && (
                <NavLink to="/global-history" className={navClass} onClick={close}>
                  <span className="text-lg">🕐</span>
                  <span className="flex-1">ประวัติทั้งหมด</span>
                </NavLink>
              )}
              {canManageSettings && (
                <NavLink to="/settings" className={navClass} onClick={close}>
                  <span className="text-lg">⚙️</span>
                  <span className="flex-1">ตั้งค่าระบบ</span>
                </NavLink>
              )}
            </>
          )}

          <SectionLabel>ระบบ</SectionLabel>
          <button
            onClick={handleLock}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full text-left text-red-500 hover:bg-red-50 hover:text-red-600"
          >
            <span className="text-lg">🔒</span>
            <span className="flex-1">ล็อคโปรแกรม</span>
          </button>
        </nav>

        {/* Footer */}
        <div className="border-t border-gray-100 px-4 py-3">
          <p className="text-xs text-gray-400 text-center">
            บันทึกรายรับ-รายจ่ายร้านค้า<br />
            ข้อมูลเก็บในเครื่องนี้เท่านั้น
          </p>
        </div>
      </aside>
    </>
  )
}
