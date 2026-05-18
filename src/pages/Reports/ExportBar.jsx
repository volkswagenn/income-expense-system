import { useState } from 'react'
import useCategoryStore from '../../store/useCategoryStore'
import {
  exportDailyIncome, exportIncomeByType, exportExpenses,
  exportExpenseByCategory, exportSummary
} from '../../lib/excelExporter'
import {
  exportDailyIncomeCsv, exportIncomeByTypeCsv, exportExpensesCsv,
  exportExpenseByCategoryCsv, exportSummaryCsv
} from '../../lib/csvExporter'
import useLogStore from '../../store/useLogStore'
import { buildLogEntry } from '../../lib/logBuilder'

const REPORT_LABELS = {
  daily_income: 'รายรับรวมตามรายวัน',
  income_by_type: 'รายรับแยกประเภท',
  expense: 'รายจ่าย',
  expense_by_cat: 'รายจ่ายแยกประเภท',
  summary: 'รายรับ-รายจ่ายรวม',
}

export default function ExportBar({ type, transactions, startDate, endDate }) {
  const { getCategoryName } = useCategoryStore()
  const { addLog } = useLogStore()
  const dateRange = `${startDate}_${endDate}`
  const [status, setStatus] = useState(null) // null | { kind: 'loading'|'ok'|'error', msg: string }

  const run = async (fn, format) => {
    setStatus({ kind: 'loading', msg: 'กำลังสร้างไฟล์...' })
    try {
      const result = await fn()
      if (result?.cancelled) { setStatus(null); return }
      if (!result?.success) throw new Error(result?.error ?? 'บันทึกไม่สำเร็จ')
      const verifiedNote = result.verified === false ? ' ⚠️ ไม่พบไฟล์หลังบันทึก' : ''
      const loc = result.savedPath ? ` — ${result.savedPath}` : ''
      setStatus({ kind: result.verified === false ? 'error' : 'ok', msg: `✓ บันทึกแล้ว${loc}${verifiedNote}` })
      addLog(buildLogEntry({
        activityType: 'REPORT_EXPORT',
        description: `ส่งออกรายงาน ${REPORT_LABELS[type] ?? type} เป็น ${format.toUpperCase()} (${dateRange})`,
        newValue: { type, format, startDate, endDate, rowCount: transactions.length, savedPath: result.savedPath ?? null },
      }))
      setTimeout(() => setStatus(null), 6000)
    } catch (err) {
      setStatus({ kind: 'error', msg: `⚠️ ${err.message}` })
      addLog(buildLogEntry({
        activityType: 'REPORT_EXPORT',
        description: `ส่งออกรายงาน ${REPORT_LABELS[type] ?? type} เป็น ${format.toUpperCase()} ไม่สำเร็จ`,
        status: 'error',
        errorMessage: err.message,
        newValue: { type, format, startDate, endDate },
      }))
    }
  }

  const handleExcel = () => {
    if (type === 'daily_income') return run(() => exportDailyIncome(transactions, dateRange), 'xlsx')
    if (type === 'income_by_type') return run(() => exportIncomeByType(transactions, dateRange), 'xlsx')
    if (type === 'expense') return run(() => exportExpenses(transactions, getCategoryName, dateRange), 'xlsx')
    if (type === 'expense_by_cat') return run(() => exportExpenseByCategory(transactions, getCategoryName, dateRange), 'xlsx')
    if (type === 'summary') return run(() => exportSummary(transactions, getCategoryName, dateRange), 'xlsx')
  }

  const handleCsv = () => {
    if (type === 'daily_income') return run(() => exportDailyIncomeCsv(transactions, dateRange), 'csv')
    if (type === 'income_by_type') return run(() => exportIncomeByTypeCsv(transactions, dateRange), 'csv')
    if (type === 'expense') return run(() => exportExpensesCsv(transactions, getCategoryName, dateRange), 'csv')
    if (type === 'expense_by_cat') return run(() => exportExpenseByCategoryCsv(transactions, getCategoryName, dateRange), 'csv')
    if (type === 'summary') return run(() => exportSummaryCsv(transactions, getCategoryName, dateRange), 'csv')
  }

  const isLoading = status?.kind === 'loading'

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <button className="btn btn-success" onClick={handleExcel} disabled={isLoading}>
          📊 Excel
        </button>
        <button className="btn btn-secondary" onClick={handleCsv} disabled={isLoading}>
          📄 CSV
        </button>
      </div>
      {status && (
        <p className={`text-xs ${
          status.kind === 'ok' ? 'text-emerald-600' :
          status.kind === 'error' ? 'text-red-600' : 'text-blue-600'
        }`}>
          {status.msg}
        </p>
      )}
    </div>
  )
}
