import { useState, useRef } from 'react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import useTransactionStore from '../../store/useTransactionStore'
import useLogStore from '../../store/useLogStore'
import { buildLogEntry } from '../../lib/logBuilder'
import { clearDates, importEntry, runImport } from '../../lib/importRunner'
import TransferAccountPicker from '../../components/shared/TransferAccountPicker'
import useWalletStore from '../../store/useWalletStore'
import { parseImportFile } from '../../lib/importParser'
import ConfirmPopup from '../../components/shared/ConfirmPopup'

const COL_MAPS = {
  daily:   { 'วันที่': 'date', 'ยอดรวม (บาท)': 'total', 'หมายเหตุ': 'note' },
  bytype:  { 'วันที่': 'date', 'เงินสด (บาท)': 'cash', 'เงินโอน (บาท)': 'transfer', 'หมายเหตุ': 'note' },
  summary: { 'วันที่': 'date', 'รายรับ (บาท)': 'income', 'รายจ่าย (บาท)': 'expense', 'หมายเหตุ': 'note' },
}

function hasValue(row, formType) {
  if (formType === 'daily') return Number(row.total) > 0
  if (formType === 'bytype') return Number(row.cash) > 0 || Number(row.transfer) > 0
  if (formType === 'summary') return Number(row.income) > 0 || Number(row.expense) > 0
  return false
}

function RowValue({ row, formType }) {
  if (formType === 'daily') {
    const v = Number(row.total) || 0
    return <span className={v > 0 ? 'text-emerald-700 font-medium' : 'text-gray-400'}>{v > 0 ? v.toLocaleString() : '—'}</span>
  }
  if (formType === 'bytype') {
    const cash = Number(row.cash) || 0
    const transfer = Number(row.transfer) || 0
    return (
      <span className="text-sm space-x-2">
        {cash > 0 && <span className="text-gray-700">สด {cash.toLocaleString()}</span>}
        {transfer > 0 && <span className="text-blue-600">โอน {transfer.toLocaleString()}</span>}
        {!cash && !transfer && <span className="text-gray-400">—</span>}
      </span>
    )
  }
  if (formType === 'summary') {
    const income = Number(row.income) || 0
    const expense = Number(row.expense) || 0
    return (
      <span className="text-sm space-x-2">
        {income > 0 && <span className="text-emerald-600">รับ {income.toLocaleString()}</span>}
        {expense > 0 && <span className="text-red-600">จ่าย {expense.toLocaleString()}</span>}
        {!income && !expense && <span className="text-gray-400">—</span>}
      </span>
    )
  }
  return null
}

