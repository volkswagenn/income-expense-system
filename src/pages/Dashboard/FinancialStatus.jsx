import { useNavigate } from 'react-router-dom'
import useWalletStore from '../../store/useWalletStore'
import useCreditCardStore from '../../store/useCreditCardStore'
import usePendingStore from '../../store/usePendingStore'
import Icon from '../../components/shared/Icon'

const fmt = (n) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * การ์ดยอดรวม — พื้นเข้มพร้อมวงกลม lime ตาม mockup
 *
 * ยอดรวมยังเป็น เงินสด + เงินโอน เท่านั้น ตั้งใจไม่หักหนี้บัตรออก
 * เพราะยอดนี้ตอบคำถามว่า "มีเงินเท่าไร" ไม่ใช่ "รวยเท่าไร"
 * หนี้บัตรจึงแยกเป็นอีกบรรทัด พร้อมยอดสุทธิไว้ให้คนที่อยากเห็นภาพรวม
 */
function HeroCard({ total, cash, transfer, cardDebt = 0 }) {
  return (
    <div className="relative overflow-hidden rounded-card bg-ink p-5 sm:col-span-2">
      <div className="absolute -right-8 -top-11 w-[130px] h-[130px] rounded-full bg-lime opacity-[.13]" />
      <div className="relative">
        <p className="text-[12.5px] text-[#9AA0A8]">ยอดเงินคงเหลือรวม</p>
        <p className="text-[34px] font-semibold text-white tabular-nums tracking-[-0.02em] mt-1">
          {fmt(total)}
          <span className="text-[15px] font-normal text-[#9AA0A8] ml-1.5">บาท</span>
        </p>
        <div className="flex gap-5 mt-3">
          <div className="flex items-center gap-1.5">
            <Icon name="payments" size={16} className="text-lime" />
            <span className="text-[12px] text-[#9AA0A8]">เงินสด</span>
            <span className="text-[12.5px] text-white tabular-nums">{fmt(cash)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Icon name="account_balance" size={16} className="text-lime" />
            <span className="text-[12px] text-[#9AA0A8]">เงินโอน</span>
            <span className="text-[12.5px] text-white tabular-nums">{fmt(transfer)}</span>
          </div>
          {cardDebt > 0 && (
            <div className="flex items-center gap-1.5">
              <Icon name="credit_card" size={16} className="text-[#F2A0A0]" />
              <span className="text-[12px] text-[#9AA0A8]">หนี้บัตร</span>
              <span className="text-[12.5px] text-[#F2A0A0] tabular-nums">{fmt(cardDebt)}</span>
            </div>
          )}
        </div>
        {cardDebt > 0 && (
          <p className="text-[11.5px] text-[#7C828A] mt-2.5 tabular-nums">
            คงเหลือสุทธิหลังหักหนี้บัตร {fmt(total - cardDebt)} บาท
          </p>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon, label, amount, tone, onClick, sub }) {
  const tones = {
    income:   { box: 'bg-income-soft border-transparent', ic: 'text-income',   val: 'text-income' },
    expense:  { box: 'bg-expense-soft border-transparent', ic: 'text-expense', val: 'text-expense' },
    pending:  { box: 'bg-pending-soft border-pending-line', ic: 'text-pending', val: 'text-pending' },
    transfer: { box: 'bg-transfer-soft border-transparent', ic: 'text-transfer', val: 'text-transfer' },
    plain:    { box: 'bg-white border-hairline', ic: 'text-muted', val: 'text-ink' },
  }
  const t = tones[tone] ?? tones.plain

  return (
    <div
      className={`rounded-card border p-4 ${t.box} ${onClick ? 'cursor-pointer hover:brightness-[0.98] transition' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-1.5">
        <Icon name={icon} size={17} className={t.ic} />
        <p className="text-[12.5px] text-muted">{label}</p>
      </div>
      <p className={`text-[24px] font-semibold tabular-nums tracking-[-0.02em] mt-1.5 ${t.val}`}>
        {fmt(amount)}
      </p>
      <p className="text-[11.5px] text-faint mt-0.5 min-h-[16px]">{sub ?? ''}</p>
    </div>
  )
}

export default function FinancialStatus() {
  const { cash, transfer } = useWalletStore()
  const cardDebt = useCreditCardStore((s) => s.getTotalOutstanding())
  const cardDue = useCreditCardStore((s) => s.getDueTotal())
  const pendingTotal = usePendingStore((s) => s.getPendingTotal())
  const pendingIncomeTotal = usePendingStore((s) => s.getPendingIncomeTotal())
  const navigate = useNavigate()

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
      <HeroCard total={cash + transfer} cash={cash} transfer={transfer} cardDebt={cardDebt} />

      <StatCard
        icon="schedule"
        label="หนี้ค้างชำระ"
        amount={pendingTotal}
        tone={pendingTotal > 0 ? 'pending' : 'plain'}
        onClick={() => navigate('/pending-tasks?tab=payment')}
        sub={pendingTotal > 0 ? 'คลิกดูรายละเอียด' : 'ไม่มีรายการค้าง'}
      />
      <StatCard
        icon="savings"
        label="รอรับเงิน"
        amount={pendingIncomeTotal}
        tone={pendingIncomeTotal > 0 ? 'transfer' : 'plain'}
        onClick={() => navigate('/pending-tasks?tab=income')}
        sub={pendingIncomeTotal > 0 ? 'คลิกดูรายละเอียด' : 'ไม่มีรายการรอรับ'}
      />
      {/* แสดงเฉพาะเมื่อมีบิลบัตรที่ปิดรอบแล้วและยังจ่ายไม่ครบ
          คนที่ไม่ได้ใช้บัตรจะไม่เห็นการ์ดนี้เลย หน้าแรกจึงไม่รกขึ้นโดยไม่จำเป็น */}
      {cardDue > 0 && (
        <StatCard
          icon="credit_card"
          label="บิลบัตรที่ต้องจ่าย"
          amount={cardDue}
          tone="expense"
          onClick={() => navigate('/wallet')}
          sub="คลิกไปหน้ากระเป๋าเงิน"
        />
      )}
    </div>
  )
}
