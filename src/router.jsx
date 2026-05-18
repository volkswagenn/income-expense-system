import { createHashRouter, Navigate } from 'react-router-dom'
import App from './App'
import HomeLayout from './components/layout/HomeLayout'
import AuthGuard from './components/layout/AuthGuard'
import PermissionGuard from './components/layout/PermissionGuard'
import LoginPage from './pages/Login'
import ShopManager from './pages/ShopManager'
import SettingsPage from './pages/Settings'
import UserManagementPage from './pages/UserManagement'
import Dashboard from './pages/Dashboard'
import WalletPage from './pages/Wallet'
import PendingTasksPage from './pages/PendingTasks'
import TransactionsPage from './pages/Transactions'
import ReportsPage from './pages/Reports'
import HistoryPage from './pages/History'
import ImportPage from './pages/Import'
import BackupPage from './pages/Backup'
import StoreUserManagementPage from './pages/StoreUserManagement'
import GlobalHistoryPage from './pages/GlobalHistory'
import { P } from './lib/permissions'

const guard = (permission, element) => (
  <PermissionGuard permission={permission}>{element}</PermissionGuard>
)

export const router = createHashRouter([
  {
    path: '/',
    children: [
      // Login — no auth required
      { path: 'login', element: <LoginPage /> },

      {
        element: <AuthGuard />,
        children: [
          // ── Home layout (Navbar + HomeSidebar, no active shop required) ──
          {
            element: <HomeLayout />,
            children: [
              { index: true,      element: <ShopManager /> },
              { path: 'settings', element: guard(P.MANAGE_SETTINGS, <SettingsPage />) },
              { path: 'users',          element: guard(P.MANAGE_USERS,         <UserManagementPage />) },
              { path: 'global-history', element: guard(P.VIEW_GLOBAL_HISTORY,   <GlobalHistoryPage />) },
            ],
          },

          // ── App layout (Navbar + AppSidebar, active shop required) ──
          {
            element: <App />,
            children: [
              { path: 'dashboard',    element: guard(P.VIEW_DASHBOARD,      <Dashboard />) },
              { path: 'wallet',       element: guard(P.VIEW_WALLET,         <WalletPage />) },
              { path: 'pending-tasks', element: guard([P.VIEW_PENDING_TASKS, P.VIEW_PENDING_PAYMENT, P.VIEW_PENDING_INCOME], <PendingTasksPage />) },
              { path: 'wallet/pending', element: <Navigate to="/pending-tasks" replace /> },
              { path: 'transactions', element: guard([P.MANAGE_INCOME, P.MANAGE_EXPENSE, P.MANAGE_RECURRING], <TransactionsPage />) },
              { path: 'reports',      element: guard(P.VIEW_REPORTS,        <ReportsPage />) },
              { path: 'history',      element: guard(P.VIEW_HISTORY,        <HistoryPage />) },
              { path: 'import',       element: guard(P.IMPORT_DATA,         <ImportPage />) },
              { path: 'backup',       element: guard(P.MANAGE_BACKUP,       <BackupPage />) },
              { path: 'store-users',  element: guard([P.MANAGE_STORE_USERS, P.MANAGE_STORE_ROLES], <StoreUserManagementPage />) },
            ],
          },
        ],
      },

      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
