import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import HomeNavbar from './HomeNavbar'
import HomeSidebar from './HomeSidebar'

export default function HomeLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50">
      <HomeNavbar
        onMenuClick={() => setSidebarOpen((v) => !v)}
        sidebarOpen={sidebarOpen}
      />
      <HomeSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="pt-14 lg:ml-60 transition-[margin] duration-200">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
