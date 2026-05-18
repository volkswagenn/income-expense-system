import { useMemo, useState } from 'react'
import useAppStore from '../../store/useAppStore'
import { appendShopAuditLog } from '../../lib/auditLog'
import { BackupAllShops } from '../Backup/BackupFull'
import FolderManager from '../Backup/FolderManager'
import LogDownloader from '../Backup/LogDownloader'
import { findOrphanShopData, getAllShopSummaries } from '../../lib/shopSummary'

function writeShopAppSetting(shopId, changes) {
  const key = `${shopId}_app_settings`
  let current = { state: {}, version: 0 }
  try {
    current = JSON.parse(localStorage.getItem(key) || 'null') ?? current
  } catch {
    current = { state: {}, version: 0 }
  }
  localStorage.setItem(key, JSON.stringify({
    ...current,
    state: { ...(current.state ?? {}), ...changes },
  }))
}

function HealthPanel({ shops }) {
  const summaries = useMemo(() => getAllShopSummaries(shops), [shops])
  const orphans = useMemo(() => findOrphanShopData(shops), [shops])
  const brokenShops = shops.filter((shop) => !summaries[shop.id]?.health?.ok)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">ร้านทั้งหมด</p>
          <p className="text-lg font-bold text-gray-900">{shops.length}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-700">ต้องตรวจสอบ</p>
          <p className="text-lg font-bold text-amber-700">{brokenShops.length}</p>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <p className="text-xs text-blue-700">ข้อมูลกำพร้า</p>
          <p className="text-lg font-bold text-blue-700">{orphans.length}</p>
        </div>
      </div>

      {brokenShops.length === 0 && orphans.length === 0 ? (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          ข้อมูลร้านทั้งหมดอยู่ในสถานะปกติ
        </p>
      ) : (
        <div className="space-y-2">
          {brokenShops.map((shop) => {
            const health = summaries[shop.id]?.health
            return (
              <div key={shop.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                <p className="font-medium text-amber-800">{shop.name}</p>
                <p className="text-xs text-amber-700">
                  Missing: {health?.missing?.join(', ') || '-'} · Broken: {health?.broken?.join(', ') || '-'}
                </p>
              </div>
            )
          })}
          {orphans.map((item) => (
            <div key={item.id} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
              <p className="font-medium text-blue-800">ข้อมูลที่ยังไม่ผูกกับร้าน: {item.id}</p>
              <p className="text-xs text-blue-700">{item.keys.length} keys</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AppSettingsPopup({ shops, latestShop, onClose }) {
  const { notifyDaysBefore, setNotifyDaysBefore } = useAppStore()
  const [tab, setTab] = useState('backup')
  const [notifyDays, setNotifyDays] = useState(String(notifyDaysBefore ?? 3))
  const [syncStatus, setSyncStatus] = useState('')

  const syncNotifyAll = () => {
    const value = Math.max(0, Number(notifyDays) || 0)
    shops.forEach((shop) => {
      writeShopAppSetting(shop.id, { notifyDaysBefore: value })
      appendShopAuditLog(shop.id, {
        activityType: 'SETTINGS_SYNC_ALL_SHOPS',
        description: `ซิงก์วันแจ้งเตือนก่อนครบกำหนดเป็น ${value} วัน`,
        newValue: { notifyDaysBefore: value },
      })
    })
    setNotifyDaysBefore(value)
    setSyncStatus(`ซิงก์การแจ้งเตือน ${value} วันให้ ${shops.length} ร้านแล้ว`)
    setTimeout(() => setSyncStatus(''), 3000)
  }

  const tabs = [
    { key: 'backup', label: 'ข้อมูลและสำรอง' },
    { key: 'health', label: 'ตรวจสอบข้อมูล' },
    { key: 'notify', label: 'การแจ้งเตือน' },
    { key: 'logs', label: 'ประวัติ' },
    { key: 'about', label: 'เกี่ยวกับแอพ' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-base text-gray-900">ตั้งค่าแอพ</h2>
            <p className="text-xs text-gray-500 mt-0.5">จัดการข้อมูลรวมของทุกสาขาและการตั้งค่าที่ควรซิงก์กัน</p>
          </div>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onClose}>×</button>
        </div>

        <div className="border-b bg-white px-4 py-2 flex gap-1 overflow-x-auto">
          {tabs.map((item) => (
            <button
              key={item.key}
              className={`btn whitespace-nowrap ${tab === item.key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="p-5 overflow-y-auto">
          {tab === 'backup' && (
            <div className="space-y-5">
              <div>
                <h3 className="section-title">สำรองข้อมูลทุกร้าน</h3>
                <BackupAllShops />
              </div>
              <div className="border-t pt-5">
                <h3 className="section-title">โฟลเดอร์ไฟล์แนบ</h3>
                <FolderManager />
              </div>
            </div>
          )}

          {tab === 'health' && (
            <div className="space-y-3">
              <h3 className="section-title">ตรวจสอบข้อมูลทุกสาขา</h3>
              <HealthPanel shops={shops} />
            </div>
          )}

          {tab === 'notify' && (
            <div className="space-y-4">
              <div>
                <h3 className="section-title">วันแจ้งเตือนก่อนครบกำหนด</h3>
                <p className="text-sm text-gray-600">
                  ค่านี้ใช้กับรายการค้างชำระและรอรับเงิน ปกติถูกเก็บแยกตามร้าน ปุ่มนี้จะซิงก์ค่าเดียวกันไปยังทุกร้าน
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                <div className="sm:w-48">
                  <label className="label">จำนวนวัน</label>
                  <input className="input" type="number" min="0" value={notifyDays} onChange={(e) => setNotifyDays(e.target.value)} />
                </div>
                <button className="btn btn-primary" onClick={syncNotifyAll} disabled={shops.length === 0}>
                  ซิงก์ไปยังทุกร้าน
                </button>
              </div>
              {syncStatus && <p className="text-sm text-emerald-600">{syncStatus}</p>}
            </div>
          )}

          {tab === 'logs' && (
            <div className="space-y-3">
              <h3 className="section-title">ประวัติของร้านที่กำลังใช้งาน</h3>
              <p className="text-sm text-gray-600">
                ปัจจุบัน log ถูกเก็บแยกตามร้าน {latestShop ? `ร้านล่าสุดคือ "${latestShop.name}"` : 'ยังไม่มีร้านล่าสุด'}
              </p>
              <LogDownloader />
            </div>
          )}

          {tab === 'about' && (
            <div className="space-y-4 text-sm text-gray-600">
              <div>
                <h3 className="section-title">บันทึกรายรับ-รายจ่ายร้านค้า</h3>
                <p>Multi-Shop Edition · ข้อมูลเก็บแยกตามร้านในเครื่องนี้</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="font-medium text-gray-800">แนวทาง sync ข้อมูล</p>
                <p className="mt-1">ข้อมูลธุรกรรม กระเป๋า หมวดหมู่ และประวัติ ควรแยกตามร้าน</p>
                <p>การแจ้งเตือนและนโยบาย backup สามารถซิงก์ทุกสาขาได้จากหน้านี้</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
