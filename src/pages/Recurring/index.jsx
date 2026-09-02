import { useState, useEffect, useMemo } from 'react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import useRecurringStore from '../../store/useRecurringStore'
import useTransactionStore from '../../store/useTransactionStore'
import usePendingStore from '../../store/usePendingStore'
import useLogStore from '../../store/useLogStore'
import { buildLogEntry } from '../../lib/logBuilder'
import { deductWallet, addToWallet, willGoNegative } from '../../lib/walletEngine'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import RecurringEntryCard from './RecurringEntryCard'
import RecurringEntryRow from './RecurringEntryRow'
import { isYearly, scheduleLabel } from '../../lib/recurringSchedule'
import { localMonthStr } from '../../lib/dateUtils'
import RecurringItemForm from './RecurringItemForm'
import PayEntryPopup from './PayEntryPopup'

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

// มุมมองรายการ: card = การ์ดเต็ม / compact = บรรทัดเดียว — จำไว้ในเครื่องต่อผู้ใช้
const VIEW_KEY = 'jodflow.recurring.view'
function loadView() {
  try { return localStorage.getItem(VIEW_KEY) === 'compact' ? 'compact' : 'card' } catch { return 'card' }
}

function monthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

export default function RecurringPage() {
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [payTarget, setPayTarget] = useState(null) // { entry, item }
  const [deleteItemId, setDeleteItemId] = useState(null)
  const [undoTarget, setUndoTarget] = useState(null)
  const [negativeWarn, setNegativeWarn] = useState(null) // { amount, method, proceed }
  const [showItemList, setShowItemList] = useState(false)
  const [view, setView] = useState(loadView)
  const changeView = (v) => { setView(v); try { localStorage.setItem(VIEW_KEY, v) } catch {} }

  const {
    items, entries, addItem, updateItem, toggleItem, deleteItem,
    generateEntries, updateEntry, markSkipped, getPendingCountCurrentMonth, syncPendingEntries,
    syncEntryFromTransaction,
  } = useRecurringStore()
  const { addTransaction, deleteTransaction } = useTransactionStore()
  const { addPending, deletePending, pendingPayments } = usePendingStore()
  const { addLog } = useLogStore()

  const month = monthKey(viewYear, viewMonth)

  // สร้าง entry ของเดือนที่ดูอยู่ — ต้องรันใหม่เมื่อ items เปลี่ยนด้วย
  // ไม่งั้นการเปิดใช้รายการที่ปิดไว้จะไม่สร้าง entry จนกว่าจะสลับเดือนไปกลับ
  useEffect(() => {
    generateEntries(month)
  }, [month, items])

  const navigateMonth = (delta) => {
    let m = viewMonth + delta
    let y = viewYear
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setViewMonth(m)
    setViewYear(y)
  }

  // entries for current view month, merged with item data
  const monthEntries = useMemo(() => {
    return entries
      .filter((e) => e.month === month)
      .map((e) => ({ entry: e, item: items.find((it) => it.id === e.recurringId) }))
      .filter((x) => x.item)
      .sort((a, b) => a.item.billingDay - b.item.billingDay)
  }, [entries, items, month])

  const summary = useMemo(() => {
    const paid = monthEntries.filter((x) => x.entry.status === 'paid')
    const pending = monthEntries.filter((x) => x.entry.status === 'pending')
    return {
      paidCount: paid.length,
      paidTotal: paid.reduce((s, x) => s + (x.entry.amount || 0), 0),
      pendingCount: pending.length,
      pendingTotal: pending.reduce((s, x) => s + (x.entry.amount || 0), 0),
    }
  }, [monthEntries])

  // ── Handlers ────────────────────────────────────────────────────────────────

  // ทุกตัวต้อง await ให้เซิร์ฟเวอร์ตอบรับก่อนจึงปิดหน้าต่าง — ถ้าไม่รอ เวลาบันทึกล้ม
  // (เช่นฐานข้อมูลยังไม่มีคอลัมน์ใหม่) หน้าต่างจะปิดเหมือนสำเร็จ แล้วผู้ใช้เข้าใจว่า
  // บันทึกแล้วทั้งที่ไม่มีอะไรถูกเขียนเลย พอรีเฟรชจึงดูเหมือน "ข้อมูลหาย"
  const handleAddItem = async (data) => {
    await addItem(data)
    addLog(buildLogEntry({ activityType: 'RECURRING_CREATE', description: `สร้างรายการประจำ "${data.name}"` }))
    await generateEntries(month)
    setShowForm(false)
  }

  const handleUpdateItem = async (data) => {
    const id = editItem.id
    await updateItem(id, data)
    // เดือนนี้จริงๆ ไม่ใช่เดือนที่กำลังเปิดดู — ย้อนไปแก้บิลเดือนที่ผ่านมาแล้วไม่ได้
    const changed = await syncPendingEntries(id, localMonthStr())
    addLog(buildLogEntry({
      activityType: 'RECURRING_UPDATE',
      description: `แก้ไขรายการประจำ "${data.name}"` +
        (changed > 0 ? ` (ปรับรอบที่ยังไม่จ่าย ${changed} รอบให้ตรงกัน)` : ''),
    }))
    await generateEntries(month)
    setEditItem(null)
  }

  const handleDeleteItem = async () => {
    const it = items.find((i) => i.id === deleteItemId)
    await deleteItem(deleteItemId)
    addLog(buildLogEntry({ activityType: 'RECURRING_DELETE', description: `ลบรายการประจำ "${it?.name}"` }))
    setDeleteItemId(null)
  }

  const handlePay = (entry, item) => setPayTarget({ entry, item })

  const executeMarkPaid = (entry, item, amount, paidMethod, paidDate = format(new Date(), 'yyyy-MM-dd'), accountId = null) => {
    let tx = null

    let pendingPaymentId = null
    if (paidMethod === 'pending') {
      const p = addPending({
        description: item.name,
        itemName: item.name,
        amount,
        dueDate: entry.dueDate,
        category: item.category,
        vendor: item.vendor,
        note: item.note,
        recurringEntryId: entry.id,
        // พกวิธีจ่าย/บัญชีที่ตั้งไว้ไปด้วย เพื่อให้ตอนกดชำระใช้ได้ทันที
        ...(item.defaultMethod && item.defaultMethod !== 'pending' ? { defaultMethod: item.defaultMethod } : {}),
        ...(item.defaultTransferAccountId ? { defaultTransferAccountId: item.defaultTransferAccountId } : {}),
      })
      pendingPaymentId = p.id
    } else {
      tx = addTransaction({
        type: 'expense',
        date: paidDate,
        amount,
        category: item.category,
        method: paidMethod,
        ...(accountId ? { transferAccountId: accountId } : {}),
        itemName: item.name,
        vendor: item.vendor,
        note: item.note,
        recurringEntryId: entry.id,
      })
      deductWallet(paidMethod, amount, {
        activityType: 'RECURRING_PAID',
        description: `จ่ายรายการประจำ "${item.name}" ${amount.toLocaleString()} บาท`,
      }, accountId)
    }

    updateEntry(entry.id, {
      status: 'paid',
      amount,
      paidMethod,
      transferAccountId: accountId,
      paidAt: new Date(`${paidDate}T12:00:00`).toISOString(),
      transactionId: tx?.id ?? null,
      pendingPaymentId,
    })

    setPayTarget(null)
  }

  const handlePayConfirm = (amount, paidMethod, paidDate, accountId = null) => {
    const { entry, item } = payTarget
    if (paidMethod !== 'pending' && willGoNegative(paidMethod, amount, accountId)) {
      setNegativeWarn({ amount, paidMethod, paidDate, accountId, entry, item })
      setPayTarget(null)
      return
    }
    executeMarkPaid(entry, item, amount, paidMethod, paidDate, accountId)
  }

  const handleNegativeConfirm = () => {
    const { entry, item, amount, paidMethod, paidDate, accountId } = negativeWarn
    executeMarkPaid(entry, item, amount, paidMethod, paidDate, accountId)
    setNegativeWarn(null)
  }

  const handleSaveEntryAmount = (amount) => {
    const { entry, item } = payTarget
    updateEntry(entry.id, { amount, amountUpdatedAt: new Date().toISOString() })
    addLog(buildLogEntry({
      activityType: 'RECURRING_UPDATE',
      description: `บันทึกยอดรายการประจำ "${item.name}" ${amount.toLocaleString()} บาท`,
      newValue: { recurringEntryId: entry.id, recurringId: item.id, amount },
    }))
    setPayTarget(null)
  }

  const handleUndoPay = (entry) => setUndoTarget(entry)

  // pending ที่ผูกกับ entry — ใช้ทั้งตอนแสดงผลลัพธ์และตอนยกเลิกจริง
  const linkedPendingOf = (entry) =>
    entry?.pendingPaymentId ? pendingPayments.find((p) => p.id === entry.pendingPaymentId) : null

  const undoEffects = (entry) => {
    if (!entry) return []
    const lines = []
    const linked = linkedPendingOf(entry)
    if (entry.paidMethod && entry.paidMethod !== 'pending') {
      lines.push(`คืนเงิน ${entry.amount.toLocaleString()} บาท เข้า${entry.paidMethod === 'cash' ? 'เงินสด' : 'เงินโอน'}`)
      if (entry.transactionId) lines.push('ลบรายการบันทึกที่เชื่อมโยง')
    }
    if (linked?.status === 'paid') {
      lines.push(`คืนเงิน ${linked.amount.toLocaleString()} บาท เข้า${linked.paidMethod === 'cash' ? 'เงินสด' : 'เงินโอน'} (ชำระผ่านรายการค้างจ่าย)`)
      if (linked.transactionId) lines.push('ลบรายการบันทึกของการชำระ')
    }
    if (linked) lines.push('ลบรายการค้างจ่ายที่เชื่อมโยง')
    if (lines.length === 0) lines.push('ไม่มีผลต่อยอดเงิน')
    return lines
  }

  const executeUndoPay = () => {
    const entry = undoTarget
    const item = items.find((it) => it.id === entry.recurringId)

    if (entry.transactionId) deleteTransaction(entry.transactionId)

    // จ่ายผ่านช่องทาง "ค้างชำระ" แล้วไปกดชำระที่หน้ารายการรอ — ต้องคืนเงินและลบ
    // transaction ของการชำระด้วย ไม่งั้นเงินยังถูกหักอยู่แต่ entry กลับเป็น "รอจ่าย" → จ่ายซ้ำได้
    const linked = linkedPendingOf(entry)
    if (linked?.status === 'paid') {
      if (linked.transactionId) deleteTransaction(linked.transactionId)
      if (linked.paidMethod) {
        addToWallet(linked.paidMethod, linked.amount, {
          activityType: 'RECURRING_UNPAID',
          description: `ยกเลิกการจ่าย "${item?.name}" คืนเงิน ${linked.amount.toLocaleString()} บาท (ชำระผ่านรายการค้างจ่าย)`,
        }, linked.transferAccountId)
      }
    }
    if (entry.pendingPaymentId) deletePending(entry.pendingPaymentId)

    if (entry.paidMethod && entry.paidMethod !== 'pending') {
      addToWallet(entry.paidMethod, entry.amount, {
        activityType: 'RECURRING_UNPAID',
        description: `ยกเลิกการจ่าย "${item?.name}" คืนเงิน ${entry.amount.toLocaleString()} บาท`,
      }, entry.transferAccountId)
    }

    updateEntry(entry.id, {
      status: 'pending',
      paidAt: null,
      paidMethod: null,
      transactionId: null,
      pendingPaymentId: null,
      transferAccountId: null,
      amount: item?.amountType === 'fixed' ? (item.fixedAmount ?? 0) : 0,
    })

    addLog(buildLogEntry({
      activityType: 'RECURRING_UNPAID',
      description: `ยกเลิกการจ่ายรายการประจำ "${item?.name}"`,
    }))
    setUndoTarget(null)
  }

  const handleSkip = (entryId) => {
    const e = entries.find((x) => x.id === entryId)
    if (e?.status === 'skipped') {
      updateEntry(entryId, { status: 'pending' })
    } else {
      markSkipped(entryId)
      addLog(buildLogEntry({ activityType: 'RECURRING_SKIPPED', description: `ข้ามรายการประจำเดือน ${month}` }))
    }
  }

  // แม่แบบที่ถูกซ่อน (ลบไปแล้วแต่ยังมีประวัติจ่าย) ไม่ต้องโผล่ในลิสต์จัดการ
  // แต่ยังต้องอยู่ใน items เพื่อให้รอบที่จ่ายแล้วของเดือนเก่าแสดงชื่อรายการได้
  const activeItems = useMemo(() => items.filter((it) => !it.deleted), [items])

  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth()

  return (
    <div className="space-y-4">
      {/* Month navigator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button className="btn btn-secondary w-8 h-8 p-0 flex items-center justify-center" onClick={() => navigateMonth(-1)}>‹</button>
          <span className="text-sm font-semibold text-gray-800 min-w-[120px] text-center">
            {THAI_MONTHS[viewMonth]} {viewYear + 543}
            {isCurrentMonth && <span className="ml-1 text-xs text-blue-500 font-normal">(เดือนนี้)</span>}
          </span>
          <button className="btn btn-secondary w-8 h-8 p-0 flex items-center justify-center" onClick={() => navigateMonth(1)}>›</button>
        </div>
        <div className="flex items-center gap-2">
          {/* สลับมุมมอง การ์ดเต็ม / บรรทัดเดียว */}
          <div className="inline-flex rounded-lg border border-hairline bg-white p-0.5" role="group" aria-label="มุมมองรายการ">
            <button
              type="button"
              onClick={() => changeView('card')}
              className={`px-2.5 h-7 rounded-md text-xs font-medium transition-colors ${view === 'card' ? 'bg-ink text-white' : 'text-gray-500 hover:bg-[#F6F5F1]'}`}
              title="การ์ดเต็ม"
            >
              ▤ เต็ม
            </button>
            <button
              type="button"
              onClick={() => changeView('compact')}
              className={`px-2.5 h-7 rounded-md text-xs font-medium transition-colors ${view === 'compact' ? 'bg-ink text-white' : 'text-gray-500 hover:bg-[#F6F5F1]'}`}
              title="บรรทัดเดียว"
            >
              ☰ ย่อ
            </button>
          </div>
          <button className="btn btn-primary text-sm" onClick={() => setShowForm(true)}>+ เพิ่มรายการ</button>
        </div>
      </div>

      {/* Summary */}
      {monthEntries.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-100">
            <p className="text-xs text-gray-500 mb-0.5">จ่ายแล้ว</p>
            <p className="text-base font-bold text-emerald-600">{summary.paidTotal.toLocaleString('th-TH')}</p>
            <p className="text-xs text-emerald-500">{summary.paidCount} รายการ</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-3 text-center border border-amber-100">
            <p className="text-xs text-gray-500 mb-0.5">รอจ่าย</p>
            <p className="text-base font-bold text-amber-600">{summary.pendingTotal.toLocaleString('th-TH')}</p>
            <p className="text-xs text-amber-500">{summary.pendingCount} รายการ</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-200">
            <p className="text-xs text-gray-500 mb-0.5">รวมทั้งหมด</p>
            <p className="text-base font-bold text-gray-800">{(summary.paidTotal + summary.pendingTotal).toLocaleString('th-TH')}</p>
            <p className="text-xs text-gray-400">{monthEntries.length} รายการ</p>
          </div>
        </div>
      )}

      {/* Entry list */}
      {monthEntries.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">🔁</p>
          <p className="text-sm">ยังไม่มีรายการประจำเดือนนี้</p>
          <p className="text-xs mt-1">กด "เพิ่มรายการ" เพื่อสร้างรายจ่ายประจำ</p>
        </div>
      ) : (
        <div className={view === 'compact' ? 'space-y-1' : 'space-y-2'}>
          {monthEntries.map(({ entry, item }) => {
            const Row = view === 'compact' ? RecurringEntryRow : RecurringEntryCard
            return (
              <Row
                key={entry.id}
                entry={entry}
                item={item}
                onPay={handlePay}
                onUndoPay={handleUndoPay}
                onSkip={handleSkip}
                onEdit={setEditItem}
                onDelete={(it) => setDeleteItemId(it.id)}
              />
            )
          })}
        </div>
      )}

      {/* Template list (collapsible) */}
      {activeItems.length > 0 && (
        <div className="border-t border-gray-100 pt-4">
          <button
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
            onClick={() => setShowItemList((v) => !v)}
          >
            <span>{showItemList ? '▾' : '▸'}</span>
            <span>จัดการรายการทั้งหมด ({activeItems.length} รายการ)</span>
          </button>

          {showItemList && (
            <div className="mt-3 space-y-2">
              {activeItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-white">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${item.enabled ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                      <span className="text-sm font-medium text-gray-800 truncate">{item.name}</span>
                      {isYearly(item) && (
                        <span className="text-[10px] font-medium px-1.5 rounded bg-violet-100 text-violet-700 flex-shrink-0">รายปี</span>
                      )}
                      {item.amountType === 'fixed' && (
                        <span className="text-xs text-gray-500 tabular-nums">{(item.fixedAmount ?? 0).toLocaleString('th-TH')} บาท</span>
                      )}
                      {item.amountType === 'variable' && (
                        <span className="text-xs text-gray-400 italic">ยอดเปลี่ยนแปลง</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 ml-4">{scheduleLabel(item)}</p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => toggleItem(item.id)}
                      className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                        item.enabled
                          ? 'border-gray-200 text-gray-500 hover:border-gray-300'
                          : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                      }`}
                    >
                      {item.enabled ? 'ปิด' : 'เปิด'}
                    </button>
                    <button
                      onClick={() => setEditItem(item)}
                      className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-blue-500 hover:bg-blue-50"
                    >
                      แก้
                    </button>
                    <button
                      onClick={() => setDeleteItemId(item.id)}
                      className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-red-400 hover:bg-red-50"
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <RecurringItemForm onSave={handleAddItem} onClose={() => setShowForm(false)} />
      )}
      {editItem && (
        <RecurringItemForm item={editItem} onSave={handleUpdateItem} onClose={() => setEditItem(null)} />
      )}
      {payTarget && (
        <PayEntryPopup
          entry={payTarget.entry}
          item={payTarget.item}
          onConfirm={handlePayConfirm}
          onSaveAmount={handleSaveEntryAmount}
          onClose={() => setPayTarget(null)}
        />
      )}
      <ConfirmPopup
        open={!!undoTarget}
        title="ยกเลิกการจ่าย"
        message={`ยกเลิกการจ่าย "${items.find((i) => i.id === undoTarget?.recurringId)?.name}"?\n\nผลที่จะเกิดขึ้น:\n${undoEffects(undoTarget).map((e) => `• ${e}`).join('\n')}`}
        onConfirm={executeUndoPay}
        onCancel={() => setUndoTarget(null)}
        confirmLabel="ยืนยัน"
        danger
      />
      <ConfirmPopup
        open={!!deleteItemId}
        title="ลบรายการประจำ"
        message={`ลบ "${items.find((i) => i.id === deleteItemId)?.name}"?\nรอบที่ยังไม่จ่ายจะถูกลบ ส่วนรอบที่จ่ายไปแล้วยังอยู่ในประวัติเดือนเก่าตามเดิม`}
        onConfirm={handleDeleteItem}
        onCancel={() => setDeleteItemId(null)}
        confirmLabel="ลบ"
        danger
      />
      <ConfirmPopup
        open={!!negativeWarn}
        title="ยอดเงินไม่เพียงพอ"
        message={`${negativeWarn?.paidMethod === 'cash' ? 'เงินสด' : 'เงินโอน'}ไม่เพียงพอ ต้องการจ่ายต่อไปหรือไม่?\nยอดจะติดลบ`}
        onConfirm={handleNegativeConfirm}
        onCancel={() => setNegativeWarn(null)}
        confirmLabel="จ่ายต่อไป"
        danger
      />
    </div>
  )
}
