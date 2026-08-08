import { useState, useMemo } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { th } from 'date-fns/locale'
import useLogStore from '../../store/useLogStore'
import useTransactionStore from '../../store/useTransactionStore'
import useWalletStore from '../../store/useWalletStore'
import usePendingStore from '../../store/usePendingStore'
import useCategoryStore from '../../store/useCategoryStore'
import { ACTIVITY_LABELS } from '../../lib/logBuilder'
import { cancelTransaction, describeTxCancelEffects } from '../../lib/transactionActions'
import { localDateStr } from '../../lib/dateUtils'
import SectionCard from '../../components/shared/SectionCard'
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

// ── Helpers ────────────────────────────────────────────────────────────────────

function applyWalletTarget(ws, target, delta, transferAccountId = null) {
  if (!target || delta === 0) return
  if (target === 'cash') delta > 0 ? ws.addCash(delta) : ws.deductCash(-delta)
  else if (target === 'transfer') {
    // เงินโอนต้องกลับเข้าบัญชีธนาคารเดิมที่เคยเคลื่อนไหว
    delta > 0 ? ws.addTransfer(delta, transferAccountId) : ws.deductTransfer(-delta, transferAccountId)
  }
  else if (target?.startsWith('sub:')) ws.updateSubWallet(target.slice(4), delta)
}

function tgtLabel(t) {
  if (t === 'cash') return 'เงินสด'
  if (t === 'transfer') return 'เงินโอน'
  if (t?.startsWith('sub:')) return 'กระเป๋าตังค์'
  return t ?? ''
}

function computeLogEffects(log, loans) {
  const lines = []
  const { activityType, walletEffect, newValue } = log

  if (walletEffect) {
    const { target, delta } = walletEffect
    const rev = -delta
    lines.push(`${tgtLabel(target)}: ${rev > 0 ? '+' : ''}${rev.toLocaleString()} บาท`)
    if (activityType === 'TRANSFER_TO_WALLET') lines.push(`เงินโอน: ${delta.toLocaleString()} บาท`)
    else if (activityType === 'WITHDRAW_FROM_TRANSFER') lines.push(`เงินสด: ${delta.toLocaleString()} บาท`)
    if (activityType === 'SUB_DEPOSIT' && newValue?.fromMethod)
      lines.push(`${tgtLabel(newValue.fromMethod)}: +${delta.toLocaleString()} บาท (คืนกลับ)`)
    if (activityType === 'SUB_WITHDRAW' && newValue?.toMethod)
      lines.push(`${tgtLabel(newValue.toMethod)}: ${delta.toLocaleString()} บาท (หักคืน)`)
    if (activityType === 'SUB_BORROW' && newValue?.loanId) {
      const loan = loans.find((l) => l.id === newValue.loanId)
      if (loan) lines.push(`${tgtLabel(loan.method)}: -${loan.amount.toLocaleString()} บาท`)
      lines.push('ลบรายการยืมเงินที่เชื่อมโยง')
    }
    if (activityType === 'SUB_RETURN' && newValue?.loanId) {
      const loan = loans.find((l) => l.id === newValue.loanId)
      if (loan) lines.push(`กระเป๋าตังค์: -${loan.amount.toLocaleString()} บาท (คืนค่า)`)
    }
  }
  if (activityType === 'PAY_PENDING') lines.push('ย้อนสถานะค้างชำระกลับเป็น "รอชำระ"')
  if (activityType === 'OPEN_BILL_INCOME') lines.push('ลบรายการรอรับเงินที่เชื่อมโยง')
  return lines
}

function executeDeleteLog(log) {
  const ws = useWalletStore.getState()
  const ps = usePendingStore.getState()
  const ts = useTransactionStore.getState()
  const { activityType, walletEffect, newValue } = log

  if (walletEffect) {
    const { target, delta, transferAccountId } = walletEffect
    const acct = transferAccountId ?? newValue?.transferAccountId ?? null
    applyWalletTarget(ws, target, -delta, acct)
    if (activityType === 'TRANSFER_TO_WALLET') applyWalletTarget(ws, 'transfer', delta, acct)
    else if (activityType === 'WITHDRAW_FROM_TRANSFER') applyWalletTarget(ws, 'cash', delta)
    else if (activityType === 'SUB_DEPOSIT' && newValue?.fromMethod) applyWalletTarget(ws, newValue.fromMethod, delta, acct)
    else if (activityType === 'SUB_WITHDRAW' && newValue?.toMethod) applyWalletTarget(ws, newValue.toMethod, delta, acct)
    else if (activityType === 'SUB_TRANSFER' && newValue?.toId) ws.updateSubWallet(newValue.toId, delta)

    if (activityType === 'SUB_BORROW' && newValue?.loanId) {
      const loan = ws.loans.find((l) => l.id === newValue.loanId)
      if (loan) {
        if (loan.method === 'cash') ws.deductCash(loan.amount)
        else ws.deductTransfer(loan.amount, loan.transferAccountId)
      }
      ws.deleteLoanById(newValue.loanId)
    }
    if (activityType === 'SUB_RETURN' && newValue?.loanId) {
      const loan = ws.loans.find((l) => l.id === newValue.loanId)
      if (loan) {
        ws.updateSubWallet(loan.subWalletId, -loan.amount)
        ws.unReturnLoanById(loan.id)
      }
    }
  }

  if (activityType === 'OPEN_BILL' && newValue?.pendingId) ps.deletePending(newValue.pendingId)
  if (activityType === 'PAY_PENDING' && newValue?.pendingId) {
    if (newValue?.transactionId) ts.deleteTransaction(newValue.transactionId)
    ps.unPayPending(newValue.pendingId)
  }
  if (activityType === 'OPEN_BILL_INCOME' && newValue?.pendingIncomeId) ps.deletePendingIncome(newValue.pendingIncomeId)

  useLogStore.getState().deleteLog(log.id)
}

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

