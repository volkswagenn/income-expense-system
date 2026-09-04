import { useEffect, useMemo, useState } from 'react'
import Popup from '../../components/shared/Popup'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { th } from 'date-fns/locale'
import useLogStore from '../../store/useLogStore'
import useTransactionStore from '../../store/useTransactionStore'
import usePendingStore from '../../store/usePendingStore'
import useCategoryStore from '../../store/useCategoryStore'
import { ACTIVITY_LABELS } from '../../lib/logBuilder'
import { cancelTransaction, describeTxCancelEffects } from '../../lib/transactionActions'
import { localDateStr } from '../../lib/dateUtils'
import SectionCard from '../../components/shared/SectionCard'
import TabBar from '../../components/shared/TabBar'
import Icon from '../../components/shared/Icon'
import DateRangeFilter from '../../components/shared/DateRangeFilter'

// ── Constants ──────────────────────────────────────────────────────────────────

const TX_LOG_TYPES = new Set([
  'ADD_INCOME', 'ADD_INCOME_MAIN', 'ADD_OTHER_INCOME',
  'ADD_EXPENSE', 'EDIT_INCOME', 'EDIT_EXPENSE',
])

// Non-transaction money operations that live only in the log store
const MONEY_LOG_TYPES = new Set([
  'CASH_DEPOSIT',
  'TRANSFER_TO_WALLET',
  'WITHDRAW_FROM_TRANSFER',
  'PAY_PENDING',
  'OPEN_BILL_INCOME',
  'SUB_DEPOSIT',
  'SUB_WITHDRAW',
  'SUB_TRANSFER',
  'SUB_BORROW',
  'SUB_RETURN',
])

// ── AllTab ─────────────────────────────────────────────────────────────────────

function typeColor(type) {
  if (TX_LOG_TYPES.has(type) || type === 'DELETE_TRANSACTION' || type === 'CANCEL_TRANSACTION') {
    if (type.includes('INCOME') || type === 'ADD_INCOME_MAIN') return 'bg-emerald-100 text-emerald-700'
    if (type.includes('EXPENSE') || type === 'OPEN_BILL') return 'bg-red-100 text-red-700'
    if (type === 'DELETE_TRANSACTION' || type === 'CANCEL_TRANSACTION') return 'bg-orange-100 text-orange-700'
    return 'bg-blue-100 text-blue-700'
  }
  if (type === 'PAY_PENDING') return 'bg-amber-100 text-amber-700'
  if (['CASH_DEPOSIT', 'TRANSFER_TO_WALLET', 'WITHDRAW_FROM_TRANSFER', 'OPEN_BILL_INCOME'].includes(type))
    return 'bg-emerald-100 text-emerald-700'
  if (type?.startsWith('SUB_')) return 'bg-purple-100 text-purple-700'
  if (type === 'IMPORT_DATA') return 'bg-indigo-100 text-indigo-700'
  return 'bg-gray-100 text-gray-600'
}

/** ไอคอน + สีของแต่ละชนิดเหตุการณ์ — ใช้แทนป้ายข้อความยาวๆ ในตาราง */
function TYPE_TINT(type) {
  if (type === 'TX_INCOME_RECORD' || (type ?? '').includes('INCOME')) {
    return { box: 'bg-income-soft text-income', icon: 'arrow_downward' }
  }
  if (type === 'TX_EXPENSE_RECORD' || (type ?? '').includes('EXPENSE') || type === 'OPEN_BILL') {
    return { box: 'bg-expense-soft text-expense', icon: 'arrow_upward' }
  }
  if ((type ?? '').startsWith('CARD')) return { box: 'bg-expense-soft text-[#A93A2E]', icon: 'credit_card' }
  if ((type ?? '').startsWith('SUB_')) return { box: 'bg-recurring-soft text-recurring', icon: 'savings' }
  if ((type ?? '').startsWith('RECURRING')) return { box: 'bg-recurring-soft text-recurring', icon: 'history' }
  if ((type ?? '').startsWith('DEBT') || (type ?? '').startsWith('INSTALLMENT')) {
    return { box: 'bg-pending-soft text-pending', icon: 'receipt_long' }
  }
  if (type === 'PAY_PENDING' || (type ?? '').includes('PENDING')) {
    return { box: 'bg-pending-soft text-pending', icon: 'pending_actions' }
  }
  if (type === 'IMPORT_DATA') return { box: 'bg-transfer-soft text-transfer', icon: 'upload_file' }
  if ((type ?? '').includes('TAX')) return { box: 'bg-[#FBEFE4] text-[#B4571E]', icon: 'receipt_long' }
  return { box: 'bg-paper text-muted', icon: 'edit_note' }
}

