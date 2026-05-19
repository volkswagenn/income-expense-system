import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { SHOP_COLORS } from '../../store/useShopStore'
import { getShopCode } from '../../lib/shopIdentity'

const money = new Intl.NumberFormat('th-TH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatDate(value) {
  if (!value) return 'ยังไม่มีรายการ'
  try {
    return format(new Date(value), 'd MMM yy', { locale: th })
  } catch {
    return 'ไม่ทราบวันที่'
  }
}

function timeAgo(value) {
  if (!value) return '-'
  const diff = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(diff)) return '-'
  const minutes = Math.max(0, Math.floor(diff / 60000))
  if (minutes < 1) return 'เมื่อสักครู่'
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`
  return `${Math.floor(minutes / 60)} ชม.ที่แล้ว`
}

export default function ShopCard({
  shop,
  shops,
  summary,
  onSelect,
  onDelete,
  onEdit,
  onBackup,
  isOnly,
  sessionSummary,
  users = [],
  canViewMonitor = false,
  canManageMonitor = false,
  onForceEndSession,
  canEditShop = false,
  canDeleteShop = false,
}) {
  const color = SHOP_COLORS.find((c) => c.id === shop.colorId) ?? SHOP_COLORS[0]
  const shopCode = getShopCode(shop, shops)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteText, setDeleteText] = useState('')

  const hasData = (summary?.transactionCount || 0) > 0 || (summary?.subWalletCount || 0) > 0
  const canDelete = !hasData || deleteText.trim() === shop.name
  const status = useMemo(() => {
    if (!summary?.health?.ok) return { label: 'ควรตรวจสอบ', className: 'bg-amber-100 text-amber-700' }
    if (summary.transactionCount > 0 || summary.totalBalance !== 0) return { label: 'มีข้อมูล', className: 'bg-emerald-100 text-emerald-700' }
    return { label: 'พร้อมใช้งาน', className: 'bg-blue-100 text-blue-700' }
  }, [summary])
  const sessionTone = sessionSummary?.editorCount > 0
    ? (sessionSummary.canEdit ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700')
    : 'bg-emerald-100 text-emerald-700'
  const sessionLabel = sessionSummary?.activeCount > 0
    ? `กำลังใช้งาน ${sessionSummary.activeCount} คน`
    : 'ไม่มีผู้ใช้งาน'

  const handleDelete = () => {
    if (!canDelete) return
    onDelete(shop.id)
    setConfirmDelete(false)
    setDeleteText('')
  }

  return (
    <>
      <div
        className={`relative border p-4 cursor-pointer transition-all duration-200 hover:shadow-md ${color.card} rounded-lg`}
        onClick={() => onSelect(shop.id)}
      >
        <div className={`absolute top-0 left-0 right-0 h-1 ${color.bg} rounded-t-lg`} />

        <div className="flex items-start gap-3">
          <div className={`w-12 h-12 rounded-lg ${color.bg} flex items-center justify-center text-white font-bold text-xl shadow-sm shrink-0`}>
            {shop.name[0]?.toUpperCase()}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={`font-semibold text-sm truncate ${color.text}`}>{shop.name}</p>
                <p className="text-xs text-gray-500">
                  {shopCode} · ใช้งานล่าสุด {formatDate(shop.lastUsedAt || shop.createdAt)}
                </p>
              </div>

              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  className="w-8 h-8 rounded-lg bg-white/80 hover:bg-white text-gray-500 hover:text-gray-800 flex items-center justify-center shadow-sm"
                  onClick={() => setMenuOpen((v) => !v)}
                  title="จัดการร้าน"
                  aria-label="จัดการร้าน"
                >
                  <span className="text-lg leading-none">⋮</span>
                </button>

                {menuOpen && (
                  <div className="absolute right-0 top-9 z-10 w-44 rounded-lg border border-gray-200 bg-white shadow-lg py-1 text-sm">
                    {canEditShop && (
                      <button className="w-full px-3 py-2 text-left hover:bg-gray-50" onClick={() => { setMenuOpen(false); onEdit(shop) }}>
                        แก้ไขร้าน
                      </button>
                    )}
                    <button className="w-full px-3 py-2 text-left hover:bg-gray-50" onClick={() => { setMenuOpen(false); onBackup(shop) }}>
                      สำรองร้านนี้
                    </button>
                    {canDeleteShop && (
                      <button className="w-full px-3 py-2 text-left text-red-600 hover:bg-red-50" onClick={() => { setMenuOpen(false); setConfirmDelete(true) }}>
                        ลบร้าน
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-white/70 border border-white/70 p-2">
                <p className="text-gray-500">ยอดรวม</p>
                <p className="font-semibold text-gray-900">{money.format(summary?.totalBalance || 0)} บาท</p>
              </div>
              <div className="rounded-lg bg-white/70 border border-white/70 p-2">
                <p className="text-gray-500">รายการ</p>
                <p className="font-semibold text-gray-900">{summary?.transactionCount || 0} รายการ</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
              <span className={`px-2 py-1 rounded-full ${status.className}`}>{status.label}</span>
              <span className={`px-2 py-1 rounded-full ${sessionTone}`}>{sessionLabel}</span>
              {(summary?.pendingPaymentCount || 0) > 0 && (
                <span className="px-2 py-1 rounded-full bg-red-100 text-red-700">ค้างชำระ {summary.pendingPaymentCount}</span>
              )}
              {(summary?.pendingIncomeCount || 0) > 0 && (
                <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700">รอรับ {summary.pendingIncomeCount}</span>
              )}
              {(summary?.taxWaitingCount || 0) > 0 && (
                <span className="px-2 py-1 rounded-full bg-purple-100 text-purple-700">รอใบกำกับ {summary.taxWaitingCount}</span>
              )}
            </div>

            {sessionSummary?.activeCount > 0 && (
              <div className="mt-3 rounded-lg border border-white/70 bg-white/70 px-3 py-2 text-xs text-gray-600">
                {canViewMonitor ? (
                  <div className="space-y-1.5">
                    {sessionSummary.active.slice(0, 3).map((session) => {
                      const user = users.find((u) => u.id === session.userId)
                      return (
                        <div key={session.id} className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate">
                            {session.mode === 'edit' ? 'แก้ไข' : 'อ่าน'} · {user?.displayName || session.displayName}
                          </span>
                          <span className="flex items-center gap-2 shrink-0 text-gray-400">
                            {timeAgo(session.lastSeenAt)}
                            {canManageMonitor && (
                              <button
                                className="text-red-500 hover:text-red-700"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onForceEndSession?.(session.id)
                                }}
                                title="ปล่อย session"
                              >
                                ปล่อย
                              </button>
                            )}
                          </span>
                        </div>
                      )
                    })}
                    {sessionSummary.active.length > 3 && (
                      <p className="text-gray-400">+ อีก {sessionSummary.active.length - 3} session</p>
                    )}
                  </div>
                ) : (
                  <p>มีผู้ใช้งานอยู่ แต่คุณไม่มีสิทธิ์ดูรายละเอียด</p>
                )}
              </div>
            )}

            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-gray-500">รายการล่าสุด {formatDate(summary?.latestTransactionAt)}</p>
              <span className={`text-sm font-semibold ${color.text}`}>เข้าใช้งาน</span>
            </div>
          </div>
        </div>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b bg-red-50 border-red-100">
              <h3 className="font-semibold text-base text-red-700">ลบร้านนี้?</h3>
            </div>
            <div className="px-6 py-4 space-y-3 text-sm text-gray-700">
              <p>ร้าน "{shop.name}" มี {summary?.transactionCount || 0} รายการ และยอดรวม {money.format(summary?.totalBalance || 0)} บาท</p>
              {hasData ? (
                <div>
                  <label className="label">พิมพ์ชื่อร้านเพื่อยืนยันการลบ</label>
                  <input className="input" value={deleteText} onChange={(e) => setDeleteText(e.target.value)} placeholder={shop.name} autoFocus />
                </div>
              ) : (
                <p>ร้านนี้ยังไม่มีข้อมูลสำคัญ สามารถลบได้ทันที</p>
              )}
              <p className="text-xs text-red-600">การลบจะลบข้อมูลของร้านนี้ออกจากเครื่องและไม่สามารถย้อนกลับได้</p>
            </div>
            <div className="px-6 pb-5 flex gap-3 justify-end">
              <button className="btn btn-secondary" onClick={() => { setConfirmDelete(false); setDeleteText('') }}>ยกเลิก</button>
              <button className="btn btn-danger disabled:opacity-50 disabled:cursor-not-allowed" disabled={!canDelete} onClick={handleDelete}>
                ลบร้าน
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
