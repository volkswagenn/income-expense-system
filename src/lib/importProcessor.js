import { eachDayOfInterval, parseISO, format } from 'date-fns'

/**
 * ตัวช่วยของหน้านำเข้าข้อมูล
 *
 * เวอร์ชันเดิมมีฟังก์ชันแปลงแถวครบทุกแบบฟอร์ม (daily / bytype / summary) และแต่ละตัว
 * ยัด `id: uuid()` กับ `createdAt` ลงไปเอง เพราะสมัยออฟไลน์ต้องสร้าง id ฝั่งเครื่อง
 * ตอนนี้ Postgres เป็นคนออก id และ created_at ให้ ค่าที่ส่งไปจึงถูกทิ้งทั้งหมด
 *
 * เหลือไว้เฉพาะสองตัวที่หน้าจอเรียกจริง — แบบ daily กับ bytype ประกอบแถวเองในหน้าจอ
 * อยู่แล้ว (ดู ImportFormDaily / ImportFormByType) ไม่ได้ผ่านไฟล์นี้
 */

/** แตกช่วงวันที่เป็นแถวเปล่าให้ผู้ใช้กรอก */
export function generateDateRows(startDate, endDate) {
  const days = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) })
  return days.map((d) => ({ date: format(d, 'yyyy-MM-dd'), cash: '', transfer: '', note: '' }))
}

/** แถวแบบ "รายรับ-รายจ่ายรวม" → รายการที่พร้อมส่งเข้า runImport */
export function processSummaryImport(rows) {
  return rows
    .filter((r) => Number(r.income || 0) > 0 || Number(r.expense || 0) > 0)
    .flatMap((r) => {
      const txs = []
      if (Number(r.income || 0) > 0) {
        txs.push({
          date: r.date,
          type: 'income',
          amount: Number(r.income),
          method: 'cash',
          itemName: 'รายรับรวม (นำเข้าข้อมูล)',
          note: r.note ?? '',
        })
      }
      if (Number(r.expense || 0) > 0) {
        txs.push({
          date: r.date,
          type: 'expense',
          amount: Number(r.expense),
          method: 'cash',
          itemName: 'รายจ่ายรวม (นำเข้าข้อมูล)',
          note: r.note ?? '',
        })
      }
      return txs
    })
}
