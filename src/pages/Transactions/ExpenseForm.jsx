import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import DateNavigator from '../../components/shared/DateNavigator'
import EditableDropdown from '../../components/shared/EditableDropdown'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import FileUploadPopup from '../../components/shared/FileUploadPopup'
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
  itemName: '', category: '', amount: '', method: 'cash',
  vendor: '', receiptNo: '', taxStatus: 'none', dueDate: '', taxDueDate: '', note: ''
}

// ── Category manager popup ────────────────────────────────────────────────────
function CategoryManagerPopup({ categories, onAdd, onUpdate, onDelete, onClose }) {
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [deleteCat, setDeleteCat] = useState(null)

  const handleAdd = () => {
    const name = newName.trim()
    if (!name) return
    onAdd(name, 'expense')
    setNewName('')
  }

  const saveEdit = (id) => {
    if (editingName.trim()) onUpdate(id, editingName.trim())
    setEditingId(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between bg-gray-50">
          <h3 className="font-semibold text-base">🗂️ จัดการหมวดหมู่รายจ่าย</h3>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onClose}>×</button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            <input
              className="input text-sm py-1.5 flex-1"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="ชื่อหมวดหมู่ใหม่..."
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <button className="btn btn-primary text-sm px-3" onClick={handleAdd}>+ เพิ่ม</button>
          </div>

          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {categories.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-3">ยังไม่มีหมวดหมู่</p>
            )}
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                {editingId === cat.id ? (
                  <>
                    <input
                      className="input text-sm py-1 flex-1"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(cat.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      autoFocus
                    />
                    <button className="btn btn-primary text-xs py-1 px-2" onClick={() => saveEdit(cat.id)}>บันทึก</button>
                    <button className="btn btn-secondary text-xs py-1 px-2" onClick={() => setEditingId(null)}>ยกเลิก</button>
                  </>
                ) : (
                  <>
                    <span className="text-sm flex-1 text-gray-800">{cat.name}</span>
                    <button
                      className="text-xs text-blue-500 hover:text-blue-700 px-1"
                      onClick={() => { setEditingId(cat.id); setEditingName(cat.name) }}
                    >แก้ไข</button>
                    <button
                      className="text-xs text-red-400 hover:text-red-600 px-1"
                      onClick={() => setDeleteCat(cat)}
                    >ลบ</button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 py-3 border-t bg-gray-50 flex justify-end">
          <button className="btn btn-secondary" onClick={onClose}>ปิด</button>
        </div>
      </div>

      <ConfirmPopup
        open={!!deleteCat}
        title="ลบหมวดหมู่"
        message={`ลบหมวดหมู่ "${deleteCat?.name}"?`}
        onConfirm={() => { onDelete(deleteCat.id); setDeleteCat(null) }}
        onCancel={() => setDeleteCat(null)}
        confirmLabel="ลบ"
        danger
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ExpenseForm() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [form, setForm, clearDraft, hasDraft] = useFormDraft('expense', EMPTY)
  const [saved, setSaved] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const [catPopup, setCatPopup] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadStatus, setUploadStatus] = useState(null)
  const [attachments, setAttachments] = useState([])
  const { warning, check, proceed, cancel } = useNegativeConfirm()

  const { addTransaction } = useTransactionStore()
  const { addPending, addTaxInvoice } = usePendingStore()
  const {
    addCategory, updateCategory, softDeleteCategory,
    addVendor, updateVendor, softDeleteVendor,
    addQuickItem, updateQuickItem, softDeleteQuickItem,
    getCategories, getVendors, getQuickItems,
  } = useCategoryStore()
  const { addLog } = useLogStore()

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const logCategoryAdd = (name, type) => {
    const item = addCategory(name, type)
    addLog(buildLogEntry({ activityType: 'CATEGORY_CREATE', description: `สร้างหมวดหมู่รายจ่าย "${name}"`, newValue: item }))
    return item
  }

  const logCategoryUpdate = (id, name) => {
    const oldItem = getCategories('expense').find((item) => item.id === id)
    updateCategory(id, name)
    addLog(buildLogEntry({ activityType: 'CATEGORY_UPDATE', description: `แก้ไขหมวดหมู่ "${oldItem?.name ?? id}" → "${name}"`, oldValue: oldItem, newValue: { id, name } }))
  }

  const logCategoryDelete = (id) => {
    const oldItem = getCategories('expense').find((item) => item.id === id)
    softDeleteCategory(id)
    addLog(buildLogEntry({ activityType: 'CATEGORY_DELETE', description: `ลบหมวดหมู่ "${oldItem?.name ?? id}"`, oldValue: oldItem }))
  }

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
      })
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
    setErrMsg('')
    if (form.method === 'pending') {
      execute()
    } else {
      check({ method: form.method, amount: Number(form.amount), onConfirm: execute })
    }
  }

  const expenseCategories = getCategories('expense')
  const vendorList = getVendors()
  const quickList = getQuickItems()

  const recurringAllItems = useRecurringStore((s) => s.items)
  const recurringEntries = useRecurringStore((s) => s.entries)
  const currentMonth = format(new Date(), 'yyyy-MM')
  const matchingRecurring = useMemo(() => {
    if (!form.category) return null
    const pendingThisMonth = recurringEntries.filter(
      (e) => e.month === currentMonth && e.status === 'pending'
    )
    for (const entry of pendingThisMonth) {
      const item = recurringAllItems.find((it) => it.id === entry.recurringId && it.category === form.category)
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
              <button
                className="text-xs text-blue-500 hover:text-blue-700 hover:underline"
                onClick={() => setCatPopup(true)}
              >
                🗂️ จัดการหมวดหมู่
              </button>
            </div>
            <select
              className="input"
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
            >
              <option value="">เลือกหมวดหมู่...</option>
              {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
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
          <div>
            <label className="label">วิธีชำระเงิน</label>
            <select className="input" value={form.method} onChange={(e) => set('method', e.target.value)}>
              <option value="cash">💵 เงินสด</option>
              <option value="transfer">🏦 เงินโอน</option>
              <option value="pending">⏳ ค้างชำระ</option>
            </select>
          </div>
        </div>

        {form.method === 'pending' && (
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-2">
            <p className="text-xs text-amber-700 font-medium">⏳ รายการค้างชำระ — ยังไม่ตัดเงินจนกว่าจะชำระ</p>
            <div>
              <label className="label">วันที่กำหนดชำระ</label>
              <input className="input" type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
            </div>
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
              <input className="input" type="date" value={form.taxDueDate} onChange={(e) => set('taxDueDate', e.target.value)} />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button className="btn btn-danger px-6" onClick={handleSave}>💾 บันทึกรายจ่าย</button>
          {saved && <span className="text-emerald-600 text-sm font-medium">✓ บันทึกสำเร็จ</span>}
          {errMsg && <span className="text-red-500 text-sm">{errMsg}</span>}
        </div>
      </div>

      {catPopup && (
        <CategoryManagerPopup
          categories={expenseCategories}
          onAdd={logCategoryAdd}
          onUpdate={logCategoryUpdate}
          onDelete={logCategoryDelete}
          onClose={() => setCatPopup(false)}
        />
      )}

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
