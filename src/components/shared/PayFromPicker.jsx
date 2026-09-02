import useWalletStore from '../../store/useWalletStore'
import useCreditCardStore from '../../store/useCreditCardStore'
import BankLogo from './BankLogo'
import { formatCard } from './CreditCardPicker'
import { formatIsoThai } from '../../lib/cardCycle'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

/**
 * "จ่ายจาก" — เลือกกระเป๋าที่จะจ่ายจากรายการที่เห็นยอดคงเหลืออยู่ตรงนั้นเลย
 *
 * แทนที่ dropdown วิธีชำระเงิน + ตัวเลือกบัญชี/บัตรที่แยกกัน ด้วยรายการเดียว
 * ผู้ใช้เห็นทันทีว่ากระเป๋าไหนมีเงินเท่าไร บัตรไหนค้างเท่าไร ไม่ต้องเดา
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

  const is = (m, id) => {
    if (value.method !== m) return false
    if (m === 'transfer') return value.transferAccountId === id
    if (m === 'card') return value.cardId === id
    return true
  }
  const pick = (m, id) => onChange({
    method: m,
    transferAccountId: m === 'transfer' ? id : '',
    cardId: m === 'card' ? id : '',
  })

  const Row = ({ on, icon, tone, title, sub, right, rightTone, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 text-left rounded-xl border px-3 py-2 transition-colors ${
        on ? 'border-gray-900 ring-1 ring-gray-900 bg-white' : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <span className={`w-8 h-8 rounded-lg grid place-items-center text-base shrink-0 ${tone}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium truncate">{title}</span>
        {sub && <span className="block text-xs text-gray-500 truncate">{sub}</span>}
      </span>
      {right && (
        <span className={`text-xs tabular-nums shrink-0 ${rightTone ?? 'text-gray-700'}`}>{right}</span>
      )}
      <span className={`w-[18px] h-[18px] rounded-full border-2 shrink-0 grid place-items-center ${on ? 'border-gray-900 bg-gray-900' : 'border-gray-300'}`}>
        {on && <span className="w-2 h-2 rounded-full bg-white" />}
      </span>
    </button>
  )

  return (
    <div>
      <label className="label">{label}</label>
      <div className="space-y-1.5">
        {options.includes('cash') && (
          <Row on={is('cash')} icon="💵" tone="bg-emerald-50" title="เงินสด" sub="กระเป๋าเงินสด"
            right={fmt(cash)} rightTone={cash < 0 ? 'text-red-600' : undefined} onClick={() => pick('cash')} />
        )}

        {options.includes('transfer') && accounts.map((a) => (
          <Row key={a.id} on={is('transfer', a.id)}
            icon={<BankLogo bankName={a.bankName} size="sm" />} tone=""
            title={a.bankName ? `${a.bankName} — ${a.name}` : a.name} sub="เงินโอน"
            right={fmt(a.balance)} rightTone={a.balance < 0 ? 'text-red-600' : undefined}
            onClick={() => pick('transfer', a.id)} />
        ))}
        {options.includes('transfer') && accounts.length === 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ยังไม่มีบัญชีเงินโอน เพิ่มได้ที่หน้ากระเป๋าเงิน
          </p>
        )}

        {options.includes('card') && cards.map((c) => {
          const cur = getCurrentCycle(c.id)
          const bill = getStatements(c.id).find((s) => s.status !== 'paid')
          const limit = Number(c.creditLimit) || 0
          const left = limit > 0 ? limit - Number(c.outstanding || 0) : null
          const sub = [
            left !== null ? `วงเงินเหลือ ${fmt(left)}` : null,
            bill ? `บิล ${formatIsoThai(bill.dueDate)}` : (cur ? `ครบกำหนด ${formatIsoThai(cur.due.toISOString().slice(0, 10))}` : null),
          ].filter(Boolean).join(' · ')
          return (
            <Row key={c.id} on={is('card', c.id)}
              icon={<BankLogo bankName={c.bankName} size="sm" />} tone=""
              title={formatCard(c)} sub={sub || 'บัตรเครดิต'}
              right={`ค้าง ${fmt(c.outstanding)}`} rightTone="text-rose-600"
              onClick={() => pick('card', c.id)} />
          )
        })}

        {options.includes('debt') && (
          <Row on={is('debt')} icon="📒" tone="bg-amber-50" title="กู้ยืม / ผ่อนกับสถาบัน"
            sub="สร้างเป็นหนี้สิน มีตารางงวด ยังไม่ตัดเงิน" onClick={() => pick('debt')} />
        )}

        {options.includes('pending') && (
          <Row on={is('pending')} icon="⏳" tone="bg-yellow-50" title="ค้างชำระไว้ก่อน"
            sub="ยังไม่ตัดเงิน จนกว่าจะกดจ่าย" onClick={() => pick('pending')} />
        )}
      </div>
    </div>
  )
}
