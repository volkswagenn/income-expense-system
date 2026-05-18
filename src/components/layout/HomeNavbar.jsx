import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../../store/useAuthStore'
import useAppStore from '../../store/useAppStore'

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

export default function HomeNavbar({ onMenuClick, sidebarOpen }) {
  const navigate = useNavigate()
  const { version } = useAppStore()
  const { currentUser, logout } = useAuthStore()
  const [dropOpen, setDropOpen] = useState(false)
  const dropRef = useRef(null)

  useEffect(() => {
    if (!dropOpen) return
    const fn = (e) => { if (!dropRef.current?.contains(e.target)) setDropOpen(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [dropOpen])

  const handleLock = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3 shadow-sm">
      {/* Mobile sidebar toggle */}
      <button
        onClick={onMenuClick}
        className={`btn w-9 h-9 p-0 flex items-center justify-center lg:hidden ${sidebarOpen ? 'btn-primary' : 'btn-ghost'}`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <span className="text-2xl leading-none">🐾</span>
        <div>
          <p className="font-bold text-gray-900 text-sm leading-tight">บันทึกรายรับ-รายจ่าย</p>
          <p className="text-xs text-gray-400 leading-tight">ร้านค้า · v{version}</p>
        </div>
      </div>

      {/* User dropdown */}
      {currentUser && (
        <div className="relative ml-auto flex-shrink-0" ref={dropRef}>
          <button
            onClick={() => setDropOpen((v) => !v)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className={`w-7 h-7 rounded-full ${avatarColor(currentUser.id)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
              {initials(currentUser.displayName)}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-semibold text-gray-800 leading-tight max-w-[120px] truncate">
                {currentUser.displayName}
              </p>
              <p className="text-xs text-gray-400 leading-tight">
                {currentUser.role === 'admin' ? '🛡️ Admin' : '👤 User'}
              </p>
            </div>
            <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${dropOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50">
              <div className="px-4 py-2.5 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-900">{currentUser.displayName}</p>
                <p className="text-xs text-gray-400">@{currentUser.username}</p>
              </div>
              <div className="border-t border-gray-100 mt-1">
                <button
                  onClick={handleLock}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  🔒 ล็อคโปรแกรม / ออกจากระบบ
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </header>
  )
}
