import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import DebtList from '../Wallet/DebtList'
import InstallmentList from '../Recurring/InstallmentList'
import useDebtStore from '../../store/useDebtStore'
import useCreditCardStore from '../../store/useCreditCardStore'
import Icon from '../../components/shared/Icon'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

/**
 * หนี้สินและงวดผ่อน — 2 คอลัมน์ตามแบบ
 *
 * ซ้าย: สัญญาหนี้ที่จ่ายเองจากกระเป๋า (จ่ายทีละงวดได้ที่นี่)
 * ขวา: งวดผ่อนที่ถูกเรียกเก็บผ่านบิลบัตร จึงไม่มีปุ่มจ่ายรายตัว
 * แยกกันเพราะเงินออกคนละทาง ถ้าเอามาปนกันจะมีแถวที่กดจ่ายไม่ได้โดยไม่รู้เหตุผล
 */
export default function DebtView({ onOpenBill }) {
  const debts = useDebtStore((s) => s.debts)
  const entries = useDebtStore((s) => s.entries)
  const totals = useDebtStore((s) => s.getTotals())
  const installments = useCreditCardStore((s) => s.getActiveInstallments())
  const getInstallmentProgress = useCreditCardStore((s) => s.getInstallmentProgress)
  const getInstallmentMonthly = useCreditCardStore((s) => s.getInstallmentMonthly)
  const dueTotal = useCreditCardStore((s) => s.getDueTotal())

  const buckets = useMemo(() => {
    const active = debts.filter((d) => d.status === 'active')
    const pendingOf = (ids) => entries
      .filter((e) => ids.has(e.debtId) && e.status === 'pending')
      .reduce((s, e) => s + Number(e.amount || 0), 0)
    const idsOf = (fn) => new Set(active.filter(fn).map((d) => d.id))

    // ภาระต่อเดือน = งวดถัดไปของทุกสัญญาที่เราติดคนอื่น + งวดผ่อนบัตรที่ยังเหลือ
    const seen = new Set()
    let monthly = 0
    for (const e of [...entries].sort((a, b) => a.seq - b.seq)) {
      const d = active.find((x) => x.id === e.debtId)
      if (!d || d.direction !== 'payable' || e.status !== 'pending' || seen.has(d.id)) continue
      seen.add(d.id)
      monthly += Number(e.amount || 0)
    }
    monthly += getInstallmentMonthly()

    return {
      short: pendingOf(idsOf((d) => d.direction === 'payable' && d.term !== 'long')),
      long: pendingOf(idsOf((d) => d.direction === 'payable' && d.term === 'long')),
      monthly,
      activeCount: active.length,
    }
  }, [debts, entries, installments, getInstallmentMonthly])

  // คงเหลือ = ยังไม่ได้จ่ายจริง (รวมงวดที่เข้าบิลแล้วแต่ยังไม่ได้จ่ายบิล)
  const insRemaining = installments.reduce((s, i) => {
    const p = getInstallmentProgress(i.id)
    return s + (p?.unpaidAmount ?? 0)
  }, 0)
  const insMonthly = getInstallmentMonthly()

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
        <div className="bg-pending-soft border border-pending-line rounded-[14px] px-3.5 py-3">
          <p className="text-[11px] text-[#8A6A15]">เราติดคนอื่น</p>
          <p className="tabular-nums text-[21px] font-semibold text-pending mt-0.5">{fmt(totals.payable)}</p>
        </div>
        <div className="bg-income-soft border border-[#BFE0D2] rounded-[14px] px-3.5 py-3">
          <p className="text-[11px] text-[#0F6A50]">คนอื่นติดเรา</p>
          <p className="tabular-nums text-[21px] font-semibold text-income mt-0.5">{fmt(totals.receivable)}</p>
        </div>
        <div className="bg-[#E7EFFA] border border-[#C9D8F2] rounded-[14px] px-3.5 py-3">
          <p className="text-[11px] text-[#2E5AA6]">ระยะสั้น · ผ่อนจบภายใน 1 ปี</p>
          <p className="tabular-nums text-[21px] font-semibold text-[#2E5AA6] mt-0.5">{fmt(buckets.short)}</p>
        </div>
        <div className="bg-recurring-soft border border-[#D6CBF0] rounded-[14px] px-3.5 py-3">
          <p className="text-[11px] text-[#5A3C90]">ระยะยาว · ผ่อนนานกว่า 1 ปี</p>
          <p className="tabular-nums text-[21px] font-semibold text-[#5A3C90] mt-0.5">{fmt(buckets.long)}</p>
        </div>
        <div className="bg-ink rounded-[14px] px-3.5 py-3">
          <p className="text-[11px] text-[#9AA0A8]">ภาระผ่อนต่อเดือน</p>
          <p className="tabular-nums text-[21px] font-semibold text-lime mt-0.5">{fmt(buckets.monthly)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
        <section className="card flex flex-col overflow-hidden">
          <div className="px-4 pt-3.5 pb-2.5 flex-none">
            <div className="flex items-center gap-2.5">
              <Icon name="receipt_long" size={17} className="text-ink" />
              <span className="text-sm font-semibold">หนี้สินและลูกหนี้</span>
              <Link
                to="/manage/debts"
                className="ml-auto h-[30px] px-2.5 rounded-[9px] bg-lime text-ink text-xs font-semibold flex items-center gap-1 hover:brightness-95"
              >
                <Icon name="add" size={16} />เพิ่มหนี้สิน
              </Link>
            </div>
            <p className="text-[11px] text-faint leading-relaxed mt-1.5">
              สัญญาผ่อน เงินกู้ และเงินที่ให้คนอื่นยืม — จ่ายทีละงวดได้ที่นี่ เงินออกจากกระเป๋าที่เลือกทันที ไม่ผ่านบิลบัตร
            </p>
          </div>
          <div className="px-4 pb-3">
            <DebtList bare />
          </div>
        </section>

        <section className="card flex flex-col overflow-hidden">
          <div className="px-4 pt-3.5 pb-2.5 flex-none">
            <div className="flex items-center gap-2.5">
              <Icon name="credit_card" size={17} className="text-ink" />
              <span className="text-sm font-semibold">ผ่อนชำระผ่านบัตรเครดิต</span>
              {dueTotal > 0 && (
                <button
                  onClick={onOpenBill}
                  className="ml-auto h-[30px] px-2.5 rounded-[9px] bg-pending-soft border border-pending-line text-[#8A6A15] text-xs font-semibold flex items-center gap-1.5 hover:brightness-[0.98]"
                >
                  จ่ายบิลบัตร <span className="tabular-nums">{fmt(dueTotal)}</span>
                </button>
              )}
            </div>
            <p className="text-[11px] text-faint leading-relaxed mt-1.5">
              แต่ละงวดถูกเรียกเก็บรวมในบิลบัตรอัตโนมัติ จึงจ่ายที่บิลไม่ใช่ที่ตัวรายการผ่อน
              เริ่มผ่อนได้จากฟอร์มบันทึกรายจ่าย เลือกบัตรเครดิตแล้วติ๊ก “แบ่งชำระ”
            </p>
            {installments.length > 0 && (
              <div className="flex items-center justify-between gap-2.5 bg-expense-soft border border-[#F0C4BE] rounded-[11px] px-3 py-2 mt-2.5">
                <span className="text-xs text-[#A93A2E]">
                  กำลังผ่อน {installments.length} รายการ · คงเหลือ {fmt(insRemaining)}
                </span>
                <span className="tabular-nums text-[12.5px] font-semibold text-[#C03A2D]">
                  {fmt(insMonthly)} บาท / เดือน
                </span>
              </div>
            )}
          </div>
          <div className="px-4 pb-3">
            <InstallmentList bare />
          </div>
        </section>
      </div>
    </div>
  )
}
