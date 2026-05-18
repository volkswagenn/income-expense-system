import { useState, useMemo } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { th } from 'date-fns/locale'
import useGlobalLogStore, {
  readShopLogsFromStorage,
  readShopTransactionsFromStorage,
} from '../../store/useGlobalLogStore'
import useShopStore from '../../store/useShopStore'
import useAuthStore from '../../store/useAuthStore'
import useRoleStore from '../../store/useRoleStore'
import { ACTIVITY_LABELS } from '../../lib/logBuilder'
import { P, checkPermission } from '../../lib/permissions'
import { getActorLabel, getActorSearchText } from '../../lib/auditActor'
import DateRangeFilter from '../../components/shared/DateRangeFilter'

// ── Activity type sets ─────────────────────────────────────────────────────────

const MONEY_LOG_TYPES = new Set([
  'CASH_DEPOSIT', 'TRANSFER_TO_WALLET', 'WITHDRAW_FROM_TRANSFER',
  'PAY_PENDING', 'OPEN_BILL_INCOME',
  'SUB_DEPOSIT', 'SUB_WITHDRAW', 'SUB_TRANSFER', 'SUB_BORROW', 'SUB_RETURN',
])
const TX_LOG_TYPES = new Set([
  'ADD_INCOME', 'ADD_INCOME_MAIN', 'ADD_OTHER_INCOME',
  'ADD_EXPENSE', 'EDIT_INCOME', 'EDIT_EXPENSE',
])
const MGMT_TYPES = new Set([
  'SYS_USER_CREATE', 'SYS_USER_UPDATE', 'SYS_USER_DELETE',
  'SYS_USER_BLOCK', 'SYS_USER_UNBLOCK',
  'SYS_ROLE_CREATE', 'SYS_ROLE_UPDATE', 'SYS_ROLE_DELETE',
  'STORE_USER_CREATE', 'STORE_USER_UPDATE', 'STORE_USER_DELETE',
  'STORE_USER_BLOCK', 'STORE_USER_UNBLOCK',
  'STORE_ROLE_CREATE', 'STORE_ROLE_UPDATE', 'STORE_ROLE_DELETE',
])
const SHOP_MGMT_TYPES = new Set([
  'SHOP_CREATE', 'SHOP_UPDATE', 'SHOP_DELETE', 'SHOP_RECOVER',
  'SHOP_SELECT', 'SHOP_BACKUP',
  'SETTINGS_BACKUP', 'SETTINGS_RESTORE', 'SETTINGS_SYNC_ALL_SHOPS',
  'IMPORT_DATA', 'RESTORE_BACKUP', 'LOG_EXPORT', 'LOG_CLEAR_OLD',
])

// ── Helpers ────────────────────────────────────────────────────────────────────

function typeColor(type) {
  if (!type) return 'bg-gray-100 text-gray-600'
  if (type.includes('INCOME') || type === 'ADD_INCOME_MAIN' || type === 'OPEN_BILL_INCOME')
    return 'bg-emerald-100 text-emerald-700'
  if (type.includes('EXPENSE') || type === 'OPEN_BILL' || type === 'PAY_PENDING')
    return 'bg-red-100 text-red-700'
  if (type === 'CANCEL_TRANSACTION' || type === 'DELETE_TRANSACTION')
    return 'bg-orange-100 text-orange-700'
  if (type?.startsWith('SUB_') || MONEY_LOG_TYPES.has(type))
    return 'bg-purple-100 text-purple-700'
  if (MGMT_TYPES.has(type)) {
    if (type.includes('DELETE') || type.includes('BLOCK')) return 'bg-red-100 text-red-700'
    if (type.includes('CREATE')) return 'bg-emerald-100 text-emerald-700'
    if (type.includes('UPDATE') || type.includes('UNBLOCK')) return 'bg-blue-100 text-blue-700'
    return 'bg-indigo-100 text-indigo-700'
  }
  if (SHOP_MGMT_TYPES.has(type)) return 'bg-amber-100 text-amber-700'
  return 'bg-gray-100 text-gray-600'
}

function ShopBadge({ shop }) {
  if (!shop) return (
    <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">ระบบหลัก</span>
  )
  return (
    <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">🏪 {shop.name}</span>
  )
}

function ActorMeta({ actor, canView }) {
  return (
    <p className="text-xs text-gray-400 mt-1">
      ผู้ทำรายการ: {canView ? getActorLabel(actor) : 'ซ่อนตามสิทธิ์'}
    </p>
  )
}

