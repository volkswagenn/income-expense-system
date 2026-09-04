import { useState } from 'react'
import Popup from './Popup'
import { Link } from 'react-router-dom'
import useWalletStore from '../../store/useWalletStore'
import useCreditCardStore from '../../store/useCreditCardStore'
import BankLogo from './BankLogo'
import Icon from './Icon'
import UiIcon from './UiIcon'
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

  // แถวเลือกบัญชี/บัตร — วงกลมติ๊กท้ายแถวบอกว่ากำลังเลือกอันไหนอยู่
  // ถ้าใช้แค่ขอบเข้มอย่างเดียว บนจอกลางแดดจะแยกไม่ออกว่าอันไหนถูกเลือก
  const Row = ({ on, icon, title, sub, right, rightTone, balLabel, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-[11px] text-left rounded-ctl border px-3 py-2.5 transition ${
        on ? 'border-ink shadow-[0_0_0_1px_#16181D] bg-[#F2FAD9]' : 'border-hairline bg-white hover:border-ink'
      }`}
    >
      <span className="flex-none">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold truncate">{title}</span>
        {sub && <span className="block text-[11px] text-faint truncate">{sub}</span>}
      </span>
      {right && (
        <span className="flex-none text-right">
          {balLabel && <span className="block text-[10.5px] text-faint">{balLabel}</span>}
          <span className={`tabular-nums block text-[13px] font-bold ${rightTone ?? 'text-ink'}`}>{right}</span>
        </span>
      )}
      <span
        className={`flex-none w-[22px] h-[22px] rounded-full flex items-center justify-center ${
          on ? 'bg-ink' : 'border border-[#D8D4C9]'
        }`}
      >
        {on && <Icon name="check" size={15} className="text-lime" />}
      </span>
    </button>
  )

  const needsConfirm = draft && (draft.method === 'debt' || draft.method === 'pending')

  /**
   * กดปุ่มช่องทางจากในฟอร์มโดยตรง
   * เงินสด = จบเลย, ช่องทางที่มีตัวเลือกเดียวก็เลือกให้เลย ที่เหลือเปิด popup ให้เลือกต่อ
   */
  const pickMethodDirect = (m) => {
    setError('')
    if (m === 'cash') return onChange({ method: 'cash', transferAccountId: '', cardId: '' })
    if (m === 'transfer' && accounts.length === 1) {
      return onChange({ method: 'transfer', transferAccountId: accounts[0].id, cardId: '' })
    }
    if (m === 'card' && cards.length === 1) {
      return onChange({ method: 'card', transferAccountId: '', cardId: cards[0].id })
    }
    setDraft({
      method: m,
      transferAccountId: m === 'transfer' ? value.transferAccountId : '',
      cardId: m === 'card' ? value.cardId : '',
    })
    setOpen(true)
  }

  /**
   * แถวปุ่มเลือกช่องทาง — กางให้เห็นทุกช่องทางพร้อมยอดคงเหลือ
   *
   * ของเดิมเป็นปุ่มเดียวที่ต้องกดเปิด popup ก่อนถึงจะรู้ว่ามีช่องทางอะไรบ้าง
   * ซึ่งเป็นการตัดสินใจที่ทำทุกครั้งที่บันทึก จึงควรเห็นตัวเลือกทั้งหมดตั้งแต่แรก
   * ช่องทางที่ต้องเลือกต่อ (บัญชีไหน บัตรใบไหน ตารางงวด วันครบกำหนด) ยังเปิด popup เหมือนเดิม
   */
  const TILE_TONE = {
    cash: { on: 'border-ink shadow-[0_0_0_1px_#16181D] bg-white', icon: 'text-income' },
    transfer: { on: 'border-ink shadow-[0_0_0_1px_#16181D] bg-white', icon: 'text-transfer' },
    card: { on: 'border-ink shadow-[0_0_0_1px_#16181D] bg-white', icon: 'text-expense' },
    debt: { on: 'border-ink shadow-[0_0_0_1px_#16181D] bg-white', icon: 'text-pending' },
    pending: { on: 'border-ink shadow-[0_0_0_1px_#16181D] bg-white', icon: 'text-pending' },
  }
  const TILE_ICON = { cash: 'payments', transfer: 'account_balance', card: 'credit_card', debt: 'receipt_long', pending: 'schedule' }
  const NEEDS_PICK = new Set(['transfer', 'card', 'debt', 'pending'])

  /** ข้อความบรรทัดล่างของแต่ละปุ่ม — บอกสถานะจริงของช่องทางนั้น */
  const tileSub = (k) => {
    if (k === 'cash') return `คงเหลือ ${fmt(cash)}`
    if (k === 'transfer') {
      if (!accounts.length) return 'ยังไม่มีบัญชี'
      return account ? `${account.bankName ?? ''} ${account.name} · ${fmt(account.balance)}`.trim() : 'เลือกบัญชี'
    }
    if (k === 'card') {
      if (!cards.length) return 'ยังไม่มีบัตร'
      return card ? `${formatCard(card)}` : 'เลือกบัตร'
    }
    if (k === 'debt') {
      const c = debt ? computeDebt({ ...debt, name: itemName || 'x' }) : null
      return c ? `${c.months} งวด × ${fmt(c.monthly)}` : 'ตั้งตารางงวด'
    }
    if (k === 'pending') {
      return pending?.dueDate ? `ครบกำหนด ${formatIsoThai(pending.dueDate)}` : 'ยังไม่ตัดเงิน'
    }
    return ''
  }

  return (
    <div>
      <label className="label">{label}</label>

      {/* มือถือเรียง 3 คอลัมน์ตามแบบ (ปุ่มสูงพอให้นิ้วกด ~52px) จอใหญ่กางแถวเดียว */}
      <div className={`grid gap-2 ${
        METHODS.length >= 5 ? 'grid-cols-3 lg:grid-cols-5'
          : METHODS.length === 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-3'
      }`}>
        {METHODS.map((m) => {
          const on = value.method === m.k
          const tone = TILE_TONE[m.k] ?? TILE_TONE.cash
          return (
            <button
              key={m.k}
              type="button"
              onClick={() => (on && NEEDS_PICK.has(m.k) ? openPopup() : pickMethodDirect(m.k))}
              className={`rounded-ctl border px-2.5 py-2.5 text-left transition ${
                on ? tone.on : 'border-hairline bg-white hover:border-[#C9C5BA]'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Icon name={TILE_ICON[m.k]} size={17} className={`flex-none ${on ? tone.icon : 'text-faint'}`} />
                <span className="flex-none whitespace-nowrap text-[12.5px] font-semibold">{m.t}</span>
              </span>
              <span className="flex items-center gap-1 mt-1">
                <span className={`tabular-nums flex-1 min-w-0 text-[11.5px] truncate ${
                  m.warn ? 'text-expense' : on ? 'text-muted' : 'text-faint'
                }`}>
                  {tileSub(m.k)}
                </span>
                {NEEDS_PICK.has(m.k) && <Icon name="expand_more" size={16} className="flex-none text-faint" />}
              </span>
            </button>
          )
        })}
      </div>

      {open && draft && (
        <Popup
      title="จ่ายจาก"
          icon="payments"
          width={420}
          onClose={onClose}
        >
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
                      icon={<BankLogo bankName={a.bankName} size="lg" />}
                      title={a.bankName ? `${a.bankName} — ${a.name}` : a.name}
                      sub={a.accountNumber ? `${a.accountType ?? 'บัญชี'} · ${a.accountNumber}` : null}
                      balLabel="คงเหลือ"
                      right={fmt(a.balance)} rightTone={a.balance < 0 ? 'text-expense' : undefined}
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
                        icon={<BankLogo bankName={c.bankName} size="lg" />}
                        title={formatCard(c)} sub={sub || null}
                        balLabel="ยอดค้าง"
                        right={fmt(c.outstanding)} rightTone="text-expense"
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

            {/* ทางออกไปเพิ่มบัญชี/บัตร — ไม่งั้นคนที่ยังไม่มีบัญชีจะติดอยู่ในกล่องนี้
                โดยไม่รู้ว่าต้องไปเพิ่มที่ไหน */}
            {(draft.method === 'transfer' || draft.method === 'card') && (
              <div className="flex items-center gap-2 border-t border-[#F2F0EA] pt-[11px]">
                <span className="flex-1 min-w-0 text-[11px] text-faint leading-relaxed">
                  เพิ่ม แก้ไข หรือลบบัญชีและบัตรได้ที่ จัดการข้อมูล
                </span>
                <Link
                  to={draft.method === 'card' ? '/manage/cards' : '/manage/accounts'}
                  onClick={close}
                  className="flex-none h-8 px-3 rounded-[9px] border border-hairline bg-white text-[12px] font-semibold flex items-center gap-1.5 hover:bg-paper"
                >
                  <UiIcon name="plus" size={13} />
                  เพิ่มใหม่
                </Link>
              </div>
            )}
        </Popup>
      )}
    </div>
  )
}
