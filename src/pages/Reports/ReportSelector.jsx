export const REPORT_TYPES = [
  {
    key: 'daily_income',
    label: 'รายรับรายวัน',
    icon: '📥',
    desc: 'ยอดรับแต่ละวัน แยกเงินสด / โอน / อื่นๆ',
    tone: 'income',
  },
  {
    key: 'income_by_type',
    label: 'รายรับแยกประเภท',
    icon: '🏷️',
    desc: 'แยกตามช่องทางและประเภทรายรับ',
    tone: 'income',
  },
  {
    key: 'expense',
    label: 'รายจ่ายทั้งหมด',
    icon: '📤',
    desc: 'รายการจ่ายพร้อมหมวดหมู่ ผู้ขาย ใบกำกับภาษี',
    tone: 'expense',
  },
  {
    key: 'expense_by_cat',
    label: 'รายจ่ายแยกหมวดหมู่',
    icon: '🗂️',
    desc: 'สรุปว่าเงินออกไปกับหมวดไหนบ้าง',
    tone: 'expense',
  },
  {
    key: 'summary',
    label: 'รายรับ-รายจ่ายรวม',
    icon: '⚖️',
    desc: 'เทียบรายรับกับรายจ่ายในช่วงเดียวกัน',
    tone: 'neutral',
  },
]

const TONE = {
  income: {
    on: 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200',
    icon: 'bg-emerald-100',
    title: 'text-emerald-900',
  },
  expense: {
    on: 'border-red-400 bg-red-50 ring-1 ring-red-200',
    icon: 'bg-red-100',
    title: 'text-red-900',
  },
  neutral: {
    on: 'border-blue-400 bg-blue-50 ring-1 ring-blue-200',
    icon: 'bg-blue-100',
    title: 'text-blue-900',
  },
}

/** เลือกประเภทรายงานแบบการ์ด — เห็นชื่อพร้อมคำอธิบายว่ารายงานนั้นให้อะไร */
export default function ReportSelector({ type, setType }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
      {REPORT_TYPES.map((r) => {
        const active = type === r.key
        const tone = TONE[r.tone]
        return (
          <button
            key={r.key}
            onClick={() => setType(r.key)}
            className={`text-left rounded-xl border p-3 transition-all ${
              active ? tone.on : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${active ? tone.icon : 'bg-gray-100'}`}>
                {r.icon}
              </span>
              <div className="min-w-0">
                <p className={`text-sm font-medium ${active ? tone.title : 'text-gray-800'}`}>{r.label}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-snug">{r.desc}</p>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
