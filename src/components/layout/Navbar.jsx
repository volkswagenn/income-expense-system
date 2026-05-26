import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../../store/useAppStore'
import useShopStore, { SHOP_COLORS } from '../../store/useShopStore'
import useAuthStore from '../../store/useAuthStore'
import useRoleStore from '../../store/useRoleStore'
import { checkPermission, getRoleInfo, P } from '../../lib/permissions'
import { getCloudQueueSummary } from '../../lib/cloudSyncMetadata'
import { isCloudEnabled } from '../../services/cloud/cloudConfig'
import { pushShopQueue } from '../../services/cloud/syncApi'
import { pullAndApplyShop } from '../../services/cloud/pullApply'
import { endCurrentShopSession } from '../../lib/shopSessions'

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

export default function Navbar({ setSidebarOpen, sidebarPinned, setSidebarPinned }) {
  const { version } = useAppStore()
  const activeShop = useShopStore((s) => s.shops.find((sh) => sh.id === s.activeShopId) ?? null)
  const shopColor = useShopStore((s) => {
    const shop = s.shops.find((sh) => sh.id === s.activeShopId)
    return shop ? SHOP_COLORS.find((c) => c.id === shop.colorId) ?? SHOP_COLORS[0] : null
  })
  const clearActiveShop = useShopStore((s) => s.clearActiveShop)
  const { currentUser, logout } = useAuthStore()
  const roles = useRoleStore((s) => s.roles)
  const navigate = useNavigate()

  const role = currentUser?.role
  const roleInfo = getRoleInfo(roles, role)
  const canManageSettings = checkPermission(roles, role, P.MANAGE_SETTINGS)
  const canAccessUsersPage = checkPermission(roles, role, P.MANAGE_USERS) || checkPermission(roles, role, P.MANAGE_ROLES)
  const clickTimerRef = useRef(null)
  const menuRef = useRef(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [cloudEnabled, setCloudEnabled] = useState(() => isCloudEnabled())
  const [syncState, setSyncState] = useState({ status: 'idle', message: '', error: '' })
  const [queueSummary, setQueueSummary] = useState({ pending: 0, failed: 0 })

  const activeShopId = activeShop?.id
  const pendingCount = (queueSummary.pending || 0) + (queueSummary.failed || 0)

  useEffect(() => () => clearTimeout(clickTimerRef.current), [])

  useEffect(() => {
    const updateCloudEnabled = () => setCloudEnabled(isCloudEnabled())
    window.addEventListener('zuzoo:cloud-config-changed', updateCloudEnabled)
    window.addEventListener('storage', updateCloudEnabled)
    return () => {
      window.removeEventListener('zuzoo:cloud-config-changed', updateCloudEnabled)
      window.removeEventListener('storage', updateCloudEnabled)
    }
  }, [])

  useEffect(() => {
    if (!userMenuOpen) return
    const handler = (e) => {
      if (!menuRef.current?.contains(e.target)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [userMenuOpen])

  useEffect(() => {
    let cancelled = false
    const refreshQueueSummary = async () => {
      const summary = activeShopId ? await getCloudQueueSummary(activeShopId) : { pending: 0, failed: 0 }
      if (!cancelled) setQueueSummary(summary)
    }

    refreshQueueSummary()
    const handleQueueUpdated = (event) => {
      if (!activeShopId || event.detail?.shopId === activeShopId) refreshQueueSummary()
    }
    window.addEventListener('zuzoo:queue-updated', handleQueueUpdated)
    return () => {
      cancelled = true
      window.removeEventListener('zuzoo:queue-updated', handleQueueUpdated)
    }
  }, [activeShopId])

  const handleSidebarClick = () => {
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
    clickTimerRef.current = setTimeout(() => {
      if (sidebarPinned) {
        setSidebarPinned(false)
        setSidebarOpen(false)
      } else {
        setSidebarOpen((prev) => !prev)
      }
      clickTimerRef.current = null
    }, 220)
  }

  const handleSidebarDoubleClick = () => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
    const nextPinned = !sidebarPinned
    setSidebarPinned(nextPinned)
    setSidebarOpen(nextPinned)
  }

  const handleChangeShop = () => {
    endCurrentShopSession('change_shop')
    clearActiveShop()
    navigate('/')
    setUserMenuOpen(false)
  }

  const handleLock = () => {
    endCurrentShopSession('logout')
    logout()
    navigate('/login', { replace: true })
    setUserMenuOpen(false)
  }

  const handleManualSync = async () => {
    if (!activeShopId) return
    if (!isCloudEnabled()) {
      setSyncState({ status: 'error', message: '', error: 'Cloud Sync is disabled' })
      setTimeout(() => setSyncState({ status: 'idle', message: '', error: '' }), 3000)
      return
    }

    setSyncState({ status: 'syncing', message: '', error: '' })
    try {
      const pushResult = await pushShopQueue(activeShopId, { limit: 200 })
      const pullResult = await pullAndApplyShop(activeShopId)
      setQueueSummary(await getCloudQueueSummary(activeShopId))
      setSyncState({
        status: 'success',
        message: `Cloud sync complete: pushed ${pushResult.applied?.length ?? 0}, pulled ${pullResult.applied ?? 0}`,
        error: '',
      })
      setTimeout(() => setSyncState({ status: 'idle', message: '', error: '' }), 3000)
    } catch (err) {
      setSyncState({ status: 'error', message: '', error: err.message || 'Cloud sync failed' })
      setTimeout(() => setSyncState({ status: 'idle', message: '', error: '' }), 4000)
    }
  }

  const handleManageUsers = () => {
    navigate('/users')
    setUserMenuOpen(false)
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3 shadow-sm">
      <button
        className={`btn w-9 h-9 p-0 flex items-center justify-center lg:hidden ${sidebarPinned ? 'btn-primary' : 'btn-ghost'}`}
        onClick={handleSidebarClick}
        onDoubleClick={handleSidebarDoubleClick}
        title={sidebarPinned ? 'Unpin menu' : 'Open menu'}
        aria-pressed={sidebarPinned}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div className="flex items-center gap-2.5 min-w-0">
        {shopColor && (
          <div className={`w-7 h-7 rounded-full ${shopColor.bg} flex-shrink-0 flex items-center justify-center text-white text-xs font-bold shadow-sm`}>
            {activeShop?.name?.[0]?.toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <span className="font-bold text-gray-900 text-sm leading-tight truncate block max-w-[180px]">
            {activeShop?.name ?? 'ZuZoo'}
          </span>
          <span className="text-xs text-gray-400">v{version}</span>
        </div>
      </div>

      <div className="relative ml-auto">
        {cloudEnabled && activeShopId && (
          <button
            className={`btn text-xs py-1.5 px-3 ${pendingCount > 0 ? 'btn-primary' : 'btn-secondary'} ${syncState.status === 'success' ? 'border-emerald-300 text-emerald-700' : ''} ${syncState.status === 'error' ? 'border-red-300 text-red-700' : ''}`}
            onClick={handleManualSync}
            disabled={syncState.status === 'syncing'}
            title={syncState.error || 'Sync cloud data'}
          >
            {syncState.status === 'syncing' ? 'Syncing...' : `${syncState.status === 'success' ? 'OK ' : syncState.status === 'error' ? '! ' : 'Cloud '}${pendingCount > 0 ? `(${pendingCount})` : ''}`}
          </button>
        )}
        {(syncState.message || syncState.error) && (
          <div className={`absolute right-0 top-10 z-50 w-64 rounded-lg border px-3 py-2 text-xs shadow-lg ${
            syncState.error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}>
            {syncState.error || syncState.message}
          </div>
        )}
      </div>

      {currentUser && (
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            title="User menu"
          >
            <div className={`w-7 h-7 rounded-full ${avatarColor(currentUser.id)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
              {initials(currentUser.displayName)}
            </div>
            <div className="hidden sm:block text-left min-w-0">
              <p className="text-xs font-semibold text-gray-800 leading-tight truncate max-w-[100px]">
                {currentUser.displayName}
              </p>
              <p className="text-xs text-gray-400 leading-tight">
                {roleInfo.icon} {roleInfo.label}
              </p>
            </div>
            <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${userMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50">
              <div className="px-4 py-2.5 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-900">{currentUser.displayName}</p>
                <p className="text-xs text-gray-400">@{currentUser.username}</p>
              </div>

              {canAccessUsersPage && (
                <button
                  onClick={handleManageUsers}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <span>Users</span>
                </button>
              )}

              {canManageSettings && (
                <button
                  onClick={() => { navigate('/settings'); setUserMenuOpen(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <span>Settings</span>
                </button>
              )}

              <button
                onClick={handleChangeShop}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <span>Change shop</span>
              </button>

              <div className="border-t border-gray-100 mt-1">
                <button
                  onClick={handleLock}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <span>Lock / Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </header>
  )
}
