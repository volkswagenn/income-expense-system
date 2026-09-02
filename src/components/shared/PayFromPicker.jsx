import useWalletStore from '../../store/useWalletStore'
import useCreditCardStore from '../../store/useCreditCardStore'
import BankLogo from './BankLogo'
import { formatCard } from './CreditCardPicker'
import { formatIsoThai, toDateString } from '../../lib/cardCycle'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

/**
 * "จ่ายจาก" สองชั้น — เลือกวิธีก่อน แล้วค่อยเลือกว่าบัญชีไหนหรือบัตรใบไหน
 *
 * ของเดิมโชว์ทุกบัญชีทุกบัตรในรายการเดียว พอมี 3 บัญชี 5 บัตร ก็ยาว 11 แถว
 * ชั้นบนจึงเหลือแค่ 5 วิธี ยอดคงเหลือยังโชว์อยู่ตรงปุ่มและในรายการชั้นล่าง
 * ผู้ใช้ยังไม่ต้องเดา แต่ไม่ต้องไล่อ่านทั้งหมดทุกครั้ง
 *
 * value = { method, transferAccountId, cardId }
 * onChange(nextValue)
 * options = ['cash','transfer','card','debt','pending'] — ฟอร์มไหนไม่ใช้อันไหนก็ตัดออก
 */
export default function PayFromPicker({ value, onChange, options = ['cash', 'transfer', 'card', 'pending'], label = 'จ่ายจาก' }) {
  const cash = useWalletStore((s) => s.cash)
  const accounts = useWalletStore((s) => s.transferAccounts)
  const cards = useCreditCardStore((s) => s.cards.filter((c) => c.enabled))
  const getCurrentCycle = useCreditCardStore((s) => s.getCurrentCycle)
  const getStatements = useCreditCardStore((s) => s.getStatements)

  const transferTotal = accounts.reduce((s, a) => s + Number(a.balance || 0), 0)
  const cardTotal = cards.reduce((s, c) => s + Number(c.outstanding || 0), 0)

  // เลือกวิธี — ถ้ามีบัญชี/บัตรใบเดียว เลือกให้เลย ไม่ต้องกดซ้ำ
  const pickMethod = (m) => onChange({
    method: m,
    transferAccountId: m === 'transfer' ? (value.transferAccountId || (accounts.length === 1 ? accounts[0].id : '')) : '',
    cardId: m === 'card' ? (value.cardId || (cards.length === 1 ? cards[0].id : '')) : '',
  })
  const pickAccount = (id) => onChange({ method: 'transfer', transferAccountId: id, cardId: '' })
  const pickCard = (id) => onChange({ method: 'card', transferAccountId: '', cardId: id })

  const METHODS = [
    options.includes('cash') && { k: 'cash', icon: '💵', t: 'เงินสด', sub: fmt(cash), warn: cash < 0 },
    options.includes('transfer') && { k: 'transfer', icon: '🏦', t: 'เงินโอน', sub: accounts.length ? fmt(transferTotal) : 'ไม่มีบัญชี', warn: transferTotal < 0 },
    options.includes('card') && { k: 'card', icon: '💳', t: 'บัตรเครดิต', sub: cards.length ? `ค้าง ${fmt(cardTotal)}` : 'ไม่มีบัตร', rose: cardTotal > 0 },
    options.includes('debt') && { k: 'debt', icon: '📒', t: 'กู้ยืม', sub: 'มีตารางงวด' },
    options.includes('pending') && { k: 'pending', icon: '⏳', t: 'ค้างชำระ', sub: 'ยังไม่ตัดเงิน' },
  ].filter(Boolean)

  const SubRow = ({ on, icon, title, sub, right, rightTone, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 text-left rounded-lg border px-2.5 py-1.5 transition-colors ${
        on ? 'border-gray-900 ring-1 ring-gray-900 bg-white' : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium truncate">{title}</span>
        {sub && <span className="block text-[11px] text-gray-500 truncate">{sub}</span>}
      </span>
      {right && <span className={`text-xs tabular-nums shrink-0 ${rightTone ?? 'text-gray-700'}`}>{right}</span>}
      <span className={`w-4 h-4 rounded-full border-2 shrink-0 grid place-items-center ${on ? 'border-gray-900 bg-gray-900' : 'border-gray-300'}`}>
        {on && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
      </span>
    </button>
  )

  return (
    <div>
      <label className="label">{label}</label>

      {/* ชั้นที่ 1 วิธี */}
      <div className={`grid gap-1.5 ${METHODS.length >= 5 ? 'grid-cols-5' : METHODS.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
        {METHODS.map((m) => {
          const on = value.method === m.k
          return (
            <button
              key={m.k}
              type="button"
              onClick={() => pickMethod(m.k)}
              className={`rounded-xl border px-1.5 py-2 text-center transition-colors ${
                on ? 'border-gray-900 ring-1 ring-gray-900 bg-white' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <span className="block text-lg leading-none">{m.icon}</span>
              <span className="block text-[12px] font-medium mt-1 leading-tight">{m.t}</span>
              <span className={`block text-[10.5px] tabular-nums mt-0.5 leading-tight truncate ${m.warn ? 'text-red-600' : m.rose ? 'text-rose-600' : 'text-gray-500'}`}>
                {m.sub}
              </span>
            </button>
          )
        })}
      </div>

      {/* ชั้นที่ 2 บัญชีหรือบัตร เฉพาะวิธีที่เลือก */}
      {value.method === 'transfer' && (
        <div className="mt-2 space-y-1">
          {accounts.length === 0 ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ยังไม่มีบัญชีเงินโอน เพิ่มได้ที่หน้ากระเป๋าเงิน
            </p>
          ) : accounts.map((a) => (
            <SubRow key={a.id} on={value.transferAccountId === a.id}
              icon={<BankLogo bankName={a.bankName} size="sm" />}
              title={a.bankName ? `${a.bankName} — ${a.name}` : a.name}
              right={fmt(a.balance)} rightTone={a.balance < 0 ? 'text-red-600' : undefined}
              onClick={() => pickAccount(a.id)} />
          ))}
        </div>
      )}

      {value.method === 'card' && (
        <div className="mt-2 space-y-1">
          {cards.length === 0 ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ยังไม่มีบัตรเครดิต เพิ่มได้ที่หน้ากระเป๋าเงิน
            </p>
          ) : cards.map((c) => {
            const bill = getStatements(c.id).find((s) => s.status !== 'paid')
            const cur = bill ? null : getCurrentCycle(c.id)
            const limit = Number(c.creditLimit) || 0
            const left = limit > 0 ? limit - Number(c.outstanding || 0) : null
            const sub = [
              left !== null ? `วงเงินเหลือ ${fmt(left)}` : null,
              bill ? `บิล ${formatIsoThai(bill.dueDate)}` : cur ? `ครบกำหนด ${formatIsoThai(toDateString(cur.due))}` : null,
            ].filter(Boolean).join(' · ')
            return (
              <SubRow key={c.id} on={value.cardId === c.id}
                icon={<BankLogo bankName={c.bankName} size="sm" />}
                title={formatCard(c)} sub={sub || null}
                right={`ค้าง ${fmt(c.outstanding)}`} rightTone="text-rose-600"
                onClick={() => pickCard(c.id)} />
            )
          })}
        </div>
      )}
    </div>
  )
}
