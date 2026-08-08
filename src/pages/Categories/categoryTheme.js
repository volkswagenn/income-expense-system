/**
 * สีประจำประเภทหมวดหมู่ — รายรับเขียว รายจ่ายแดง
 * เขียนคลาสเต็มไว้ทั้งชุดเพราะ Tailwind ต้องเห็นชื่อคลาสตรงๆ ตอน build
 */
export const CATEGORY_THEME = {
  expense: {
    key: 'expense',
    label: 'รายจ่าย',
    icon: '📤',
    tabActive: 'bg-red-500 text-white shadow-sm',
    hintBox: 'bg-red-50 border-red-100 text-red-900',
    hintSub: 'text-red-600',
    rootBox: 'bg-red-50 border-red-200',
    rootText: 'text-red-900',
    rowHover: 'hover:bg-red-50/60',
    rowSelected: 'bg-red-50 ring-1 ring-red-200',
    mainText: 'text-red-900',
    subText: 'text-red-700/70',
    countText: 'text-red-400',
    button: 'bg-red-500 hover:bg-red-600 text-white',
    emptyIcon: '📤',
  },
  income: {
    key: 'income',
    label: 'รายรับ',
    icon: '📥',
    tabActive: 'bg-emerald-500 text-white shadow-sm',
    hintBox: 'bg-emerald-50 border-emerald-100 text-emerald-900',
    hintSub: 'text-emerald-600',
    rootBox: 'bg-emerald-50 border-emerald-200',
    rootText: 'text-emerald-900',
    rowHover: 'hover:bg-emerald-50/60',
    rowSelected: 'bg-emerald-50 ring-1 ring-emerald-200',
    mainText: 'text-emerald-900',
    subText: 'text-emerald-700/70',
    countText: 'text-emerald-400',
    button: 'bg-emerald-500 hover:bg-emerald-600 text-white',
    emptyIcon: '📥',
  },
}

export const CATEGORY_TYPE_LIST = [CATEGORY_THEME.expense, CATEGORY_THEME.income]
