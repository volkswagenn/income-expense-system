import { useState } from 'react'
import useWalletStore from '../../store/useWalletStore'
import useCreditCardStore from '../../store/useCreditCardStore'
import BankLogo from './BankLogo'
import DatePicker from './DatePicker'
import TransferAccountPicker from './TransferAccountPicker'
import DebtFields, { computeDebt, validateDebt } from './DebtFields'
import { formatCard } from './CreditCardPicker'
import { formatIsoThai, toDateString, formatThaiDate } from '../../lib/cardCycle'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

/**
 * "จ่ายจาก" — ปุ่มเดียวในฟอร์ม กดแล้วค่อยเปิด popup
 *
 * ทุกอย่างที่เกี่ยวกับ "จะจ่ายยังไง" อยู่ใน popup หมด ทั้งวิธี บัญชี บัตร
 * ช่องกู้ยืม และช่องค้างชำระ ฟอร์มหลักจึงเหลือแค่แถวเดียวที่บอกว่าเลือกอะไรอยู่
 * ของเดิมกางทั้งหมดในฟอร์ม พอมี 3 บัญชี 5 บัตร บวกช่องหนี้สิน ก็ยาวจนต้องเลื่อน
 *
 * value    = { method, transferAccountId, cardId }
 * onChange(patch)
 * debt / onDebtChange           — ค่าของช่องกู้ยืม (จาก DebtFields)
 * pending / onPendingChange     — { dueDate, accountId } ของค้างชำระ
 * itemName                      — ชื่อรายการ ใช้ตรวจหนี้สินก่อนกดตกลง
 */
