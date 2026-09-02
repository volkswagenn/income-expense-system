import { useState } from 'react'
import { Link } from 'react-router-dom'
import useCreditCardStore from '../../store/useCreditCardStore'
import useLogStore from '../../store/useLogStore'
import { buildLogEntry } from '../../lib/logBuilder'
import { formatCard } from '../../components/shared/CreditCardPicker'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import BankLogo from '../../components/shared/BankLogo'
import CardFormPopup, { autopayLabel, MONTHS_TH } from './CardFormPopup'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

/**
 * จัดการบัตรเครดิต — เพิ่ม แก้ไข ลบ อยู่ที่นี่ที่เดียว
 * การจ่ายบิล กดเงินสด บันทึกเงินคืน ยังอยู่ที่การ์ดบัตรในหน้ากระเป๋าเงิน เพราะเป็นงานประจำวัน
 */
export default function CardManage() {
  const cards = useCreditCardStore((s) => s.cards)
  const { createCard, updateCard, deleteCard, adjustOutstanding, ensureStatements } = useCreditCardStore()
  const { addLog } = useLogStore()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (fn) => {
    if (busy) return
    setBusy(true); setError('')
    try { await fn() } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const handleSave = (data) => run(async () => {
    if (editing) {
      await updateCard(editing.id, {
        bankName: data.bankName,
        name: data.name,
        last4: data.last4 || null,
        creditLimit: data.creditLimit,
        closingDay: data.closingDay,
        dueDay: data.dueDay,
        cashbackRate: data.cashbackRate,
        annualFee: data.annualFee,
        annualFeeMonth: data.annualFeeMonth,
        autopayMode: data.autopayMode,
        autopayAccountId: data.autopayAccountId,
        autopayAmount: data.autopayAmount,
      })
      // ยอดหนี้ต้องไปทาง RPC เสมอ ส่งเป็นส่วนต่าง ไม่เขียนทับยอด
      const delta = data.outstanding - Number(editing.outstanding || 0)
      if (delta !== 0) {
        await adjustOutstanding(editing.id, delta)
        await addLog(buildLogEntry({
          activityType: 'CARD_ADJUST',
          description: `ปรับยอดหนี้บัตร "${data.name}" ${fmt(editing.outstanding)} → ${fmt(data.outstanding)} บาท`,
          oldValue: { outstanding: editing.outstanding },
          newValue: { cardId: editing.id, outstanding: data.outstanding },
        }))
      } else {
        await addLog(buildLogEntry({
          activityType: 'CARD_UPDATE',
          description: `แก้ไขบัตรเครดิต "${data.name}"`,
          oldValue: editing,
          newValue: { ...editing, ...data },
        }))
      }
    } else {
      const card = await createCard(data)
      await addLog(buildLogEntry({
        activityType: 'CARD_CREATE',
        description: `เพิ่มบัตรเครดิต "${data.bankName} — ${data.name}"${data.outstanding ? ` ยอดยกมา ${fmt(data.outstanding)} บาท` : ''}`,
        newValue: card,
      }))
    }
    setFormOpen(false)
    setEditing(null)
    await ensureStatements()
  })

  const handleDelete = () => run(async () => {
    const card = confirmDelete
    await deleteCard(card.id)
    await addLog(buildLogEntry({
      activityType: 'CARD_DELETE',
      description: `ลบบัตรเครดิต "${formatCard(card)}"`,
      oldValue: card,
    }))
    setConfirmDelete(null)
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-semibold text-gray-900">💳 บัตรเครดิต</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            ตั้งค่าบัตรที่นี่ — จ่ายบิล กดเงินสด บันทึกเงินคืน ทำที่{' '}
            <Link to="/wallet" className="text-blue-600 hover:underline">หน้ากระเป๋าเงิน</Link>
          </p>
        </div>
        <button className="btn btn-primary text-xs" onClick={() => { setEditing(null); setFormOpen(true) }}>
          + เพิ่มบัตร
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">⚠️ {error}</p>}

      {cards.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <p className="text-4xl mb-3">💳</p>
          <p className="text-sm">ยังไม่มีบัตรเครดิต</p>
          <p className="text-xs mt-1">กด "เพิ่มบัตร" เพื่อเริ่มบันทึกรายจ่ายผ่านบัตร</p>
        </div>
      ) : (
        <div className="space-y-2">
          {cards.map((card) => {
            const debt = Number(card.outstanding) || 0
            return (
              <div key={card.id} className="rounded-xl border border-gray-200 p-3.5 flex items-center gap-3">
                <BankLogo bankName={card.bankName} size="lg" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{formatCard(card)}</p>
                  <p className="text-xs text-gray-500 truncate">
                    สรุปยอดทุกวันที่ {card.closingDay} · ครบกำหนดวันที่ {card.dueDay}
                    {Number(card.creditLimit) > 0 && ` · วงเงิน ${fmt(card.creditLimit)}`}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    หักบัญชี: {autopayLabel(card.autopayMode)}
                    {Number(card.annualFee) > 0 && (
                      ` · ค่าธรรมเนียมรายปี ${fmt(card.annualFee)}` +
                      (card.annualFeeMonth ? ` (${MONTHS_TH[card.annualFeeMonth - 1]})` : '')
                    )}
                    {Number(card.cashbackRate) > 0 && ` · เงินคืน ${card.cashbackRate}%`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-400">{debt < 0 ? 'เครดิตคงเหลือ' : 'ยอดหนี้'}</p>
                  <p className={`font-bold tabular-nums text-sm ${debt > 0 ? 'text-rose-600' : debt < 0 ? 'text-emerald-600' : 'text-gray-500'}`}>
                    {fmt(Math.abs(debt))}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button className="text-xs text-blue-500 hover:text-blue-700 px-1.5 py-1" onClick={() => { setEditing(card); setFormOpen(true) }}>แก้ไข</button>
                  <button className="text-xs text-red-400 hover:text-red-600 px-1.5 py-1" onClick={() => setConfirmDelete(card)}>ลบ</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {formOpen && (
        <CardFormPopup
          card={editing}
          onSave={handleSave}
          onClose={() => { setFormOpen(false); setEditing(null) }}
          busy={busy}
        />
      )}

      <ConfirmPopup
        open={!!confirmDelete}
        title="ลบบัตรเครดิต"
        message={
          confirmDelete
            ? `ลบ "${formatCard(confirmDelete)}" ที่มียอดหนี้ ${fmt(confirmDelete.outstanding)} บาท?\n\nรายการที่เคยรูดบัตรใบนี้จะยังอยู่ในประวัติและรายงานเหมือนเดิม แต่จะเลือกบัตรใบนี้ในฟอร์มไม่ได้อีก`
            : ''
        }
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
        confirmLabel="ลบบัตร"
        danger
      />
    </div>
  )
}
