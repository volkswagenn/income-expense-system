import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import usePendingStore from '../../store/usePendingStore'
import useCreditCardStore from '../../store/useCreditCardStore'
import useDebtStore from '../../store/useDebtStore'
import useCategoryStore from '../../store/useCategoryStore'
import { formatIsoThai, daysUntil } from '../../lib/cardCycle'
import SourceTag, { SOURCES } from '../../components/shared/SourceTag'
import InstallmentList from '../Recurring/InstallmentList'
import DebtList from '../Wallet/DebtList'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

const FILTERS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'installment', label: `${SOURCES.installment.icon} ${SOURCES.installment.label}` },
  { key: 'debt', label: `${SOURCES.debt.icon} ${SOURCES.debt.label}` },
  { key: 'pending', label: `${SOURCES.pending.icon} ${SOURCES.pending.label}` },
]

/** รายการค้างชำระ — จ่ายจริงที่หน้ารายการรอดำเนินการ ที่นี่แสดงให้ครบว่าเป็นหนี้อยู่เท่าไร */
function PendingSection() {
  const navigate = useNavigate()
  const rows = usePendingStore((s) => s.pendingPayments.filter((p) => p.status === 'pending'))
  const categories = useCategoryStore((s) => s.categories)
  const categoryName = (id) => categories.find((c) => c.id === id)?.name ?? ''

  const sorted = useMemo(
    () => [...rows].sort((a, b) => String(a.dueDate ?? '9999').localeCompare(String(b.dueDate ?? '9999'))),
    [rows]
  )
  const total = sorted.reduce((s, p) => s + Number(p.amount || 0), 0)

  return (
    <div className="space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="section-title">{SOURCES.pending.icon} รายการค้างชำระ</h2>
          <p className="text-xs text-gray-500 mt-1">
            บิลที่รับของหรือใช้บริการไปแล้วแต่ยังไม่จ่าย นับเป็นหนี้เหมือนกัน
            กดจ่ายได้ที่หน้ารายการรอดำเนินการ
          </p>
        </div>
        <button className="btn btn-secondary text-xs shrink-0" onClick={() => navigate('/pending-tasks')}>
          ไปหน้ารายการรอ
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <div className="text-3xl mb-2">{SOURCES.pending.icon}</div>
          <p className="text-sm">ไม่มีรายการค้างชำระ</p>
        </div>
      ) : (
        <>
          <div className="rounded-xl bg-yellow-50 border border-yellow-200 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-yellow-900">ค้างชำระ {sorted.length} รายการ</span>
            <span className="text-sm font-semibold tabular-nums text-yellow-800">{fmt(total)} บาท</span>
          </div>

          <div className="space-y-2">
            {sorted.map((p) => {
              const left = p.dueDate ? daysUntil(new Date(p.dueDate + 'T00:00:00')) : null
              return (
                <div key={p.id} className="rounded-xl border border-gray-200 p-3.5 flex items-center gap-3">
                  <span className="w-9 h-9 rounded-lg grid place-items-center text-lg shrink-0 bg-yellow-50">
                    {SOURCES.pending.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium text-gray-800 truncate">{p.itemName || 'ค้างชำระ'}</p>
                      <SourceTag source="pending" detail={p.vendor || undefined} />
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {categoryName(p.category) || 'ไม่ระบุหมวดหมู่'}
                      {p.dueDate && ` · ครบกำหนด ${formatIsoThai(p.dueDate)}`}
                      {left !== null && (
                        <span className={left < 0 ? ' text-red-600 font-medium' : left <= 7 ? ' text-amber-700 font-medium' : ' text-gray-400'}>
                          {left < 0 ? ` เกินกำหนด ${-left} วัน` : ` อีก ${left} วัน`}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-gray-400">ต้องจ่าย</p>
                    <p className="font-bold tabular-nums text-yellow-700">{fmt(p.amount)}</p>
                  </div>
                  <button
                    className="btn btn-primary text-xs !h-8 px-3 shrink-0"
                    onClick={() => navigate('/pending-tasks')}
                  >
                    ไปจ่าย
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * ผ่อนชำระ/หนี้สิน — รวมภาระที่ยังผ่อนหรือค้างอยู่ทุกแหล่งไว้หน้าเดียว
 *
 * ของเดิมแยกกันคนละที่: ผ่อนบัตรอยู่แท็บนี้ หนี้สินอยู่หน้ากระเป๋าเงิน
 * ค้างชำระอยู่หน้ารายการรอ ทำให้ตอบไม่ได้ว่า "ตอนนี้เป็นหนี้อยู่เท่าไร"
 * ตอนนี้ดึงมารวมและติดป้ายว่าแต่ละก้อนมาจากไหน ส่วนวิธีจ่ายยังเป็นของเดิมของแต่ละแหล่ง
 * เพราะเงินไหลคนละทาง ผ่อนบัตรเข้าบิล หนี้สินจ่ายทีละงวด ค้างชำระจ่ายที่หน้ารายการรอ
 */
export default function DebtHub() {
  const [filter, setFilter] = useState('all')

  const installments = useCreditCardStore((s) => s.installments)
  const getInstallmentProgress = useCreditCardStore((s) => s.getInstallmentProgress)
  const debtTotals = useDebtStore((s) => s.getTotals())
  const pendingTotal = usePendingStore((s) =>
    s.pendingPayments.reduce((sum, p) => sum + (p.status === 'pending' ? Number(p.amount || 0) : 0), 0)
  )
  const pendingCount = usePendingStore((s) =>
    s.pendingPayments.reduce((n, p) => n + (p.status === 'pending' ? 1 : 0), 0)
  )

  const instTotal = useMemo(
    () => installments
      .filter((i) => i.status === 'active')
      .reduce((sum, i) => sum + (getInstallmentProgress(i.id)?.remainingAmount ?? 0), 0),
    [installments, getInstallmentProgress]
  )
  const instCount = installments.filter((i) => i.status === 'active').length

  const owed = instTotal + debtTotals.payable + pendingTotal
  const show = (key) => filter === 'all' || filter === key

  const cards = [
    { key: 'installment', total: instTotal, count: instCount, tone: 'text-rose-700' },
    { key: 'debt', total: debtTotals.payable, count: null, tone: 'text-amber-800' },
    { key: 'pending', total: pendingTotal, count: pendingCount, tone: 'text-yellow-800' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h2 className="section-title">ผ่อนชำระ / หนี้สิน</h2>
        <p className="text-xs text-gray-500 mt-1">
          ทุกอย่างที่ยังต้องจ่ายอยู่ รวมไว้ที่นี่ที่เดียว แต่ละรายการติดป้ายว่ามาจากไหน
          การเพิ่มและแก้ไขทำที่เมนูจัดการข้อมูล ส่วนที่นี่ไว้ดูยอดและกดจ่าย
        </p>
      </div>

      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-rose-900">รวมที่ยังเป็นหนี้อยู่ทั้งหมด</span>
          <span className="text-lg font-bold tabular-nums text-rose-700">{fmt(owed)} บาท</span>
        </div>
        {debtTotals.receivable > 0 && (
          <div className="flex items-center justify-between gap-3 text-xs mt-1 pt-1 border-t border-rose-200">
            <span className="text-emerald-800">คนอื่นติดเรา (ยังไม่ได้หักออกจากยอดข้างบน)</span>
            <span className="font-semibold tabular-nums text-emerald-700">{fmt(debtTotals.receivable)}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {cards.map((c) => {
          const s = SOURCES[c.key]
          return (
            <button
              key={c.key}
              className={`rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                filter === c.key ? 'border-gray-900 ring-1 ring-gray-900 bg-white' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
              onClick={() => setFilter(filter === c.key ? 'all' : c.key)}
            >
              <p className="text-xs text-gray-500">
                {s.icon} {s.label}
                {c.count !== null && c.count > 0 && ` · ${c.count} รายการ`}
              </p>
              <p className={`font-bold tabular-nums ${c.tone}`}>{fmt(c.total)}</p>
            </button>
          )
        })}
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`btn text-xs px-3 py-1.5 rounded-lg transition-all ${
              filter === f.key ? 'bg-white shadow-sm text-gray-900 font-semibold' : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {show('installment') && <InstallmentList />}
      {show('debt') && (
        <div className={show('installment') ? 'border-t pt-5' : ''}>
          <DebtList embedded />
        </div>
      )}
      {show('pending') && (
        <div className={filter === 'all' ? 'border-t pt-5' : ''}>
          <PendingSection />
        </div>
      )}
    </div>
  )
}
