import { useEffect, useMemo, useState } from 'react'
import ReportSelector, { REPORT_TYPES } from './ReportSelector'
import ReportTable from './ReportTable'
import ExportBar from './ExportBar'
import DateRangePicker from '../../components/shared/DateRangePicker'
import useTransactionStore from '../../store/useTransactionStore'
import { presetRange } from '../../lib/dateRangePresets'
import { THAI_MONTH_SHORT } from '../../lib/dateUtils'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** ช่วงเวลาที่กดบ่อย — กดครั้งเดียวจบ ไม่ต้องเปิดปฏิทินก่อนทุกครั้ง */
const QUICK_RANGES = [
  { key: 'month', label: 'เดือนนี้' },
  { key: 'lastMonth', label: 'เดือนก่อน' },
  { key: 'quarter', label: 'ไตรมาสนี้' },
  { key: 'year', label: 'ปีนี้' },
]

/** การ์ดตัวเลขสี่ใบบนสุด — สีตามความหมาย ใบ "คงเหลือ" เป็นพื้นเข้มเพราะเป็นคำตอบหลัก */
function Kpi({ label, value, sub, box, labelFg, valueFg }) {
  return (
    <div className={`rounded-panel px-4 py-3.5 ${box}`}>
      <p className={`text-[11.5px] ${labelFg}`}>{label}</p>
      <p className={`tabular-nums text-[23px] font-semibold mt-[3px] ${valueFg}`}>{value}</p>
      {sub && <p className="text-[11px] text-faint mt-px">{sub}</p>}
    </div>
  )
}