export default function ImportUploader({ formType, onDone }) {
  const [parsedRows, setParsedRows] = useState(null)
  const [overwriteDates, setOverwriteDates] = useState(new Set())
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [doneMsg, setDoneMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)

  const { transactions } = useTransactionStore()
  const { addLog } = useLogStore()
  const [accountId, setAccountId] = useState('')
  const resolveAccount = useWalletStore((s) => s.resolveTransferAccountId)

  const datesWithData = parsedRows
    ? new Set(parsedRows.filter((r) => transactions.some((t) => t.date === r.date)).map((r) => r.date))
    : new Set()

  const allChecked = datesWithData.size > 0 && [...datesWithData].every((d) => overwriteDates.has(d))

  const handleFile = async (f) => {
    setError('')
    setParsedRows(null)
    setDone(false)
    try {
      const buf = await f.arrayBuffer()
      const rows = parseImportFile(buf, COL_MAPS[formType])
      if (rows.length === 0) { setError('ไม่พบข้อมูลในไฟล์ หรือรูปแบบคอลัมน์ไม่ถูกต้อง'); return }
      setParsedRows(rows)
      const existing = new Set(rows.filter((r) => transactions.some((t) => t.date === r.date)).map((r) => r.date))
      setOverwriteDates(existing)
    } catch (err) {
      setError(err.message || 'อ่านไฟล์ไม่สำเร็จ')
    }
  }

  const toggleDate = (date) => {
    setOverwriteDates((prev) => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  const toggleAll = () => {
    if (allChecked) setOverwriteDates(new Set())
    else setOverwriteDates(new Set(datesWithData))
  }

  const validRows = parsedRows ? parsedRows.filter((r) => hasValue(r, formType)) : []

  /**
   * นำเข้าทั้งชุด — ต้องทำตามลำดับจริงๆ ไม่ใช่ยิงทิ้งไว้แบบเดิม
   *
   * ของเดิมวน forEach แล้วเรียก deleteByDate กับ addTransaction โดยไม่ await
   * ทั้งคู่เป็น async ผลคือคำสั่งลบวันเดิมยังทำงานค้างอยู่ตอนที่รายการใหม่ถูกส่งไปแล้ว
   * รายการที่เพิ่งนำเข้าจึงถูกคำสั่งลบที่ตามมาทีหลังลบทิ้งไปด้วยแบบสุ่ม
   * (ขึ้นกับว่าคำสั่งไหนถึงเซิร์ฟเวอร์ก่อน) แล้วหน้าจอก็ยังขึ้นว่าสำเร็จ
   */
  const execute = async () => {
    if (saving) return
    // เงินโอนที่นำเข้าทั้งชุดจะลงบัญชีเดียวกันที่เลือกไว้
    const acct = resolveAccount(accountId)

    const entries = []
    let totalIncome = 0, totalExpense = 0

    validRows.forEach((r) => {
      if (formType === 'daily') {
        const amt = Number(r.total) || 0
        if (amt > 0) {
          entries.push(importEntry(
            { date: r.date, type: 'income', amount: amt, method: 'cash', itemName: 'รายรับรวม (นำเข้าข้อมูล)', note: r.note ?? '' },
            `นำเข้ารายรับรวม ${amt.toLocaleString()} บาท (${r.date})`))
          totalIncome += amt
        }
      } else if (formType === 'bytype') {
        const cash = Number(r.cash) || 0
        const transfer = Number(r.transfer) || 0
        if (cash > 0) {
          entries.push(importEntry(
            { date: r.date, type: 'income', amount: cash, method: 'cash', itemName: 'รายรับเงินสด (นำเข้าข้อมูล)', note: r.note ?? '' },
            `นำเข้ารายรับเงินสด ${cash.toLocaleString()} บาท (${r.date})`))
          totalIncome += cash
        }
        if (transfer > 0 && acct) {
          entries.push(importEntry(
            { date: r.date, type: 'income', amount: transfer, method: 'transfer', transferAccountId: acct, itemName: 'รายรับเงินโอน (นำเข้าข้อมูล)', note: r.note ?? '' },
            `นำเข้ารายรับเงินโอน ${transfer.toLocaleString()} บาท (${r.date})`))
          totalIncome += transfer
        }
      } else if (formType === 'summary') {
        const income = Number(r.income) || 0
        const expense = Number(r.expense) || 0
        if (income > 0) {
          entries.push(importEntry(
            { date: r.date, type: 'income', amount: income, method: 'cash', itemName: 'รายรับ (นำเข้าข้อมูล)', note: r.note ?? '' },
            `นำเข้ารายรับ ${income.toLocaleString()} บาท (${r.date})`))
          totalIncome += income
        }
        if (expense > 0) {
          entries.push(importEntry(
            { date: r.date, type: 'expense', amount: expense, method: 'cash', itemName: 'รายจ่าย (นำเข้าข้อมูล)', note: r.note ?? '' },
            `นำเข้ารายจ่าย ${expense.toLocaleString()} บาท (${r.date})`))
          totalExpense += expense
        }
      }
    })

    setConfirm(false)
    setSaving(true)
    setError('')
    try {
      // ลบให้จบก่อน แล้วค่อยเขียนของใหม่ — ห้ามสลับหรือทำพร้อมกัน
      // clearDates คืนเงินของรายการเก่าให้ถูกกระเป๋าผ่าน RPC เดียวกับตอนยกเลิกรายการ
      const removed = overwriteDates.size > 0 ? await clearDates([...overwriteDates]) : 0
      await runImport(entries)

      const overwriteNote = overwriteDates.size > 0 ? ` (เขียนทับข้อมูล ${overwriteDates.size} วัน)` : ''
      addLog(buildLogEntry({
        activityType: 'IMPORT_DATA',
        description: `นำเข้าข้อมูลจากไฟล์ ${validRows.length} แถว รายรับ ${totalIncome.toLocaleString()} บาท${totalExpense > 0 ? ` รายจ่าย ${totalExpense.toLocaleString()} บาท` : ''}${overwriteNote}`,
        newValue: { count: validRows.length, income: totalIncome, expense: totalExpense, overwritten: overwriteDates.size, removedTransactions: removed },
      }))

      setDone(true)
      setDoneMsg(`นำเข้าสำเร็จ ${entries.length} รายการ${overwriteNote}`)
      if (onDone) onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const confirmMsg = [
    `นำเข้าข้อมูล ${validRows.length} แถว`,
    overwriteDates.size > 0
      ? `\n⚠️ จะเขียนทับข้อมูลเดิม ${overwriteDates.size} วัน (ลบทุกรายการในวันที่เลือก)`
      : '',
    '\nยืนยันหรือไม่?',
  ].join('')

  return (
    <div className="space-y-4">
      {done ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700">
          ✓ {doneMsg}
        </div>
      ) : (
        <>
          {/* File picker */}
          <div className="flex items-center gap-3">
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
            <button className="btn btn-secondary" onClick={() => inputRef.current?.click()}>
              📂 เลือกไฟล์ CSV / Excel
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">⚠️ {error}</p>
          )}

          {parsedRows && (
            <>
              {/* บัญชีปลายทางของยอดเงินโอนที่นำเข้า */}
              {formType === 'bytype' && validRows.some((r) => Number(r.transfer) > 0) && (
                <div className="max-w-sm">
                  <TransferAccountPicker value={accountId} onChange={setAccountId} label="เงินโอนเข้าบัญชี" />
                </div>
              )}

              {/* Overwrite notice */}
              {datesWithData.size > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                  <p className="text-sm text-amber-800 font-medium">
                    ⚠️ พบข้อมูลเดิมใน {datesWithData.size} วัน — เลือกวันที่ต้องการเขียนทับ
                  </p>
                  <label className="flex items-center gap-2 text-sm text-amber-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={toggleAll}
                      className="w-4 h-4 accent-amber-500"
                    />
                    เลือกทั้งหมด
                  </label>
                </div>
              )}

              {/* Preview table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="py-2 pr-3 text-left font-medium text-gray-600 min-w-32">วันที่</th>
                      <th className="py-2 pr-3 text-left font-medium text-gray-600">ข้อมูล</th>
                      <th className="py-2 text-left font-medium text-gray-600">หมายเหตุ</th>
                      {datesWithData.size > 0 && (
                        <th className="py-2 pl-2 text-center font-medium text-amber-600 w-20">เขียนทับ</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((row) => {
                      const hasExisting = datesWithData.has(row.date)
                      return (
                        <tr key={row.date} className={`border-b border-gray-100 ${hasExisting ? 'bg-amber-50/40' : ''}`}>
                          <td className="py-1.5 pr-3 text-gray-600 whitespace-nowrap">
                            {(() => {
                              try { return format(new Date(row.date), 'EEE d MMM', { locale: th }) } catch { return row.date }
                            })()}
                            {hasExisting && <span className="ml-1 text-xs text-amber-600">●</span>}
                          </td>
                          <td className="py-1.5 pr-3">
                            <RowValue row={row} formType={formType} />
                          </td>
                          <td className="py-1.5 text-gray-500 text-xs">{row.note}</td>
                          {datesWithData.size > 0 && (
                            <td className="py-1.5 pl-2 text-center">
                              {hasExisting ? (
                                <input
                                  type="checkbox"
                                  checked={overwriteDates.has(row.date)}
                                  onChange={() => toggleDate(row.date)}
                                  className="w-4 h-4 accent-amber-500"
                                />
                              ) : null}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-gray-500">{parsedRows.length} แถวทั้งหมด — มีข้อมูล {validRows.length} แถว</p>

              <button
                className="btn btn-primary"
                disabled={validRows.length === 0}
                onClick={() => setConfirm(true)}
              >
                📥 นำเข้าข้อมูล ({validRows.length} แถว)
              </button>
            </>
          )}
        </>
      )}

      <ConfirmPopup
        open={confirm}
        title="ยืนยันการนำเข้าข้อมูล"
        message={confirmMsg}
        onConfirm={execute}
        onCancel={() => setConfirm(false)}
        confirmLabel="ยืนยันนำเข้า"
        danger={overwriteDates.size > 0}
      />
    </div>
  )
}
