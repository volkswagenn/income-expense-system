import { Link } from 'react-router-dom'
import MainWalletCard from './MainWalletCard'
import LoanSummary from './LoanSummary'
import SubWalletList from './SubWalletList'
import TransferAccountList from './TransferAccountList'
import Icon from '../../components/shared/Icon'
import AppIcon from '../../components/shared/AppIcon'
import useWalletStore from '../../store/useWalletStore'
import useTransactionStore from '../../store/useTransactionStore'
import useRecurringStore from '../../store/useRecurringStore'
import { localMonthStr, thaiShortDate } from '../../lib/dateUtils'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

/** กล่องหนึ่งใบในตารางการ์ด — หัวข้อ + จำนวน + ลิงก์เสริม + คำใบ้ */
function WalletSection({ title, count, action, hint, children }) {
  return (
    <section className="card px-4 py-3.5 flex flex-col min-w-0">
      <div className="flex-none flex items-center gap-2">
        <span className="flex-none text-[13.5px] font-semibold">{title}</span>
        {count != null && (
          <span className="flex-none tabular-nums text-[11px] font-semibold bg-paper text-muted rounded-full px-2 py-0.5">
            {count}
          </span>
        )}
        {action && <div className="ml-auto flex-none">{action}</div>}
      </div>
      {hint && <div className="flex-none text-[11px] text-faint leading-relaxed mt-[5px]">{hint}</div>}
      {children}
    </section>
  )
}

/** ลิงก์ข้อความสีเขียวมุมขวาบนของการ์ด */
function CardLink({ to, children }) {
  return (
    <Link to={to} className="text-[12px] font-semibold text-income hover:underline whitespace-nowrap">
      {children}
    </Link>
  )
}

/**
 * กระเป๋าเงิน — เฉพาะ "เงินที่มีอยู่จริง" เท่านั้น
 *
 * บัตรเครดิตกับสัญญาหนี้เป็นภาระผูกพัน ไม่ใช่เงินในมือ อยู่หน้า "บัตรและหนี้สิน"
 * ที่นี่คือ เงินสด · บัญชีธนาคาร · กระเป๋าย่อย · เงินที่ยืมจากกระเป๋าย่อย
 * ปิดท้ายด้วยรายจ่ายประจำของเดือนนี้ เพราะเป็นเงินที่จะออกจากกระเป๋าพวกนี้แน่ๆ
 */
