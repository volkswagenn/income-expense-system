import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { saveAppFile } from './fileHelper'
import { localDateStr } from './dateUtils'

function dateStr(d) {
  try { return format(new Date(d), 'dd/MM/yyyy', { locale: th }) } catch { return d ?? '' }
}

function dtStr(d) {
  try { return format(new Date(d), 'dd/MM/yyyy HH:mm', { locale: th }) } catch { return d ?? '' }
}

function buildWorkbook(sheets) {
  const wb = XLSX.utils.book_new()
  for (const { name, data } of sheets) {
    const ws = XLSX.utils.json_to_sheet(data)
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  return wb
}

async function download(wb, filename) {
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return saveAppFile(new Uint8Array(buf), 'reports', filename)
}

// รายรับรวมตามรายวัน
export async function exportDailyIncome(transactions, dateRange) {
  const isOther = (t) => !!t.otherIncomeType || t.method === 'other'
  const rows = transactions
    .filter((t) => t.type === 'income')
    .map((t) => ({
      วันที่: dateStr(t.date),
      เงินสด: !isOther(t) && t.method === 'cash' ? t.amount : 0,
      เงินโอน: !isOther(t) && t.method === 'transfer' ? t.amount : 0,
      รายรับอื่นๆ: isOther(t) ? t.amount : 0,
      รวม: t.amount,
      หมายเหตุ: t.note ?? '',
    }))
  const wb = buildWorkbook([{ name: 'รายรับรายวัน', data: rows }])
  return download(wb, `รายรับรายวัน_${dateRange}.xlsx`)
}

// รายรับแยกประเภท
export async function exportIncomeByType(transactions, dateRange) {
  const methodLabel = (t) => t.method === 'cash' ? 'เงินสด' : t.method === 'transfer' ? 'เงินโอน' : 'อื่นๆ'
  const rows = transactions
    .filter((t) => t.type === 'income')
    .map((t) => ({
      วันที่: dateStr(t.date),
      ประเภท: t.otherIncomeType
        ? `${t.otherIncomeType} (${methodLabel(t)})`
        : methodLabel(t),
      จำนวนเงิน: t.amount,
      หมายเหตุ: t.note ?? '',
    }))
  const wb = buildWorkbook([{ name: 'รายรับแยกประเภท', data: rows }])
  return download(wb, `รายรับแยกประเภท_${dateRange}.xlsx`)
}

// รายจ่าย
export async function exportExpenses(transactions, categoryFn, dateRange) {
  const rows = transactions
    .filter((t) => t.type === 'expense')
    .map((t) => ({
      วันที่: dateStr(t.date),
      รายการ: t.itemName ?? '',
      หมวดหมู่: categoryFn(t.category),
      จำนวนเงิน: t.amount,
      วิธีชำระ: t.method === 'cash' ? 'เงินสด' : t.method === 'transfer' ? 'เงินโอน' : 'ค้างชำระ',
      ผู้ขาย: t.vendor ?? '',
      เลขที่ใบเสร็จ: t.receiptNo ?? '',
      ใบกำกับภาษี: t.taxStatus === 'received' ? 'มี' : t.taxStatus === 'waiting' ? 'รอ' : '-',
      หมายเหตุ: t.note ?? '',
    }))
  const wb = buildWorkbook([{ name: 'รายจ่าย', data: rows }])
  return download(wb, `รายจ่าย_${dateRange}.xlsx`)
}

// รายจ่ายแยกประเภท
export async function exportExpenseByCategory(transactions, categoryFn, dateRange) {
  const rows = transactions
    .filter((t) => t.type === 'expense')
    .map((t) => ({
      วันที่: dateStr(t.date),
      หมวดหมู่: categoryFn(t.category),
      รายการ: t.itemName ?? '',
      จำนวนเงิน: t.amount,
    }))
  const wb = buildWorkbook([{ name: 'รายจ่ายแยกประเภท', data: rows }])
  return download(wb, `รายจ่ายแยกประเภท_${dateRange}.xlsx`)
}

// รายรับ-รายจ่ายรวม
export async function exportSummary(transactions, categoryFn, dateRange) {
  const income = transactions.filter((t) => t.type === 'income')
  const expense = transactions.filter((t) => t.type === 'expense')

  const incomeRows = income.map((t) => ({
    วันที่: dateStr(t.date),
    ประเภท: 'รายรับ',
    รายการ: t.itemName ?? '',
    จำนวนเงิน: t.amount,
    หมวดหมู่: '',
    หมายเหตุ: t.note ?? '',
  }))
  const expenseRows = expense.map((t) => ({
    วันที่: dateStr(t.date),
    ประเภท: 'รายจ่าย',
    รายการ: t.itemName ?? '',
    จำนวนเงิน: t.amount,
    หมวดหมู่: categoryFn(t.category),
    หมายเหตุ: t.note ?? '',
  }))

  const wb = buildWorkbook([{ name: 'รายรับ-รายจ่าย', data: [...incomeRows, ...expenseRows] }])
  return download(wb, `รายรับรายจ่ายรวม_${dateRange}.xlsx`)
}

// Log
export function exportLog(logs, fmt = 'json') {
  if (fmt === 'json') {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `activity_log_${localDateStr()}.json`
    a.click()
    URL.revokeObjectURL(url)
    return
  }
  const rows = logs.map((l) => ({
    เวลา: dtStr(l.timestamp),
    ประเภท: l.activityType,
    รายละเอียด: l.description,
    สถานะ: l.status,
    เหตุผลแก้ไข: l.changeNote ?? '',
  }))
  const wb = buildWorkbook([{ name: 'Log', data: rows }])
  download(wb, `activity_log_${localDateStr()}.xlsx`)
}
