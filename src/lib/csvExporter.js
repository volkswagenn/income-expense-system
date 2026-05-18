import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { saveAppFile } from './fileHelper'

function dateStr(d) {
  try { return format(new Date(d), 'dd/MM/yyyy', { locale: th }) } catch { return d ?? '' }
}

function toCsv(rows) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const escape = (v) => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [
    headers.map(escape).join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ]
  return '﻿' + lines.join('\r\n') // BOM for Thai in Excel
}

async function downloadCsv(content, filename) {
  const bytes = new TextEncoder().encode(content)
  return saveAppFile(bytes, 'reports', filename)
}

export async function exportDailyIncomeCsv(transactions, dateRange) {
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
  return downloadCsv(toCsv(rows), `รายรับรายวัน_${dateRange}.csv`)
}

export async function exportIncomeByTypeCsv(transactions, dateRange) {
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
  return downloadCsv(toCsv(rows), `รายรับแยกประเภท_${dateRange}.csv`)
}

export async function exportExpensesCsv(transactions, categoryFn, dateRange) {
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
  return downloadCsv(toCsv(rows), `รายจ่าย_${dateRange}.csv`)
}

export async function exportExpenseByCategoryCsv(transactions, categoryFn, dateRange) {
  const rows = transactions
    .filter((t) => t.type === 'expense')
    .map((t) => ({
      วันที่: dateStr(t.date),
      หมวดหมู่: categoryFn(t.category),
      รายการ: t.itemName ?? '',
      จำนวนเงิน: t.amount,
    }))
  return downloadCsv(toCsv(rows), `รายจ่ายแยกประเภท_${dateRange}.csv`)
}

export async function exportSummaryCsv(transactions, categoryFn, dateRange) {
  const rows = [
    ...transactions.filter((t) => t.type === 'income').map((t) => ({
      วันที่: dateStr(t.date),
      ประเภท: 'รายรับ',
      รายการ: t.itemName ?? '',
      จำนวนเงิน: t.amount,
      หมวดหมู่: '',
      หมายเหตุ: t.note ?? '',
    })),
    ...transactions.filter((t) => t.type === 'expense').map((t) => ({
      วันที่: dateStr(t.date),
      ประเภท: 'รายจ่าย',
      รายการ: t.itemName ?? '',
      จำนวนเงิน: t.amount,
      หมวดหมู่: categoryFn(t.category),
      หมายเหตุ: t.note ?? '',
    })),
  ]
  return downloadCsv(toCsv(rows), `รายรับรายจ่ายรวม_${dateRange}.csv`)
}
