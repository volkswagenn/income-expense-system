import useWalletStore from '../../store/useWalletStore'
import useCreditCardStore from '../../store/useCreditCardStore'
import useRecurringStore from '../../store/useRecurringStore'
import useTransactionStore from '../../store/useTransactionStore'
import useDebtStore from '../../store/useDebtStore'
import Icon from '../../components/shared/Icon'
import { localMonthStr } from '../../lib/dateUtils'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

/** กล่องรายการ + ยอดรวม ใช้กับแท็บที่ไม่ใช่ฟอร์ม (รายการประจำ / ค้นหารายการ) */
function SummaryBox({ rows, totalLabel, totalValue, note }) {
  return (
    <>
      <div className="bg-paper rounded-ctl px-3.5 py-3 mt-2.5 flex flex-col gap-[7px]">
        {rows.length === 0 && (
          <span className="text-[12px] text-faint leading-relaxed">ไม่มีรายการในช่วงนี้</span>
        )}
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-2.5 text-[12.5px]">
            <span className="flex-1 min-w-0 text-muted truncate">{r.label}</span>
            <span className={`flex-none tabular-nums font-semibold ${r.tone ?? ''}`}>{r.value}</span>
          </div>
        ))}
        <div className="flex justify-between items-baseline border-t border-hairline pt-[7px]">
          <span className="text-[12.5px] font-semibold">{totalLabel}</span>
          <span className="tabular-nums text-base font-bold">{totalValue}</span>
        </div>
      </div>
      {note && <div className="text-[11.5px] text-faint leading-relaxed mt-2.5">{note}</div>}
    </>
  )
}

/**
 * "ก่อนกดบันทึก ระบบจะทำสิ่งนี้" — บอกล่วงหน้าว่ากดแล้วยอดไหนจะขยับเท่าไร
 *
 * มีไว้เพราะเงินออกจากคนละที่กันตามช่องทางที่เลือก (เงินสด / บัญชีไหน / บัตรใบไหน)
 * และบางช่องทางไม่ตัดเงินตอนนี้เลย (ค้างชำระ บัตรเครดิต หนี้สิน) ซึ่งเป็นจุดที่
 * ผู้ใช้เข้าใจผิดบ่อยที่สุด — เห็นยอดก่อน/หลังไว้ก่อนจึงกันบันทึกผิดช่องทางได้
 *
 * preview = { type, method, amount, accountId, cardId, recurringName }
 */
