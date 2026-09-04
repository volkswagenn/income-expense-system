import { useNavigate } from 'react-router-dom'
import useWalletStore from '../../store/useWalletStore'
import useCreditCardStore from '../../store/useCreditCardStore'
import useDebtStore from '../../store/useDebtStore'
import usePendingStore from '../../store/usePendingStore'
import useObligationRows from '../PendingTasks/useObligationRows'
import Icon from '../../components/shared/Icon'
import { localDateStr, thaiShortDate } from '../../lib/dateUtils'

const fmt = (n) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * การ์ดยอดรวม — พื้นเข้มพร้อมวงกลม lime
 *
 * ยอดรวมเป็น เงินสด + เงินโอน เท่านั้น ตั้งใจไม่หักหนี้บัตรออก
 * เพราะยอดนี้ตอบคำถามว่า "ตอนนี้มีเงินเท่าไร" ไม่ใช่ "รวยเท่าไร"
 * ยอดหนี้ไปอยู่หน้าบัตรและหนี้สินซึ่งเป็นที่ของมันโดยตรง
 */
function HeroCard({ total, cash, transfer }) {
  return (
    // มือถือการ์ดนี้กินเต็มแถว (2 คอลัมน์) แล้วการ์ดตัวเลขสองใบอยู่แถวถัดไปคู่กัน
    <div className="relative overflow-hidden rounded-panel bg-ink px-5 py-[17px] col-span-2 lg:col-span-1">
      <div className="absolute -right-[30px] -top-10 w-[120px] h-[120px] rounded-full bg-lime opacity-[.13]" />
      <div className="relative">
        <p className="text-[12px] text-[#9AA0A8]">ยอดเงินคงเหลือรวม</p>
        <p className="text-[28px] lg:text-[32px] font-semibold text-white tabular-nums tracking-[-0.025em] leading-[1.1] mt-0.5">
          {fmt(total)}
        </p>
        {/* จอแคบต้องขึ้นบรรทัดใหม่ ไม่งั้นก้อนสุดท้ายถูกตัดหายไปครึ่งตัว */}
        <div className="flex gap-x-4 gap-y-1.5 mt-[9px] flex-wrap">
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <Icon name="payments" size={15} className="text-lime" />
            <span className="text-[11.5px] text-[#9AA0A8]">เงินสด</span>
            <span className="text-[12px] text-white tabular-nums">{fmt(cash)}</span>
          </span>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <Icon name="account_balance" size={15} className="text-lime" />
            <span className="text-[11.5px] text-[#9AA0A8]">เงินโอน</span>
            <span className="text-[12px] text-white tabular-nums">{fmt(transfer)}</span>
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * การ์ดตัวเลขสองใบขวามือ — สีคงที่ตามความหมาย ไม่เปลี่ยนตามว่ามียอดหรือไม่
 * ถ้าเปลี่ยนเป็นสีขาวตอนยอดศูนย์ ตำแหน่งการ์ดจะดูเหมือนหายไปทั้งที่ยังอยู่
 */
function StatCard({ icon, label, shortLabel, amount, tone, onClick, children }) {
  const tones = {
    pending: { box: 'bg-pending-soft border-pending-line hover:border-[#E0C98A]', ic: 'text-pending', val: 'text-pending' },
    transfer: { box: 'bg-transfer-soft border-transparent hover:brightness-[0.98]', ic: 'text-transfer', val: 'text-transfer' },
  }
  const t = tones[tone] ?? tones.pending

  return (
    // มือถือเหลือแค่ป้าย + ตัวเลข (บรรทัดย่อยซ่อน) จะได้วางคู่กันในแถวเดียวโดยไม่ล้น
    <div
      className={`rounded-panel border px-3.5 py-3 lg:px-[17px] lg:py-[15px] transition ${t.box} ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-[7px]">
        <Icon name={icon} size={16} className={t.ic} />
        <p className="text-[12px] text-muted whitespace-nowrap">
          <span className="lg:hidden">{shortLabel ?? label}</span>
          <span className="hidden lg:inline">{label}</span>
        </p>
      </div>
      <p className={`text-[20px] lg:text-[26px] font-semibold tabular-nums tracking-[-0.02em] mt-1 ${t.val}`}>
        {fmt(amount)}
      </p>
      <div className="hidden lg:block mt-1.5 text-[11.5px] min-h-[16px]">{children}</div>
    </div>
  )
}

/**
 * แถวตัวเลขสรุปบนสุดของหน้าภาพรวม
 *
 * "ต้องจ่ายใน 30 วัน" รวมทุกแหล่งที่เงินจะออกจริงในเดือนข้างหน้า (ค้างชำระ + บิลบัตร
 * + งวดหนี้ + รายการประจำ) เพราะคำถามที่คนเปิดหน้านี้มาถามคือ "ต้องเตรียมเงินเท่าไร"
 * ไม่ใช่ยอดของแต่ละระบบแยกกัน
 */
export default function FinancialStatus() {
  const { cash, transfer } = useWalletStore()
  const cardDebt = useCreditCardStore((s) => s.getTotalOutstanding())
  const loanDebt = useDebtStore((s) => s.getTotals().payable)
  const pendingIncomeTotal = usePendingStore((s) => s.getPendingIncomeTotal())
  const pendingIncomeCount = usePendingStore((s) => s.pendingIncomes.filter((p) => p.status === 'pending').length)
  const rows = useObligationRows()
  const navigate = useNavigate()

  const limit = localDateStr(new Date(Date.now() + 30 * 86400000))
  const due30 = rows.filter((r) => !['income', 'receivable', 'tax'].includes(r.kind) && r.due <= limit)
  const due30Total = due30.reduce((s, r) => s + r.amount, 0)
  const pendingPart = due30.filter((r) => r.kind === 'pending').reduce((s, r) => s + r.amount, 0)
  const cardPart = due30.filter((r) => r.kind === 'card').reduce((s, r) => s + r.amount, 0)
  const nextIncome = rows.filter((r) => r.kind === 'income').sort((a, b) => String(a.due).localeCompare(String(b.due)))[0]

  return (
    // จอกว้างการ์ดสามใบเรียงลงมาเป็นคอลัมน์ซ้าย ปฏิทินจะได้ความสูงเต็มจอ
    // จอแคบเรียงเป็นแถวเดียว การ์ดยอดรวมกว้างกว่าอีกสองใบเพราะมีตัวเลขย่อยอยู่ข้างใน
    <div className="grid grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr] wide:grid-cols-1 wide:content-start gap-3">
      <HeroCard total={cash + transfer} cash={cash} transfer={transfer} />

      <StatCard
        icon="schedule"
        label="ต้องจ่ายใน 30 วัน"
        shortLabel="ต้องจ่าย 30 วัน"
        amount={due30Total}
        tone="pending"
        onClick={() => navigate('/pending-tasks')}
      >
        {due30Total > 0 ? (
          <span className="flex gap-3 text-[#8A6A15] flex-wrap">
            <span>ค้างจ่าย <b className="tabular-nums">{Math.round(pendingPart).toLocaleString('th-TH')}</b></span>
            <span>บิลบัตร <b className="tabular-nums">{Math.round(cardPart).toLocaleString('th-TH')}</b></span>
          </span>
        ) : (
          <span className="text-[#8A6A15]">ไม่มีรายการครบกำหนด</span>
        )}
      </StatCard>

      <StatCard
        icon="savings"
        label="รอรับเงิน"
        amount={pendingIncomeTotal}
        tone="transfer"
        onClick={() => navigate('/pending-tasks?tab=income')}
      >
        <span className="text-transfer">
          {pendingIncomeTotal > 0
            ? `${pendingIncomeCount} บิล${nextIncome ? ` · ครบกำหนดใกล้สุด ${thaiShortDate(nextIncome.due)}` : ''}`
            : 'ไม่มีรายการรอรับ'}
        </span>
      </StatCard>
    </div>
  )
}
