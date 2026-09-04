import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Popup from './Popup'
import Icon from './Icon'
import useTransactionStore from '../../store/useTransactionStore'
import usePendingStore from '../../store/usePendingStore'
import { NAV_GROUPS } from '../layout/navConfig'
import { thaiShortDate } from '../../lib/dateUtils'

/**
 * ค้นหาแบบพิมพ์ทีเดียวเจอทุกอย่าง — หน้า รายการที่บันทึกไว้ และบิลที่ยังค้าง
 *
 * ค้นจากข้อมูลที่โหลดไว้ใน store อยู่แล้ว (ไม่ยิงเซิร์ฟเวอร์เพิ่ม) จึงตอบทันทีที่พิมพ์
 * รายการที่เก่ากว่าช่วงที่โหลดไว้จะไม่อยู่ในผล — บอกไว้ท้ายกล่องเพื่อไม่ให้เข้าใจผิดว่าไม่มี
 */
export default function SearchPopup({ onClose }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const transactions = useTransactionStore((s) => s.transactions)
  const pendingPayments = usePendingStore((s) => s.pendingPayments)

  const pages = useMemo(() => NAV_GROUPS.flatMap((g) => g.items), [])

  const results = useMemo(() => {
    const key = q.trim().toLowerCase()
    if (!key) return { pages: pages.slice(0, 4), txs: [], bills: [] }
    return {
      pages: pages.filter((p) => p.label.toLowerCase().includes(key)).slice(0, 4),
      txs: transactions
        .filter((t) => [t.itemName, t.note, t.vendor].filter(Boolean).join(' ').toLowerCase().includes(key))
        .slice(0, 6),
      bills: pendingPayments
        .filter((p) => p.status === 'pending' && (p.description ?? p.itemName ?? '').toLowerCase().includes(key))
        .slice(0, 4),
    }
  }, [q, pages, transactions, pendingPayments])

  const go = (to) => { navigate(to); onClose() }

  const Row = ({ icon, tint, title, meta, amount, amountClass, onClick }) => (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-ctl hover:bg-paper text-left"
    >
      <span className={`w-7 h-7 flex-none rounded-[9px] flex items-center justify-center ${tint}`}>
        <Icon name={icon} size={16} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-medium truncate">{title}</span>
        {meta && <span className="block text-[11px] text-faint truncate">{meta}</span>}
      </span>
      {amount && <span className={`text-[12.5px] font-semibold tabular-nums ${amountClass}`}>{amount}</span>}
    </button>
  )

  const empty = q.trim() && !results.pages.length && !results.txs.length && !results.bills.length

  return (
    <Popup title="ค้นหา" sub="หน้า รายการที่บันทึกไว้ และบิลที่ยังค้าง" icon="search" width={560} onClose={onClose}>
      <div className="flex items-center gap-2.5 h-11 px-3.5 rounded-ctl border border-ink">
        <Icon name="search" size={18} className="text-faint flex-none" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="พิมพ์ชื่อรายการ ผู้ขาย หรือชื่อหน้า"
          className="flex-1 min-w-0 bg-transparent outline-none text-[13.5px]"
        />
      </div>

      <div className="min-h-[120px]">
        {results.pages.length > 0 && (
          <>
            <p className="text-[11px] tracking-[0.1em] uppercase text-faint px-2.5 pt-1 pb-1">หน้า</p>
            {results.pages.map((p) => (
              <Row key={p.to} icon={p.icon} tint="bg-paper text-ink" title={p.label} onClick={() => go(p.to)} />
            ))}
          </>
        )}

        {results.txs.length > 0 && (
          <>
            <p className="text-[11px] tracking-[0.1em] uppercase text-faint px-2.5 pt-2.5 pb-1">รายการ</p>
            {results.txs.map((t) => (
              <Row
                key={t.id}
                icon={t.type === 'income' ? 'arrow_downward' : 'arrow_upward'}
                tint={t.type === 'income' ? 'bg-income-soft text-income' : 'bg-expense-soft text-expense'}
                title={t.itemName || '(ไม่ระบุชื่อ)'}
                meta={thaiShortDate(t.date)}
                amount={`${t.type === 'income' ? '+' : '-'}${Number(t.amount).toLocaleString()}`}
                amountClass={t.type === 'income' ? 'text-income' : 'text-expense'}
                onClick={() => go('/history')}
              />
            ))}
          </>
        )}

        {results.bills.length > 0 && (
          <>
            <p className="text-[11px] tracking-[0.1em] uppercase text-faint px-2.5 pt-2.5 pb-1">ค้างชำระ</p>
            {results.bills.map((b) => (
              <Row
                key={b.id}
                icon="pending_actions"
                tint="bg-pending-soft text-pending"
                title={b.description ?? b.itemName ?? 'ค้างชำระ'}
                meta={b.dueDate ? `ครบกำหนด ${thaiShortDate(b.dueDate)}` : 'ไม่ระบุกำหนด'}
                amount={Number(b.amount).toLocaleString()}
                amountClass="text-pending"
                onClick={() => go('/pending-tasks')}
              />
            ))}
          </>
        )}

        {empty && (
          <p className="text-center text-[12.5px] text-faint py-8">ไม่พบสิ่งที่ค้นหา</p>
        )}
      </div>

      <p className="text-[11px] text-faint leading-relaxed">
        ค้นจากข้อมูลที่โหลดไว้ในเครื่อง (รายการย้อนหลัง 24 เดือน) — รายการที่เก่ากว่านั้นดูได้ที่หน้ารายงาน
      </p>
    </Popup>
  )
}
