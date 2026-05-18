import { useState } from 'react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import DateNavigator from '../../components/shared/DateNavigator'
import FileUploadPopup from '../../components/shared/FileUploadPopup'
import useTransactionStore from '../../store/useTransactionStore'
import useLogStore from '../../store/useLogStore'
import usePendingStore from '../../store/usePendingStore'
import { addToWallet } from '../../lib/walletEngine'
import { buildLogEntry } from '../../lib/logBuilder'
import { useFormDraft, DraftBanner } from '../../hooks/useFormDraft'

const EMPTY = { cash: '', transfer: '', otherAmount: '', otherType: '', otherMethod: '', note: '', detail: '', docType: 'none' }

function RecentTransactions() {
  const { transactions } = useTransactionStore()
  const recent = [...transactions]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8)

  if (recent.length === 0) return null

  return (
    <div className="border-t border-gray-100 pt-4 space-y-2">
      <p className="text-sm font-semibold text-gray-700">การทำรายการล่าสุด</p>
      <div className="space-y-1.5">
        {recent.map((tx) => {
          const isIncome = tx.type === 'income'
          return (
            <div key={tx.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${isIncome ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {isIncome ? 'รับ' : 'จ่าย'}
                </span>
                <span className="text-sm text-gray-700 truncate">{tx.itemName || '—'}</span>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {format(new Date(tx.date), 'd MMM', { locale: th })}
                </span>
              </div>
              <span className={`text-sm font-semibold tabular-nums ml-2 flex-shrink-0 ${isIncome ? 'text-emerald-600' : 'text-red-600'}`}>
                {isIncome ? '+' : '-'}{tx.amount.toLocaleString()}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function IncomeForm() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [form, setForm, clearDraft, hasDraft] = useFormDraft('income', EMPTY)
  const [saved, setSaved] = useState(false)
  const [savedMsg, setSavedMsg] = useState('✓ บันทึกสำเร็จ')
  const [errMsg, setErrMsg] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadStatus, setUploadStatus] = useState(null)
  const [attachments, setAttachments] = useState([])
  // pending income state
  const [isPendingMode, setIsPendingMode] = useState(false)

  const { addTransaction } = useTransactionStore()
  const { addLog } = useLogStore()
  const { addPendingIncome } = usePendingStore()

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const cashAmt = Number(form.cash) || 0
  const transferAmt = Number(form.transfer) || 0
  const otherAmt = Number(form.otherAmount) || 0
  const handleSave = () => {
    if (!cashAmt && !transferAmt && !otherAmt) return setErrMsg('กรุณาใส่จำนวนเงินอย่างน้อย 1 ช่อง')
    if (otherAmt > 0 && !form.otherType) return setErrMsg('กรุณาระบุประเภทรายรับอื่นๆ')
    if (otherAmt > 0 && !isPendingMode && !form.otherMethod) return setErrMsg('กรุณาเลือกว่ารายรับอื่นๆ เข้ากระเป๋าไหน')
    setErrMsg('')

    // ── PENDING MODE: รวมทุกยอดเป็น pendingIncome เดียว ──
    if (isPendingMode) {
      const totalAmt = cashAmt + transferAmt + otherAmt
      const parts = []
      if (cashAmt > 0) parts.push(`สด ${cashAmt.toLocaleString()}`)
      if (transferAmt > 0) parts.push(`โอน ${transferAmt.toLocaleString()}`)
      if (otherAmt > 0) parts.push(`${form.otherType || 'อื่นๆ'} ${otherAmt.toLocaleString()}`)

      const noteText = [form.note, parts.join(' / ')].filter(Boolean).join(' | ')
      const item = addPendingIncome({
        date,
        amount: totalAmt,
        description: `เปิดบิลรอรับเงิน ${date}`,
        note: noteText,
        source: !cashAmt && !transferAmt ? 'other' : 'main',
        otherIncomeType: otherAmt > 0 ? (form.otherType || 'อื่นๆ') : undefined,
        ...(attachments.length > 0 ? {
          attachments,
          documentPath: attachments[0].path,
          documentType: attachments[0].type,
          documentLabel: attachments[0].label,
        } : {}),
      })
      addLog(buildLogEntry({
        activityType: 'OPEN_BILL_INCOME',
        description: `เปิดบิลรอรับเงิน ${totalAmt.toLocaleString()} บาท (${date}) — ${parts.join(' / ')}`,
        newValue: { pendingIncomeId: item.id, amount: totalAmt, billDate: date },
      }))

      clearDraft()
      setIsPendingMode(false)
      setSavedMsg('✓ สร้างรายการรอรับเงินแล้ว')
      setSaved(true)
      setUploadStatus(null)
      setAttachments([])
      setTimeout(() => setSaved(false), 3000)
      return
    }

    // ── NORMAL MODE ──
    if (cashAmt > 0) {
      const tx = addTransaction({ date, type: 'income', amount: cashAmt, method: 'cash', note: form.note, detail: form.detail, itemName: 'รายรับเงินสด', ...(attachments.length > 0 ? { attachments, documentPath: attachments[0].path, documentType: attachments[0].type, documentLabel: attachments[0].label } : {}) })
      addToWallet('cash', cashAmt, { activityType: 'ADD_INCOME_MAIN', description: `รับเงินสด ${cashAmt.toLocaleString()} บาท`, newValue: tx })
    }
    if (transferAmt > 0) {
      const tx = addTransaction({ date, type: 'income', amount: transferAmt, method: 'transfer', note: form.note, detail: form.detail, itemName: 'รายรับเงินโอน', ...(attachments.length > 0 ? { attachments, documentPath: attachments[0].path, documentType: attachments[0].type, documentLabel: attachments[0].label } : {}) })
      addToWallet('transfer', transferAmt, { activityType: 'ADD_INCOME_MAIN', description: `รับเงินโอน ${transferAmt.toLocaleString()} บาท`, newValue: tx })
    }
    if (otherAmt > 0) {
      const method = form.otherMethod || 'cash'
      const tx = addTransaction({
        date, type: 'income', amount: otherAmt, method,
        otherIncomeType: form.otherType,
        note: form.note, detail: form.detail,
        itemName: form.otherType || 'รายรับอื่นๆ',
        ...(attachments.length > 0 ? { attachments, documentPath: attachments[0].path, documentType: attachments[0].type, documentLabel: attachments[0].label } : {}),
      })
      addToWallet(method, otherAmt, {
        activityType: 'ADD_OTHER_INCOME',
        description: `${form.otherType} ${otherAmt.toLocaleString()} บาท → กระเป๋า${method === 'cash' ? 'เงินสด' : 'เงินโอน'}`,
        newValue: tx,
      })
    }

    clearDraft()
    setSavedMsg('✓ บันทึกสำเร็จ')
    setSaved(true)
    setUploadStatus(null)
    setAttachments([])
    setTimeout(() => setSaved(false), 2000)
  }

  const isTaxUpload = form.docType === 'taxinvoice'

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
        description: `อัปโหลด${isTaxUpload ? 'ไฟล์ใบกำกับภาษี' : 'ใบเสร็จ'}สำหรับรายรับ (${date})`,
        newValue: { savedPath: paths[0], savedPaths: paths, date, docType: form.docType },
      }))
    }
  }

  return (
    <div className="space-y-5">
      <DraftBanner hasDraft={hasDraft} onClear={clearDraft} />
      <div className="flex items-center gap-3">
        <DateNavigator date={date} onChange={setDate} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">💵 เงินสด (บาท)</label>
          <input className="input" type="number" min="0" value={form.cash} onChange={(e) => set('cash', e.target.value)} placeholder="0" />
        </div>
        <div>
          <label className="label">🏦 เงินโอน (บาท)</label>
          <input className="input" type="number" min="0" value={form.transfer} onChange={(e) => set('transfer', e.target.value)} placeholder="0" />
        </div>
      </div>

      {/* รายรับอื่นๆ */}
      <div className="space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">รายรับอื่นๆ (บาท)</label>
            <input className="input" type="number" min="0" value={form.otherAmount} onChange={(e) => set('otherAmount', e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="label">ประเภทรายรับอื่นๆ</label>
            <input className="input" value={form.otherType} onChange={(e) => set('otherType', e.target.value)} placeholder="เช่น บัตรเครดิต, ดอกเบี้ย" />
          </div>
        </div>

        {/* Wallet selector — แสดงตลอดเมื่อไม่อยู่ใน pending mode */}
        {!isPendingMode && (
          <div className="px-1">
            <label className="label text-xs mb-1">เข้ากระเป๋า</label>
            <div className="flex flex-wrap gap-4">
              {[
                { value: 'cash', label: '💵 เงินสด' },
                { value: 'transfer', label: '🏦 เงินโอน' },
              ].map(({ value, label }) => (
                <label key={value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="otherMethod"
                    value={value}
                    checked={form.otherMethod === value}
                    onChange={() => set('otherMethod', value)}
                    className="accent-emerald-600"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        )}
        {isPendingMode && (
          <p className="text-xs text-amber-600 px-1">รวมเป็นรายการรอรับเงินเดียวกัน</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">ประเภทเอกสาร</label>
          <select className="input" value={form.docType} onChange={(e) => { set('docType', e.target.value); setUploadStatus(null) }}>
            <option value="none">ไม่ต้องการ</option>
            <option value="receipt">ใบเสร็จ</option>
            <option value="taxinvoice">มีใบกำกับภาษี</option>
            <option value="waiting_tax">รอใบกำกับภาษี</option>
          </select>
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

      <div>
        <label className="label">รายละเอียด</label>
        <textarea className="input resize-none" rows={2} value={form.detail} onChange={(e) => set('detail', e.target.value)} placeholder="รายละเอียดเพิ่มเติม" />
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {isPendingMode ? (
          <button className="btn btn-warning px-6" onClick={handleSave}>
            📋 สร้างรายการรอรับเงิน ({(cashAmt + transferAmt + otherAmt).toLocaleString()} บาท)
          </button>
        ) : (
          <button className="btn btn-success px-6" onClick={handleSave}>💾 บันทึกรายรับ</button>
        )}

        <button
          type="button"
          className={`btn text-sm ${isPendingMode ? 'btn-secondary' : 'btn-warning'}`}
          onClick={() => setIsPendingMode((v) => !v)}
        >
          {isPendingMode ? 'ยกเลิกโหมดรอรับเงิน' : 'เปิดบิลรอรับเงิน'}
        </button>

        {saved && <span className="text-emerald-600 text-sm font-medium">{savedMsg}</span>}
        {errMsg && <span className="text-red-500 text-sm">{errMsg}</span>}
      </div>

      <RecentTransactions />

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
    </div>
  )
}
