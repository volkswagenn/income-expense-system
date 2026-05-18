import { v4 as uuid } from 'uuid'
import { eachDayOfInterval, parseISO, format } from 'date-fns'

export function generateDateRows(startDate, endDate) {
  const days = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) })
  return days.map((d) => ({ date: format(d, 'yyyy-MM-dd'), cash: '', transfer: '', note: '' }))
}

export function validateDailyImport(rows) {
  const errors = []
  rows.forEach((row, i) => {
    if (row.cash !== '' && isNaN(Number(row.cash))) errors.push(`แถว ${i + 1}: เงินสดต้องเป็นตัวเลข`)
    if (row.transfer !== '' && isNaN(Number(row.transfer))) errors.push(`แถว ${i + 1}: เงินโอนต้องเป็นตัวเลข`)
  })
  return errors
}

export function processDailyImport(rows) {
  return rows
    .filter((r) => Number(r.cash || 0) > 0 || Number(r.transfer || 0) > 0)
    .flatMap((r) => {
      const txs = []
      if (Number(r.cash || 0) > 0) {
        txs.push({
          id: uuid(),
          date: r.date,
          type: 'income',
          amount: Number(r.cash),
          method: 'cash',
          itemName: 'รายรับ (นำเข้าข้อมูล)',
          note: r.note ?? '',
          createdAt: new Date().toISOString(),
        })
      }
      if (Number(r.transfer || 0) > 0) {
        txs.push({
          id: uuid(),
          date: r.date,
          type: 'income',
          amount: Number(r.transfer),
          method: 'transfer',
          itemName: 'รายรับ (นำเข้าข้อมูล)',
          note: r.note ?? '',
          createdAt: new Date().toISOString(),
        })
      }
      return txs
    })
}

export function processTypeImport(rows) {
  return rows
    .filter((r) => Number(r.amount || 0) > 0)
    .map((r) => ({
      id: uuid(),
      date: r.date,
      type: 'income',
      amount: Number(r.amount),
      method: r.method ?? 'cash',
      itemName: r.itemName ?? 'รายรับ (นำเข้าข้อมูล)',
      otherIncomeType: r.incomeType ?? '',
      note: r.note ?? '',
      createdAt: new Date().toISOString(),
    }))
}

export function processSummaryImport(rows) {
  return rows
    .filter((r) => Number(r.income || 0) > 0 || Number(r.expense || 0) > 0)
    .flatMap((r) => {
      const txs = []
      if (Number(r.income || 0) > 0) {
        txs.push({
          id: uuid(),
          date: r.date,
          type: 'income',
          amount: Number(r.income),
          method: 'cash',
          itemName: 'รายรับรวม (นำเข้าข้อมูล)',
          note: r.note ?? '',
          createdAt: new Date().toISOString(),
        })
      }
      if (Number(r.expense || 0) > 0) {
        txs.push({
          id: uuid(),
          date: r.date,
          type: 'expense',
          amount: Number(r.expense),
          method: 'cash',
          category: null,
          itemName: 'รายจ่ายรวม (นำเข้าข้อมูล)',
          note: r.note ?? '',
          createdAt: new Date().toISOString(),
        })
      }
      return txs
    })
}
