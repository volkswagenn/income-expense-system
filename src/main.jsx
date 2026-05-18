import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { parseSettingFile } from './lib/settingParser'
import useAppStore from './store/useAppStore'
import './index.css'

// generate session id for this browser session
if (!sessionStorage.getItem('sessionId')) {
  sessionStorage.setItem('sessionId', crypto.randomUUID())
}

async function bootstrap() {
  try {
    const res = await fetch('./SettingApp.txt')
    if (res.ok) {
      const text = await res.text()
      const settings = parseSettingFile(text)
      useAppStore.getState().init(settings)
    }
  } catch (err) {
    console.warn('ไม่สามารถอ่าน SettingApp.txt ได้, ใช้ค่าจาก localStorage', err)
  }

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>
  )
}

bootstrap()
