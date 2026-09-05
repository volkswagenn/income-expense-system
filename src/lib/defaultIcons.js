/**
 * ไอคอนตั้งต้นของแต่ละชนิดข้อมูล — ใช้เมื่อผู้ใช้ยังไม่ได้เลือกไอคอนเอง
 *
 * ทำไมต้องรวมไว้ที่เดียว
 *   ก่อนหน้านี้แต่ละหน้ากำหนดไอคอนสำรองของตัวเอง (บางที่ใช้ 'label' บางที่ 'folder'
 *   บางที่ 'wallet') พอเป็นของชนิดเดียวกันแต่คนละหน้า กลับเห็นไอคอนไม่เหมือนกัน
 *   ทำให้กวาดตาแล้วนึกว่าเป็นคนละอย่าง ตรงนี้จึงเป็นแหล่งเดียวที่ตัดสินว่า
 *   "ของชนิดนี้ ถ้าไม่เลือกอะไร จะหน้าตาแบบไหน"
 *
 * ค่าที่คืนเป็นชื่อไอคอนของชุด Material (ใช้กับ prop `fallback` ของ AppIcon
 * หรือ `emptyIcon` ของ IconPickerButton) ไม่ใช่ค่าที่บันทึกลงฐานข้อมูล —
 * ในฐานข้อมูลยังเก็บเป็น null ตามเดิม เพื่อให้แยกออกว่า "ยังไม่ได้เลือก"
 * กับ "เลือกไอคอนที่บังเอิญตรงกับตัวตั้งต้น" ซึ่งต่างกันตอนเปลี่ยนตัวตั้งต้นภายหลัง
 */
export const DEFAULT_ICONS = {
  category: 'folder',
  categoryIncome: 'savings',
  categoryExpense: 'receipt_long',
  subCategory: 'description',
  account: 'account_balance',
  card: 'credit_card',
  subWallet: 'wallet',
  recurring: 'history',
  vendor: 'storefront',
  debt: 'receipt_long',
}

/**
 * ไอคอนตั้งต้นของหมวดหมู่ — แยกตามชนิดและชั้น
 * หมวดหลักใช้รูปโฟลเดอร์เพราะเป็นตัวรวม ส่วนหมวดย่อยใช้รูปเอกสารเพราะเป็นตัวปลายทาง
 */
export function defaultCategoryIcon(type, isMain = true) {
  if (!isMain) return DEFAULT_ICONS.subCategory
  if (type === 'income') return DEFAULT_ICONS.categoryIncome
  if (type === 'expense') return DEFAULT_ICONS.categoryExpense
  return DEFAULT_ICONS.category
}
