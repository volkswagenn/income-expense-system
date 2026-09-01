import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { AuthProvider } from './auth/AuthProvider'
import AuthGate from './auth/AuthGate'
import DataGate from './auth/DataGate'
import ErrorToast from './components/shared/ErrorToast'
import './index.css'

// id ประจำการเปิดแท็บครั้งนี้ — ใช้ระบุที่มาของ log
if (!sessionStorage.getItem('sessionId')) {
  sessionStorage.setItem('sessionId', crypto.randomUUID())
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <AuthGate>
        <DataGate>
          <RouterProvider router={router} />
        </DataGate>
      </AuthGate>
      {/* อยู่นอก gate เพื่อให้แจ้งเตือนได้ตั้งแต่ตอนล็อกอิน/โหลดข้อมูล ไม่ใช่เฉพาะตอนเข้าแอปแล้ว */}
      <ErrorToast />
    </AuthProvider>
  </React.StrictMode>
)
