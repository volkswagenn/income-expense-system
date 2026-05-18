import { useState } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { th } from 'date-fns/locale'
import useTransactionStore from '../../store/useTransactionStore'
import useCategoryStore from '../../store/useCategoryStore'
import usePendingStore from '../../store/usePendingStore'
import DateRangeFilter from '../../components/shared/DateRangeFilter'
import EditTransactionPopup from '../../components/shared/EditTransactionPopup'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import { AttachmentButton, getAttachments, getPrimaryAttachment } from '../../components/shared/AttachmentViewer'
import { cancelTransaction, describeTxCancelEffects } from '../../lib/transactionActions'

function methodLabel(m) {
  return m === 'cash' ? 'เงินสด' : m === 'transfer' ? 'เงินโอน' : m === 'pending' ? 'ค้างชำระ' : 'อื่นๆ'
}

function TxCard({ tx, onEdit }) {
  const { getCategoryName } = useCategoryStore()
  const { pendingPayments } = usePendingStore()
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isIncome = tx.type === 'income'
  const borderColor = isIncome ? 'border-l-emerald-400' : 'border-l-red-400'
  const amountColor = isIncome ? 'text-emerald-600' : 'text-red-600'
  const badgeColor = isIncome ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'

  const attachment = getPrimaryAttachment(tx)
  const attachments = getAttachments(tx)
  const hasDetails = tx.vendor || tx.receiptNo || tx.detail || tx.dueDate || tx.taxStatus !== 'none' || tx.otherIncomeType || attachment
  const cancelEffects = describeTxCancelEffects(tx, pendingPayments)

  const handleDelete = () => {
    cancelTransaction(tx)
    setConfirmDelete(false)
  }

  return (
    <>
      <div className={`rounded-lg border-l-4 ${borderColor} border border-gray-100 bg-white shadow-sm overflow-hidden`}>
        <div className="px-3 py-2 flex items-center gap-2">

          {/* Badge */}
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${badgeColor}`}>
            {isIncome ? 'รับ' : 'จ่าย'}
          </span>

          {/* ชื่อ + รายละเอียดย่อ */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="text-sm font-semibold text-gray-800 truncate">{tx.itemName || '—'}</span>
              <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                · {methodLabel(tx.method)}{tx.otherIncomeType ? ` · ${tx.otherIncomeType}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-gray-400">
                {format(new Date(tx.date), 'd MMM yyyy', { locale: th })}
              </span>
              {tx.category && (
                <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                  {getCategoryName(tx.category)}
                </span>
              )}
              {tx.note && <span className="text-xs text-gray-400 truncate">· 📝 {tx.note}</span>}
              {attachment && <AttachmentButton attachments={attachments} compact />}
              {hasDetails && !expanded && (
                <button className="text-xs text-blue-500 hover:underline" onClick={() => setExpanded(true)}>รายละเอียด ▾</button>
              )}
              {expanded && (
                <button className="text-xs text-blue-500 hover:underline" onClick={() => setExpanded(false)}>ย่อ ▴</button>
              )}
            </div>

            {expanded && (
              <div className="mt-1 pt-1 border-t border-gray-100 space-y-0.5 text-xs text-gray-500">
                {tx.vendor && <p>ร้านค้า: {tx.vendor}</p>}
                {tx.receiptNo && <p>เลขใบเสร็จ: {tx.receiptNo}</p>}
                {tx.taxStatus && tx.taxStatus !== 'none' && (
                  <p>ใบกำกับภาษี: {tx.taxStatus === 'received' ? 'มีใบกำกับ' : 'รอใบกำกับ'}</p>
                )}
                {tx.dueDate && <p>วันครบกำหนด: {tx.dueDate}</p>}
                {tx.otherIncomeType && <p>ประเภทรายรับ: {tx.otherIncomeType}</p>}
                {attachment && <p>เอกสารแนบ: {attachment.label} ({attachment.path.split(/[\\/]/).pop()})</p>}
                {tx.detail && <p className="whitespace-pre-line">รายละเอียด: {tx.detail}</p>}
              </div>
            )}
          </div>

          {/* จำนวนเงิน + actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-sm font-bold tabular-nums whitespace-nowrap ${amountColor}`}>
              {isIncome ? '+' : '-'}{tx.amount.toLocaleString()}
              <span className="text-xs font-normal text-gray-400"> บาท</span>
            </span>
            <button className="text-gray-300 hover:text-blue-500 transition-colors" onClick={() => onEdit(tx)}>✏️</button>
            <button className="text-gray-300 hover:text-red-500 transition-colors" onClick={() => setConfirmDelete(true)}>🗑️</button>
          </div>

        </div>
      </div>

      <ConfirmPopup
        open={confirmDelete}
        title="ยืนยันการยกเลิกรายการ"
        message={`ยกเลิกรายการ "${tx.itemName}" ${tx.amount.toLocaleString()} บาท\n\nผลที่จะเกิด:\n${cancelEffects.map(e => `• ${e}`).join('\n')}`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
        confirmLabel="ยืนยันยกเลิก"
        danger
      />
    </>
  )
}

export default function TransactionHistoryPanel() {
  const { transactions } = useTransactionStore()
  const { getCategories } = useCategoryStore()
  const [filter, setFilter] = useState('month')
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [typeFilter, setTypeFilter] = useState('all')
  const [catFilter, setCatFilter] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState(null)
  const PAGE_SIZE = 30

  const expenseCats = getCategories('expense')

  const filtered = transactions.filter((t) => {
    if (t.date < startDate || t.date > endDate) return false
    if (typeFilter !== 'all' && t.type !== typeFilter) return false
    if (catFilter && t.category !== catFilter) return false
    return true
  }).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))

  const totalIncome = filtered.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const totalExpense = filtered.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const resetPage = () => setPage(1)

  return (
    <div className="space-y-4">
      {/* Date filter */}
      <DateRangeFilter
        filter={filter} setFilter={(v) => { setFilter(v); resetPage() }}
        startDate={startDate} endDate={endDate}
        setStartDate={(v) => { setStartDate(v); resetPage() }}
        setEndDate={(v) => { setEndDate(v); resetPage() }}
      />

      {/* Type + Category filter */}
      <div className="flex flex-wrap gap-2 items-center">
        {[
          { key: 'all', label: 'ทั้งหมด' },
          { key: 'income', label: 'รายรับ' },
          { key: 'expense', label: 'รายจ่าย' },
        ].map((o) => (
          <button
            key={o.key}
            className={`btn text-sm ${typeFilter === o.key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setTypeFilter(o.key); resetPage() }}
          >
            {o.label}
          </button>
        ))}
        {(typeFilter === 'expense' || typeFilter === 'all') && expenseCats.length > 0 && (
          <select
            className="input text-sm py-1.5 w-44"
            value={catFilter}
            onChange={(e) => { setCatFilter(e.target.value); resetPage() }}
          >
            <option value="">หมวดหมู่ทั้งหมด</option>
            {expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <span className="text-sm text-gray-500 ml-auto">{filtered.length} รายการ</span>
      </div>

      {/* Summary bar */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-emerald-50 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-500">รายรับรวม</p>
            <p className="text-lg font-bold text-emerald-600">{totalIncome.toLocaleString()}</p>
          </div>
          <div className="bg-red-50 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-500">รายจ่ายรวม</p>
            <p className="text-lg font-bold text-red-600">{totalExpense.toLocaleString()}</p>
          </div>
          <div className={`rounded-xl p-3 text-center ${totalIncome - totalExpense >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
            <p className="text-xs text-gray-500">กำไร/ขาดทุน</p>
            <p className={`text-lg font-bold ${totalIncome - totalExpense >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
              {(totalIncome - totalExpense).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Transaction cards */}
      {paged.length === 0 ? (
        <p className="text-center text-gray-400 py-10">ไม่มีรายการในช่วงที่เลือก</p>
      ) : (
        <div className="space-y-1.5">
          {paged.map((tx) => (
            <TxCard key={tx.id} tx={tx} onEdit={setEditing} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button className="btn btn-secondary text-sm" disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>
          <span className="text-sm text-gray-600">{page} / {totalPages}</span>
          <button className="btn btn-secondary text-sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>›</button>
        </div>
      )}

      {editing && <EditTransactionPopup transaction={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
