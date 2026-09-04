import { lazy, Suspense } from 'react'
import { createHashRouter, Navigate } from 'react-router-dom'
import App from './App'
import Dashboard from './pages/Dashboard'
import TransactionsPage from './pages/Transactions'
import WalletPage from './pages/Wallet'
import CardsPage from './pages/Cards'
import PendingTasksPage from './pages/PendingTasks'

/**
 * หน้าที่เปิดบ่อยที่สุด (ภาพรวม / บันทึกรายการ / กระเป๋าเงิน / รายการรอ) อยู่ใน bundle หลัก
 * เพราะผู้ใช้เข้าแทบทุกครั้งที่เปิดแอป โหลดแยกจะกลายเป็นรอสองรอบ
 *
 * ส่วนที่เหลือแยกไฟล์ เพราะลากไลบรารีหนักติดมาด้วยและนานๆ ใช้ที:
 *   รายงาน → recharts (383 KB) + xlsx (424 KB) + html2canvas (202 KB)
 *   นำเข้าข้อมูล / สำรองข้อมูล → xlsx
 * ก่อนแยก ทุกหน้าต้องรอไฟล์พวกนี้โหลดจบก่อนถึงจะเห็นหน้าแรก
 */
const ManagePage = lazy(() => import('./pages/Manage'))
const ReportsPage = lazy(() => import('./pages/Reports'))
const HistoryPage = lazy(() => import('./pages/History'))
const ImportPage = lazy(() => import('./pages/Import'))
const BackupPage = lazy(() => import('./pages/Backup'))
const SettingsPage = lazy(() => import('./pages/Settings'))

function PageSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 rounded-full border-[3px] border-hairline border-t-ink animate-spin" />
    </div>
  )
}

/** ครอบหน้าที่โหลดแยก — ระหว่างรอไฟล์มาให้เห็นตัวหมุน ไม่ใช่หน้าว่างเปล่า */
const lazyRoute = (Component) => (
  <Suspense fallback={<PageSpinner />}>
    <Component />
  </Suspense>
)

export const router = createHashRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'wallet', element: <WalletPage /> },
      // บัตรเครดิต งวดผ่อน และสัญญาหนี้ ย้ายออกจากท้ายหน้ากระเป๋าเงินมาเป็นหน้าของตัวเอง
      { path: 'cards', element: <CardsPage /> },
      { path: 'pending-tasks', element: <PendingTasksPage /> },
      { path: 'wallet/pending', element: <Navigate to="/pending-tasks" replace /> },
      { path: 'transactions', element: <TransactionsPage /> },
      // จัดการข้อมูล — หมวดหมู่ / บัญชีธนาคาร / บัตรเครดิต / หนี้สิน อยู่ใต้เมนูเดียว
      { path: 'manage', element: <Navigate to="/manage/categories" replace /> },
      { path: 'manage/:tab', element: lazyRoute(ManagePage) },
      { path: 'categories', element: <Navigate to="/manage/categories" replace /> },
      { path: 'reports', element: lazyRoute(ReportsPage) },
      { path: 'history', element: lazyRoute(HistoryPage) },
      { path: 'import', element: lazyRoute(ImportPage) },
      { path: 'backup', element: lazyRoute(BackupPage) },
      { path: 'settings', element: lazyRoute(SettingsPage) },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