export default function BeforeSavePanel({ preview, kicker = 'ก่อนกดบันทึก', title = 'ระบบจะทำสิ่งนี้', tab = 'expense' }) {
  const cash = useWalletStore((s) => s.cash)
  const accounts = useWalletStore((s) => s.transferAccounts)
  const getAccountLabel = useWalletStore((s) => s.getTransferAccountLabel)
  const resolveAccount = useWalletStore((s) => s.resolveTransferAccountId)
  const cards = useCreditCardStore((s) => s.cards)
  const resolveCard = useCreditCardStore((s) => s.resolveCardId)
  const getCardLabel = useCreditCardStore((s) => s.getCardLabel)

  // ข้อมูลของแท็บที่ไม่ใช่ฟอร์ม — อ่านไว้เสมอเพราะ hook เรียกแบบมีเงื่อนไขไม่ได้
  const month = localMonthStr()
  const recItems = useRecurringStore((s) => s.items)
  const recEntries = useRecurringStore((s) => s.entries)
  const transactions = useTransactionStore((s) => s.transactions)
  const debtTotals = useDebtStore((s) => s.getTotals())

  // แท็บรายจ่ายส่ง preview แบบไม่มี kind — แท็บอื่นส่งมาพร้อม kind ห้ามเอามาปนกัน
  const expensePreview = preview && !preview.kind ? preview : null
  const { type = 'expense', method = 'cash', amount = 0, accountId, cardId, recurringName } = expensePreview ?? {}
  const amt = Number(amount) || 0
  const sign = type === 'income' ? 1 : -1

  let fromLabel = 'เงินสด'
  let before = cash
  let noMoveNote = null

  if (method === 'transfer') {
    const id = resolveAccount(accountId)
    const acc = accounts.find((a) => a.id === id)
    fromLabel = acc ? getAccountLabel(id) : 'ยังไม่ได้เลือกบัญชี'
    before = Number(acc?.balance ?? 0)
  } else if (method === 'card') {
    const id = resolveCard(cardId)
    const card = cards.find((c) => c.id === id)
    fromLabel = card ? getCardLabel(id) : 'ยังไม่ได้เลือกบัตร'
    before = Number(card?.outstanding ?? 0)
    noMoveNote = 'รูดบัตรยังไม่ตัดเงินตอนนี้ — ยอดจะไปรวมในบิลของรอบนั้น แล้วจ่ายทีเดียวตอนบิลครบกำหนด'
  } else if (method === 'pending') {
    fromLabel = 'ยังไม่ตัดจากที่ไหน'
    noMoveNote = 'ค้างชำระยังไม่ตัดเงิน — จะตัดตอนกดจ่ายที่หน้ารอดำเนินการ'
  } else if (method === 'debt') {
    fromLabel = 'ยังไม่ตัดจากที่ไหน'
    noMoveNote = 'บันทึกหนี้ที่มีอยู่เพื่อติดตามงวดการจ่าย ไม่ตัดเงินจากกระเป๋า'
  } else if (method === 'other') {
    fromLabel = 'ช่องทางอื่น'
    noMoveNote = 'ช่องทางอื่นไม่แตะกระเป๋าเงิน — บันทึกไว้เพื่อให้รายงานครบเท่านั้น'
  }

  // บัตรเป็น "หนี้" ยอดจึงเพิ่มขึ้นเมื่อรูด (ตรงข้ามกับกระเป๋าเงิน)
  const isCard = method === 'card'
  const delta = isCard ? amt : sign * amt
  const after = noMoveNote && !isCard ? before : before + delta
  const beforeLabel = isCard ? 'หนี้บัตรก่อนหน้า' : 'ยอดก่อนหน้า'
  const afterLabel = isCard ? 'หนี้บัตรหลังบันทึก' : 'ยอดหลังบันทึก'

  // แท็บรายรับ — บอกว่าแต่ละช่องจะเข้ากระเป๋าไหน ยอดก่อน → หลัง เป็นเท่าไร
  if (tab === 'income') {
    const p = preview?.kind === 'income' ? preview : null
    const rows = []
    if (p) {
      const otherToCash = p.otherMethod !== 'transfer'
      const cashAdd = p.cash + (otherToCash ? p.other : 0)
      if (cashAdd > 0) rows.push({ label: 'เงินสดในร้าน', add: cashAdd, base: cash })
      const accId = resolveAccount(p.transferAccountId)
      const acc = accounts.find((a) => a.id === accId)
      const transferAdd = p.transfer + (!otherToCash && resolveAccount(p.otherAccountId) === accId ? p.other : 0)
      if (transferAdd > 0) rows.push({ label: acc ? getAccountLabel(accId) : 'เงินโอน (ยังไม่ได้เลือกบัญชี)', add: transferAdd, base: Number(acc?.balance ?? 0) })
      if (!otherToCash && p.other > 0 && resolveAccount(p.otherAccountId) !== accId) {
        const oid = resolveAccount(p.otherAccountId)
        const oacc = accounts.find((a) => a.id === oid)
        rows.push({ label: oacc ? getAccountLabel(oid) : 'เงินโอน (ยังไม่ได้เลือกบัญชี)', add: p.other, base: Number(oacc?.balance ?? 0) })
      }
    }
    const total = rows.reduce((s, r) => s + r.add, 0)
    return (
      <div className="card px-4 py-3.5">
        <div className="text-[11px] tracking-[0.1em] uppercase text-faint">{kicker}</div>
        <div className="text-sm font-semibold mt-0.5">{title}</div>
        <div className="bg-paper rounded-ctl px-3.5 py-3 mt-2.5 flex flex-col gap-2">
          {rows.length === 0 && (
            <span className="text-[12px] text-faint leading-relaxed">
              ใส่ยอดในช่องใดช่องหนึ่งก่อน แล้วที่นี่จะบอกว่าเงินจะเข้ากระเป๋าไหน เพิ่มขึ้นเท่าไร
            </span>
          )}
          {rows.map((r) => (
            <div key={r.label}>
              <div className="flex justify-between text-[12.5px]">
                <span className="text-muted truncate">{r.label}</span>
                <span className="tabular-nums font-semibold text-income">+{fmt(r.add)}</span>
              </div>
              <div className="flex justify-between text-[11.5px] mt-0.5">
                <span className="tabular-nums text-[#A5A199]">{fmt(r.base)}</span>
                <span className="tabular-nums text-muted">→ {fmt(p?.isPending ? r.base : r.base + r.add)}</span>
              </div>
            </div>
          ))}
          {rows.length > 0 && (
            <div className="flex justify-between items-baseline border-t border-hairline pt-2">
              <span className="text-[12.5px] font-semibold">รวมรายรับที่จะบันทึก</span>
              <span className="tabular-nums text-base font-bold text-income">{fmt(total)}</span>
            </div>
          )}
        </div>
        {p?.isPending && (
          <div className="flex items-start gap-2 bg-pending-soft border border-pending-line rounded-[11px] px-2.5 py-2 mt-2">
            <Icon name="schedule" size={16} className="text-pending flex-none mt-px" />
            <span className="text-[11.5px] text-[#8A6A15] leading-relaxed">
              เปิดบิลรอรับเงินอยู่ · ยังไม่เพิ่มเงินเข้ากระเป๋าตอนนี้ ยอดข้างบนจะเกิดขึ้นเมื่อกดรับเงินที่หน้ารอดำเนินการ
            </span>
          </div>
        )}
      </div>
    )
  }

  // แท็บหนี้สิน — ไม่แตะกระเป๋าเลย บอกแค่ว่าจะไปเข้ากลุ่มหนี้ไหน
  if (tab === 'debt') {
    const p = preview?.kind === 'debt' ? preview : null
    const bucketLabel = p?.term === 'long' ? 'ระยะยาว' : 'ระยะสั้น'
    const bucketNow = p?.term === 'long' ? debtTotals.long ?? 0 : debtTotals.short ?? 0
    return (
      <div className="card px-4 py-3.5">
        <div className="text-[11px] tracking-[0.1em] uppercase text-faint">{kicker}</div>
        <div className="text-sm font-semibold mt-0.5">{title}</div>
        <div className="bg-paper rounded-ctl px-3.5 py-3 mt-2.5 flex flex-col gap-1.5">
          <div className="flex justify-between gap-2 text-[12.5px]">
            <span className="text-muted">ตัดจาก</span>
            <span className="font-semibold">ไม่ตัดจากกระเป๋าไหน</span>
          </div>
          <div className="flex justify-between gap-2 text-[12.5px]">
            <span className="text-muted">ยอดหนี้ทั้งสัญญา</span>
            <span className="tabular-nums">{fmt(p?.total ?? 0)}</span>
          </div>
          <div className="flex justify-between gap-2 text-[12.5px]">
            <span className="text-muted">งวดละ</span>
            <span className="tabular-nums font-semibold">{fmt(p?.monthly ?? 0)} × {p?.months ?? 0} งวด</span>
          </div>
        </div>
        <div className="flex items-start gap-2 bg-pending-soft border border-pending-line rounded-[11px] px-2.5 py-2 mt-2">
          <Icon name="schedule" size={16} className="text-pending flex-none mt-px" />
          <span className="text-[11.5px] text-[#8A6A15] leading-relaxed">
            สร้างรายการหนี้สินเท่านั้น ไม่ตัดเงินจากกระเป๋า ระบบจะติดตามงวดการจ่ายให้ที่หน้าบัตรและหนี้สิน
          </span>
        </div>
        <div className="text-[11.5px] text-muted leading-relaxed mt-2">
          เข้ากลุ่มหนี้{bucketLabel} {fmt(bucketNow)} → {fmt(bucketNow + (p?.total ?? 0))}
        </div>
      </div>
    )
  }

  // แท็บรายการประจำ — รอบที่ยังไม่จ่ายของเดือนนี้
  if (tab === 'recurring') {
    const pending = recEntries.filter((e) => e.month === month && e.status === 'pending')
    const rows = pending.slice(0, 6).map((e) => ({
      label: recItems.find((i) => i.id === e.recurringId)?.name ?? 'รายการประจำ',
      value: fmt(e.amount),
      tone: 'text-expense',
    }))
    const total = pending.reduce((s, e) => s + (Number(e.amount) || 0), 0)
    return (
      <div className="card px-4 py-3.5">
        <div className="text-[11px] tracking-[0.1em] uppercase text-faint">{kicker}</div>
        <div className="text-sm font-semibold mt-0.5">{title}</div>
        <SummaryBox
          rows={rows}
          totalLabel={`รวม ${pending.length} รายการ`}
          totalValue={fmt(total)}
          note="กดจ่ายที่แท็บนี้แล้วจะไม่ต้องบันทึกซ้ำในแท็บรายจ่าย ระบบลงรายจ่ายให้เองพร้อมตัดเงินตามช่องทางที่ตั้งไว้"
        />
      </div>
    )
  }

  // แท็บค้นหารายการ — สรุปของเดือนนี้ ซึ่งเป็นช่วงเริ่มต้นที่ตารางเปิดมา
  if (tab === 'history') {
    const inMonth = transactions.filter((t) => String(t.date).slice(0, 7) === month)
    const income = inMonth.filter((t) => t.type === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0)
    const expense = inMonth.filter((t) => t.type === 'expense').reduce((s, t) => s + (Number(t.amount) || 0), 0)
    return (
      <div className="card px-4 py-3.5">
        <div className="text-[11px] tracking-[0.1em] uppercase text-faint">{kicker}</div>
        <div className="text-sm font-semibold mt-0.5">{title}</div>
        <SummaryBox
          rows={[
            { label: 'รายรับ', value: fmt(income), tone: 'text-income' },
            { label: 'รายจ่าย', value: fmt(expense), tone: 'text-expense' },
            { label: 'จำนวนรายการ', value: String(inMonth.length) },
          ]}
          totalLabel="สุทธิ"
          totalValue={fmt(income - expense)}
          note="ตัวเลขนี้คิดจากเดือนปัจจุบัน เปลี่ยนช่วงวันที่ในตารางเพื่อดูช่วงอื่น"
        />
      </div>
    )
  }

  return (
    <div className="card px-4 py-3.5">
      <div className="text-[11px] tracking-[0.1em] uppercase text-faint">{kicker}</div>
      <div className="text-sm font-semibold mt-0.5">{title}</div>

      <div className="bg-paper rounded-ctl px-3.5 py-3 mt-2.5 flex flex-col gap-1.5">
        <div className="flex justify-between gap-2 text-[12.5px]">
          <span className="text-muted flex-none">ตัดจาก</span>
          <span className="font-semibold text-right truncate">{fromLabel}</span>
        </div>
        <div className="flex justify-between gap-2 text-[12.5px]">
          <span className="text-muted">{beforeLabel}</span>
          <span className="tabular-nums">{fmt(before)}</span>
        </div>
        <div className="flex justify-between gap-2 text-[12.5px]">
          <span className="text-muted">รายการนี้</span>
          <span className={`tabular-nums font-semibold ${
            amt === 0 ? 'text-faint' : delta >= 0 && !isCard ? 'text-income' : 'text-expense'
          }`}>
            {amt === 0 ? '—' : `${isCard || delta < 0 ? (isCard ? '+' : '−') : '+'}${fmt(Math.abs(delta))}`}
          </span>
        </div>
        <div className="flex justify-between items-baseline gap-2 border-t border-hairline pt-2 mt-0.5">
          <span className="text-[12.5px] font-semibold">{afterLabel}</span>
          <span className={`tabular-nums text-base font-bold ${after < 0 && !isCard ? 'text-expense' : ''}`}>
            {fmt(after)}
          </span>
        </div>
      </div>

      {noMoveNote && (
        <div className="flex items-start gap-2 bg-pending-soft border border-pending-line rounded-[11px] px-2.5 py-2 mt-2">
          <Icon name="schedule" size={16} className="text-pending flex-none mt-px" />
          <span className="text-[11.5px] text-[#8A6A15] leading-relaxed">{noMoveNote}</span>
        </div>
      )}

      {after < 0 && !isCard && !noMoveNote && (
        <div className="flex items-start gap-2 bg-expense-soft border border-[#F0C4BE] rounded-[11px] px-2.5 py-2 mt-2">
          <Icon name="error" size={16} className="text-expense flex-none mt-px" />
          <span className="text-[11.5px] text-[#A93A2E] leading-relaxed">
            บันทึกแล้วยอดจะติดลบ — ระบบจะถามยืนยันอีกครั้งก่อนบันทึก
          </span>
        </div>
      )}

      {recurringName && (
        <div className="flex items-start gap-2 bg-recurring-soft rounded-[11px] px-2.5 py-2 mt-2">
          <Icon name="info" size={16} className="text-recurring flex-none mt-px" />
          <span className="text-[11.5px] text-[#5A3C90] leading-relaxed">
            หมวดนี้มีรายการประจำ “{recurringName}” รอจ่ายเดือนนี้
          </span>
        </div>
      )}
    </div>
  )
}
