import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Popup from '../../components/shared/Popup'
import Icon from '../../components/shared/Icon'
import BankLogo from '../../components/shared/BankLogo'
import { listWalletLogsSince } from '../../lib/api/logs'
import {
  buildYearStatement, buildMonthEntries, deltaForAccount, monthLabel, yearsWithMovement,
} from '../../lib/accountStatement'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const plain = (n) => Math.round(Number(n) || 0).toLocaleString('th-TH')

const timeLabel = (iso) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * เมนูของบัญชีเงินโอน — กดปุ่ม ⋮ ท้ายบัญชีในหน้ากระเป๋าเงิน
 *
 * มี 3 มุมมองในป๊อปอัปเดียว (เมนู → รายการเดินบัญชีรายปี → รายการของเดือน)
 * ไม่ได้แยกเป็นคนละป๊อปอัป เพราะทั้งสามอย่างคือ "เรื่องของบัญชีใบนี้" การเปิดซ้อนกัน
 * หลายชั้นจะทำให้กดปิดแล้วไม่รู้ว่ากลับไปอยู่ตรงไหน
 *
 * ตัวเลขทั้งหมดไล่จาก activity_logs ไม่ใช่จากตารางรายการ (ดู accountStatement.js)
 */
export default function AccountMenuPopup({ account, onClose, onEdit }) {
  const [view, setView] = useState('menu')       // menu | year | month
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(null)       // 'YYYY-MM'
  const [logs, setLogs] = useState(null)         // null = ยังโหลดไม่เสร็จ
  const [error, setError] = useState('')

  // โหลด log ย้อนหลัง 3 ปี พอสำหรับใบแจ้งยอดรายปีและยังไม่หนักเกินไป
  useEffect(() => {
    let alive = true
    const since = new Date()
    since.setFullYear(since.getFullYear() - 3)
    listWalletLogsSince(since.toISOString())
      .then((rows) => { if (alive) setLogs(rows) })
      .catch((err) => { if (alive) { setError(err.message); setLogs([]) } })
    return () => { alive = false }
  }, [])

  const getDelta = useMemo(() => (log) => deltaForAccount(log, account.id), [account.id])

  const years = useMemo(() => (logs ? yearsWithMovement(logs, getDelta) : []), [logs, getDelta])

  const statement = useMemo(
    () => (logs ? buildYearStatement({ logs, getDelta, currentBalance: Number(account.balance) || 0, year }) : null),
    [logs, getDelta, account.balance, year],
  )

  const monthData = useMemo(
    () => (logs && month
      ? buildMonthEntries({ logs, getDelta, currentBalance: Number(account.balance) || 0, monthKey: month })
      : null),
    [logs, getDelta, account.balance, month],
  )

  const loading = logs === null
  const title = view === 'menu' ? 'บัญชีนี้' : view === 'year' ? 'รายการเดินบัญชีรายปี' : monthLabel(month)
  const sub = account.bankName ? `${account.bankName} — ${account.name}` : account.name

  const back = () => {
    if (view === 'month') { setView('year'); setMonth(null) }
    else setView('menu')
  }

  return (
    <Popup
      title={title}
      sub={sub}
      icon="account_balance"
      width={view === 'menu' ? 420 : 520}
      onClose={onClose}
      footer={
        // แถบท้ายใช้ขอบในชุดเดียวกับแถบมาตรฐานของ Popup ไม่งั้นปุ่มจะชิดขอบกล่อง
        <div className="flex-none flex items-center gap-2 px-[17px] py-3 border-t border-[#EFEDE7] bg-[#FAF9F6]">
          {view !== 'menu' && (
            <button
              onClick={back}
              className="h-[38px] px-4 rounded-[11px] border border-hairline bg-white text-[13px] font-semibold flex items-center gap-1.5 hover:bg-paper"
            >
              <Icon name="chevron_left" size={17} />
              ย้อนกลับ
            </button>
          )}
          <button onClick={onClose} className="ml-auto h-[38px] px-[18px] rounded-[11px] bg-ink text-white text-[13px] font-semibold hover:bg-black">
            ปิด
          </button>
        </div>
      }
    >
      {view === 'menu' && (
        <>
          <div className="rounded-panel bg-paper px-4 py-3.5 flex items-center gap-3">
            <BankLogo bankName={account.bankName} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] text-muted">ยอดคงเหลือตอนนี้</p>
              <p className={`text-[24px] font-semibold tabular-nums leading-tight ${
                Number(account.balance) < 0 ? 'text-expense' : 'text-ink'
              }`}>
                {fmt(account.balance)}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-1.5">
            <button
              onClick={() => setView('year')}
              className="h-12 px-3.5 rounded-ctl border border-hairline flex items-center gap-2.5 text-left hover:bg-paper hover:border-ink"
            >
              <Icon name="history" size={19} className="text-transfer" />
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-semibold">รายการเดินบัญชีรายปี</span>
                <span className="block text-[11px] text-faint">กดที่เดือนไหนก็ได้เพื่อเปิดดูความเคลื่อนไหวของเดือนนั้น</span>
              </span>
              <Icon name="chevron_right" size={18} className="text-faint" />
            </button>

            <Link
              to="/manage/accounts"
              onClick={() => { onEdit?.(account); onClose() }}
              className="h-12 px-3.5 rounded-ctl border border-hairline flex items-center gap-2.5 text-left hover:bg-paper hover:border-ink"
            >
              <Icon name="edit_note" size={19} className="text-muted" />
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-semibold">แก้ไขบัญชี</span>
                <span className="block text-[11px] text-faint">เปลี่ยนชื่อ ธนาคาร ประเภท เลขบัญชี หรือปรับยอด</span>
              </span>
              <Icon name="chevron_right" size={18} className="text-faint" />
            </Link>

            {/* ลบบัญชีอยู่ที่หน้าจัดการข้อมูลที่เดียว — ที่นี่เป็นหน้าของงานประจำวัน
                การวางปุ่มลบไว้ข้างยอดเงินทำให้กดพลาดได้ง่ายเกินไป */}
            <p className="text-[11px] text-faint leading-relaxed px-1 pt-1">
              ลบบัญชีทำได้ที่ จัดการข้อมูล → บัญชีธนาคาร
            </p>
          </div>
        </>
      )}

      {view === 'year' && (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-2.5">
            {years.slice(0, 4).map((y) => (
              <button
                key={y}
                onClick={() => setYear(y)}
                className={`h-8 px-3 rounded-[9px] text-[12.5px] border ${
                  y === year ? 'bg-ink text-white border-ink font-semibold' : 'bg-white border-hairline hover:bg-paper'
                }`}
              >
                {y + 543}
              </button>
            ))}
            <span className="ml-auto text-[11px] text-faint">ยอดคงเหลือตอนนี้ {fmt(account.balance)}</span>
          </div>

          {loading ? (
            <p className="text-center text-[12.5px] text-faint py-8">กำลังอ่านความเคลื่อนไหว…</p>
          ) : (
            <>
              <div className="grid grid-cols-[minmax(0,1fr)_92px_92px_104px] gap-2 pb-1.5 text-[11px] tracking-[0.06em] uppercase text-faint border-b border-[#EFEDE7]">
                <span>เดือน</span>
                <span className="text-right">เงินเข้า</span>
                <span className="text-right">เงินออก</span>
                <span className="text-right">คงเหลือ</span>
              </div>
              {statement.rows.map((r) => (
                <button
                  key={r.key}
                  onClick={() => { setMonth(r.key); setView('month') }}
                  className="w-full grid grid-cols-[minmax(0,1fr)_92px_92px_104px] gap-2 py-2 border-b border-[#F2F0EA] text-left hover:bg-paper"
                >
                  <span className="text-[12.5px] truncate">
                    {r.label}
                    {r.count > 0 && <span className="text-[10.5px] text-faint"> · {r.count} รายการ</span>}
                  </span>
                  <span className="tabular-nums text-right text-[12.5px] text-income">{r.income ? plain(r.income) : '—'}</span>
                  <span className="tabular-nums text-right text-[12.5px] text-expense">{r.expense ? plain(r.expense) : '—'}</span>
                  <span className={`tabular-nums text-right text-[12.5px] font-semibold ${r.closing < 0 ? 'text-expense' : 'text-ink'}`}>
                    {plain(r.closing)}
                  </span>
                </button>
              ))}
            </>
          )}
        </>
      )}

      {view === 'month' && monthData && (
        <>
          <div className="flex items-center justify-between gap-2 bg-paper rounded-ctl px-3.5 py-2.5 mb-2.5 text-[12px]">
            <span className="text-muted">ยอดยกมา <b className="tabular-nums text-ink">{fmt(monthData.opening)}</b></span>
            <span className="text-muted">ยอดยกไป <b className="tabular-nums text-ink">{fmt(monthData.closing)}</b></span>
          </div>

          {monthData.rows.length === 0 ? (
            <p className="text-center text-[12.5px] text-faint py-8">เดือนนี้ไม่มีความเคลื่อนไหว</p>
          ) : monthData.rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2.5 py-2 border-b border-[#F2F0EA] last:border-0">
              <span className="flex-none w-[58px] text-[11px] text-faint tabular-nums">{timeLabel(r.timestamp)}</span>
              <span className="flex-1 min-w-0 text-[12.5px] truncate">{r.description}</span>
              <span className={`flex-none tabular-nums text-[12.5px] font-semibold ${r.delta > 0 ? 'text-income' : 'text-expense'}`}>
                {r.delta > 0 ? '+' : '−'}{plain(Math.abs(r.delta))}
              </span>
              <span className="flex-none w-[86px] tabular-nums text-right text-[11.5px] text-muted">{plain(r.balance)}</span>
            </div>
          ))}
        </>
      )}

      {error && (
        <p className="mt-2.5 text-[12px] text-expense bg-expense-soft border border-[#F0C4BE] rounded-ctl px-3 py-2">
          อ่านความเคลื่อนไหวไม่สำเร็จ — {error}
        </p>
      )}

      {/* บอกที่มาของตัวเลขไว้ เพราะใบนี้ไม่ใช่ใบแจ้งยอดจากธนาคาร */}
      {view !== 'menu' && !loading && (
        <p className="mt-2.5 text-[11px] text-faint leading-relaxed">
          ไล่จากประวัติการใช้งานของแอป (ย้อนหลัง 3 ปี) ไม่ใช่ใบแจ้งยอดจากธนาคาร ·
          ยอดคงเหลือไล่ถอยหลังจากยอดจริงตอนนี้
        </p>
      )}
    </Popup>
  )
}
