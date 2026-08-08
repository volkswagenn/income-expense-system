import { useCallback, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Navbar from './components/layout/Navbar'
import Sidebar from './components/layout/Sidebar'

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const handleClose = useCallback(() => setSidebarOpen(false), [])

  return (
    <div className="min-h-screen bg-paper flex">
      <Sidebar open={sidebarOpen} pinned={false} onClose={handleClose} />

      {/* เนื้อหาเลื่อนไปทางขวาให้พ้น sidebar กว้าง 238px บนจอใหญ่ */}
      <div className="flex-1 min-w-0 flex flex-col lg:ml-[238px]">
        <Navbar setSidebarOpen={setSidebarOpen} />
        <main className="flex-1 min-w-0 px-6 pt-5 pb-10">
          <div className="max-w-[1080px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
