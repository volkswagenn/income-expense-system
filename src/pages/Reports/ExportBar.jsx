import { useState } from 'react'
import useCategoryStore from '../../store/useCategoryStore'
import useCreditCardStore from '../../store/useCreditCardStore'
import { exportSummary, exportExpenseByCategory } from '../../lib/excelExporter'
import { exportSummaryCsv, exportExpenseByCategoryCsv } from '../../lib/csvExporter'
import { exportReportPdf } from '../../lib/pdfExporter'
import { buildReportRows } from './ReportTable'
import { thaiShortDate } from '../../lib/dateUtils'
import useLogStore from '../../store/useLogStore'
import { buildLogEntry } from '../../lib/logBuilder'

const REPORT_LABELS = {
  daily: 'รายรับ-รายจ่ายรายวัน',
  category: 'แยกตามหมวดหมู่',
  vendor: 'แยกตามผู้ขาย',
  method: 'แยกตามช่องทางจ่าย',
  installment: 'ภาระผ่อนต่อเดือน',
  tax: 'ใบกำกับภาษี',
}

export default function ExportBar({ type, transactions, startDate, endDate }) {
  const { getCategoryName } = useCategoryStore()
  const getCategoryPath = useCategoryStore((s) => s.getCategoryPath)
  const getCardLabel = useCreditCardStore((s) => s.getCardLabel)
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
      setStatus({
        kind: result.verified === false ? 'error' : 'ok',
        // PDF ไม่ได้เขียนไฟล์เอง แค่เปิดกล่องพิมพ์ จึงบอกตามจริงว่าต้องกดต่อ
        msg: result.printed
          ? '✓ เปิดกล่องพิมพ์แล้ว — เลือกปลายทางเป็น “บันทึกเป็น PDF”'
          : `✓ บันทึกแล้ว${loc}${verifiedNote}`,
      })
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

  // ทุกประเภทส่งออกเป็นตารางรูปเดียวกัน (วันที่ · ประเภท · รายการ · จำนวนเงิน)
  // ยกเว้นรายงานแยกหมวดหมู่ที่มีไฟล์เฉพาะอยู่แล้วซึ่งมีคอลัมน์หมวดหมู่เพิ่มมา
  const handleExcel = () =>
    type === 'category'
      ? run(() => exportExpenseByCategory(transactions, getCategoryName, dateRange), 'xlsx')
      : run(() => exportSummary(transactions, getCategoryName, dateRange), 'xlsx')

  const handleCsv = () =>
    type === 'category'
      ? run(() => exportExpenseByCategoryCsv(transactions, getCategoryName, dateRange), 'csv')
      : run(() => exportSummaryCsv(transactions, getCategoryName, dateRange), 'csv')

  /**
   * PDF ใช้ตารางชุดเดียวกับที่เห็นบนหน้าจอ (buildReportRows) ตัวเลขจึงตรงกันเสมอ
   * ไม่ได้เขียนไฟล์ลงเครื่องเอง แต่เปิดกล่องพิมพ์ให้เลือก "บันทึกเป็น PDF"
   */
  const handlePdf = () => run(async () => {
    const rows = buildReportRows(type, transactions, { getCategoryPath, getCardLabel })
    if (rows.length === 0) return { success: false, error: 'ไม่มีข้อมูลในช่วงที่เลือก' }
    const byDate = type === 'daily' || type === 'tax' || type === 'installment'
    const headers = [
      { label: byDate ? 'วันที่' : 'จำนวน' },
      { label: 'รายการ' },
      { label: 'รายรับ', align: 'right' },
      { label: 'รายจ่าย', align: 'right' },
      { label: 'สุทธิ', align: 'right' },
    ]
    const body = rows.map((r) => [
      byDate ? thaiShortDate(r.date) : `${r.count} รายการ`,
      r.label, r.inc, r.exp, r.inc - r.exp,
    ])
    const sum = (k) => rows.reduce((s, r) => s + r[k], 0)
    const res = await exportReportPdf({
      title: REPORT_LABELS[type] ?? type,
      subtitle: `${thaiShortDate(startDate)} – ${thaiShortDate(endDate)} · ${transactions.length} รายการ`,
      headers,
      rows: body,
      totals: ['', 'รวมทั้งหมด', sum('inc'), sum('exp'), sum('inc') - sum('exp')],
    })
    // ไม่รู้ว่าผู้ใช้กดบันทึกหรือกดยกเลิกในกล่องพิมพ์ จึงไม่อ้างว่า "บันทึกแล้ว"
    return res.success ? { success: true, savedPath: null, printed: true } : res
  }, 'pdf')

  const isLoading = status?.kind === 'loading'

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <button
          className="h-8 px-[13px] rounded-[9px] border border-hairline bg-white text-[12.5px] flex items-center gap-1.5 hover:bg-paper disabled:opacity-50"
          onClick={handleExcel}
          disabled={isLoading}
        >
          Excel
        </button>
        <button
          className="h-8 px-[13px] rounded-[9px] border border-hairline bg-white text-[12.5px] flex items-center gap-1.5 hover:bg-paper disabled:opacity-50"
          onClick={handleCsv}
          disabled={isLoading}
        >
          CSV
        </button>
        {/* PDF เป็นปุ่มพื้นเข้มตามแบบ — เป็นรูปแบบที่เอาไปส่งต่อหรือแนบได้เลย */}
        <button
          className="h-8 px-[13px] rounded-[9px] bg-ink text-white text-[12.5px] font-semibold flex items-center gap-1.5 hover:bg-black disabled:opacity-50"
          onClick={handlePdf}
          disabled={isLoading}
          title="เปิดกล่องพิมพ์ แล้วเลือกปลายทางเป็น “บันทึกเป็น PDF”"
        >
          PDF
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
