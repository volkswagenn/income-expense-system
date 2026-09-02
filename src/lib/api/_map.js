/**
 * แปลงชื่อฟิลด์ระหว่างหน้าจอกับฐานข้อมูล
 *
 * หน้าจอทั้งแอปใช้ camelCase (itemName, transferAccountId) ส่วน Postgres ใช้ snake_case
 * (item_name, transfer_account_id) แทนที่จะไล่แก้หน้าจอ 13,000 บรรทัด ให้แปลงที่นี่ที่เดียว
 *
 * ส่วนใหญ่แปลงตรงๆ ตามกฎ camel ↔ snake ยกเว้นไม่กี่ฟิลด์ที่ชื่อไม่ตรงกันจริงๆ
 * (หน้าจอเรียก category แต่คอลัมน์ชื่อ category_id) — พวกนั้นอยู่ใน OVERRIDES
 */

const OVERRIDES = {
  transactions: { category: 'category_id' },
  pending_payments: { category: 'category_id' },
  // หน้าจอส่ง date = วันที่เปิดบิล ส่วน due_date คือวันครบกำหนด คนละความหมายกัน
  pending_incomes: { category: 'category_id', date: 'open_date' },
  recurring_items: { category: 'category_id' },
}

/** ฟิลด์ที่ต้องเป็นตัวเลขเสมอ — numeric ของ Postgres อาจกลับมาเป็น string */
const NUMERIC_FIELDS = new Set([
  'amount', 'balance', 'cash', 'fixedAmount', 'notifyDaysBefore', 'billingDay', 'billingMonth', 'vatRate', 'sortOrder',
  // บัตรเครดิต — ไม่ใส่ไว้ที่นี่ numeric จะกลับมาเป็น string แล้วบวกเลขกลายเป็นต่อสตริง
  'creditLimit', 'outstanding', 'closingDay', 'dueDay', 'cashbackRate', 'cardMinRate',
  // ใบแจ้งยอด
  'previousBalance', 'spendAmount', 'creditAmount', 'minimumAmount', 'paidAmount',
])

const camelToSnake = (s) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())
const snakeToCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())

function reverse(map) {
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]))
}

/**
 * หน้าจอ → ฐานข้อมูล
 * ทิ้งคีย์ที่เป็น undefined ออก (ส่งไปจะโดน PostgREST ปฏิเสธ)
 * และทิ้งคีย์ที่ฐานข้อมูลจัดการเอง (id / createdAt) ถ้าไม่ได้ตั้งใจส่ง
 */
export function toRow(table, obj, { keepId = false } = {}) {
  const over = OVERRIDES[table] ?? {}
  const row = {}
  for (const [key, value] of Object.entries(obj ?? {})) {
    if (value === undefined) continue
    if (!keepId && key === 'id') continue
    const column = over[key] ?? camelToSnake(key)
    row[column] = value === '' ? null : value
  }
  return row
}

/** ฐานข้อมูล → หน้าจอ */
export function fromRow(table, row) {
  if (!row) return row
  const back = reverse(OVERRIDES[table] ?? {})
  const obj = {}
  for (const [column, value] of Object.entries(row)) {
    const key = back[column] ?? snakeToCamel(column)
    obj[key] = NUMERIC_FIELDS.has(key) && value !== null ? Number(value) : value
  }
  return obj
}

export function fromRows(table, rows) {
  return (rows ?? []).map((r) => fromRow(table, r))
}
