import { useState } from 'react'
import useAppStore from '../../store/useAppStore'
import { BackupFull } from '../Backup/BackupFull'
import LogDownloader from '../Backup/LogDownloader'
import Icon from '../../components/shared/Icon'
import AccountPanel from '../../auth/AccountPanel'

const TABS = [
  { key: 'account', icon: 'account_circle', label: 'บัญชีผู้ใช้' },
  { key: 'backup', icon: 'backup', label: 'ข้อมูลและสำรอง' },
  { key: 'notify', icon: 'notifications', label: 'การแจ้งเตือน' },
  { key: 'logs', icon: 'history', label: 'ประวัติ' },
  { key: 'about', icon: 'info', label: 'เกี่ยวกับแอพ' },
]

export default function SettingsPage() {
  const { notifyDaysBefore, setNotifyDaysBefore, version } = useAppStore()

  const [tab, setTab] = useState('account')
  const [notifyDays, setNotifyDays] = useState(String(notifyDaysBefore ?? 3))
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)

  /**
   * ค่านี้เก็บที่ shop_settings และแก้ได้เฉพาะเจ้าของร้าน (RLS บังคับ)
   * ต้องรอผลจริงก่อนขึ้นว่าบันทึกแล้ว — ของเดิมยิงทิ้งไว้เฉยๆ ทำให้ editor
   * ที่ไม่มีสิทธิ์เห็นข้อความ "บันทึกแล้ว" ทั้งที่เซิร์ฟเวอร์ปฏิเสธไปเรียบร้อย
   */
  const saveNotifyDays = async () => {
    if (saving) return
    const value = Math.max(0, Number(notifyDays) || 0)
    setSaving(true)
    setSaveError('')
    try {
      await setNotifyDaysBefore(value)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">⚙️ ตั้งค่าระบบ</h1>
        <p className="text-sm text-gray-500 mt-0.5">จัดการข้อมูลและการตั้งค่าระบบ</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-2 py-2 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`btn whitespace-nowrap text-sm ${tab === t.key ? 'btn-primary' : 'btn-ghost'}`}
            >
              <Icon name={t.icon} size={17} /> {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === 'account' && <AccountPanel />}

          {tab === 'backup' && (
            <div className="space-y-6">
              <div>
                <h2 className="section-title">สำรองข้อมูลทั้งหมด</h2>
                <BackupFull />
              </div>
            </div>
          )}

          {tab === 'notify' && (
            <div className="space-y-4">
              <div>
                <h2 className="section-title">วันแจ้งเตือนก่อนครบกำหนด</h2>
                <p className="text-sm text-gray-600">
                  ค่านี้ใช้กับรายการค้างชำระและรอรับเงิน
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                <div className="sm:w-48">
                  <label className="label">จำนวนวัน</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    value={notifyDays}
                    onChange={(e) => setNotifyDays(e.target.value)}
                  />
                </div>
                <button className="btn btn-primary" onClick={saveNotifyDays} disabled={saving}>
                  {saving ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}
                </button>
              </div>
              {saved && (
                <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2">
                  ✅ บันทึกการตั้งค่าแล้ว
                </p>
              )}
              {saveError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
                  บันทึกไม่สำเร็จ — {saveError}
                </p>
              )}
            </div>
          )}

          {tab === 'logs' && (
            <div className="space-y-4">
              <div>
                <h2 className="section-title">ประวัติการใช้งาน</h2>
              </div>
              <LogDownloader />
            </div>
          )}

          {tab === 'about' && (
            <div className="space-y-4 text-sm text-gray-600">
              <div>
                <h2 className="section-title">JodFlow</h2>
                <p className="text-sm text-gray-500 mt-1">ระบบบันทึกรายรับ-รายจ่ายร้านค้า</p>
              </div>
              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-400 mb-1">เวอร์ชัน</p>
                <p className="font-semibold text-gray-900">{version}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
