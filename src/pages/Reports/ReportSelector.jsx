import Icon from '../../components/shared/Icon'

/**
 * ประเภทรายงาน — เปลี่ยน "วิธีจัดกลุ่มแถว" ของตารางผลลัพธ์ ไม่ได้เปลี่ยนหน้าตาตาราง
 * ตารางมีคอลัมน์เท่ากันเสมอ จะได้เทียบข้ามประเภทและส่งออกไฟล์รูปเดียวกันได้
 */
export const REPORT_TYPES = [
  { key: 'daily', icon: 'calendar_month', label: 'รายรับ-รายจ่ายรายวัน', desc: 'ยอดรวมของแต่ละวันในช่วงที่เลือก' },
  { key: 'category', icon: 'database', label: 'แยกตามหมวดหมู่', desc: 'หมวดไหนใช้เงินไปเท่าไร' },
  { key: 'vendor', icon: 'storefront', label: 'แยกตามผู้ขาย', desc: 'จ่ายให้ร้านไหนมากที่สุด' },
  { key: 'method', icon: 'payments', label: 'แยกตามช่องทางจ่าย', desc: 'เงินสด โอน บัตร ค้างชำระ' },
  { key: 'installment', icon: 'credit_card', label: 'ภาระผ่อนต่อเดือน', desc: 'เฉพาะงวดผ่อนที่ถูกเรียกเก็บแล้ว' },
  { key: 'tax', icon: 'receipt_long', label: 'ใบกำกับภาษี', desc: 'รายการที่ต้องมีใบกำกับ' },
]

export default function ReportSelector({ type, setType }) {
  return (
    <div className="flex flex-col gap-1">
      {REPORT_TYPES.map((t) => {
        const on = t.key === type
        return (
          <button
            key={t.key}
            onClick={() => setType(t.key)}
            title={t.desc}
            className={`min-h-[34px] px-[11px] py-1.5 rounded-[9px] text-[12.5px] flex items-center gap-2 text-left transition ${
              on ? 'bg-ink text-white font-semibold' : 'text-ink hover:bg-paper'
            }`}
          >
            <Icon name={t.icon} size={17} className={on ? 'text-lime flex-none' : 'text-faint flex-none'} />
            <span className="min-w-0">{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}
