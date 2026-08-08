import { createHashRouter, Navigate } from 'react-router-dom'
import App from './App'
import SettingsPage from './pages/Settings'
import Dashboard from './pages/Dashboard'
import WalletPage from './pages/Wallet'
import PendingTasksPage from './pages/PendingTasks'
import TransactionsPage from './pages/Transactions'
import CategoriesPage from './pages/Categories'
import ReportsPage from './pages/Reports'
import HistoryPage from './pages/History'
import ImportPage from './pages/Import'
import BackupPage from './pages/Backup'

export const router = createHashRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'wallet', element: <WalletPage /> },
      { path: 'pending-tasks', element: <PendingTasksPage /> },
      { path: 'wallet/pending', element: <Navigate to="/pending-tasks" replace /> },
      { path: 'transactions', element: <TransactionsPage /> },
      { path: 'categories', element: <CategoriesPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'import', element: <ImportPage /> },
      { path: 'backup', element: <BackupPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