export default function PayFromPicker({
  value, onChange,
  options = ['cash', 'transfer', 'card', 'pending'],
  label = 'จ่ายจาก',
  debt, onDebtChange,
  pending, onPendingChange,
  itemName = '',
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(null)       // สถานะชั่วคราวใน popup จนกว่าจะกดตกลง/ปิด
  const [error, setError] = useState('')

  const cash = useWalletStore((s) => s.cash)
  const accounts = useWalletStore((s) => s.transferAccounts)
  const cards = useCreditCardStore((s) => s.cards.filter((c) => c.enabled))
  const getCurrentCycle = useCreditCardStore((s) => s.getCurrentCycle)
  const getStatements = useCreditCardStore((s) => s.getStatements)

  const transferTotal = accounts.reduce((s, a) => s + Number(a.balance || 0), 0)
  const cardTotal = cards.reduce((s, c) => s + Number(c.outstanding || 0), 0)
  const account = accounts.find((a) => a.id === value.transferAccountId)
  const card = cards.find((c) => c.id === value.cardId)

  // ── สรุปที่โชว์บนปุ่มในฟอร์ม ──────────────────────────────────────────────
  const summary = (() => {
    const m = value.method
    if (m === 'cash') return { icon: '💵', t: 'เงินสด', sub: `คงเหลือ ${fmt(cash)}`, tone: cash < 0 ? 'text-red-600' : 'text-gray-500' }
    if (m === 'transfer') return account
      ? { icon: <BankLogo bankName={account.bankName} size="sm" />, t: account.bankName ? `${account.bankName} — ${account.name}` : account.name, sub: `เงินโอน · คงเหลือ ${fmt(account.balance)}`, tone: account.balance < 0 ? 'text-red-600' : 'text-gray-500' }
      : { icon: '🏦', t: 'เงินโอน', sub: 'ยังไม่ได้เลือกบัญชี', tone: 'text-amber-700' }
    if (m === 'card') return card
      ? { icon: <BankLogo bankName={card.bankName} size="sm" />, t: formatCard(card), sub: `บัตรเครดิต · ค้าง ${fmt(card.outstanding)}`, tone: 'text-rose-600' }
      : { icon: '💳', t: 'บัตรเครดิต', sub: 'ยังไม่ได้เลือกบัตร', tone: 'text-amber-700' }
    if (m === 'debt') {
      const c = debt ? computeDebt({ ...debt, name: itemName }) : null
      return c
        ? { icon: '📒', t: `กู้ยืม · ${debt.direction === 'receivable' ? 'คนอื่นติดเรา' : 'เราติดคนอื่น'}`, sub: `${c.months} งวด × ${fmt(c.monthly)} · รวม ${fmt(c.total)}${c.prepaidCount ? ` · ผ่อนมาแล้ว ${c.prepaidCount}` : ''}`, tone: 'text-amber-800' }
        : { icon: '📒', t: 'กู้ยืม / ผ่อนกับสถาบัน', sub: 'ยังไม่ได้ตั้งค่างวด', tone: 'text-amber-700' }
    }
    if (m === 'pending') return { icon: '⏳', t: 'ค้างชำระไว้ก่อน', sub: pending?.dueDate ? `ครบกำหนด ${formatIsoThai(pending.dueDate)}` : 'ยังไม่ตัดเงิน · ไม่ระบุวันครบกำหนด', tone: 'text-gray-500' }
    return { icon: '❔', t: 'เลือกวิธีจ่าย', sub: '', tone: 'text-gray-500' }
  })()

  // ── เปิด/ปิด ──────────────────────────────────────────────────────────────
  const openPopup = () => {
    setDraft({ method: value.method, transferAccountId: value.transferAccountId, cardId: value.cardId })
    setError('')
    setOpen(true)
  }
  const close = () => { setOpen(false); setDraft(null); setError('') }

  // เลือกเงินสด / บัญชี / บัตร แล้วปิดทันที ไม่ต้องกดตกลงซ้ำ
  const commit = (patch) => { onChange(patch); close() }
  const pickMethod = (m) => {
    if (m === 'cash') return commit({ method: 'cash', transferAccountId: '', cardId: '' })
    if (m === 'transfer' && accounts.length === 1) return commit({ method: 'transfer', transferAccountId: accounts[0].id, cardId: '' })
    if (m === 'card' && cards.length === 1) return commit({ method: 'card', transferAccountId: '', cardId: cards[0].id })
    setDraft({ method: m, transferAccountId: m === 'transfer' ? value.transferAccountId : '', cardId: m === 'card' ? value.cardId : '' })
    setError('')
  }
  const confirm = () => {
    if (draft.method === 'debt') {
      const err = validateDebt({ ...debt, name: itemName || 'x' }, computeDebt({ ...debt, name: itemName || 'x' }))
      if (err && !err.startsWith('กรอกชื่อ')) return setError(err)
    }
    commit({ method: draft.method, transferAccountId: '', cardId: '' })
  }

  const METHODS = [
    options.includes('cash') && { k: 'cash', icon: '💵', t: 'เงินสด', sub: fmt(cash), warn: cash < 0 },
    options.includes('transfer') && { k: 'transfer', icon: '🏦', t: 'เงินโอน', sub: accounts.length ? fmt(transferTotal) : 'ไม่มีบัญชี', warn: transferTotal < 0 },
    options.includes('card') && { k: 'card', icon: '💳', t: 'บัตรเครดิต', sub: cards.length ? `ค้าง ${fmt(cardTotal)}` : 'ไม่มีบัตร', rose: cardTotal > 0 },
    options.includes('debt') && { k: 'debt', icon: '📒', t: 'กู้ยืม', sub: 'มีตารางงวด' },
    options.includes('pending') && { k: 'pending', icon: '⏳', t: 'ค้างชำระ', sub: 'ยังไม่ตัดเงิน' },
  ].filter(Boolean)

  const Row = ({ on, icon, title, sub, right, rightTone, onClick }) => (
    <button type="button" onClick={onClick}
      className={`w-full flex items-center gap-2.5 text-left rounded-lg border px-2.5 py-2 transition-colors ${on ? 'border-gray-900 ring-1 ring-gray-900 bg-white' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium truncate">{title}</span>
        {sub && <span className="block text-[11px] text-gray-500 truncate">{sub}</span>}
      </span>
      {right && <span className={`text-xs tabular-nums shrink-0 ${rightTone ?? 'text-gray-700'}`}>{right}</span>}
    </button>
  )

  const needsConfirm = draft && (draft.method === 'debt' || draft.method === 'pending')

  return (
    <div>
      <label className="label">{label}</label>

      {/* ปุ่มสรุปในฟอร์ม */}
      <button type="button" onClick={openPopup}
        className="w-full flex items-center gap-2.5 text-left rounded-xl border border-gray-200 bg-white px-3 py-2 hover:border-gray-400 transition-colors">
        <span className="w-8 h-8 rounded-lg grid place-items-center text-base shrink-0 bg-gray-50">{summary.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium truncate">{summary.t}</span>
          <span className={`block text-xs truncate ${summary.tone}`}>{summary.sub}</span>
        </span>
        <span className="text-xs text-gray-400 shrink-0">เปลี่ยน ▾</span>
      </button>

      {open && draft && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={close}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3.5 border-b bg-gray-50 flex items-center justify-between shrink-0">
              <h3 className="font-semibold text-base">จ่ายจาก</h3>
              <button type="button" className="text-gray-400 hover:text-gray-600 text-xl leading-none" onClick={close}>×</button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto">
              {/* ชั้นที่ 1 วิธี */}
              <div className={`grid gap-1.5 ${METHODS.length >= 5 ? 'grid-cols-5' : METHODS.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                {METHODS.map((m) => {
                  const on = draft.method === m.k
                  return (
                    <button key={m.k} type="button" onClick={() => pickMethod(m.k)}
                      className={`rounded-xl border px-1 py-2 text-center transition-colors ${on ? 'border-gray-900 ring-1 ring-gray-900 bg-white' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                      <span className="block text-lg leading-none">{m.icon}</span>
                      <span className="block text-[12px] font-medium mt-1 leading-tight">{m.t}</span>
                      <span className={`block text-[10.5px] tabular-nums mt-0.5 leading-tight truncate ${m.warn ? 'text-red-600' : m.rose ? 'text-rose-600' : 'text-gray-500'}`}>{m.sub}</span>
                    </button>
                  )
                })}
              </div>

              {/* ชั้นที่ 2 */}
              {draft.method === 'transfer' && (
                <div className="space-y-1">
                  {accounts.length === 0
                    ? <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">ยังไม่มีบัญชีเงินโอน เพิ่มได้ที่หน้ากระเป๋าเงิน</p>
                    : accounts.map((a) => (
                      <Row key={a.id} on={draft.transferAccountId === a.id}
                        icon={<BankLogo bankName={a.bankName} size="sm" />}
                        title={a.bankName ? `${a.bankName} — ${a.name}` : a.name}
                        right={fmt(a.balance)} rightTone={a.balance < 0 ? 'text-red-600' : undefined}
                        onClick={() => commit({ method: 'transfer', transferAccountId: a.id, cardId: '' })} />
                    ))}
                </div>
              )}

              {draft.method === 'card' && (
                <div className="space-y-1">
                  {cards.length === 0
                    ? <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">ยังไม่มีบัตรเครดิต เพิ่มได้ที่หน้ากระเป๋าเงิน</p>
                    : cards.map((c) => {
                      const bill = getStatements(c.id).find((s) => s.status !== 'paid')
                      const cur = bill ? null : getCurrentCycle(c.id)
                      const limit = Number(c.creditLimit) || 0
                      const left = limit > 0 ? limit - Number(c.outstanding || 0) : null
                      const sub = [
                        left !== null ? `วงเงินเหลือ ${fmt(left)}` : null,
                        bill ? `บิล ${formatIsoThai(bill.dueDate)}` : cur ? `ครบกำหนด ${formatIsoThai(toDateString(cur.due))}` : null,
                      ].filter(Boolean).join(' · ')
                      return (
                        <Row key={c.id} on={draft.cardId === c.id}
                          icon={<BankLogo bankName={c.bankName} size="sm" />}
                          title={formatCard(c)} sub={sub || null}
                          right={`ค้าง ${fmt(c.outstanding)}`} rightTone="text-rose-600"
                          onClick={() => commit({ method: 'card', transferAccountId: '', cardId: c.id })} />
                      )
                    })}
                </div>
              )}

              {draft.method === 'debt' && debt && (
                <div className="rounded-xl bg-amber-50/60 border border-amber-200 p-3">
                  <p className="text-xs text-amber-800 mb-2">บันทึกเป็นหนี้สินที่มีตารางงวด ยังไม่ตัดเงินและยังไม่สร้างรายจ่าย ชื่อรายการใช้จากฟอร์ม</p>
                  <DebtFields value={debt} onChange={(d) => { onDebtChange(d); setError('') }} hideName hideCategory />
                </div>
              )}

              {draft.method === 'pending' && pending && (
                <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-3 space-y-2">
                  <p className="text-xs text-yellow-800">ยังไม่ตัดเงินจนกว่าจะกดชำระ</p>
                  <div>
                    <label className="label">วันที่กำหนดชำระ</label>
                    <DatePicker value={pending.dueDate} onChange={(v) => onPendingChange({ ...pending, dueDate: v })} placeholder="ไม่ระบุ" />
                  </div>
                  <TransferAccountPicker value={pending.accountId} onChange={(v) => onPendingChange({ ...pending, accountId: v })} label="ตั้งบัญชีที่จะจ่าย (ไม่บังคับ)" />
                  <p className="text-xs text-yellow-700">ตั้งบัญชีไว้แล้ว เวลากดชำระจะตัดจากบัญชีนั้นให้เลย</p>
                </div>
              )}

              {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">⚠️ {error}</p>}
            </div>

            {needsConfirm && (
              <div className="px-4 py-3 border-t bg-gray-50 flex gap-2 justify-end shrink-0">
                <button type="button" className="btn btn-secondary" onClick={close}>ยกเลิก</button>
                <button type="button" className="btn btn-primary" onClick={confirm}>ตกลง</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
