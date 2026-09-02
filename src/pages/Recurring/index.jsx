import { useState, useEffect, useMemo } from 'react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import useRecurringStore from '../../store/useRecurringStore'
import useTransactionStore from '../../store/useTransactionStore'
import usePendingStore from '../../store/usePendingStore'
import useLogStore from '../../store/useLogStore'
import { buildLogEntry } from '../../lib/logBuilder'
import { addToWallet, willGoNegative } from '../../lib/walletEngine'
import useCreditCardStore from '../../store/useCreditCardStore'
import { methodLabel } from '../../lib/walletEngine'
import { walletTarget } from '../../lib/api/transactions'
import { cancelTransaction } from '../../lib/transactionActions'
import useWalletStore from '../../store/useWalletStore'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import RecurringEntryCard from './RecurringEntryCard'
import RecurringEntryRow from './RecurringEntryRow'
import { isYearly, pauseInfo, pauseLabel, scheduleLabel } from '../../lib/recurringSchedule'
import PausePopup from './PausePopup'
import RecurringPausedCard from './RecurringPausedCard'
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
  const [pauseTarget, setPauseTarget] = useState(null)
  const changeView = (v) => { setView(v); try { localStorage.setItem(VIEW_KEY, v) } catch {} }

  const {
    items, entries, addItem, updateItem, toggleItem, deleteItem,
    generateEntries, updateEntry, markSkipped, getPendingCountCurrentMonth, syncPendingEntries,
    pauseItem, resumeItem,
    syncEntryFromTransaction,
  } = useRecurringStore()
  const { addTransaction, transactions } = useTransactionStore()
  const { addPending, deletePending, pendingPayments } = usePendingStore()
  const { addLog } = useLogStore()
  const refreshWallet = useWalletStore((s) => s.refresh)
  const refreshPending = usePendingStore((s) => s.refresh)
  // งานที่แตะเงินต้องรอเซิร์ฟเวอร์ตอบ — กันกดซ้ำและแสดงผลที่ล้มบนหน้าจอ
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

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

  // เดือนที่ถูกพักไม่มี entry ในฐานข้อมูลเลย (ไม่ได้ออกบิล) จึงต้องหยิบจากแม่แบบมาแสดงเอง
  // ตั้งใจให้ยังเห็นอยู่ เพราะต้องรู้ว่ารายการนี้ยังมีและจะกลับมาเมื่อไหร่
  const pausedThisMonth = useMemo(() => {
    return items
      .filter((it) => it.enabled && !it.deleted)
      .map((it) => ({ item: it, info: pauseInfo(it, month) }))
      .filter((x) => x.info)
      .sort((a, b) => a.item.billingDay - b.item.billingDay)
  }, [items, month])

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

  const paidThisMonthFor = (itemId) =>
    entries.some((e) => e.recurringId === itemId && e.month === localMonthStr() && e.status === 'paid')

  const handlePause = async (months) => {
    const item = pauseTarget
    const { from, until } = await pauseItem(item.id, months)
    addLog(buildLogEntry({
      activityType: 'RECURRING_UPDATE',
      description: `พักการเรียกเก็บ "${item.name}" ${months} เดือน (ตั้งแต่ ${from} ถึงก่อน ${until})`,
      newValue: { recurringId: item.id, pausedFrom: from, pausedUntil: until, months },
    }))
    setPauseTarget(null)
  }

  const handleResume = async (item) => {
    await resumeItem(item.id)
    addLog(buildLogEntry({
      activityType: 'RECURRING_UPDATE',
      description: `ยกเลิกการพักเรียกเก็บ "${item.name}" กลับมาเรียกเก็บตามปกติ`,
    }))
    // พักอยู่แปลว่าเดือนนี้ไม่มีรอบ พอเลิกพักต้องสร้างรอบให้ใหม่ทันที
    await generateEntries(month)
  }

  /**
   * กดจ่ายรอบรายการประจำ
   *
   * จ่ายสด/โอน: บันทึกรายการ + ตัดเงิน + log จบใน RPC เดียว (post_transaction)
   * แล้วค่อยผูก entry กับรายการที่ได้ — ของเดิมเรียก addTransaction/deductWallet
   * โดยไม่ await ทำให้ tx.id เป็น undefined entry จึงไม่เคยผูกกับรายการ (ยกเลิกไม่ได้)
   * และเงินถูกตัดแยกอีกคำสั่ง ถ้าอันใดอันหนึ่งล้มยอดจะไม่ตรง
   */
  const executeMarkPaid = async (entry, item, amount, paidMethod, paidDate = format(new Date(), 'yyyy-MM-dd'), accountId = null, cardId = null, paidAt = null) => {
    if (busy) return
    setBusy(true)
    setActionError('')
    try {
      let tx = null
      let pendingPaymentId = null

      if (paidMethod === 'pending') {
        const p = await addPending({
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
        const target = walletTarget(paidMethod, { transferAccountId: accountId, cardId })
        if (!target) throw new Error(paidMethod === 'card' ? 'กรุณาเลือกบัตรเครดิต' : 'กรุณาเลือกบัญชีเงินโอน')
        tx = await addTransaction({
          type: 'expense',
          date: paidDate,
          amount,
          category: item.category,
          method: paidMethod,
          ...(accountId ? { transferAccountId: accountId } : {}),
          ...(cardId ? { cardId } : {}),
          itemName: item.name,
          vendor: item.vendor,
          note: item.note,
          recurringEntryId: entry.id,
        }, {
          effect: { target, delta: -amount },
          log: buildLogEntry({
            activityType: 'RECURRING_PAID',
            description: `จ่ายรายการประจำ "${item.name}" ${amount.toLocaleString()} บาท`,
            walletEffect: { target: paidMethod, delta: -amount, transferAccountId: accountId, cardId },
            newValue: { recurringEntryId: entry.id, recurringId: item.id, amount, paidDate },
          }),
        })
        if (cardId) await useCreditCardStore.getState().refresh()
        else await refreshWallet()
      }

      await updateEntry(entry.id, {
        status: 'paid',
        amount,
        paidMethod,
        transferAccountId: accountId,
        cardId,
        // เวลาจากหน้าต่างจ่าย ถ้าไม่ได้ระบุใช้เที่ยงตรงของวันที่เลือกเหมือนเดิม
        paidAt: paidAt ?? new Date(`${paidDate}T12:00:00`).toISOString(),
        transactionId: tx?.id ?? null,
        pendingPaymentId,
      })

      setPayTarget(null)
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handlePayConfirm = (amount, paidMethod, paidDate, accountId = null, cardId = null, paidAt = null) => {
    const { entry, item } = payTarget
    // บัตรเครดิตไม่ต้องเช็คยอดติดลบ เป็นหนี้อยู่แล้วโดยธรรมชาติ
    if (paidMethod !== 'pending' && paidMethod !== 'card' && willGoNegative(paidMethod, amount, accountId)) {
      setNegativeWarn({ amount, paidMethod, paidDate, accountId, cardId, entry, item, paidAt })
      setPayTarget(null)
      return
    }
    executeMarkPaid(entry, item, amount, paidMethod, paidDate, accountId, cardId, paidAt)
  }

  const handleNegativeConfirm = () => {
    const { entry, item, amount, paidMethod, paidDate, accountId, cardId, paidAt } = negativeWarn
    executeMarkPaid(entry, item, amount, paidMethod, paidDate, accountId, cardId, paidAt)
    setNegativeWarn(null)
  }

  const handleSaveEntryAmount = async (amount) => {
    const { entry, item } = payTarget
    setActionError('')
    try {
      await updateEntry(entry.id, { amount, amountUpdatedAt: new Date().toISOString() })
      addLog(buildLogEntry({
        activityType: 'RECURRING_UPDATE',
        description: `บันทึกยอดรายการประจำ "${item.name}" ${amount.toLocaleString()} บาท`,
        newValue: { recurringEntryId: entry.id, recurringId: item.id, amount },
      }))
      setPayTarget(null)
    } catch (err) {
      setActionError(err.message)
    }
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
      lines.push(`คืนเงิน ${entry.amount.toLocaleString()} บาท เข้า${methodLabel(entry.paidMethod)}`)
      if (entry.transactionId) lines.push('ลบรายการบันทึกที่เชื่อมโยง')
    }
    if (linked?.status === 'paid') {
      lines.push(`คืนเงิน ${linked.amount.toLocaleString()} บาท เข้า${methodLabel(linked.paidMethod)} (ชำระผ่านรายการค้างจ่าย)`)
      if (linked.transactionId) lines.push('ลบรายการบันทึกของการชำระ')
    }
    if (linked) lines.push('ลบรายการค้างจ่ายที่เชื่อมโยง')
    if (lines.length === 0) lines.push('ไม่มีผลต่อยอดเงิน')
    return lines
  }

  /**
   * รายการที่ผูกกับ entry อาจอยู่นอกช่วง 24 เดือนที่โหลดไว้ — ประกอบข้อมูลขั้นต่ำ
   * ที่ cancelTransaction ต้องใช้คำนวณเงินคืน (type/method/amount/บัญชี) จากตัว entry แทน
   */
  const txForCancel = (transactionId, { method, amount, transferAccountId, itemName, date }) =>
    transactions.find((t) => t.id === transactionId) ?? {
      id: transactionId, type: 'expense', method, amount, transferAccountId: transferAccountId ?? null,
      itemName, date,
    }

  /**
   * ยกเลิกการจ่าย — ทุกขั้นรอเซิร์ฟเวอร์ตอบตามลำดับ
   *
   * การคืนเงินใช้ RPC cancel_transaction (คืนเงินตาม effect + ลบรายการ + ลบรายการค้าง
   * ที่ผูก + ย้อน entry ในทรานแซกชันเดียว) ไม่ใช่ addToWallet แยกอีกคำสั่งแบบเดิม
   * ซึ่งยิงพร้อมกัน 4–5 คำสั่งแล้วแข่งกันเขียน entry เดียวกับที่ RPC ย้อนให้
   */
  const executeUndoPay = async () => {
    if (busy) return
    const entry = undoTarget
    const item = items.find((it) => it.id === entry.recurringId)
    setBusy(true)
    setActionError('')
    try {
      const linked = linkedPendingOf(entry)

      // 1. จ่ายสด/โอนโดยตรง → ยกเลิกรายการ = คืนเงิน + ย้อน entry ให้ที่ฐานข้อมูล
      if (entry.transactionId) {
        await cancelTransaction(txForCancel(entry.transactionId, {
          method: entry.paidMethod, amount: entry.amount, transferAccountId: entry.transferAccountId,
          itemName: item?.name, date: entry.dueDate,
        }))
      } else if (entry.paidMethod && entry.paidMethod !== 'pending' && entry.amount > 0) {
        // entry รุ่นเก่าที่ไม่ได้ผูกรายการไว้ — คืนเงินตรงๆ
        await addToWallet(entry.paidMethod, entry.amount, {
          activityType: 'RECURRING_UNPAID',
          description: `ยกเลิกการจ่าย "${item?.name}" คืนเงิน ${entry.amount.toLocaleString()} บาท`,
        }, entry.transferAccountId)
      }

      // 2. จ่ายผ่าน "ค้างชำระ" แล้วไปกดชำระที่หน้ารายการรอ — ต้องคืนเงินและลบรายการ
      //    ของการชำระด้วย ไม่งั้นเงินยังถูกหักอยู่แต่ entry กลับเป็น "รอจ่าย" → จ่ายซ้ำได้
      if (linked?.status === 'paid' && linked.transactionId) {
        // cancel_transaction ลบ pending_payments ที่ผูกกับรายการนั้นให้ด้วย
        await cancelTransaction(txForCancel(linked.transactionId, {
          method: linked.paidMethod, amount: linked.amount, transferAccountId: linked.transferAccountId,
          itemName: item?.name, date: entry.dueDate,
        }))
      } else if (linked) {
        if (linked.status === 'paid' && linked.paidMethod) {
          await addToWallet(linked.paidMethod, linked.amount, {
            activityType: 'RECURRING_UNPAID',
            description: `ยกเลิกการจ่าย "${item?.name}" คืนเงิน ${linked.amount.toLocaleString()} บาท (ชำระผ่านรายการค้างจ่าย)`,
          }, linked.transferAccountId)
        }
        await deletePending(linked.id)
      }

      // 3. ย้อน entry (RPC ย้อนให้แล้วถ้ามีรายการผูก แต่ต้องตั้งยอดคงที่และล้างการผูกให้ครบ)
      await updateEntry(entry.id, {
        status: 'pending',
        paidAt: null,
        paidMethod: null,
        transactionId: null,
        pendingPaymentId: null,
        transferAccountId: null,
        amount: item?.amountType === 'fixed' ? (item.fixedAmount ?? 0) : 0,
      })

      await Promise.all([refreshWallet(), refreshPending()])
      addLog(buildLogEntry({
        activityType: 'RECURRING_UNPAID',
        description: `ยกเลิกการจ่ายรายการประจำ "${item?.name}"`,
        newValue: { recurringEntryId: entry.id, recurringId: item?.id },
      }))
      setUndoTarget(null)
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleSkip = async (entryId) => {
    const e = entries.find((x) => x.id === entryId)
    setActionError('')
    try {
      if (e?.status === 'skipped') {
        await updateEntry(entryId, { status: 'pending' })
      } else {
        await markSkipped(entryId)
        addLog(buildLogEntry({ activityType: 'RECURRING_SKIPPED', description: `ข้ามรายการประจำเดือน ${month}` }))
      }
    } catch (err) {
      setActionError(err.message)
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

      {/* ผลลัพธ์ที่ล้ม ต้องเห็นบนหน้าจอ ไม่ใช่จมอยู่ใน console */}
      {actionError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
          ทำรายการไม่สำเร็จ — {actionError}
        </p>
      )}

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
      {monthEntries.length === 0 && pausedThisMonth.length === 0 ? (
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
                onPause={setPauseTarget}
              />
            )
          })}

          {/* รายการที่พักอยู่ — ยังเห็นได้และบอกว่าเหลืออีกกี่เดือน แต่ไม่นับเป็นยอดรอจ่าย */}
          {pausedThisMonth.map(({ item, info }) => (
            <RecurringPausedCard
              key={`paused-${item.id}`}
              item={item}
              info={info}
              compact={view === 'compact'}
              onResume={handleResume}
              onEdit={setEditItem}
            />
          ))}
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
                      {pauseInfo(item, month) && (
                        <span className="text-[10px] font-medium px-1.5 rounded bg-gray-200 text-gray-600 flex-shrink-0">⏸ พัก</span>
                      )}
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
                    <p className="text-xs text-gray-400 ml-4">
                      {scheduleLabel(item)}
                      {pauseInfo(item, month) && ` · ${pauseLabel(pauseInfo(item, month))}`}
                    </p>
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
      {pauseTarget && (
        <PausePopup
          item={pauseTarget}
          paidThisMonth={paidThisMonthFor(pauseTarget.id)}
          onConfirm={handlePause}
          onClose={() => setPauseTarget(null)}
        />
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
        message={`${methodLabel(negativeWarn?.paidMethod)}ไม่เพียงพอ ต้องการจ่ายต่อไปหรือไม่?\nยอดจะติดลบ`}
        onConfirm={handleNegativeConfirm}
        onCancel={() => setNegativeWarn(null)}
        confirmLabel="จ่ายต่อไป"
        danger
      />
    </div>
  )
}
