import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { Link } from 'react-router-dom'
import DateNavigator from '../../components/shared/DateNavigator'
import DatePicker from '../../components/shared/DatePicker'
import EditableDropdown from '../../components/shared/EditableDropdown'
import CategorySelect from '../../components/shared/CategorySelect'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import FileUploadPopup from '../../components/shared/FileUploadPopup'
import TransferAccountPicker from '../../components/shared/TransferAccountPicker'
import useWalletStore from '../../store/useWalletStore'
import useTransactionStore from '../../store/useTransactionStore'
import usePendingStore from '../../store/usePendingStore'
import useCategoryStore from '../../store/useCategoryStore'
import useRecurringStore from '../../store/useRecurringStore'
import { deductWallet } from '../../lib/walletEngine'
import { buildLogEntry } from '../../lib/logBuilder'
import useLogStore from '../../store/useLogStore'
import { useNegativeConfirm } from '../../hooks/useNegativeConfirm'
import { useFormDraft, DraftBanner } from '../../hooks/useFormDraft'

const EMPTY = {
  itemName: '', category: '', amount: '', method: 'cash', transferAccountId: '', pendingAccountId: '',
  vendor: '', receiptNo: '', taxStatus: 'none', dueDate: '', taxDueDate: '', note: ''
}

export default function ExpenseForm() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [form, setForm, clearDraft, hasDraft] = useFormDraft('expense', EMPTY)
  const [saved, setSaved] = useState(false)
  const [errMsg, setErrMsg] = useState('')
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

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const logVendorAdd = (name) => {
    const item = addVendor(name)
    addLog(buildLogEntry({ activityType: 'VENDOR_CREATE', description: `สร้างผู้ขาย "${name}"`, newValue: item }))
    return item
  }

  const logVendorUpdate = (id, name) => {
    const oldItem = getVendors().find((item) => item.id === id)
    updateVendor(id, name)
    addLog(buildLogEntry({ activityType: 'VENDOR_UPDATE', description: `แก้ไขผู้ขาย "${oldItem?.name ?? id}" → "${name}"`, oldValue: oldItem, newValue: { id, name } }))
  }

  const logVendorDelete = (id) => {
    const oldItem = getVendors().find((item) => item.id === id)
    softDeleteVendor(id)
    addLog(buildLogEntry({ activityType: 'VENDOR_DELETE', description: `ลบผู้ขาย "${oldItem?.name ?? id}"`, oldValue: oldItem }))
  }

  const logQuickItemAdd = (name, categoryId) => {
    const item = addQuickItem(name, categoryId)
    addLog(buildLogEntry({ activityType: 'QUICK_ITEM_CREATE', description: `สร้างรายการด่วน "${name}"`, newValue: item }))
    return item
  }

  const logQuickItemUpdate = (id, changes) => {
    const oldItem = getQuickItems().find((item) => item.id === id)
    updateQuickItem(id, changes)
    addLog(buildLogEntry({ activityType: 'QUICK_ITEM_UPDATE', description: `แก้ไขรายการด่วน "${oldItem?.name ?? id}"`, oldValue: oldItem, newValue: { ...oldItem, ...changes } }))
  }

  const logQuickItemDelete = (id) => {
    const oldItem = getQuickItems().find((item) => item.id === id)
    softDeleteQuickItem(id)
    addLog(buildLogEntry({ activityType: 'QUICK_ITEM_DELETE', description: `ลบรายการด่วน "${oldItem?.name ?? id}"`, oldValue: oldItem }))
  }

  const execute = () => {
    const amt = Number(form.amount)
    const accountId = form.method === 'transfer' ? resolveAccount(form.transferAccountId) : null
    let tx = null

    if (form.method === 'pending') {
      const missingDueDateNote = form.dueDate ? '' : 'ไม่ได้ลงกำหนดชำระเงิน'
      const pending = addPending({
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
      addLog(buildLogEntry({
        activityType: 'OPEN_BILL',
        description: `เปิดบิลรอจ่ายเงิน: "${form.itemName}" ${amt.toLocaleString()} บาท (วันที่เปิด: ${date}) ครบกำหนด: ${form.dueDate || date}${missingDueDateNote ? ` (${missingDueDateNote})` : ''}`,
        newValue: { pendingId: pending.id, itemName: form.itemName, amount: amt, dueDate: form.dueDate || date, openDate: date, missingDueDate: !form.dueDate },
        walletEffect: null,
      }))
    } else {
      tx = addTransaction({
        date, type: 'expense', amount: amt,
        method: form.method, category: form.category, itemName: form.itemName,
        ...(accountId ? { transferAccountId: accountId } : {}),
        vendor: form.vendor, receiptNo: form.receiptNo, taxStatus: form.taxStatus,
        dueDate: null, note: form.note,
        ...(attachments.length > 0 ? {
          attachments,
          documentPath: attachments[0].path,
          documentType: attachments[0].type,
          documentLabel: attachments[0].label,
        } : {}),
      })
      deductWallet(form.method, amt, {
        activityType: 'ADD_EXPENSE',
        description: `จ่าย "${form.itemName}" ${amt.toLocaleString()} บาท`,
        newValue: tx,
      }, accountId)
    }

    if (form.taxStatus === 'waiting') {
      const tax = addTaxInvoice({
        ...(tx ? { transactionId: tx.id } : {}),
        itemName: form.itemName,
        receiptNo: form.receiptNo,
        amount: amt,
        dueDate: form.taxDueDate || null,
        createdAt: new Date(date + 'T00:00:00').toISOString(),
      })
      addLog(buildLogEntry({
        activityType: 'CREATE_TAX_INVOICE',
        description: `สร้างรายการรอใบกำกับภาษี "${form.itemName}" ${amt.toLocaleString()} บาท`,
        newValue: { ...tax, ...(tx ? { transactionId: tx.id } : {}) },
      }))
    }

    clearDraft()
    setSaved(true)
    setUploadStatus(null)
    setAttachments([])
    setTimeout(() => setSaved(false), 2000)
  }

  const handleSave = () => {
    if (!form.itemName) return setErrMsg('กรุณาใส่รายการจ่าย')
    if (!form.amount || Number(form.amount) <= 0) return setErrMsg('กรุณาใส่จำนวนเงิน')
    if (form.method === 'transfer' && !resolveAccount(form.transferAccountId)) {
      return setErrMsg('กรุณาเลือกบัญชีที่จะจ่ายเงินโอน')
    }
    setErrMsg('')
    if (form.method === 'pending') {
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
          </div>
        </div>

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
          <button className="btn btn-danger px-6" onClick={handleSave}>💾 บันทึกรายจ่าย</button>
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
