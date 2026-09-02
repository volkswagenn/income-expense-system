import { useState, useMemo, useRef } from 'react'
import { format } from 'date-fns'
import { Link } from 'react-router-dom'
import DateNavigator from '../../components/shared/DateNavigator'
import DatePicker from '../../components/shared/DatePicker'
import EditableDropdown from '../../components/shared/EditableDropdown'
import CategorySelect from '../../components/shared/CategorySelect'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import FileUploadPopup from '../../components/shared/FileUploadPopup'
import TransferAccountPicker from '../../components/shared/TransferAccountPicker'
import CreditCardPicker from '../../components/shared/CreditCardPicker'
import useWalletStore from '../../store/useWalletStore'
import useCreditCardStore from '../../store/useCreditCardStore'
import { nextDueDate, formatThaiDate, installmentSchedule, installmentTotal } from '../../lib/cardCycle'
import useTransactionStore from '../../store/useTransactionStore'
import usePendingStore from '../../store/usePendingStore'
import useCategoryStore from '../../store/useCategoryStore'
import useRecurringStore from '../../store/useRecurringStore'
import { walletTarget } from '../../lib/api/transactions'
import { buildLogEntry } from '../../lib/logBuilder'
import useLogStore from '../../store/useLogStore'
import { useNegativeConfirm } from '../../hooks/useNegativeConfirm'
import { useFormDraft, DraftBanner } from '../../hooks/useFormDraft'

const EMPTY = {
  itemName: '', category: '', amount: '', method: 'cash', transferAccountId: '', pendingAccountId: '',
  cardId: '', installment: false, installmentMonths: '6', installmentRate: '0',
  vendor: '', receiptNo: '', taxStatus: 'none', dueDate: '', taxDueDate: '', note: ''
}

const MONTH_PRESETS = [3, 6, 10]

const fmtBaht = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

