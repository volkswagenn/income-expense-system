import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useShopStore from '../../store/useShopStore'
import useAuthStore from '../../store/useAuthStore'
import { switchToShop } from '../../lib/shopSwitch'
import { downloadJson, shopDataKeys } from '../../lib/shopKeys'
import { buildShopBackup, findOrphanShopData, getAllShopSummaries } from '../../lib/shopSummary'
import { appendShopAuditLog } from '../../lib/auditLog'
import { checkPermission, isAdminRole, P } from '../../lib/permissions'
import { getShopCode } from '../../lib/shopIdentity'
import {
  forceEndShopSession,
  getShopSessionSettings,
  getShopSessionSummary,
  pruneExpiredShopSessions,
  startShopSession,
} from '../../lib/shopSessions'
import useRoleStore from '../../store/useRoleStore'
import ShopCard from './ShopCard'
import CreateShopPopup from './CreateShopPopup'
import EditShopPopup from './EditShopPopup'

function sortShops(list, summaries, sortBy) {
  return [...list].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name, 'th')
    if (sortBy === 'created') return new Date(b.createdAt) - new Date(a.createdAt)
    if (sortBy === 'balance') return (summaries[b.id]?.totalBalance || 0) - (summaries[a.id]?.totalBalance || 0)
    return new Date(b.lastUsedAt || b.createdAt) - new Date(a.lastUsedAt || a.createdAt)
  })
}

