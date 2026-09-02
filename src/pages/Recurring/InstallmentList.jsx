import { useState } from 'react'
import { format } from 'date-fns'
import useCreditCardStore from '../../store/useCreditCardStore'
import useLogStore from '../../store/useLogStore'
import { buildLogEntry } from '../../lib/logBuilder'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import DatePicker from '../../components/shared/DatePicker'
import BankLogo from '../../components/shared/BankLogo'
import { formatIsoThai } from '../../lib/cardCycle'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

const STATUS_STYLE = {
  paid:      { label: 'จ่ายแล้ว', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  billed:    { label: 'อยู่ในบิล รอจ่าย', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  pending:   { label: 'ยังไม่ถึงรอบ', cls: 'bg-gray-50 text-gray-500 border-gray-200' },
  cancelled: { label: 'ยกเลิก', cls: 'bg-gray-50 text-gray-400 border-gray-200 line-through' },
}

function SettlePopup({ installment, remaining, count, onConfirm, onCancel, busy }) {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [fee, setFee] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
          <h3 className="font-semibold text-base">ปิดยอดคงเหลือ</h3>
          <button className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={onCancel}>×</button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            รวมงวดที่เหลือ <strong>{count} งวด</strong> เป็นรายการเดียว{' '}
            <strong className="tabular-nums">{fmt(remaining)}</strong> บาท
            เข้าบิลรอบที่เปิดอยู่ แล้วปิดสัญญา "{installment.name}"
          </p>
          <div>
            <label className="label">วันที่ปิดยอด</label>
            <DatePicker value={date} onChange={setDate} />
          </div>
          <div>
            <label className="label">ค่าธรรมเนียมปิดยอด (ถ้ามี)</label>
            <input
              className="input"
              type="number"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <p className="text-xs text-gray-500">
            ยอดรวมที่จะเข้าบิล {fmt(remaining + (Number(fee) || 0))} บาท
          </p>
        </div>
        <div className="px-5 py-4 border-t bg-gray-50 flex gap-2 justify-end">
          <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>ยกเลิก</button>
          <button
            className="btn btn-primary"
            onClick={() => onConfirm({ date, fee: Number(fee) || 0 })}
            disabled={busy}
          >
            {busy ? '⏳ กำลังปิด…' : 'ปิดยอด'}
          </button>
        </div>
      </div>
    </div>
  )
}

function InstallmentCard({ installment, onSettle, onCancelInstallment }) {
  const [open, setOpen] = useState(false)
  const progress = useCreditCardStore((s) => s.getInstallmentProgress(installment.id))
  const cardLabel = useCreditCardStore((s) => s.getCardLabel(installment.cardId))
  const card = useCreditCardStore((s) => s.getCard(installment.cardId))
  if (!progress) return null

  const total = Number(installment.totalAmount)
  const done = progress.paidCount + progress.billedCount
  const pct = installment.months > 0 ? (done / installment.months) * 100 : 0
  // "งวดถัดไป" คืองวดที่ยังไม่ถูกเรียกเก็บ งวดที่อยู่ในบิลแล้วถือว่าเลยไปแล้ว
  const nextRow = progress.rows.find((r) => r.status === 'pending')
  const isActive = installment.status === 'active'

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${isActive ? 'border-gray-200' : 'border-gray-100 bg-gray-50'}`}>
      <div className="flex items-start gap-3">
        <BankLogo bankName={card?.bankName} size="md" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">
            {installment.name}
            {!isActive && (
              <span className="ml-2 text-xs font-normal text-gray-400">
                {installment.status === 'completed' ? 'ผ่อนครบแล้ว' : 'ยกเลิกแล้ว'}
              </span>
            )}
          </p>
          <p className="text-xs text-gray-500 truncate">{cardLabel}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-gray-400">คงเหลือ</p>
          <p className="font-bold tabular-nums text-rose-600">{fmt(progress.remainingAmount)}</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>
            ยอดเต็ม {fmt(total)} · งวดละ {fmt(installment.monthlyAmount)}
            {Number(installment.interestRate) > 0 ? ` · ${installment.interestRate}%` : ' · 0%'}
          </span>
          <span className="tabular-nums">งวด {done} จาก {installment.months}</span>
        </div>
        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full bg-rose-400" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {isActive && nextRow && (
        <p className="text-xs text-gray-600">
          งวดถัดไป งวดที่ {nextRow.seq} · {fmt(nextRow.amount)} บาท · ครบกำหนด {formatIsoThai(nextRow.dueDate)}
        </p>
      )}

      <div className="flex gap-2 items-center">
        <button
          className="text-xs text-gray-500 hover:text-gray-700 mr-auto"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? '▲ ซ่อนตารางงวด' : `▼ ดูตารางงวด (${installment.months} งวด)`}
        </button>
        {isActive && progress.remainingCount > 0 && (
          <>
            <button className="btn btn-secondary text-xs py-1 px-2.5" onClick={() => onSettle(installment, progress)}>
              ปิดยอดคงเหลือ
            </button>
            <button
              className="btn btn-secondary text-xs py-1 px-2.5 text-red-600"
              onClick={() => onCancelInstallment(installment, progress)}
            >
              ยกเลิก
            </button>
          </>
        )}
      </div>

      {open && (
        <div className="border-t pt-2 overflow-x-auto">
          <table className="w-full text-xs min-w-[420px]">
            <thead>
              <tr className="text-gray-400 text-left">
                <th className="py-1 pr-2 font-medium">งวด</th>
                <th className="py-1 pr-2 font-medium">รอบบิล</th>
                <th className="py-1 pr-2 font-medium">ครบกำหนด</th>
                <th className="py-1 pr-2 font-medium text-right">จำนวน</th>
                <th className="py-1 pr-2 font-medium">สถานะ</th>
                <th className="py-1 font-medium">จ่ายจริงวันที่</th>
              </tr>
            </thead>
            <tbody>
              {progress.rows.map((r) => {
                const st = STATUS_STYLE[r.status] ?? STATUS_STYLE.pending
                return (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="py-1.5 pr-2 tabular-nums text-gray-600">{r.seq}</td>
                    <td className="py-1.5 pr-2 tabular-nums text-gray-500">{r.cycle}</td>
                    <td className="py-1.5 pr-2 tabular-nums text-gray-500">{formatIsoThai(r.dueDate)}</td>
                    <td className="py-1.5 pr-2 tabular-nums text-right text-gray-700">{fmt(r.amount)}</td>
                    <td className="py-1.5 pr-2">
                      <span className={`inline-block rounded-full border px-2 py-0.5 ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="py-1.5 tabular-nums text-emerald-600">{r.paidAt ? formatIsoThai(r.paidAt) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function InstallmentList() {
  const installments = useCreditCardStore((s) => s.installments)
  const { settleInstallment, cancelInstallment } = useCreditCardStore()
  const { addLog } = useLogStore()

  const [showDone, setShowDone] = useState(false)
  const [settleTarget, setSettleTarget] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const active = installments.filter((i) => i.status === 'active')
  const done = installments.filter((i) => i.status !== 'active')

  const handleSettle = async ({ date, fee }) => {
    const { installment, progress } = settleTarget
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await settleInstallment(installment.id, {
        date,
        fee,
        log: buildLogEntry({
          activityType: 'INSTALLMENT_SETTLE',
          description:
            `ปิดยอดผ่อน "${installment.name}" ก่อนกำหนด ` +
            `${progress.remainingCount} งวด ${fmt(progress.remainingAmount + fee)} บาท`,
          oldValue: installment,
          newValue: { installmentId: installment.id, amount: progress.remainingAmount, fee, date },
        }),
      })
      setSettleTarget(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleCancel = async () => {
    const { installment, progress } = cancelTarget
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await cancelInstallment(installment.id, buildLogEntry({
        activityType: 'INSTALLMENT_CANCEL',
        description: `ยกเลิกการผ่อน "${installment.name}" เหลืออีก ${progress.remainingCount} งวด`,
        oldValue: installment,
      }))
      setCancelTarget(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const monthlyTotal = active.reduce((s, i) => s + Number(i.monthlyAmount || 0), 0)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="section-title">ผ่อนชำระผ่านบัตรเครดิต</h2>
        <p className="text-xs text-gray-500 mt-1">
          รายการที่แบ่งจ่ายเป็นงวด ไม่มีปุ่มจ่ายเพราะถูกเรียกเก็บผ่านบิลบัตรอัตโนมัติ
          เริ่มผ่อนได้จากฟอร์มบันทึกรายจ่าย เลือกบัตรเครดิตแล้วติ๊ก "แบ่งชำระ"
        </p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">⚠️ {error}</p>}

      {active.length === 0 && done.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <div className="text-3xl mb-2">💳</div>
          <p className="text-sm">ยังไม่มีรายการผ่อน</p>
          <p className="text-xs mt-1">บันทึกรายจ่าย เลือกบัตรเครดิต แล้วติ๊ก "แบ่งชำระ"</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-rose-800">
                กำลังผ่อน {active.length} รายการ
              </span>
              <span className="text-sm font-semibold tabular-nums text-rose-700">
                {fmt(monthlyTotal)} บาท / เดือน
              </span>
            </div>
          )}

          <div className="space-y-2.5">
            {active.map((i) => (
              <InstallmentCard
                key={i.id}
                installment={i}
                onSettle={(ins, progress) => setSettleTarget({ installment: ins, progress })}
                onCancelInstallment={(ins, progress) => setCancelTarget({ installment: ins, progress })}
              />
            ))}
          </div>

          {done.length > 0 && (
            <div>
              <button
                className="text-xs text-gray-500 hover:text-gray-700"
                onClick={() => setShowDone((v) => !v)}
              >
                {showDone ? '▲ ซ่อนรายการที่จบแล้ว' : `▼ รายการที่จบแล้ว ${done.length} รายการ`}
              </button>
              {showDone && (
                <div className="space-y-2.5 mt-2.5">
                  {done.map((i) => (
                    <InstallmentCard
                      key={i.id}
                      installment={i}
                      onSettle={() => {}}
                      onCancelInstallment={() => {}}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {settleTarget && (
        <SettlePopup
          installment={settleTarget.installment}
          remaining={settleTarget.progress.remainingAmount}
          count={settleTarget.progress.remainingCount}
          onConfirm={handleSettle}
          onCancel={() => setSettleTarget(null)}
          busy={busy}
        />
      )}

      <ConfirmPopup
        open={!!cancelTarget}
        title="ยกเลิกการผ่อน"
        message={
          cancelTarget
            ? `ยกเลิกงวดที่เหลืออีก ${cancelTarget.progress.remainingCount} งวด (${fmt(cancelTarget.progress.remainingAmount)} บาท) ของ "${cancelTarget.installment.name}"?\n\nงวดที่เรียกเก็บไปแล้วจะยังอยู่ เพราะเกิดขึ้นจริง ถ้าได้เงินคืนจากการคืนสินค้า ให้บันทึกเป็นรายรับที่ปลายทางเป็นบัตรแยกต่างหาก`
            : ''
        }
        onConfirm={handleCancel}
        onCancel={() => setCancelTarget(null)}
        confirmLabel="ยกเลิกการผ่อน"
        danger
      />
    </div>
  )
}