export default function ExpenseForm() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [form, setForm, clearDraft, hasDraft] = useFormDraft('expense', EMPTY)
  const [saved, setSaved] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  // ระบบออนไลน์อย่างเดียว การบันทึกต้องรอผลจริงจากเซิร์ฟเวอร์ จึงต้องกันกดซ้ำระหว่างรอ
  const [saving, setSaving] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadStatus, setUploadStatus] = useState(null)
  const [attachments, setAttachments] = useState([])
  const { warning, check, proceed, cancel } = useNegativeConfirm()

  const { addTransaction } = useTransactionStore()
  const { addPending, addTaxInvoice } = usePendingStore()
  const {
    addVendor, updateVendor, softDeleteVendor,
    addQuickItem, updateQuickItem, softDeleteQuickItem,
    getVendors, getQuickItems, getCategoryFilterIds,
  } = useCategoryStore()
  const { addLog } = useLogStore()
  const resolveAccount = useWalletStore((s) => s.resolveTransferAccountId)
  const refreshWallet = useWalletStore((s) => s.refresh)
  const resolveCard = useCreditCardStore((s) => s.resolveCardId)
  const refreshCards = useCreditCardStore((s) => s.refresh)
  const createInstallment = useCreditCardStore((s) => s.createInstallment)
  const cards = useCreditCardStore((s) => s.cards)

  // สิ่งที่บันทึกลงเซิร์ฟเวอร์สำเร็จแล้วในรอบนี้ (รายการ / รายการค้าง) — ถ้าขั้นถัดไปล้ม
  // (เช่นสร้างการ์ดรอใบกำกับภาษีไม่สำเร็จ) ผู้ใช้กดบันทึกซ้ำได้โดยไม่สร้างรายการ
  // และตัดเงินซ้ำอีกรอบ ล้างเมื่อสำเร็จครบหรือเมื่อแก้ฟอร์ม
  const savedRef = useRef({ tx: null, pending: null, installment: null })

  const set = (k, v) => {
    savedRef.current = { tx: null, pending: null, installment: null }
    setForm((f) => ({ ...f, [k]: v }))
  }

  const logVendorAdd = async (name) => {
    const item = await addVendor(name)
    await addLog(buildLogEntry({ activityType: 'VENDOR_CREATE', description: `สร้างผู้ขาย "${name}"`, newValue: item }))
    return item
  }

  const logVendorUpdate = async (id, name) => {
    const oldItem = getVendors().find((item) => item.id === id)
    await updateVendor(id, name)
    await addLog(buildLogEntry({ activityType: 'VENDOR_UPDATE', description: `แก้ไขผู้ขาย "${oldItem?.name ?? id}" → "${name}"`, oldValue: oldItem, newValue: { id, name } }))
  }

  const logVendorDelete = async (id) => {
    const oldItem = getVendors().find((item) => item.id === id)
    await softDeleteVendor(id)
    await addLog(buildLogEntry({ activityType: 'VENDOR_DELETE', description: `ลบผู้ขาย "${oldItem?.name ?? id}"`, oldValue: oldItem }))
  }

  const logQuickItemAdd = async (name, categoryId) => {
    const item = await addQuickItem(name, categoryId)
    await addLog(buildLogEntry({ activityType: 'QUICK_ITEM_CREATE', description: `สร้างรายการด่วน "${name}"`, newValue: item }))
    return item
  }

  const logQuickItemUpdate = async (id, changes) => {
    const oldItem = getQuickItems().find((item) => item.id === id)
    await updateQuickItem(id, changes)
    await addLog(buildLogEntry({ activityType: 'QUICK_ITEM_UPDATE', description: `แก้ไขรายการด่วน "${oldItem?.name ?? id}"`, oldValue: oldItem, newValue: { ...oldItem, ...changes } }))
  }

  const logQuickItemDelete = async (id) => {
    const oldItem = getQuickItems().find((item) => item.id === id)
    await softDeleteQuickItem(id)
    await addLog(buildLogEntry({ activityType: 'QUICK_ITEM_DELETE', description: `ลบรายการด่วน "${oldItem?.name ?? id}"`, oldValue: oldItem }))
  }

  const execute = async () => {
    if (saving) return
    const amt = Number(form.amount)
    const accountId = form.method === 'transfer' ? resolveAccount(form.transferAccountId) : null
    const cardId = form.method === 'card' ? resolveCard(form.cardId) : null
    const months = Math.max(1, Math.round(Number(form.installmentMonths) || 0))
    const isInstallment = form.method === 'card' && form.installment && !!selectedCard
    let tx = null

    setSaving(true)
    setErrMsg('')
    try {
    if (form.method === 'pending' && savedRef.current.pending) {
      // รายการค้างถูกสร้างไปแล้วในรอบก่อน (ล้มที่ขั้นถัดไป) — ข้ามไปทำขั้นที่เหลือ
    } else if (form.method === 'pending') {
      const missingDueDateNote = form.dueDate ? '' : 'ไม่ได้ลงกำหนดชำระเงิน'
      const pending = await addPending({
        amount: amt,
        dueDate: form.dueDate || date,
        description: form.itemName,
        itemName: form.itemName,
        category: form.category,
        vendor: form.vendor,
        receiptNo: form.receiptNo,
        taxStatus: form.taxStatus,
        openDate: date,
        note: [form.note, missingDueDateNote].filter(Boolean).join('\n'),
        missingDueDate: !form.dueDate,
        // ผูกบัญชีไว้ล่วงหน้า เวลากดชำระจะตัดจากบัญชีนี้ทันที
        ...(form.pendingAccountId ? { defaultTransferAccountId: form.pendingAccountId } : {}),
        ...(attachments.length > 0 ? {
          attachments,
          documentPath: attachments[0].path,
          documentType: attachments[0].type,
          documentLabel: attachments[0].label,
        } : {}),
      })
      await addLog(buildLogEntry({
        activityType: 'OPEN_BILL',
        description: `เปิดบิลรอจ่ายเงิน: "${form.itemName}" ${amt.toLocaleString()} บาท (วันที่เปิด: ${date}) ครบกำหนด: ${form.dueDate || date}${missingDueDateNote ? ` (${missingDueDateNote})` : ''}`,
        newValue: { pendingId: pending.id, itemName: form.itemName, amount: amt, dueDate: form.dueDate || date, openDate: date, missingDueDate: !form.dueDate },
        walletEffect: null,
      }))
      savedRef.current.pending = pending
    } else if (isInstallment && savedRef.current.installment) {
      // สัญญาผ่อนถูกสร้างไปแล้วในรอบก่อน — ห้ามสร้างซ้ำ
    } else if (isInstallment) {
      // ผ่อน: ยังไม่สร้างรายจ่ายและยังไม่ขยับหนี้ บันทึกแค่สัญญากับตารางงวด
      // งวดจะกลายเป็นรายจ่ายทีละงวดตอนปิดรอบ เพราะเงินไหลออกจริงทีละงวด
      //
      // ช่องจำนวนเงินคือราคาสินค้า ส่วนยอดที่ผ่อนจริงคือราคาบวกดอกเบี้ยแบบคงที่
      // ผลรวมของทุกงวดจึงเท่ากับ total ไม่ใช่ราคาสินค้า ซึ่งตรงกับเงินที่ไหลออกจริง
      const money = installmentTotal(amt, months, Number(form.installmentRate) || 0)
      const schedule = installmentSchedule(selectedCard, new Date(date + 'T00:00:00'), months, money.total)
      const ins = await createInstallment(cardId, {
        name: form.itemName,
        vendor: form.vendor,
        categoryId: form.category || null,
        note: form.note,
        principalAmount: money.principal,
        totalAmount: money.total,
        months,
        monthlyAmount: schedule[0].amount,
        interestRate: money.ratePerMonth,
        purchaseDate: date,
      }, schedule, buildLogEntry({
        activityType: 'INSTALLMENT_CREATE',
        description:
          `ผ่อน "${form.itemName}" ราคา ${money.principal.toLocaleString()} บาท ${months} งวด ` +
          (money.interest > 0
            ? `ดอกเบี้ย ${money.ratePerMonth}% ต่อเดือน รวม ${money.total.toLocaleString()} บาท `
            : 'ผ่อน 0% ') +
          `งวดละ ${schedule[0].amount.toLocaleString()} บาท`,
        newValue: {
          itemName: form.itemName,
          principal: money.principal,
          interest: money.interest,
          total: money.total,
          ratePerMonth: money.ratePerMonth,
          months, cardId, date,
        },
      }))
      savedRef.current.installment = ins
      await refreshCards()
    } else if (savedRef.current.tx) {
      // รายการถูกบันทึกและตัดเงินไปแล้วในรอบก่อน — ห้ามสร้างซ้ำ
      tx = savedRef.current.tx
    } else {
      // บันทึกรายการ + ตัดเงิน + เขียน log จบในคำสั่งเดียวที่ฐานข้อมูล
      // ถ้าแยกยิงแล้วเน็ตหลุดกลางทาง จะได้รายการที่ไม่ตัดเงิน หรือเงินหายโดยไม่มีรายการ
      const target = walletTarget(form.method, { transferAccountId: accountId, cardId })
      tx = await addTransaction({
        date, type: 'expense', amount: amt,
        method: form.method, category: form.category, itemName: form.itemName,
        ...(accountId ? { transferAccountId: accountId } : {}),
        ...(cardId ? { cardId } : {}),
        vendor: form.vendor, receiptNo: form.receiptNo, taxStatus: form.taxStatus,
        dueDate: null, note: form.note,
        ...(attachments.length > 0 ? {
          attachments,
          documentPath: attachments[0].path,
          documentType: attachments[0].type,
          documentLabel: attachments[0].label,
        } : {}),
      }, {
        effect: target ? { target, delta: -amt } : null,
        log: buildLogEntry({
          activityType: 'ADD_EXPENSE',
          description: `จ่าย "${form.itemName}" ${amt.toLocaleString()} บาท`,
          walletEffect: target ? { target: form.method, delta: -amt, transferAccountId: accountId, cardId } : null,
          newValue: { itemName: form.itemName, amount: amt, method: form.method, date, ...(cardId ? { cardId } : {}) },
        }),
      })
      savedRef.current.tx = tx
      // ยอดถูกแก้ที่เซิร์ฟเวอร์ ต้องดึงค่าจริงมาแสดง ไม่คำนวณเองเพราะอาจมีคนอื่นแก้พร้อมกัน
      // รูดบัตรไม่แตะเงินสด/เงินโอน แต่ไปเพิ่มหนี้ในบัตร จึงต้องดึงคนละชุดกัน
      if (cardId) await refreshCards()
      else await refreshWallet()
    }

    if (form.taxStatus === 'waiting') {
      const tax = await addTaxInvoice({
        ...(tx ? { transactionId: tx.id } : {}),
        itemName: form.itemName,
        receiptNo: form.receiptNo,
        amount: amt,
        dueDate: form.taxDueDate || null,
        createdAt: new Date(date + 'T00:00:00').toISOString(),
      })
      await addLog(buildLogEntry({
        activityType: 'CREATE_TAX_INVOICE',
        description: `สร้างรายการรอใบกำกับภาษี "${form.itemName}" ${amt.toLocaleString()} บาท`,
        newValue: { ...tax, ...(tx ? { transactionId: tx.id } : {}) },
      }))
    }

    savedRef.current = { tx: null, pending: null, installment: null }
    clearDraft()
    setSaved(true)
    setUploadStatus(null)
    setAttachments([])
    setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      // ยังไม่ล้างฟอร์ม ผู้ใช้จะได้กดบันทึกซ้ำได้โดยไม่ต้องกรอกใหม่
      // (ขั้นที่สำเร็จไปแล้วจะถูกข้าม ไม่สร้างรายการหรือตัดเงินซ้ำ)
      setErrMsg(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSave = () => {
    if (!form.itemName) return setErrMsg('กรุณาใส่รายการจ่าย')
    if (!form.amount || Number(form.amount) <= 0) return setErrMsg('กรุณาใส่จำนวนเงิน')
    if (form.method === 'transfer' && !resolveAccount(form.transferAccountId)) {
      return setErrMsg('กรุณาเลือกบัญชีที่จะจ่ายเงินโอน')
    }
    if (form.method === 'card' && !resolveCard(form.cardId)) {
      return setErrMsg('กรุณาเลือกบัตรเครดิตที่ใช้รูด')
    }
    if (form.method === 'card' && form.installment) {
      const m = Math.round(Number(form.installmentMonths) || 0)
      if (!(m >= 1) || m > 60) return setErrMsg('จำนวนงวดต้องอยู่ระหว่าง 1 ถึง 60')
    }
    setErrMsg('')
    // บัตรเครดิตไม่ต้องเช็คยอดติดลบ — เป็นหนี้อยู่แล้วโดยธรรมชาติ และไม่บล็อกเรื่องวงเงิน
    if (form.method === 'pending' || form.method === 'card') {
      execute()
    } else {
      check({
        method: form.method,
        amount: Number(form.amount),
        accountId: form.transferAccountId,
        onConfirm: execute,
      })
    }
  }

  const vendorList = getVendors()
  const quickList = getQuickItems()

  // บัตรที่จะถูกใช้จริง — เผื่อกรณีมีใบเดียวแล้ว picker ยังไม่ทันเซ็ตค่าให้
  const selectedCard = form.method === 'card'
    ? cards.find((c) => c.id === resolveCard(form.cardId)) ?? null
    : null

  // ตัวอย่างตารางผ่อน คำนวณสดขณะพิมพ์ ผู้ใช้จะได้เห็นยอดต่องวดก่อนกดบันทึก
  // ช่องจำนวนเงินคือ "ราคาสินค้า" ส่วนยอดที่ผ่อนจริงคือราคาบวกดอกเบี้ย
  const installmentPreview = (() => {
    if (!form.installment || !selectedCard) return null
    const principal = Number(form.amount)
    const m = Math.round(Number(form.installmentMonths) || 0)
    const rate = Number(form.installmentRate) || 0
    if (!(principal > 0) || !(m >= 1) || m > 60 || rate < 0) return null
    const money = installmentTotal(principal, m, rate)
    const rows = installmentSchedule(selectedCard, new Date(date + 'T00:00:00'), m, money.total)
    const first = rows[0]
    const last = rows[rows.length - 1]
    return {
      ...money,
      first,
      last,
      hasRemainder: rows.length > 1 && last.amount !== first.amount,
    }
  })()

  const recurringAllItems = useRecurringStore((s) => s.items)
  const recurringEntries = useRecurringStore((s) => s.entries)
  const currentMonth = format(new Date(), 'yyyy-MM')
  const matchingRecurring = useMemo(() => {
    if (!form.category) return null
    // เลือกหมวดหมู่หลัก → เตือนถึงรายการประจำที่อยู่ในหมวดหมู่ย่อยข้างในด้วย
    const scope = new Set(getCategoryFilterIds(form.category))
    const pendingThisMonth = recurringEntries.filter(
      (e) => e.month === currentMonth && e.status === 'pending'
    )
    for (const entry of pendingThisMonth) {
      const item = recurringAllItems.find((it) => it.id === entry.recurringId && scope.has(it.category))
      if (item) return item
    }
    return null
  }, [form.category, recurringAllItems, recurringEntries, currentMonth])

  // ทุก taxStatus → upload ใบเสร็จ ยกเว้น 'received' → upload ใบกำกับภาษี
  const isTaxUpload = form.taxStatus === 'received'

  const handleUploadDone = (savedPath) => {
    setUploadOpen(false)
    if (savedPath) {
      const paths = Array.isArray(savedPath) ? savedPath : [savedPath]
      const nextAttachments = paths.map((path, index) => ({
        path,
        type: isTaxUpload ? 'taxinvoice' : 'receipt',
        label: `${isTaxUpload ? 'ใบกำกับภาษี' : 'ใบเสร็จ'}${paths.length > 1 ? ` ${index + 1}` : ''}`,
        uploadedAt: new Date().toISOString(),
      }))
      setAttachments(nextAttachments)
      setUploadStatus(`✓ อัปโหลดเสร็จสิ้น — ${paths.length > 1 ? `${paths.length} ไฟล์` : paths[0]}`)
      addLog(buildLogEntry({
        activityType: isTaxUpload ? 'UPLOAD_TAX_INVOICE_FILE' : 'UPLOAD_RECEIPT',
        description: `อัปโหลด${isTaxUpload ? 'ไฟล์ใบกำกับภาษี' : 'ใบเสร็จ'}สำหรับรายจ่าย "${form.itemName || 'ยังไม่ระบุ'}"`,
        newValue: { savedPath: paths[0], savedPaths: paths, itemName: form.itemName, date, docType: isTaxUpload ? 'taxinvoice' : 'receipt' },
      }))
    }
  }

  return (
    <>
      <div className="space-y-4">
        <DraftBanner hasDraft={hasDraft} onClear={clearDraft} />
        <DateNavigator date={date} onChange={setDate} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EditableDropdown
            label="รายการจ่าย"
            value={form.itemName}
            onChange={(v) => set('itemName', v)}
            items={quickList}
            onAdd={(name) => logQuickItemAdd(name, form.category)}
            onUpdate={(id, name) => logQuickItemUpdate(id, { name })}
            onDelete={logQuickItemDelete}
            placeholder="พิมพ์หรือเลือกรายการ..."
          />

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">หมวดหมู่</label>
              <Link
                to="/categories"
                className="text-xs text-blue-500 hover:text-blue-700 hover:underline"
              >
                🗂️ จัดการหมวดหมู่
              </Link>
            </div>
            <CategorySelect value={form.category} onChange={(v) => set('category', v)} />
          </div>
        </div>

        {matchingRecurring && (
          <div className="p-2.5 bg-purple-50 rounded-lg border border-purple-200 text-xs text-purple-700">
            🔁 มีรายการประจำ <strong>"{matchingRecurring.name}"</strong> รอจ่ายในหมวดนี้เดือนนี้ — ตรวจสอบที่แท็บ <strong>รายการประจำ</strong> ก่อนบันทึก
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">จำนวนเงิน (บาท)</label>
            <input className="input" type="number" min="0" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-2">
            <div>
              <label className="label">วิธีชำระเงิน</label>
              <select className="input" value={form.method} onChange={(e) => set('method', e.target.value)}>
                <option value="cash">💵 เงินสด</option>
                <option value="transfer">🏦 เงินโอน</option>
                <option value="card">💳 บัตรเครดิต</option>
                <option value="pending">⏳ ค้างชำระ</option>
              </select>
            </div>
            {/* ระบุบัญชีที่จะตัดเงิน */}
            {form.method === 'transfer' && (
              <TransferAccountPicker
                value={form.transferAccountId}
                onChange={(v) => set('transferAccountId', v)}
                label="ตัดจากบัญชี"
              />
            )}
            {form.method === 'card' && (
              <CreditCardPicker
                value={form.cardId}
                onChange={(v) => set('cardId', v)}
                label="รูดบัตร"
              />
            )}
          </div>
        </div>

        {/* ผู้ใช้ไม่ต้องรู้เรื่องวันสรุปยอด — ระบบตอบคำถามเดียวที่เขาสนใจจริงๆ
            คือต้องหาเงินมาจ่ายเมื่อไร */}
        {form.method === 'card' && selectedCard && (
          <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 space-y-2.5">
            {!form.installment && (
              <p className="text-xs text-rose-700">
                💳 ยังไม่ตัดเงินตอนนี้ — รายการนี้จะไปอยู่ในบิลที่ครบกำหนด{' '}
                <strong>{formatThaiDate(nextDueDate(selectedCard.closingDay, selectedCard.dueDay, new Date(date + 'T00:00:00')))}</strong>
              </p>
            )}

            <label className="flex items-center gap-2 text-xs text-rose-800 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 accent-rose-600"
                checked={form.installment}
                onChange={(e) => set('installment', e.target.checked)}
              />
              <span className="font-medium">แบ่งชำระ (ผ่อน)</span>
            </label>

            {form.installment && (
              <div className="space-y-2">
                <div className="flex items-end gap-2 flex-wrap">
                  <div className="w-28">
                    <label className="label">จำนวนงวด</label>
                    <input
                      className="input"
                      type="number"
                      min="1"
                      max="60"
                      value={form.installmentMonths}
                      onChange={(e) => set('installmentMonths', e.target.value)}
                    />
                  </div>
                  <div className="flex gap-1.5 pb-0.5">
                    {MONTH_PRESETS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`btn text-xs py-1 px-2.5 ${String(m) === String(form.installmentMonths) ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => set('installmentMonths', String(m))}
                      >
                        {m} งวด
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="label">ดอกเบี้ย</label>
                  <div className="flex items-end gap-2 flex-wrap">
                    <button
                      type="button"
                      className={`btn text-xs py-1 px-3 ${Number(form.installmentRate) === 0 ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => set('installmentRate', '0')}
                    >
                      ผ่อน 0%
                    </button>
                    <div className="flex items-center gap-1.5">
                      <input
                        className="input w-24"
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.installmentRate}
                        onChange={(e) => set('installmentRate', e.target.value)}
                      />
                      <span className="text-xs text-rose-800 whitespace-nowrap">% ต่อเดือน</span>
                    </div>
                  </div>
                </div>

                {installmentPreview ? (
                  <div className="text-xs text-rose-800 bg-white/70 rounded-lg px-3 py-2 leading-relaxed space-y-0.5">
                    {installmentPreview.interest > 0 ? (
                      <>
                        <div className="flex justify-between gap-3">
                          <span>ราคาสินค้า</span>
                          <span className="tabular-nums">{fmtBaht(installmentPreview.principal)}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span>
                            ดอกเบี้ย {installmentPreview.ratePerMonth}% × {installmentPreview.months} งวด
                          </span>
                          <span className="tabular-nums">+ {fmtBaht(installmentPreview.interest)}</span>
                        </div>
                        <div className="flex justify-between gap-3 border-t border-rose-200 pt-0.5 font-semibold">
                          <span>ยอดผ่อนรวม</span>
                          <span className="tabular-nums">{fmtBaht(installmentPreview.total)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between gap-3 font-semibold">
                        <span>ยอดผ่อนรวม (ผ่อน 0%)</span>
                        <span className="tabular-nums">{fmtBaht(installmentPreview.total)}</span>
                      </div>
                    )}
                    <p className="pt-1">
                      งวดละ <strong>{fmtBaht(installmentPreview.first.amount)}</strong> บาท{' '}
                      {installmentPreview.months} งวด
                      {installmentPreview.hasRemainder && (
                        <> (งวดสุดท้าย {fmtBaht(installmentPreview.last.amount)} บาท)</>
                      )}
                    </p>
                    <p>
                      งวดแรกอยู่ในบิลที่ครบกำหนด <strong>{formatThaiDate(installmentPreview.first.dueDate)}</strong>{' '}
                      งวดสุดท้าย <strong>{formatThaiDate(installmentPreview.last.dueDate)}</strong>
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-rose-600">ใส่จำนวนเงินก่อน ระบบจะคำนวณยอดต่องวดให้</p>
                )}

                <p className="text-xs text-rose-600">
                  ไม่บันทึกรายจ่ายก้อนเดียวตอนนี้ — จะทยอยลงทีละงวดตามที่ธนาคารเรียกเก็บ
                  ติดตามได้ที่แท็บ <strong>ผ่อนชำระ</strong>
                </p>
              </div>
            )}
          </div>
        )}

        {form.method === 'pending' && (
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-2">
            <p className="text-xs text-amber-700 font-medium">⏳ รายการค้างชำระ — ยังไม่ตัดเงินจนกว่าจะชำระ</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="label">วันที่กำหนดชำระ</label>
                <DatePicker value={form.dueDate} onChange={(v) => set('dueDate', v)} placeholder="ไม่ระบุ" />
              </div>
              <div>
                <TransferAccountPicker
                  value={form.pendingAccountId}
                  onChange={(v) => set('pendingAccountId', v)}
                  label="ตั้งบัญชีที่จะจ่าย (ไม่บังคับ)"
                />
              </div>
            </div>
            <p className="text-xs text-amber-600">ตั้งบัญชีไว้แล้ว เวลากดชำระจะตัดจากบัญชีนั้นให้เลย</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EditableDropdown
            label="ผู้ขาย/ร้านค้า"
            value={form.vendor}
            onChange={(v) => set('vendor', v)}
            items={vendorList}
            onAdd={logVendorAdd}
            onUpdate={logVendorUpdate}
            onDelete={logVendorDelete}
            placeholder="พิมพ์หรือเลือกร้านค้า..."
          />
          <div>
            <label className="label">เลขที่ใบเสร็จ</label>
            <input className="input" value={form.receiptNo} onChange={(e) => set('receiptNo', e.target.value)} placeholder="เลขที่ใบเสร็จ (ถ้ามี)" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">ใบกำกับภาษี</label>
            <select className="input" value={form.taxStatus} onChange={(e) => { set('taxStatus', e.target.value); setUploadStatus(null) }}>
              <option value="none">ไม่ต้องการ</option>
              <option value="receipt">ใบเสร็จ</option>
              <option value="received">มีใบกำกับภาษี</option>
              <option value="waiting">รอใบกำกับภาษี</option>
            </select>
            {/* ปุ่ม upload แสดงทันทีตาม taxStatus ที่เลือก */}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <button
                type="button"
                className="btn btn-secondary text-sm py-1.5"
                onClick={() => setUploadOpen(true)}
              >
                {isTaxUpload ? '📎 อัปโหลดใบกำกับภาษี' : '📎 อัปโหลดใบเสร็จ'}
              </button>
              {uploadStatus && (
                <span className="text-emerald-600 text-xs">{uploadStatus}</span>
              )}
            </div>
          </div>
          <div>
            <label className="label">หมายเหตุ</label>
            <input className="input" value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="หมายเหตุ (ถ้ามี)" />
          </div>
        </div>

        {form.taxStatus === 'waiting' && (
          <div className="p-3 bg-orange-50 rounded-xl border border-orange-200 space-y-2">
            <p className="text-xs text-orange-700 font-medium">📋 รอใบกำกับภาษี — ระบบจะสร้างการ์ดติดตามให้อัตโนมัติ</p>
            <div>
              <label className="label">วันที่คาดว่าจะได้รับใบกำกับภาษี</label>
              <DatePicker value={form.taxDueDate} onChange={(v) => set('taxDueDate', v)} placeholder="ไม่ระบุ" />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button className="btn btn-danger px-6" onClick={handleSave} disabled={saving}>
            {saving ? '⏳ กำลังบันทึก…' : '💾 บันทึกรายจ่าย'}
          </button>
          {saved && <span className="text-emerald-600 text-sm font-medium">✓ บันทึกสำเร็จ</span>}
          {errMsg && <span className="text-red-500 text-sm">{errMsg}</span>}
        </div>
      </div>

      <ConfirmPopup
        open={!!warning}
        title="⚠️ ยอดเงินจะติดลบ"
        message={warning?.message ?? ''}
        onConfirm={proceed}
        onCancel={cancel}
        confirmLabel="ยืนยัน (ติดลบ)"
        danger
      />

      {uploadOpen && (
        <FileUploadPopup
          title={isTaxUpload ? 'อัปโหลดใบกำกับภาษี' : 'อัปโหลดใบเสร็จ'}
          description={`วันที่: ${date}`}
          createdAt={new Date(date + 'T00:00:00').toISOString()}
          filenamePrefix={isTaxUpload ? 'taxinvoice' : 'receipt'}
          folderBase={isTaxUpload ? 'taxinvoices' : 'receipts'}
          onConfirm={handleUploadDone}
          onCancel={() => setUploadOpen(false)}
        />
      )}
    </>
  )
}