export default function ReportsPage() {
  const [type, setType] = useState('daily')
  const [preset, setPreset] = useState('month')
  const [[startDate, endDate], setRange] = useState(() => presetRange('month'))

  const { transactions, ensureRange } = useTransactionStore()

  // store โหลดแค่ 24 เดือนล่าสุด — เลือกช่วงย้อนหลังกว่านั้นต้องดึงเพิ่มจากเซิร์ฟเวอร์
  // ไม่งั้นรายงานขึ้นว่า "ไม่มีข้อมูล" และไฟล์ที่ส่งออกขาดข้อมูลเก่าเงียบๆ
  useEffect(() => {
    ensureRange(startDate).catch((err) => console.warn('โหลดรายการย้อนหลังไม่สำเร็จ:', err))
  }, [startDate, ensureRange])

  const filtered = useMemo(
    () => transactions.filter((t) => t.date >= startDate && t.date <= endDate),
    [transactions, startDate, endDate],
  )

  const stats = useMemo(() => {
    let income = 0, expense = 0
    filtered.forEach((t) => {
      if (t.type === 'income') income += Number(t.amount) || 0
      else if (t.type === 'expense') expense += Number(t.amount) || 0
    })
    return { income, expense, net: income - expense, days: new Set(filtered.map((t) => t.date)).size }
  }, [filtered])

  // แท่งกราฟรายวัน — คิดสัดส่วนจากยอดสูงสุดในช่วง เพื่อให้แท่งสูงสุดเต็มกรอบพอดี
  const bars = useMemo(() => {
    const byDate = {}
    filtered.forEach((t) => {
      const k = t.date
      if (!byDate[k]) byDate[k] = { inc: 0, exp: 0 }
      if (t.type === 'income') byDate[k].inc += Number(t.amount) || 0
      else byDate[k].exp += Number(t.amount) || 0
    })
    const keys = Object.keys(byDate).sort().slice(-31)
    const max = Math.max(1, ...keys.map((k) => Math.max(byDate[k].inc, byDate[k].exp)))
    return keys.map((k) => {
      const d = new Date(k + 'T00:00:00')
      return {
        key: k,
        label: keys.length > 16 ? String(d.getDate()) : `${d.getDate()} ${THAI_MONTH_SHORT[d.getMonth()]}`,
        inH: `${(byDate[k].inc / max) * 100}%`,
        outH: `${(byDate[k].exp / max) * 100}%`,
      }
    })
  }, [filtered])

  const activeReport = REPORT_TYPES.find((r) => r.key === type)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[236px_minmax(0,1fr)] gap-3.5 items-start">
      {/* แถบซ้าย: ช่วงเวลา + ประเภทรายงาน — สองอย่างที่สลับบ่อยที่สุด */}
      <aside className="card p-3.5 flex flex-col gap-3 lg:sticky lg:top-[74px]">
        <div>
          <div className="text-[11px] tracking-[0.1em] uppercase text-faint px-1 pb-1.5">ช่วงเวลา</div>
          <div className="flex flex-col gap-1">
            {QUICK_RANGES.map((r) => {
              const on = preset === r.key
              return (
                <button
                  key={r.key}
                  onClick={() => { const [s, e] = presetRange(r.key); setRange([s, e]); setPreset(r.key) }}
                  className={`h-[34px] px-[11px] rounded-[9px] text-[12.5px] flex items-center transition ${
                    on ? 'bg-ink text-white font-semibold' : 'text-ink hover:bg-paper'
                  }`}
                >
                  {r.label}
                </button>
              )
            })}
          </div>
          <div className="mt-1">
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              preset={preset}
              onChange={(s, e, p) => { setRange([s, e]); setPreset(p) }}
            />
          </div>
        </div>

        <div>
          <div className="text-[11px] tracking-[0.1em] uppercase text-faint px-1 pb-1.5">ประเภทรายงาน</div>
          <ReportSelector type={type} setType={setType} />
        </div>
      </aside>

      <div className="flex flex-col gap-3 min-w-0">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 flex-none">
          <Kpi label="รายรับรวม" value={fmt(stats.income)} box="bg-income-soft" labelFg="text-muted" valueFg="text-income" />
          <Kpi label="รายจ่ายรวม" value={fmt(stats.expense)} box="bg-expense-soft" labelFg="text-muted" valueFg="text-expense" />
          <Kpi label="คงเหลือ" value={fmt(stats.net)} box="bg-ink" labelFg="text-[#9AA0A8]" valueFg="text-lime" />
          <Kpi
            label="จำนวนรายการ"
            value={filtered.length.toLocaleString('th-TH')}
            sub={`${stats.days} วันที่มีรายการ`}
            box="bg-white border border-hairline"
            labelFg="text-muted"
            valueFg="text-ink"
          />
        </div>

        {/* กราฟแท่งคู่รายวัน — วาดเองด้วย div ไม่ต้องลาก recharts (383 KB) เข้ามาทั้งก้อน */}
        <div className="card px-[18px] py-4 flex-none">
          <div className="flex items-center gap-2.5 mb-2.5">
            <span className="text-sm font-semibold">รายรับ-รายจ่ายรายวัน</span>
            <span className="ml-auto flex gap-3.5 text-[11.5px] text-muted">
              <span className="flex items-center gap-[5px]"><span className="w-[9px] h-[9px] rounded-[3px] bg-income" />รายรับ</span>
              <span className="flex items-center gap-[5px]"><span className="w-[9px] h-[9px] rounded-[3px] bg-expense" />รายจ่าย</span>
            </span>
          </div>
          {bars.length === 0 ? (
            <p className="text-center text-[13px] text-faint py-10">ไม่มีข้อมูลในช่วงที่เลือก</p>
          ) : (
            <div className="flex items-end gap-1.5 h-[150px]">
              {bars.map((b) => (
                <div key={b.key} className="flex-1 flex flex-col justify-end gap-[3px] h-full min-w-0">
                  <div className="flex gap-[2px] items-end h-full">
                    <div className="flex-1 bg-income rounded-t-[3px]" style={{ height: b.inH }} />
                    <div className="flex-1 bg-expense rounded-t-[3px]" style={{ height: b.outH }} />
                  </div>
                  <span className="tabular-nums text-[9.5px] text-faint text-center truncate">{b.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card flex flex-col overflow-hidden min-h-0">
          <div className="flex items-center gap-2.5 px-[18px] pt-3.5 pb-2.5 flex-wrap">
            <span className="text-sm font-semibold">ตารางผลลัพธ์</span>
            <span className="text-[11.5px] text-faint">{activeReport?.label}</span>
            <div className="ml-auto">
              <ExportBar type={type} transactions={filtered} startDate={startDate} endDate={endDate} />
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[640px] px-[18px]">
              <div className="grid grid-cols-[110px_minmax(0,1fr)_130px_130px_130px] gap-2.5 pb-2 text-[11px] tracking-[0.08em] uppercase text-faint border-b border-[#EFEDE7]">
                <span>{type === 'daily' || type === 'tax' || type === 'installment' ? 'วันที่' : 'จำนวน'}</span>
                <span>รายการ</span>
                <span className="text-right">รายรับ</span>
                <span className="text-right">รายจ่าย</span>
                <span className="text-right">สุทธิ</span>
              </div>
              <div className="pb-3">
                <ReportTable type={type} transactions={filtered} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