function AllTab() {
  const { logs } = useLogStore()
  const { transactions } = useTransactionStore()
  const [filter, setFilter] = useState('month')
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')

  const loggedTransactionIds = new Set(
    logs
      .filter((log) => TX_LOG_TYPES.has(log.activityType) && log.newValue?.id)
      .map((log) => log.newValue.id)
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

  return (
    <div className="space-y-4">
      <DateRangeFilter
        filter={filter} setFilter={setFilter}
        startDate={startDate} endDate={endDate}
        setStartDate={setStartDate} setEndDate={setEndDate}
      />
      <div className="flex flex-wrap gap-2 items-center">
        <select className="input text-sm py-1.5 w-52" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          {typeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input
          className="input text-sm py-1.5 flex-1 min-w-48"
          placeholder="ค้นหาทุกประวัติ..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <p className="text-sm text-gray-500">{events.length.toLocaleString()} รายการ</p>
        {events.length === 0 ? (
          <p className="text-center text-gray-400 py-10">ไม่มีประวัติในช่วงที่เลือก</p>
        ) : (
          events.map((event) => (
            <div key={event.id} className="rounded-lg border border-gray-100 bg-white p-3 flex items-start gap-3">
              <div className="text-xs text-gray-400 w-28 shrink-0">
                {(() => { try { return format(new Date(event.timestamp), 'd MMM yy HH:mm', { locale: th }) } catch { return event.timestamp } })()}
              </div>
              <div className="min-w-0 flex-1">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeColor(event.activityType)}`}>
                  {event.label}
                </span>
                <p className="text-sm text-gray-700 mt-1 break-words">{event.description}</p>
              </div>
              {event.walletEffect?.delta != null && (
                <span className={`text-xs font-semibold tabular-nums shrink-0 ${event.walletEffect.delta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {event.walletEffect.delta > 0 ? '+' : ''}{Number(event.walletEffect.delta).toLocaleString()}
                </span>
              )}
            </div>
          ))
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
    const methodLabel = tx.method === 'cash' ? 'เงินสด' : tx.method === 'transfer' ? 'เงินโอน' : tx.method === 'pending' ? 'ค้างชำระ' : 'อื่นๆ'
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
      <div className="flex items-center gap-3 shrink-0">
        {delta != null && (
          <span className={`text-sm font-bold tabular-nums ${delta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {delta > 0 ? '+' : ''}{Number(delta).toLocaleString()}
          </span>
        )}
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

function CancelConfirmPopup({ target, onConfirm, onCancel }) {
  if (!target) return null
  const descriptionText = target._kind === 'tx'
    ? `"${target.tx.itemName}" ${target.tx.amount.toLocaleString()} บาท`
    : target.log.description

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-red-50 px-5 py-4 border-b border-red-100">
          <h3 className="font-semibold text-red-700">ยืนยันการยกเลิก</h3>
          <p className="text-xs text-red-500 mt-0.5">รายการจะถูกยกเลิกและเงินจะถูกคืนสู่ต้นทาง</p>
        </div>
        <div className="p-5 space-y-3">
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
        </div>
        <div className="px-5 pb-5 flex gap-3 justify-end">
          <button className="btn btn-secondary" onClick={onCancel}>ยกเลิก</button>
          <button className="btn btn-danger" onClick={onConfirm}>ยืนยัน</button>
        </div>
      </div>
    </div>
  )
}

function MoneyTab() {
  const today = new Date()
  const { transactions } = useTransactionStore()
  const { logs } = useLogStore()
  const { pendingPayments, taxInvoices, pendingIncomes } = usePendingStore()
  const loans = useWalletStore((s) => s.loans)

  const [filter, setFilter] = useState('month')
  const [startDate, setStartDate] = useState(format(startOfMonth(today), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(today), 'yyyy-MM-dd'))
  const [typeFilter, setTypeFilter] = useState('all')
  const [cancelTarget, setCancelTarget] = useState(null)

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

  const handleCancelClick = (event) => {
    let effects
    if (event._kind === 'tx') {
      effects = describeTxCancelEffects(event.tx, { pendingPayments, taxInvoices, pendingIncomes })
    } else {
      effects = computeLogEffects(event.log, loans)
    }
    setCancelTarget({ ...event, effects })
  }

  const handleConfirmCancel = () => {
    if (!cancelTarget) return
    if (cancelTarget._kind === 'tx') {
      cancelTransaction(cancelTarget.tx)
    } else {
      executeDeleteLog(cancelTarget.log)
    }
    setCancelTarget(null)
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
        onConfirm={handleConfirmCancel}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'all',   label: '📋 ทั้งหมด' },
  { key: 'money', label: '💰 รายการเงิน' },
]

export default function HistoryPage() {
  const [tab, setTab] = useState(TABS[0].key)

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900">ประวัติการทำรายการทั้งหมด</h1>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`btn text-sm px-4 py-2 rounded-lg transition-all ${tab === t.key ? 'bg-white shadow-sm text-gray-900 font-semibold' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <SectionCard>
        {tab === 'all'   && <AllTab />}
        {tab === 'money' && <MoneyTab />}
      </SectionCard>
    </div>
  )
}
