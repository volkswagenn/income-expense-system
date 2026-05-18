import { useMemo, useState } from 'react'
import useShopStore from '../../store/useShopStore'
import useAppStore from '../../store/useAppStore'
import useAuthStore from '../../store/useAuthStore'
import { appendShopAuditLog } from '../../lib/auditLog'
import { findOrphanShopData, getAllShopSummaries } from '../../lib/shopSummary'
import { buildCloudQueueReport, compactCloudQueue, getCloudDeviceId, getCloudQueueItems, getCloudQueueSummary, resetStuckCloudQueueItems } from '../../lib/cloudSyncMetadata'
import { downloadJson } from '../../lib/shopKeys'
import { checkCloudHealth } from '../../services/cloud/apiClient'
import { getCloudConfig, saveCloudConfig } from '../../services/cloud/cloudConfig'
import { pushAllShopQueues } from '../../services/cloud/syncApi'
import { pullAndApplyAllShops } from '../../services/cloud/pullApply'
import { getShopSessionSettings, saveShopSessionSettings } from '../../lib/shopSessions'
import { BackupAllShops } from '../Backup/BackupFull'
import FolderManager from '../Backup/FolderManager'
import LogDownloader from '../Backup/LogDownloader'

function writeShopAppSetting(shopId, changes) {
  const key = `${shopId}_app_settings`
  let current = { state: {}, version: 0 }
  try { current = JSON.parse(localStorage.getItem(key) || 'null') ?? current } catch { /* noop */ }
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
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">ร้านทั้งหมด</p>
          <p className="text-2xl font-bold text-gray-900">{shops.length}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs text-amber-700 mb-1">ต้องตรวจสอบ</p>
          <p className="text-2xl font-bold text-amber-700">{brokenShops.length}</p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-xs text-blue-700 mb-1">ข้อมูลกำพร้า</p>
          <p className="text-2xl font-bold text-blue-700">{orphans.length}</p>
        </div>
      </div>

      {brokenShops.length === 0 && orphans.length === 0 ? (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
          ✅ ข้อมูลร้านทั้งหมดอยู่ในสถานะปกติ
        </p>
      ) : (
        <div className="space-y-2">
          {brokenShops.map((shop) => {
            const health = summaries[shop.id]?.health
            return (
              <div key={shop.id} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                <p className="font-medium text-amber-800">{shop.name}</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Missing: {health?.missing?.join(', ') || '-'} · Broken: {health?.broken?.join(', ') || '-'}
                </p>
              </div>
            )
          })}
          {orphans.map((item) => (
            <div key={item.id} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
              <p className="font-medium text-blue-800">ข้อมูลที่ยังไม่ผูกกับร้าน: {item.id}</p>
              <p className="text-xs text-blue-700 mt-0.5">{item.keys.length} keys</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LoginSecurityPanel() {
  const maxLoginAttempts    = useAuthStore((s) => s.maxLoginAttempts)
  const setMaxLoginAttempts = useAuthStore((s) => s.setMaxLoginAttempts)
  const maxPinLoginAttempts    = useAuthStore((s) => s.maxPinLoginAttempts)
  const setMaxPinLoginAttempts = useAuthStore((s) => s.setMaxPinLoginAttempts)

  const [pwValue,  setPwValue]  = useState(String(maxLoginAttempts ?? 5))
  const [pinValue, setPinValue] = useState(String(maxPinLoginAttempts ?? 5))
  const [saved, setSaved] = useState(false)

  const clamp = (v) => String(Math.max(1, Math.min(99, Number(v) || 5)))

  const save = () => {
    setMaxLoginAttempts(pwValue)
    setMaxPinLoginAttempts(pinValue)
    setPwValue(clamp(pwValue))
    setPinValue(clamp(pinValue))
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="section-title">ระบบการลงชื่อเข้าใช้</h2>
        <p className="text-sm text-gray-600">
          กำหนดจำนวนครั้งที่ผู้ใช้สามารถใส่รหัสผิดได้ก่อนระบบดำเนินการอัตโนมัติ
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
        {/* Password row */}
        <div className="px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-800">👤 ชื่อผู้ใช้ / รหัสผ่าน</p>
            <p className="text-xs text-gray-500 mt-0.5">
              ใส่รหัสผ่านผิดเกินกำหนด → บล็อกบัญชี (ต้องให้ผู้ดูแลปลดบล็อก)
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              className="input w-20 text-center"
              type="number"
              min="1"
              max="99"
              value={pwValue}
              onChange={(e) => setPwValue(e.target.value)}
            />
            <span className="text-sm text-gray-500">ครั้ง</span>
          </div>
        </div>

        {/* PIN row */}
        <div className="px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-800">🔢 รหัส PIN</p>
            <p className="text-xs text-gray-500 mt-0.5">
              ใส่ PIN ผิดเกินกำหนด → ระงับการใช้ PIN (login ด้วยรหัสผ่านได้ตามปกติ)
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              className="input w-20 text-center"
              type="number"
              min="1"
              max="99"
              value={pinValue}
              onChange={(e) => setPinValue(e.target.value)}
            />
            <span className="text-sm text-gray-500">ครั้ง</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        บัญชีที่ถูกบล็อกจะแสดงในหน้าจัดการผู้ใช้งาน พร้อมสาเหตุ และใช้สิทธิ์บล็อก/ปลดบล็อกในการจัดการ
      </div>

      <div>
        <button className="btn btn-primary" onClick={save}>
          บันทึกการตั้งค่า
        </button>
      </div>

      {saved && (
        <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2">
          ✅ บันทึกการตั้งค่าการลงชื่อเข้าใช้แล้ว
        </p>
      )}
    </div>
  )
}

function ShopAccessSessionPanel() {
  const [settings, setSettings] = useState(() => getShopSessionSettings())
  const [saved, setSaved] = useState(false)

  const update = (key, value) => setSettings((current) => ({ ...current, [key]: value }))
  const save = () => {
    const next = saveShopSessionSettings(settings)
    setSettings(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="section-title">การเข้าใช้งานร้านค้า</h2>
        <p className="text-sm text-gray-600">
          กำหนดจำนวนผู้ใช้ที่เข้าแก้ไขข้อมูลพร้อมกันได้ และจำนวนผู้ใช้ที่เข้าอ่านอย่างเดียวได้เมื่อร้านมีคนใช้งานอยู่
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="rounded-xl border border-gray-200 p-4">
          <span className="label">จำนวนคนแก้ไขข้อมูล</span>
          <input className="input text-center" type="number" min="1" max="20" value={settings.maxEditors} onChange={(e) => update('maxEditors', e.target.value)} />
          <p className="text-xs text-gray-500 mt-2">แนะนำ 1-2 คนต่อร้าน เพื่อลดข้อมูลชนกัน</p>
        </label>

        <label className="rounded-xl border border-gray-200 p-4">
          <span className="label">จำนวนคนอ่านอย่างเดียว</span>
          <input className="input text-center" type="number" min="0" max="100" value={settings.maxViewers} onChange={(e) => update('maxViewers', e.target.value)} />
          <p className="text-xs text-gray-500 mt-2">ใช้สำหรับดูข้อมูลเมื่อโควต้าแก้ไขเต็ม</p>
        </label>

        <label className="rounded-xl border border-gray-200 p-4">
          <span className="label">เวลาค้างก่อนหลุด</span>
          <input className="input text-center" type="number" min="1" max="240" value={settings.timeoutMinutes} onChange={(e) => update('timeoutMinutes', e.target.value)} />
          <p className="text-xs text-gray-500 mt-2">นาทีที่ไม่มี heartbeat แล้วถือว่าหลุด session</p>
        </label>
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <p className="text-sm font-medium text-gray-800 mb-3">เมื่อโควต้าแก้ไขเต็ม</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={`rounded-xl border px-4 py-3 cursor-pointer ${settings.overflowMode === 'readonly' ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}>
            <input className="mr-2" type="radio" name="overflowMode" checked={settings.overflowMode === 'readonly'} onChange={() => update('overflowMode', 'readonly')} />
            เข้าเป็นโหมดอ่านอย่างเดียว
          </label>
          <label className={`rounded-xl border px-4 py-3 cursor-pointer ${settings.overflowMode === 'block' ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}>
            <input className="mr-2" type="radio" name="overflowMode" checked={settings.overflowMode === 'block'} onChange={() => update('overflowMode', 'block')} />
            ไม่ให้เข้าร้าน
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Monitor ใช้ heartbeat ประมาณทุก 30 วินาที ไม่ใช่ real-time data sync ทุก action จึงไม่กระทบ flow บันทึกข้อมูลหลัก
      </div>

      <button className="btn btn-primary" onClick={save}>บันทึกการตั้งค่า</button>

      {saved && (
        <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2">
          บันทึกการตั้งค่าการเข้าใช้งานร้านค้าแล้ว
        </p>
      )}
    </div>
  )
}

function StatBox({ label, value, tone = 'gray' }) {
  const tones = {
    gray: 'border-gray-200 bg-gray-50 text-gray-900',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  }
  return (
    <div className={`rounded-xl border px-4 py-3 ${tones[tone] ?? tones.gray}`}>
      <p className="text-xs opacity-75 mb-1">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
    </div>
  )
}

function CloudSyncStatusPanel({ shops }) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [testing, setTesting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [config, setConfig] = useState(() => getCloudConfig())
  const deviceId = getCloudDeviceId()

  const rows = useMemo(() => shops.map((shop) => {
    const summary = getCloudQueueSummary(shop.id)
    const items = getCloudQueueItems(shop.id)
    return {
      shop,
      summary,
      latestQueuedAt: items.map((item) => item.updatedAt || item.createdAt).filter(Boolean).sort().at(-1) ?? null,
    }
  }), [shops, refreshKey])

  const totals = rows.reduce(
    (acc, row) => {
      acc.total += row.summary.total
      acc.pending += row.summary.pending
      acc.failed += row.summary.failed
      acc.dead += row.summary.dead
      return acc
    },
    { total: 0, pending: 0, failed: 0, dead: 0 }
  )

  const handleCompactAll = () => {
    const results = shops.map((shop) => ({ shop, result: compactCloudQueue(shop.id) }))
    const removed = results.reduce((sum, item) => sum + item.result.removed, 0)
    setRefreshKey((v) => v + 1)
    setMessage(`จัดระเบียบ queue แล้ว ลดรายการซ้ำได้ ${removed.toLocaleString('th-TH')} รายการ`)
    setTimeout(() => setMessage(''), 3500)
  }

  const handleResetStuckAll = () => {
    shops.forEach((shop) => resetStuckCloudQueueItems(shop.id))
    setRefreshKey((v) => v + 1)
    setMessage('Reset stuck queue items to pending.')
    setTimeout(() => setMessage(''), 3500)
  }

  const handleDownloadReport = () => {
    const report = buildCloudQueueReport(shops)
    downloadJson(report, `cloud_readiness_${new Date().toISOString().slice(0, 10)}.json`)
  }

  const handleSaveCloudConfig = () => {
    const next = saveCloudConfig({
      enabled: Boolean(config.enabled),
      supabaseUrl: String(config.supabaseUrl || config.apiBaseUrl || '').trim().replace(/\/+$/, ''),
      supabaseAnonKey: String(config.supabaseAnonKey || '').trim(),
    })
    setConfig(next)
    setMessage('บันทึกค่า Cloud แล้ว')
    setError('')
    setTimeout(() => setMessage(''), 2500)
  }

  const handleHealthCheck = async () => {
    setTesting(true)
    setError('')
    setMessage('')
    try {
      handleSaveCloudConfig()
      const result = await checkCloudHealth()
      const next = saveCloudConfig({
        lastHealthCheckAt: new Date().toISOString(),
        lastHealthStatus: 'ok',
      })
      setConfig(next)
      setMessage(`เชื่อมต่อ Cloud สำเร็จ${result?.status ? `: ${result.status}` : ''}`)
    } catch (err) {
      const next = saveCloudConfig({
        lastHealthCheckAt: new Date().toISOString(),
        lastHealthStatus: 'failed',
      })
      setConfig(next)
      setError(err.message || 'เชื่อมต่อ Cloud ไม่สำเร็จ')
    } finally {
      setTesting(false)
      setTimeout(() => setMessage(''), 3500)
    }
  }

  const handleManualPush = async () => {
    setSyncing(true)
    setError('')
    setMessage('')
    try {
      handleSaveCloudConfig()
      const results = await pushAllShopQueues(shops)
      const applied = results.reduce((sum, item) => sum + (item.applied?.length ?? 0), 0)
      const failed = results.reduce((sum, item) => sum + (item.failed?.length ?? 0), 0)
      setRefreshKey((v) => v + 1)
      setMessage(`Push queue สำเร็จ ${applied.toLocaleString('th-TH')} รายการ${failed ? `, ล้มเหลว ${failed.toLocaleString('th-TH')} รายการ` : ''}`)
    } catch (err) {
      setRefreshKey((v) => v + 1)
      setError(err.message || 'Push queue ไม่สำเร็จ')
    } finally {
      setSyncing(false)
    }
  }

  const handleManualPull = async () => {
    setPulling(true)
    setError('')
    setMessage('')
    try {
      handleSaveCloudConfig()
      const results = await pullAndApplyAllShops(shops)
      const applied = results.reduce((sum, item) => sum + (item.applied ?? 0), 0)
      const conflicts = results.reduce((sum, item) => sum + (item.conflicts ?? 0), 0)
      setRefreshKey((v) => v + 1)
      setMessage(`Pull จาก Cloud สำเร็จ ${applied.toLocaleString('th-TH')} รายการ${conflicts ? `, ข้ามเพราะมี local pending ${conflicts.toLocaleString('th-TH')} รายการ` : ''} กรุณา reload แอพเพื่อให้ store อ่านข้อมูลล่าสุดครบทุกหน้า`)
    } catch (err) {
      setError(err.message || 'Pull จาก Cloud ไม่สำเร็จ')
    } finally {
      setPulling(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="section-title">สถานะเตรียมระบบ Cloud</h2>
        <p className="text-sm text-gray-600">
          หน้านี้เป็นเครื่องมือตรวจ queue และ metadata สำหรับเตรียมขึ้น cloud เท่านั้น ยังไม่มีการส่งข้อมูลออกจากเครื่อง
        </p>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        Device ID: <span className="font-mono break-all">{deviceId}</span>
      </div>

      <div className="rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
          <div className="flex-1">
            <label className="label">Supabase URL</label>
            <input
              className="input"
              value={config.supabaseUrl || config.apiBaseUrl || ''}
              onChange={(e) => setConfig((s) => ({ ...s, supabaseUrl: e.target.value, apiBaseUrl: e.target.value }))}
              placeholder="https://your-project.supabase.co"
            />
          </div>
          <div className="flex-1">
            <label className="label">Supabase Anon Key</label>
            <input
              className="input"
              type="password"
              value={config.supabaseAnonKey || ''}
              onChange={(e) => setConfig((s) => ({ ...s, supabaseAnonKey: e.target.value }))}
              placeholder="eyJ..."
            />
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-3 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(config.enabled)}
              onChange={(e) => setConfig((s) => ({ ...s, enabled: e.target.checked }))}
            />
            <span className="text-sm font-medium text-gray-700">เปิด Cloud Sync</span>
          </label>
          <button className="btn btn-secondary" onClick={handleSaveCloudConfig}>
            บันทึกค่า
          </button>
          <button className="btn btn-secondary" onClick={handleHealthCheck} disabled={testing || !(config.supabaseUrl || config.apiBaseUrl) || !config.supabaseAnonKey}>
            {testing ? 'Testing...' : 'Test connection'}
          </button>
        </div>
        <div className="text-xs text-gray-500 flex flex-wrap gap-3">
          <span>สถานะ: {config.enabled ? 'เปิดใช้งานแบบ manual' : 'ปิดอยู่'}</span>
          <span>Health: {config.lastHealthStatus || '-'}</span>
          <span>ตรวจล่าสุด: {config.lastHealthCheckAt ? new Date(config.lastHealthCheckAt).toLocaleString('th-TH') : '-'}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatBox label="Queue ทั้งหมด" value={totals.total.toLocaleString('th-TH')} tone="gray" />
        <StatBox label="รอขึ้น Cloud" value={totals.pending.toLocaleString('th-TH')} tone="blue" />
        <StatBox label="Sync ล้มเหลว" value={totals.failed.toLocaleString('th-TH')} tone={totals.failed > 0 ? 'amber' : 'emerald'} />
        <StatBox label="Dead-letter" value={totals.dead.toLocaleString('th-TH')} tone={totals.dead > 0 ? 'red' : 'emerald'} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-secondary" onClick={() => setRefreshKey((v) => v + 1)}>
          รีเฟรชสถานะ
        </button>
        <button className="btn btn-secondary" onClick={handleCompactAll} disabled={shops.length === 0}>
          จัดระเบียบ Queue
        </button>
        <button className="btn btn-secondary" onClick={handleResetStuckAll} disabled={shops.length === 0}>
          Reset Queue
        </button>
        <button className="btn btn-primary" onClick={handleDownloadReport} disabled={shops.length === 0}>
          ดาวน์โหลดรายงาน Cloud Readiness
        </button>
        <button
          className="btn btn-primary"
          onClick={handleManualPush}
          disabled={syncing || shops.length === 0 || !config.enabled || !(config.supabaseUrl || config.apiBaseUrl) || !config.supabaseAnonKey}
        >
          {syncing ? 'กำลัง Push...' : 'Push Queue ไป Cloud'}
        </button>
        <button
          className="btn btn-secondary"
          onClick={handleManualPull}
          disabled={pulling || shops.length === 0 || !config.enabled || !(config.supabaseUrl || config.apiBaseUrl) || !config.supabaseAnonKey}
        >
          {pulling ? 'กำลัง Pull...' : 'Pull จาก Cloud'}
        </button>
      </div>

      {message && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2">
          {message}
        </p>
      )}

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
          {error}
        </p>
      )}

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Cloud Sync now uses Supabase directly. Push and Pull are manual, and local offline data remains the source of truth until sync is triggered.
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_1fr] gap-3 px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500">
          <span>ร้าน</span>
          <span>ทั้งหมด</span>
          <span>Pending</span>
          <span>Failed/Dead</span>
          <span>ล่าสุด</span>
        </div>
        <div className="divide-y divide-gray-100">
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">ยังไม่มีร้านในระบบ</p>
          ) : rows.map(({ shop, summary, latestQueuedAt }) => (
            <div key={shop.id} className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_1fr] gap-3 px-4 py-3 text-sm items-center">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{shop.name}</p>
                <p className="text-xs text-gray-400">{shop.code ?? shop.id.slice(0, 8)}</p>
              </div>
              <span className="tabular-nums">{summary.total.toLocaleString('th-TH')}</span>
              <span className="tabular-nums text-blue-600">{summary.pending.toLocaleString('th-TH')}</span>
              <span className={`tabular-nums ${(summary.failed + summary.dead) > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                {(summary.failed + summary.dead).toLocaleString('th-TH')}
              </span>
              <span className="text-xs text-gray-500">
                {latestQueuedAt ? new Date(latestQueuedAt).toLocaleString('th-TH') : '-'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const TABS = [
  { key: 'backup',  icon: '💾', label: 'ข้อมูลและสำรอง' },
  { key: 'health',  icon: '🔍', label: 'ตรวจสอบข้อมูล' },
  { key: 'cloud',   icon: '☁️', label: 'Cloud Status' },
  { key: 'sessions', icon: '👥', label: 'การเข้าใช้งานร้านค้า' },
  { key: 'notify',  icon: '🔔', label: 'การแจ้งเตือน' },
  { key: 'logs',    icon: '📜', label: 'ประวัติ' },
  { key: 'about',   icon: 'ℹ️', label: 'เกี่ยวกับแอพ' },
]

export default function SettingsPage() {
  const shops = useShopStore((s) => s.shops)
  const activeShopId = useShopStore((s) => s.activeShopId)
  const { notifyDaysBefore, setNotifyDaysBefore, version } = useAppStore()
  const currentUser = useAuthStore((s) => s.currentUser)
  const isSuperadmin = currentUser?.role === 'superadmin'

  const latestShop = useMemo(() => {
    if (!shops.length) return null
    return shops.find((s) => s.id === activeShopId) ?? shops[0]
  }, [shops, activeShopId])

  const [tab, setTab] = useState('backup')
  const [notifyDays, setNotifyDays] = useState(String(notifyDaysBefore ?? 3))
  const [syncStatus, setSyncStatus] = useState('')
  const visibleTabs = useMemo(
    () => isSuperadmin ? [...TABS, { key: 'login', icon: '🔐', label: 'ระบบการลงชื่อเข้าใช้' }] : TABS,
    [isSuperadmin]
  )

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
    setSyncStatus(`✅ ซิงก์การแจ้งเตือน ${value} วัน ให้ ${shops.length} ร้านแล้ว`)
    setTimeout(() => setSyncStatus(''), 3000)
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">⚙️ ตั้งค่าระบบ</h1>
        <p className="text-sm text-gray-500 mt-0.5">จัดการข้อมูลรวมของทุกสาขาและการตั้งค่าระบบ</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Tab nav */}
        <div className="border-b border-gray-100 px-2 py-2 flex gap-1 overflow-x-auto">
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`btn whitespace-nowrap text-sm ${tab === t.key ? 'btn-primary' : 'btn-ghost'}`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-6">
          {tab === 'backup' && (
            <div className="space-y-6">
              <div>
                <h2 className="section-title">สำรองข้อมูลทุกร้าน</h2>
                <BackupAllShops />
              </div>
              <div className="border-t pt-6">
                <h2 className="section-title">โฟลเดอร์ไฟล์แนบ</h2>
                <FolderManager />
              </div>
            </div>
          )}

          {tab === 'health' && (
            <div className="space-y-4">
              <h2 className="section-title">ตรวจสอบข้อมูลทุกสาขา</h2>
              <HealthPanel shops={shops} />
            </div>
          )}

          {tab === 'cloud' && (
            <CloudSyncStatusPanel shops={shops} />
          )}

          {tab === 'sessions' && (
            <ShopAccessSessionPanel />
          )}

          {tab === 'notify' && (
            <div className="space-y-4">
              <div>
                <h2 className="section-title">วันแจ้งเตือนก่อนครบกำหนด</h2>
                <p className="text-sm text-gray-600">
                  ค่านี้ใช้กับรายการค้างชำระและรอรับเงิน ถูกเก็บแยกตามร้าน ปุ่มนี้จะซิงก์ค่าเดียวกันไปยังทุกร้าน
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
                <button
                  className="btn btn-primary"
                  onClick={syncNotifyAll}
                  disabled={shops.length === 0}
                >
                  ซิงก์ไปยังทุกร้าน
                </button>
              </div>
              {syncStatus && (
                <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2">
                  {syncStatus}
                </p>
              )}
            </div>
          )}

          {tab === 'login' && isSuperadmin && (
            <LoginSecurityPanel />
          )}

          {tab === 'logs' && (
            <div className="space-y-4">
              <div>
                <h2 className="section-title">ประวัติของร้านที่ใช้งานล่าสุด</h2>
                <p className="text-sm text-gray-600">
                  Log ถูกเก็บแยกตามร้าน{latestShop ? ` — ร้านล่าสุดคือ "${latestShop.name}"` : ' — ยังไม่มีร้านล่าสุด'}
                </p>
              </div>
              <LogDownloader />
            </div>
          )}

          {tab === 'about' && (
            <div className="space-y-4 text-sm text-gray-600">
              <div>
                <h2 className="section-title">บันทึกรายรับ-รายจ่ายร้านค้า</h2>
                <p>Multi-Shop Edition · รองรับ Cloud Sync ผ่าน Supabase</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-400 mb-1">เวอร์ชัน</p>
                  <p className="font-semibold text-gray-900">{version}</p>
                </div>
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-400 mb-1">จำนวนร้าน</p>
                  <p className="font-semibold text-gray-900">{shops.length} ร้าน</p>
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 p-4 space-y-1">
                <p className="font-medium text-gray-800">แนวทาง sync ข้อมูล</p>
                <p>ข้อมูลธุรกรรม กระเป๋า หมวดหมู่ และประวัติ ควรแยกตามร้าน</p>
                <p>การแจ้งเตือนและนโยบาย backup สามารถซิงก์ทุกสาขาได้จากหน้านี้</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