// ── Shop Filter Bar ────────────────────────────────────────────────────────────

function ShopFilterBar({ shops, value, onChange }) {
  return (
    <div className="flex gap-1 flex-wrap">
      <button
        className={`btn text-xs px-3 py-1.5 ${value === '__all__' ? 'btn-primary' : 'btn-secondary'}`}
        onClick={() => onChange('__all__')}
      >ทั้งหมด</button>
      <button
        className={`btn text-xs px-3 py-1.5 ${value === '__sys__' ? 'btn-primary' : 'btn-secondary'}`}
        onClick={() => onChange('__sys__')}
      >👑 ระบบหลัก</button>
      {shops.map((shop) => (
        <button
          key={shop.id}
          className={`btn text-xs px-3 py-1.5 ${value === shop.id ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onChange(shop.id)}
        >🏪 {shop.name}</button>
      ))}
    </div>
  )
}

// ── AllTab ─────────────────────────────────────────────────────────────────────

const TYPE_GROUPS = [
  { value: '', label: 'ทุกประเภท' },
  { value: '__money__', label: '💰 รายการเงิน' },
  { value: '__mgmt__', label: '⚙️ การจัดการระบบ' },
  { value: '__shop__', label: '🏪 ร้านค้า' },
  ...Object.entries(ACTIVITY_LABELS).map(([value, label]) => ({ value, label })),
]

function matchesTypeGroup(event, typeFilter) {
  if (!typeFilter) return true
  const t = event.activityType
  if (typeFilter === '__money__') return MONEY_LOG_TYPES.has(t) || TX_LOG_TYPES.has(t) || t === 'TX_INCOME_RECORD' || t === 'TX_EXPENSE_RECORD'
  if (typeFilter === '__mgmt__') return MGMT_TYPES.has(t)
  if (typeFilter === '__shop__') return SHOP_MGMT_TYPES.has(t)
  return t === typeFilter
}

function AllTab({ shops, canViewActor }) {
  const globalLogs = useGlobalLogStore((s) => s.logs)
  const [shopFilter, setShopFilter] = useState('__all__')
  const [filter, setFilter] = useState('month')
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')

  const shopMap = useMemo(() => Object.fromEntries(shops.map((s) => [s.id, s])), [shops])

  // Aggregate all logs from global store + all shop logs
  const allEvents = useMemo(() => {
    const gLogs = globalLogs.map((log) => ({
      ...log,
      id: `g:${log.id}`,
      _shopId: null,
      date: log.timestamp?.slice(0, 10),
      label: ACTIVITY_LABELS[log.activityType] ?? log.activityType,
    }))

    const shopLogs = shops.flatMap((shop) =>
      readShopLogsFromStorage(shop.id).map((log) => ({
        ...log,
        id: `s:${shop.id}:${log.id}`,
        _shopId: shop.id,
        date: log.timestamp?.slice(0, 10),
        label: ACTIVITY_LABELS[log.activityType] ?? log.activityType,
      }))
    )

    return [...gLogs, ...shopLogs]
  }, [globalLogs, shops])

  const filtered = useMemo(() => {
    return allEvents
      .filter((ev) => {
        const d = ev.date ?? ev.timestamp?.slice(0, 10) ?? ''
        if (d < startDate || d > endDate) return false
        if (shopFilter === '__sys__' && ev._shopId !== null) return false
        if (shopFilter !== '__all__' && shopFilter !== '__sys__' && ev._shopId !== shopFilter) return false
        if (!matchesTypeGroup(ev, typeFilter)) return false
        if (search) {
          const haystack = [
            ev.description, ev.label, ev.activityType,
            canViewActor ? getActorSearchText(ev.actor) : '',
          ].filter(Boolean).join(' ').toLowerCase()
          if (!haystack.includes(search.toLowerCase())) return false
        }
        return true
      })
      .sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''))
  }, [allEvents, startDate, endDate, shopFilter, typeFilter, search, canViewActor])

  return (
    <div className="space-y-4">
      <DateRangeFilter
        filter={filter} setFilter={setFilter}
        startDate={startDate} endDate={endDate}
        setStartDate={setStartDate} setEndDate={setEndDate}
      />
      <ShopFilterBar shops={shops} value={shopFilter} onChange={setShopFilter} />
      <div className="flex flex-wrap gap-2 items-center">
        <select
          className="input text-sm py-1.5 w-56"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          {TYPE_GROUPS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          className="input text-sm py-1.5 flex-1 min-w-48"
          placeholder="ค้นหาทุกประวัติ..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <p className="text-sm text-gray-500">{filtered.length.toLocaleString()} รายการ</p>

      {filtered.length === 0 ? (
        <p className="text-center text-gray-400 py-10">ไม่มีประวัติในช่วงที่เลือก</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((ev) => (
            <div key={ev.id} className="rounded-lg border border-gray-100 bg-white p-3 flex items-start gap-3">
              <div className="text-xs text-gray-400 w-28 shrink-0">
                {(() => { try { return format(new Date(ev.timestamp), 'd MMM yy HH:mm', { locale: th }) } catch { return ev.timestamp } })()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeColor(ev.activityType)}`}>
                    {ev.label}
                  </span>
                  <ShopBadge shop={shopMap[ev._shopId] ?? null} />
                </div>
                <p className="text-sm text-gray-700 mt-1 break-words">{ev.description}</p>
                <ActorMeta actor={ev.actor} canView={canViewActor} />
              </div>
              {ev.walletEffect?.delta != null && (
                <span className={`text-xs font-semibold tabular-nums shrink-0 ${ev.walletEffect.delta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {ev.walletEffect.delta > 0 ? '+' : ''}{Number(ev.walletEffect.delta).toLocaleString()}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── MoneyTab ───────────────────────────────────────────────────────────────────

function MoneyTab({ shops, canViewActor }) {
  const [shopFilter, setShopFilter] = useState('__all__')
  const [filter, setFilter] = useState('month')
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [typeFilter, setTypeFilter] = useState('all')

  const shopMap = useMemo(() => Object.fromEntries(shops.map((s) => [s.id, s])), [shops])

  const allFinancial = useMemo(() => {
    const txEvents = shops.flatMap((shop) =>
      readShopTransactionsFromStorage(shop.id)
        .filter((tx) => tx.date >= startDate && tx.date <= endDate)
        .map((tx) => ({
          _kind: 'tx', id: `tx:${shop.id}:${tx.id}`,
          timestamp: tx.createdAt ?? `${tx.date}T00:00:00`,
          _shopId: shop.id, tx,
        }))
    )

    const logEvents = shops.flatMap((shop) =>
      readShopLogsFromStorage(shop.id)
        .filter((l) => {
          if (!MONEY_LOG_TYPES.has(l.activityType)) return false
          const d = l.timestamp?.slice(0, 10) ?? ''
          return d >= startDate && d <= endDate
        })
        .map((log) => ({
          _kind: 'log', id: `log:${shop.id}:${log.id}`,
          timestamp: log.timestamp, _shopId: shop.id, log,
        }))
    )

    return [...txEvents, ...logEvents].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }, [shops, startDate, endDate])

  const filtered = useMemo(() => {
    return allFinancial.filter((ev) => {
      if (shopFilter !== '__all__' && shopFilter !== '__sys__' && ev._shopId !== shopFilter) return false
      if (shopFilter === '__sys__') return false
      if (typeFilter === 'income') return ev._kind === 'tx' && ev.tx.type === 'income'
      if (typeFilter === 'expense') return ev._kind === 'tx' && ev.tx.type === 'expense'
      if (typeFilter === 'wallet') return ev._kind === 'log'
      return true
    })
  }, [allFinancial, shopFilter, typeFilter])

  return (
    <div className="space-y-4">
      <DateRangeFilter
        filter={filter} setFilter={setFilter}
        startDate={startDate} endDate={endDate}
        setStartDate={setStartDate} setEndDate={setEndDate}
      />
      <ShopFilterBar shops={shops} value={shopFilter} onChange={setShopFilter} />
      <div className="flex gap-1 flex-wrap items-center">
        {[
          { key: 'all', label: 'ทั้งหมด' },
          { key: 'income', label: '💚 รายรับ' },
          { key: 'expense', label: '❤️ รายจ่าย' },
          { key: 'wallet', label: '🔄 จัดการเงิน' },
        ].map((o) => (
          <button
            key={o.key}
            className={`btn text-xs px-3 py-1.5 ${typeFilter === o.key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTypeFilter(o.key)}
          >{o.label}</button>
        ))}
        <span className="text-sm text-gray-500 ml-auto self-center">{filtered.length} รายการ</span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-gray-400 py-10">ไม่มีรายการในช่วงที่เลือก</p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((ev) => {
            if (ev._kind === 'tx') {
              const { tx } = ev
              const isIncome = tx.type === 'income'
              const methodLabel = tx.method === 'cash' ? 'เงินสด' : tx.method === 'transfer' ? 'เงินโอน' : tx.method === 'pending' ? 'ค้างชำระ' : 'อื่นๆ'
              return (
                <div key={ev.id} className={`rounded-lg border-l-4 ${isIncome ? 'border-l-emerald-400' : 'border-l-red-400'} border border-gray-100 bg-white p-3 flex items-start gap-3`}>
                  <div className="text-xs text-gray-400 w-28 shrink-0">
                    {(() => { try { return format(new Date(tx.createdAt ?? tx.date), 'd MMM yy HH:mm', { locale: th }) } catch { return tx.date } })()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isIncome ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {isIncome ? 'รายรับ' : 'รายจ่าย'}
                      </span>
                      <span className="text-sm font-semibold text-gray-800 truncate">{tx.itemName || '—'}</span>
                      <ShopBadge shop={shopMap[ev._shopId] ?? null} />
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {(() => { try { return format(new Date(tx.date + 'T00:00:00'), 'd MMM yyyy', { locale: th }) } catch { return tx.date } })()} · {methodLabel}
                    </p>
                    <ActorMeta actor={tx.actor} canView={canViewActor} />
                  </div>
                  <span className={`text-sm font-bold tabular-nums shrink-0 ${isIncome ? 'text-emerald-600' : 'text-red-600'}`}>
                    {isIncome ? '+' : '-'}{Number(tx.amount).toLocaleString()}
                  </span>
                </div>
              )
            }

            const { log } = ev
            const delta = log.walletEffect?.delta
            return (
              <div key={ev.id} className="rounded-lg border border-gray-100 bg-white p-3 flex items-start gap-3">
                <div className="text-xs text-gray-400 w-28 shrink-0">
                  {(() => { try { return format(new Date(log.timestamp), 'd MMM yy HH:mm', { locale: th }) } catch { return log.timestamp } })()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeColor(log.activityType)}`}>
                      {ACTIVITY_LABELS[log.activityType] ?? log.activityType}
                    </span>
                    <ShopBadge shop={shopMap[ev._shopId] ?? null} />
                  </div>
                  <p className="text-sm text-gray-700 mt-1 break-words">{log.description}</p>
                  <ActorMeta actor={log.actor} canView={canViewActor} />
                </div>
                {delta != null && (
                  <span className={`text-sm font-bold tabular-nums shrink-0 ${delta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {delta > 0 ? '+' : ''}{Number(delta).toLocaleString()}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function GlobalHistoryPage() {
  const shops = useShopStore((s) => s.shops)
  const currentUser = useAuthStore((s) => s.currentUser)
  const roles = useRoleStore((s) => s.roles)
  const role = currentUser?.role

  const canViewActor = checkPermission(roles, role, P.VIEW_GLOBAL_HISTORY_ACTOR)

  // Tab access: if role directly has parent permission → show all tabs
  // Otherwise check individual tab permissions
  const userRoleObj = roles.find((r) => r.id === role)
  const canViewAllTab   = checkPermission(roles, role, P.VIEW_GLOBAL_HISTORY_ALL)
  const canViewMoneyTab = checkPermission(roles, role, P.VIEW_GLOBAL_HISTORY_MONEY)

  const TABS = [
    canViewAllTab   && { key: 'all',   label: '📋 ประวัติทั้งหมด' },
    canViewMoneyTab && { key: 'money', label: '💰 ประวัติรายการเงิน' },
  ].filter(Boolean)

  const [tab, setTab] = useState(TABS[0]?.key ?? 'all')
  const activeTab = TABS.find((t) => t.key === tab) ? tab : TABS[0]?.key

  if (TABS.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center text-gray-400">
        <p className="text-5xl mb-4">🔒</p>
        <p className="font-semibold text-gray-600">สิทธิ์ไม่เพียงพอ</p>
        <p className="text-sm mt-1">คุณไม่มีสิทธิ์ดูแท็บใดในหน้านี้</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">🕐 ประวัติการจัดการระบบทั้งหมด</h1>
        <p className="text-sm text-gray-500 mt-0.5">รวมประวัติจากทุกร้านและระบบหลัก</p>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'all'   && canViewAllTab   && <AllTab   shops={shops} canViewActor={canViewActor} />}
      {activeTab === 'money' && canViewMoneyTab && <MoneyTab shops={shops} canViewActor={canViewActor} />}
    </div>
  )
}