export default function WalletPage() {
  const cash = useWalletStore((s) => s.cash)
  const accountCount = useWalletStore((s) => s.transferAccounts.length)
  const subCount = useWalletStore((s) => s.subWallets.length)
  const loansCount = useWalletStore((s) => s.loans.filter((l) => !l.returned).length)

  const transactions = useTransactionStore((s) => s.transactions)
  const recItems = useRecurringStore((s) => s.items)
  const recEntries = useRecurringStore((s) => s.entries)
  const month = localMonthStr()

  // เงินสดเข้า-ออกล่าสุด — ใช้ตอบว่ายอดเงินสดที่เห็นมาจากอะไรบ้าง
  const cashMoves = transactions
    .filter((t) => t.method === 'cash')
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 3)

  const monthEntries = recEntries.filter((e) => e.month === month)
  const recRows = monthEntries.slice(0, 6).map((e) => ({
    ...e,
    item: recItems.find((i) => i.id === e.recurringId),
  }))
  const recTotal = monthEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const recPaid = monthEntries.filter((e) => e.status === 'paid').length

  return (
    <div className="flex flex-col gap-3">
      <MainWalletCard />

      {/* จอกว้างเรียง 3 คอลัมน์ จอแคบ 2 — การ์ดพวกนี้ยาวไม่เท่ากัน จึงจัดชิดบนเสมอ */}
      <div className="grid grid-cols-1 md:grid-cols-2 wide:grid-cols-3 gap-3 items-start">
        <WalletSection
          title="เงินสด"
          hint="กดปุ่ม ⋮ ที่บัญชีเพื่อฝากเข้าบัญชี ถอนออกมา หรือดูความเคลื่อนไหว"
        >
          <div className="flex items-center gap-[11px] py-2.5 border-t border-[#F2F0EA] mt-2">
            <span className="w-8 h-8 flex-none rounded-[10px] bg-[#F2FAD9] text-[#5C7A0F] text-[10.5px] font-bold flex items-center justify-center">
              สด
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[12.5px] font-semibold truncate">เงินสด</span>
              <span className="block text-[11px] text-faint truncate">ยอดที่ระบบบันทึกไว้ ณ ตอนนี้</span>
            </span>
            <span className="tabular-nums flex-none text-sm font-bold text-income">{fmt(cash)}</span>
          </div>

          {cashMoves.length > 0 && (
            <div className="flex-none border-t border-hairline pt-2.5 mt-2.5">
              <div className="text-[11.5px] font-semibold text-muted mb-1.5">เงินสดเข้า-ออกล่าสุด</div>
              <div className="flex flex-col gap-1.5">
                {cashMoves.map((t) => (
                  <div key={t.id} className="flex items-center gap-2.5 bg-[#FAF9F6] rounded-[9px] px-2.5 py-[7px]">
                    <span className="flex-1 min-w-0">
                      <span className="block text-[11.5px] font-medium truncate">{t.itemName || '(ไม่มีชื่อ)'}</span>
                      <span className="block text-[10.5px] text-faint truncate">
                        {thaiShortDate(t.date)} · {t.type === 'income' ? 'เข้าเงินสด' : 'ออกจากเงินสด'}
                      </span>
                    </span>
                    <span className={`tabular-nums flex-none text-[12px] font-semibold ${t.type === 'income' ? 'text-income' : 'text-expense'}`}>
                      {fmt(t.amount)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="text-[10.5px] text-[#A5A199] leading-relaxed mt-[7px]">
                ดูทั้งหมดได้ที่หน้าประวัติ กรองด้วยช่องทาง "เงินสด"
              </div>
            </div>
          )}
        </WalletSection>

        <WalletSection
          title="บัญชีธนาคาร"
          count={`${accountCount} บัญชี`}
          action={<CardLink to="/manage/accounts">จัดการบัญชี</CardLink>}
        >
          <TransferAccountList />
        </WalletSection>

        <WalletSection title="กระเป๋าตังค์ย่อย" count={`${subCount} ใบ`}>
          <SubWalletList />
        </WalletSection>

        <WalletSection title="การยืมเงินจากกระเป๋า" count={`${loansCount} รายการ`}>
          <LoanSummary />
        </WalletSection>

        {/* รายจ่ายประจำของเดือนนี้ — เงินที่จะออกจากกระเป๋าข้างบนแน่ๆ จึงอยู่หน้าเดียวกัน */}
        <WalletSection
          title="รายจ่ายประจำเดือนนี้"
          count={`${monthEntries.length} รายการ`}
          action={<CardLink to="/transactions?tab=recurring">ดูทั้งหมด</CardLink>}
        >
          {monthEntries.length === 0 ? (
            <p className="text-[12px] text-faint py-3">ยังไม่มีรายการประจำในเดือนนี้</p>
          ) : (
            <>
              {recRows.map((r) => (
                <div key={r.id} className="flex items-center gap-[11px] py-2.5 border-t border-[#F2F0EA] mt-2">
                  <span className="w-8 h-8 flex-none rounded-[10px] bg-recurring-soft flex items-center justify-center">
                    <AppIcon value={r.item?.icon} size={17} fallback="event_repeat" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12.5px] font-semibold truncate">{r.item?.name ?? 'รายการประจำ'}</span>
                    <span className="block text-[11px] text-faint truncate">
                      ทุกวันที่ {r.item?.billingDay ?? '—'} · {r.status === 'paid' ? 'จ่ายแล้ว' : 'ยังไม่จ่าย'}
                    </span>
                  </span>
                  <span className={`tabular-nums flex-none text-sm font-bold ${r.status === 'paid' ? 'text-faint' : 'text-expense'}`}>
                    {fmt(r.amount)}
                  </span>
                </div>
              ))}
              <div className="flex-none border-t border-hairline pt-2.5 mt-2.5 flex items-center justify-between">
                <span className="text-[11.5px] text-muted">
                  <Icon name="check_circle" size={14} className="inline align-[-2px] mr-1 text-income" />
                  จ่ายแล้ว {recPaid} จาก {monthEntries.length} รายการ
                </span>
                <span className="tabular-nums text-[13px] font-bold">{fmt(recTotal)}</span>
              </div>
            </>
          )}
        </WalletSection>
      </div>
    </div>
  )
}
