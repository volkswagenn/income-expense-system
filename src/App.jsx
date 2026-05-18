import { useCallback, useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import useShopStore from './store/useShopStore'
import useAuthStore from './store/useAuthStore'
import Navbar from './components/layout/Navbar'
import Sidebar from './components/layout/Sidebar'
import { endCurrentShopSession, heartbeatShopSession } from './lib/shopSessions'
import { useAutoSync } from './hooks/useAutoSync'

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarPinned, setSidebarPinned] = useState(false)
  const activeShopId = useShopStore((s) => s.activeShopId)
  const currentUser = useAuthStore((s) => s.currentUser)

  // auto push + pull ตลอดเวลาที่อยู่ในร้าน
  useAutoSync(activeShopId)

  const handleClose = useCallback(() => setSidebarOpen(false), [])

  useEffect(() => {
    if (!activeShopId || !currentUser) return undefined
    heartbeatShopSession(activeShopId, currentUser)
    const timer = window.setInterval(() => heartbeatShopSession(activeShopId, currentUser), 30000)
    const handleBeforeUnload = () => endCurrentShopSession('app_closed')
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [activeShopId, currentUser])

  if (!activeShopId) return <Navigate to="/" replace />

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar
        setSidebarOpen={setSidebarOpen}
        sidebarPinned={sidebarPinned}
        setSidebarPinned={setSidebarPinned}
      />
      <Sidebar
        open={sidebarOpen}
        pinned={sidebarPinned}
        onClose={handleClose}
      />

      <main className={`pt-14 transition-[margin] duration-200 ${
        sidebarOpen ? 'ml-60' : 'ml-0'
      } lg:ml-60`}>
        <div className="max-w-6xl mx-auto px-4 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