export default function ShopManager() {
  const { shops, createShop, recoverShop, deleteShop, updateShop, setActiveShop } = useShopStore()
  const currentUser = useAuthStore((s) => s.currentUser)
  const users = useAuthStore((s) => s.users)
  const roles = useRoleStore((s) => s.roles)

  // Filter shops by user's shopAccess (null = all, array = assigned only)
  const accessibleShops = useMemo(() => {
    if (!currentUser) return []
    if (currentUser.shopAccess === null || isAdminRole(currentUser.role)) return shops
    const ids = Array.isArray(currentUser.shopAccess) ? currentUser.shopAccess : []
    return shops.filter((s) => ids.includes(s.id))
  }, [shops, currentUser])

  const canCreateShop = isAdminRole(currentUser?.role)

  const [createOpen, setCreateOpen] = useState(false)
  const [editingShop, setEditingShop] = useState(null)
  const [selectError, setSelectError] = useState('')
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState('recent')
  const [sessionRefresh, setSessionRefresh] = useState(0)
  const navigate = useNavigate()
  const sessionSettings = useMemo(() => {
    sessionRefresh
    pruneExpiredShopSessions()
    return getShopSessionSettings()
  }, [sessionRefresh])
  const canViewSystemMonitor = checkPermission(roles, currentUser?.role, P.VIEW_SHOP_SESSIONS)
  const canManageSystemMonitor = checkPermission(roles, currentUser?.role, P.MANAGE_SHOP_SESSIONS)
  const canViewOwnMonitor = checkPermission(roles, currentUser?.role, P.VIEW_OWN_SHOP_SESSIONS)
  const canManageOwnMonitor = checkPermission(roles, currentUser?.role, P.MANAGE_OWN_SHOP_SESSIONS)

  const getFirstAllowedShopRoute = () => {
    const candidates = [
      { permission: P.VIEW_DASHBOARD, path: '/dashboard' },
      { permission: [P.MANAGE_INCOME, P.MANAGE_EXPENSE, P.MANAGE_RECURRING], path: '/transactions' },
      { permission: [P.VIEW_PENDING_TASKS, P.VIEW_PENDING_PAYMENT, P.VIEW_PENDING_INCOME], path: '/pending-tasks' },
      { permission: P.VIEW_WALLET, path: '/wallet' },
      { permission: P.VIEW_REPORTS, path: '/reports' },
      { permission: P.VIEW_HISTORY, path: '/history' },
      { permission: P.IMPORT_DATA, path: '/import' },
      { permission: P.MANAGE_BACKUP, path: '/backup' },
    ]
    return candidates.find((item) => checkPermission(roles, currentUser?.role, item.permission))?.path ?? null
  }

  const summaries = useMemo(() => getAllShopSummaries(shops), [shops])
  const orphans = useMemo(() => findOrphanShopData(shops), [shops])
  const visibleShops = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? accessibleShops.filter((shop) => shop.name.toLowerCase().includes(q))
      : accessibleShops
    return sortShops(filtered, summaries, sortBy)
  }, [query, accessibleShops, sortBy, summaries])

  const handleSelect = (shopId) => {
    const destination = getFirstAllowedShopRoute()
    if (!destination) {
      setSelectError('บัญชีนี้มีสิทธิ์เห็นร้าน แต่ยังไม่มีสิทธิ์ใช้งานเมนูภายในร้าน กรุณาเพิ่มสิทธิ์ Dashboard หรือบันทึกรายรับ-รายจ่ายให้ Role นี้')
      return
    }
    setSelectError('')
    const shop = shops.find((item) => item.id === shopId)
    const sessionResult = startShopSession(shopId, shop?.name ?? '', currentUser, sessionSettings)
    if (!sessionResult.ok) {
      setSelectError('ร้านนี้มีผู้ใช้งานครบตามจำนวนที่ตั้งไว้แล้ว กรุณารอสักครู่หรือให้ผู้ดูแลปล่อย session')
      setSessionRefresh((v) => v + 1)
      return
    }
    switchToShop(shopId)
    setActiveShop(shopId)
    const shopLabel = shop ? `${getShopCode(shop, shops)} - ${shop.name}` : 'ร้านที่ไม่ทราบชื่อ'
    appendShopAuditLog(shopId, {
      activityType: 'SHOP_SELECT',
      description: `เข้าใช้งานร้าน "${shopLabel}"`,
      newValue: { shopId, shopName: shop?.name ?? null, shopCode: shop ? getShopCode(shop, shops) : null, sessionMode: sessionResult.mode },
    })
    navigate(destination)
  }

  const handleForceEndSession = (sessionId) => {
    forceEndShopSession(sessionId, 'released_by_admin')
    setSessionRefresh((v) => v + 1)
  }

  const handleCreate = (name, colorId) => {
    const shop = createShop(name, colorId)
    switchToShop(shop.id)
    appendShopAuditLog(shop.id, {
      activityType: 'SHOP_CREATE',
      description: `สร้างร้าน "${shop.name}"`,
      newValue: shop,
    })
    handleSelect(shop.id)
  }

  const handleDelete = (shopId) => {
    const shop = shops.find((item) => item.id === shopId)
    appendShopAuditLog(shopId, {
      activityType: 'SHOP_DELETE',
      description: `ลบร้าน "${shop?.name ?? shopId}"`,
      oldValue: { shop, summary: summaries[shopId] },
    })
    deleteShop(shopId)
    shopDataKeys(shopId).forEach((key) => localStorage.removeItem(key))
  }

  const handleBackup = (shop) => {
    downloadJson(buildShopBackup(shop), `backup_${shop.name}_${new Date().toISOString().slice(0, 10)}.json`)
    appendShopAuditLog(shop.id, {
      activityType: 'SHOP_BACKUP',
      description: `สำรองข้อมูลร้าน "${shop.name}"`,
      newValue: { shopId: shop.id, shopName: shop.name },
    })
  }

  const handleRecoverOrphan = (orphan) => {
    const shop = recoverShop(orphan.id, `ร้านที่กู้คืน ${orphan.id.slice(0, 6)}`, 'orange')
    appendShopAuditLog(shop.id, {
      activityType: 'SHOP_RECOVER',
      description: `กู้คืนข้อมูลร้าน "${shop.name}"`,
      newValue: { shop, recoveredKeys: orphan.keys },
    })
    handleSelect(shop.id)
  }

  const handleUpdateShop = (id, changes) => {
    const oldShop = shops.find((shop) => shop.id === id)
    updateShop(id, changes)
    appendShopAuditLog(id, {
      activityType: 'SHOP_UPDATE',
      description: `แก้ไขร้าน "${oldShop?.name ?? id}"`,
      oldValue: oldShop,
      newValue: { ...oldShop, ...changes },
    })
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🏪 ร้านค้าทั้งหมด</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {currentUser?.shopAccess === null || isAdminRole(currentUser?.role)
              ? `พบข้อมูล ${shops.length} ร้าน · ข้อมูลแต่ละร้านถูกเก็บแยกกัน`
              : `คุณมีสิทธิ์เข้าถึง ${accessibleShops.length} จาก ${shops.length} ร้าน`
            }
          </p>
        </div>
        {canCreateShop && (
          <button
            className="btn btn-primary px-5 py-2 text-sm whitespace-nowrap"
            onClick={() => setCreateOpen(true)}
          >
            + เพิ่มร้านใหม่
          </button>
        )}
      </div>

      {/* Orphan warning */}
      {orphans.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-amber-800 text-sm">
                ⚠️ พบข้อมูลร้านที่ยังไม่ได้อยู่ในรายชื่อ
              </h2>
              <p className="text-xs text-amber-700 mt-1">
                พบข้อมูลเก่า {orphans.length} ชุด สามารถกู้คืนเป็นร้านใหม่ได้
              </p>
            </div>
            <button className="btn btn-warning text-sm" onClick={() => handleRecoverOrphan(orphans[0])}>
              กู้คืนข้อมูลชุดแรก
            </button>
          </div>
        </section>
      )}

      {/* Search & sort */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            className="input sm:flex-1"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="🔍 ค้นหาชื่อร้าน..."
          />
          <select
            className="input sm:w-44"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="recent">ใช้งานล่าสุด</option>
            <option value="name">ชื่อร้าน A-Z</option>
            <option value="created">สร้างล่าสุด</option>
            <option value="balance">ยอดเงินมากสุด</option>
          </select>
        </div>
      </section>

      {selectError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {selectError}
        </div>
      )}

      {/* Shop grid */}
      {accessibleShops.length === 0 ? (
        <section className="rounded-xl border-2 border-dashed border-gray-200 bg-white py-16 px-6 text-center">
          <div className="text-5xl mb-4">🏪</div>
          {shops.length === 0 ? (
            <>
              <h2 className="text-lg font-semibold text-gray-900">ยังไม่มีร้านในระบบ</h2>
              <p className="text-gray-500 text-sm mt-2 max-w-sm mx-auto">สร้างร้านแรกเพื่อเริ่มบันทึกรายรับรายจ่าย</p>
              {canCreateShop && (
                <button className="btn btn-primary px-8 py-3 text-base mt-6" onClick={() => setCreateOpen(true)}>
                  + สร้างร้านแรก
                </button>
              )}
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-gray-900">ยังไม่ได้รับมอบหมายร้าน</h2>
              <p className="text-gray-500 text-sm mt-2 max-w-sm mx-auto">
                บัญชีของคุณยังไม่มีร้านค้าที่ได้รับมอบหมาย กรุณาติดต่อผู้ดูแลระบบ
              </p>
            </>
          )}
        </section>
      ) : visibleShops.length === 0 ? (
        <section className="rounded-xl border border-gray-200 bg-white py-10 px-6 text-center">
          <p className="text-gray-400 text-sm">ไม่พบร้านที่ตรงกับคำค้นหา</p>
        </section>
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleShops.map((shop) => (
            <ShopCard
              key={shop.id}
              shop={shop}
              shops={shops}
              summary={summaries[shop.id]}
              onSelect={handleSelect}
              onDelete={handleDelete}
              onEdit={setEditingShop}
              onBackup={handleBackup}
              isOnly={shops.length === 1}
              sessionSummary={getShopSessionSummary(shop.id, sessionSettings)}
              users={users}
              canViewMonitor={canViewSystemMonitor || canViewOwnMonitor}
              canManageMonitor={canManageSystemMonitor || canManageOwnMonitor}
              onForceEndSession={handleForceEndSession}
            />
          ))}
        </section>
      )}

      <footer className="py-2 text-center text-xs text-gray-400">
        Multi-Shop Edition · ข้อมูลเก็บแยกตามร้าน · สำรองข้อมูลเป็นระยะเพื่อความปลอดภัย
      </footer>

      {createOpen && (
        <CreateShopPopup onClose={() => setCreateOpen(false)} onCreate={handleCreate} />
      )}
      {editingShop && (
        <EditShopPopup
          shop={editingShop}
          onClose={() => setEditingShop(null)}
          onSave={handleUpdateShop}
        />
      )}
    </div>
  )
}