function AllTab() {
  const { logs } = useLogStore()
  const { transactions } = useTransactionStore()
  const [filter, setFilter] = useState('month')
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')

  // log ที่ post_transaction เขียนจะมี newValue.transactionId (ฐานข้อมูลใส่ให้)
  // ส่วน log รุ่นเก่าเก็บทั้งรายการไว้ใน newValue จึงมี newValue.id — รับทั้งสองแบบ
  const loggedTransactionIds = new Set(
    logs
      .filter((log) => TX_LOG_TYPES.has(log.activityType))
      .map((log) => log.newValue?.transactionId ?? log.newValue?.id)
      .filter(Boolean)
  )

  const transactionEvents = transactions
    .filter((tx) => !loggedTransactionIds.has(tx.id))
    .map((tx) => ({
      id: `tx:${tx.id}`,
      timestamp: tx.createdAt ?? `${tx.date}T00:00:00`,
      date: tx.date,
      activityType: tx.type === 'income' ? 'TX_INCOME_RECORD' : 'TX_EXPENSE_RECORD',
      label: tx.type === 'income' ? 'ธุรกรรมรายรับ' : 'ธุรกรรมรายจ่าย',
      description: `${tx.type === 'income' ? 'รายรับ' : 'รายจ่าย'} "${tx.itemName ?? 'ไม่ระบุ'}" ${Number(tx.amount || 0).toLocaleString()} บาท`,
      walletEffect: { delta: tx.type === 'income' ? Number(tx.amount || 0) : -Number(tx.amount || 0) },
    }))

  const systemEvents = logs
    .map((log) => ({
      ...log,
      id: `log:${log.id}`,
      // timestamp เป็น ISO/UTC — ต้องแปลงเป็นวันที่ท้องถิ่นก่อนเทียบกับช่วงวันที่ที่ผู้ใช้เลือก
      date: localDateStr(log.timestamp),
      label: ACTIVITY_LABELS[log.activityType] ?? log.activityType,
    }))

  const typeOptions = [
    { value: '', label: 'ทุกประเภท' },
    { value: 'TX_INCOME_RECORD', label: 'ธุรกรรมรายรับ' },
    { value: 'TX_EXPENSE_RECORD', label: 'ธุรกรรมรายจ่าย' },
    ...Object.entries(ACTIVITY_LABELS)
      .map(([value, label]) => ({ value, label })),
  ]

  const events = [...transactionEvents, ...systemEvents]
    .filter((event) => {
      const d = event.date || localDateStr(event.timestamp)
      if (d < startDate || d > endDate) return false
      if (typeFilter && event.activityType !== typeFilter) return false
      if (search) {
        const haystack = [
          event.description,
          event.label,
          event.activityType,
        ]
          .filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(search.toLowerCase())) return false
      }
      return true
    })
    .sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''))

  // ชิปกรองด่วน — ชนิดที่คนมองหาบ่อยที่สุด ส่วนที่เหลือยังเลือกจากรายการเต็มได้
  const QUICK = [
    { value: '', label: 'ทั้งหมด' },
    { value: 'TX_INCOME_RECORD', label: 'รายรับ' },
    { value: 'TX_EXPENSE_RECORD', label: 'รายจ่าย' },
    { value: 'PAY_PENDING', label: 'จ่ายค้างชำระ' },
    { value: 'CARD_PAYMENT', label: 'จ่ายบิลบัตร' },
  ]

  return (
    <div className="flex flex-col gap-3">
      {/* แถบกรองอยู่ในการ์ดของตัวเอง แยกจากการ์ดรายการ — เลื่อนอ่านรายการยาวๆ
          แล้วแถบกรองยังอยู่ที่เดิม ไม่ปนกับเนื้อหา */}
      <div className="card px-4 py-3 flex items-center gap-2 flex-wrap flex-none">
        <DateRangeFilter
          filter={filter} setFilter={setFilter}
          startDate={startDate} endDate={endDate}
          setStartDate={setStartDate} setEndDate={setEndDate}
          compact
        />
        {QUICK.map((q) => {
          const on = typeFilter === q.value
          return (
            <button
              key={q.value || 'all'}
              onClick={() => setTypeFilter(q.value)}
              className={`h-8 px-3 rounded-[9px] text-[12.5px] border transition ${
                on ? 'bg-ink text-white border-ink font-semibold' : 'bg-white text-muted border-hairline hover:bg-paper'
              }`}
            >
              {q.label}
            </button>
          )
        })}
        <select
          className="h-8 px-2.5 rounded-[9px] border border-hairline bg-white text-[12.5px] text-muted"
          value={QUICK.some((q) => q.value === typeFilter) ? '' : typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">ชนิดอื่น…</option>
          {typeOptions.filter((o) => o.value).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="ml-auto min-w-[200px] flex-1 sm:flex-none h-[34px] px-3 rounded-ctl bg-paper flex items-center gap-2">
          <Icon name="search" size={17} className="text-faint flex-none" />
          <input
            className="flex-1 min-w-0 bg-transparent outline-none text-[12.5px]"
            placeholder="ค้นหาคำในรายการ"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card px-[18px] pt-1.5 pb-0 flex-1 min-h-0">
      {events.length === 0 ? (
        <p className="text-center text-[13px] text-faint py-12">ไม่มีประวัติในช่วงที่เลือก</p>
      ) : (
        <div>
          {events.map((event) => {
            const delta = event.walletEffect?.delta
            const tone = TYPE_TINT(event.activityType)
            return (
              <div
                key={event.id}
                className="flex items-center gap-3 py-2.5 border-b border-[#F2F0EA] hover:bg-[#FAF9F6] -mx-2 px-2 rounded-lg"
              >
                <span className="w-[104px] flex-none">
                  <span className="tabular-nums block text-[12.5px] font-medium">
                    {(() => { try { return format(new Date(event.timestamp), 'd MMM yy', { locale: th }) } catch { return event.date } })()}
                  </span>
                  <span className="tabular-nums block text-[10.5px] text-faint">
                    {(() => { try { return format(new Date(event.timestamp), 'HH:mm', { locale: th }) } catch { return '' } })()}
                  </span>
                </span>
                <span className={`w-[30px] h-[30px] flex-none rounded-[9px] flex items-center justify-center ${tone.box}`}>
                  <Icon name={tone.icon} size={16} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] truncate">{event.description}</span>
                  <span className="block text-[11px] text-faint">{event.label}</span>
                </span>
                {delta != null && (
                  <span className={`tabular-nums flex-none text-[13px] font-semibold ${delta > 0 ? 'text-income' : 'text-expense'}`}>
                    {delta > 0 ? '+' : ''}{Number(delta).toLocaleString()}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
      </div>
    </div>
  )
}

// ── MoneyTab ───────────────────────────────────────────────────────────────────

function MoneyEventCard({ event, onCancel }) {
  const { getCategoryName } = useCategoryStore()

  if (event._kind === 'tx') {
    const { tx } = event
    const isIncome = tx.type === 'income'
    const methodLabel = tx.method === 'cash' ? 'เงินสด' : tx.method === 'transfer' ? 'เงินโอน' : tx.method === 'card' ? 'บัตรเครดิต' : tx.method === 'pending' ? 'ค้างชำระ' : 'อื่นๆ'
    return (
      <div className={`rounded-lg border-l-4 ${isIncome ? 'border-l-emerald-400' : 'border-l-red-400'} border border-gray-100 bg-white p-3 flex items-start gap-3`}>
        <div className="text-xs text-gray-400 w-28 shrink-0">
          {(() => { try { return format(new Date(tx.createdAt ?? tx.date), 'd MMM yy HH:mm', { locale: th }) } catch { return tx.date } })()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isIncome ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
              {isIncome ? 'รายรับ' : 'รายจ่าย'}
            </span>
            <span className="text-sm font-semibold text-gray-800 truncate">{tx.itemName || '—'}</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {format(new Date(tx.date + 'T00:00:00'), 'd MMM yyyy', { locale: th })} · {methodLabel}
            {tx.category ? ` · ${getCategoryName(tx.category)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={`text-sm font-bold tabular-nums ${isIncome ? 'text-emerald-600' : 'text-red-600'}`}>
            {isIncome ? '+' : '-'}{tx.amount.toLocaleString()}
          </span>
          <button
            className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-2 py-1 rounded-lg transition-colors whitespace-nowrap"
            onClick={() => onCancel(event)}
          >
            ↩ ยกเลิก
          </button>
        </div>
      </div>
    )
  }

  // log event
  const { log } = event
  const delta = log.walletEffect?.delta
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-3 flex items-start gap-3">
      <div className="text-xs text-gray-400 w-28 shrink-0">
        {(() => { try { return format(new Date(log.timestamp), 'd MMM yy HH:mm', { locale: th }) } catch { return log.timestamp } })()}
      </div>
      <div className="flex-1 min-w-0">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeColor(log.activityType)}`}>
          {ACTIVITY_LABELS[log.activityType] ?? log.activityType}
        </span>
        <p className="text-sm text-gray-700 mt-1 break-words">{log.description}</p>
      </div>
      {/*
        รายการจัดการเงิน (ฝาก/ถอน/ยืม/คืน) ไม่มีปุ่มยกเลิกโดยตั้งใจ
        ประวัติการใช้งานเป็นบันทึกที่แก้ย้อนหลังไม่ได้ตามที่ตั้ง RLS ไว้ (ดู policies.sql)
        ถ้าจะย้อนรายการพวกนี้ ให้ทำรายการตรงข้ามจากหน้ากระเป๋าเงิน — ยอดจะถูกต้องเสมอ
        และมีร่องรอยครบว่าใครย้อนเมื่อไหร่
      */}
      {delta != null && (
        <span className={`text-sm font-bold tabular-nums shrink-0 ${delta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          {delta > 0 ? '+' : ''}{Number(delta).toLocaleString()}
        </span>
      )}
    </div>
  )
}

function CancelConfirmPopup({ target, busy, error, onConfirm, onCancel }) {
  if (!target) return null
  const descriptionText = `"${target.tx.itemName}" ${Number(target.tx.amount).toLocaleString()} บาท`

  return (
    <Popup
      title="ยืนยันการยกเลิก"
      sub="รายการจะถูกยกเลิกและเงินจะถูกคืนสู่ต้นทาง"
      icon="delete_sweep"
      width={420}
      onClose={onClose}
      onConfirm={onConfirm}
      busy={busy}
      danger
      confirmLabel="ยืนยัน"
    >
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-xs text-gray-500 font-medium mb-1">รายการที่จะยกเลิก</p>
          <p className="text-sm text-gray-800 leading-relaxed">{descriptionText}</p>
        </div>
        {target.effects.length > 0 && (
          <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
            <p className="text-xs font-semibold text-amber-700 mb-2">ผลที่จะเกิดขึ้น</p>
            <div className="space-y-1.5">
              {target.effects.map((e, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-amber-500 shrink-0">↩</span>
                  <span className="text-sm text-amber-800">{e}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </p>
        )}
    </Popup>
  )
}

function MoneyTab() {
  const today = new Date()
  const { transactions } = useTransactionStore()
  const { logs } = useLogStore()
  const { pendingPayments, taxInvoices, pendingIncomes } = usePendingStore()

  const [filter, setFilter] = useState('month')
  const [startDate, setStartDate] = useState(format(startOfMonth(today), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(today), 'yyyy-MM-dd'))
  const [typeFilter, setTypeFilter] = useState('all')
  const [cancelTarget, setCancelTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const [cancelError, setCancelError] = useState('')

  const events = useMemo(() => {
    const txEvents = transactions
      .filter((tx) => tx.date >= startDate && tx.date <= endDate)
      .map((tx) => ({
        _kind: 'tx',
        id: `tx:${tx.id}`,
        timestamp: tx.createdAt ?? `${tx.date}T00:00:00`,
        tx,
      }))

    const logEvents = logs
      .filter((l) => {
        if (!MONEY_LOG_TYPES.has(l.activityType)) return false
        // แปลงเป็นวันที่ท้องถิ่นก่อนเทียบ ไม่งั้นรายการช่วง 00:00–07:00 จะตกไปเป็นของเมื่อวาน
        const d = localDateStr(l.timestamp)
        return d >= startDate && d <= endDate
      })
      .map((log) => ({
        _kind: 'log',
        id: `log:${log.id}`,
        timestamp: log.timestamp,
        log,
      }))

    return [...txEvents, ...logEvents].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }, [transactions, logs, startDate, endDate])

  const filtered = useMemo(() => {
    if (typeFilter === 'all') return events
    if (typeFilter === 'income') return events.filter((e) => e._kind === 'tx' && e.tx.type === 'income')
    if (typeFilter === 'expense') return events.filter((e) => e._kind === 'tx' && e.tx.type === 'expense')
    if (typeFilter === 'wallet') return events.filter((e) => e._kind === 'log')
    return events
  }, [events, typeFilter])

  // ยกเลิกได้เฉพาะ transaction — รายการจัดการเงินเป็นบันทึกที่ย้อนไม่ได้ (ดู MoneyEventCard)
  const handleCancelClick = (event) => {
    setCancelTarget({
      ...event,
      effects: describeTxCancelEffects(event.tx, { pendingPayments, taxInvoices, pendingIncomes }),
    })
  }

  const handleConfirmCancel = async () => {
    if (!cancelTarget || busy) return
    setBusy(true)
    setCancelError('')
    try {
      await cancelTransaction(cancelTarget.tx)
      setCancelTarget(null)
    } catch (err) {
      // ต้องบอกให้รู้ ไม่ใช่ปิดหน้าต่างเงียบๆ แล้วปล่อยให้เข้าใจว่ายกเลิกสำเร็จ
      setCancelError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <DateRangeFilter
        filter={filter} setFilter={setFilter}
        startDate={startDate} endDate={endDate}
        setStartDate={setStartDate} setEndDate={setEndDate}
      />

      <div className="flex gap-1 flex-wrap">
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
          >
            {o.label}
          </button>
        ))}
        <span className="text-sm text-gray-500 ml-auto self-center">{filtered.length} รายการ</span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-gray-400 py-10">ไม่มีรายการในช่วงที่เลือก</p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((event) => (
            <MoneyEventCard key={event.id} event={event} onCancel={handleCancelClick} />
          ))}
        </div>
      )}

      <CancelConfirmPopup
        target={cancelTarget}
        busy={busy}
        error={cancelError}
        onConfirm={handleConfirmCancel}
        onCancel={() => { setCancelTarget(null); setCancelError('') }}
      />
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'all', label: 'ทั้งหมด', icon: 'history' },
  { key: 'money', label: 'รายการเงิน', icon: 'payments' },
]

export default function HistoryPage() {
  const [tab, setTab] = useState(TABS[0].key)
  const loadFirstPage = useLogStore((s) => s.loadFirstPage)
  const loadMore = useLogStore((s) => s.loadMore)
  const loading = useLogStore((s) => s.loading)
  const hasMore = useLogStore((s) => s.hasMore)
  const loadedCount = useLogStore((s) => s.logs.length)
  const total = useLogStore((s) => s.total)
  const [loadError, setLoadError] = useState('')

  const handleLoadMore = () => {
    loadMore().catch((err) => setLoadError(err.message))
  }

  /**
   * ประวัติไม่ได้ถูกโหลดตอนเปิดแอป (hydrate.js ข้ามไว้ เพราะตารางโตได้เป็นหมื่นแถว)
   * หน้านี้จึงต้องสั่งโหลดเอง — ก่อนหน้านี้ไม่มีใครเรียกเลย ทำให้แท็บประวัติ
   * ขึ้นว่า "ไม่มีข้อมูล" เสมอทั้งที่ในฐานข้อมูลมีอยู่จริง
   */
  useEffect(() => {
    let alive = true
    loadFirstPage().catch((err) => {
      if (alive) setLoadError(err.message)
    })
    return () => { alive = false }
  }, [loadFirstPage])

  return (
    <div className="space-y-3.5">
      {loadError && (
        <p className="text-[12.5px] text-expense bg-expense-soft border border-[#F0C4BE] rounded-ctl px-4 py-2.5">
          โหลดประวัติไม่สำเร็จ — {loadError}
        </p>
      )}

      {/* หน้านี้แสดงประวัติทุกการเปลี่ยนแปลงในรายการเดียว ไม่มีแท็บแยก
          รายการเงินอย่างเดียวดูได้ที่ บันทึกรายการ › ค้นหารายการ ซึ่งกรองได้ละเอียดกว่า
          (แท็บ "รายการเงิน" เดิมถูกถอดออก บันทึกไว้ใน MOCKUP-NOTES.md ข้อ ก9) */}
      {loading && loadedCount === 0 ? (
        <div className="card flex items-center justify-center py-14">
          <div className="w-7 h-7 rounded-full border-[3px] border-hairline border-t-ink animate-spin" />
        </div>
      ) : (
        <AllTab />
      )}

      {/* ประวัติโหลดทีละหน้า (หน้าละ 100) — ถ้าเลือกช่วงวันที่ย้อนหลังแล้วไม่เจอ
          ให้กดโหลดเพิ่มจนครอบคลุมช่วงนั้น ไม่งั้นจะเข้าใจผิดว่าไม่มีประวัติ */}
      {hasMore && (
        <div className="flex items-center justify-center gap-3">
          <button className="btn btn-secondary text-sm" onClick={handleLoadMore} disabled={loading}>
            {loading ? 'กำลังโหลด…' : 'โหลดประวัติเก่ากว่านี้'}
          </button>
          <span className="text-xs text-gray-400">
            โหลดแล้ว {loadedCount.toLocaleString()} / {total.toLocaleString()} รายการ
          </span>
        </div>
      )}
    </div>
  )
}
