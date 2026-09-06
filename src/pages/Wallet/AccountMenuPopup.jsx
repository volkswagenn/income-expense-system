import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import Popup from '../../components/shared/Popup'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import Icon from '../../components/shared/Icon'
import UiIcon from '../../components/shared/UiIcon'
import AppIcon from '../../components/shared/AppIcon'
import AmountInput from '../../components/shared/AmountInput'
import DatePicker from '../../components/shared/DatePicker'
import TransferAccountPicker, { formatAccount } from '../../components/shared/TransferAccountPicker'
import { DEFAULT_ICONS } from '../../lib/defaultIcons'
import { listWalletLogsSince } from '../../lib/api/logs'
import { addToWallet, deductWallet, transferBetweenWallets, moveBetweenTransferAccounts } from '../../lib/walletEngine'
import { useNegativeConfirm } from '../../hooks/useNegativeConfirm'
import useWalletStore from '../../store/useWalletStore'
import { formatIsoThai } from '../../lib/cardCycle'
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
 * สามงานเงินของบัญชี — แต่ละงานมีสองทางเลือกว่าเงินมาจาก/ไปที่ไหน
 * ฝาก: จากเงินสดในร้าน (ย้ายกระเป๋า) หรือรับจากข้างนอก (เงินใหม่เข้าระบบ)
 * ถอน: เป็นเงินสดในร้าน (ย้ายกระเป๋า) หรือจ่ายออกข้างนอก (เงินออกจากระบบ)
 * โอน: ไปบัญชีอื่นของเรา (ยอดรวมเงินโอนไม่ขยับ)
 */
const ACTIONS = {
  deposit: {
    title: 'ฝากเงินเข้าบัญชี', icon: 'add', confirm: 'ฝากเงิน', sign: +1,
    options: [
      { key: 'cash', label: 'จากเงินสดในร้าน', hint: 'ย้ายเงินสดที่มีอยู่เข้าบัญชีนี้', icon: 'cash' },
      { key: 'outside', label: 'รับจากข้างนอก', hint: 'เงินโอนเข้ามาใหม่ ไม่ได้มาจากกระเป๋าไหนในแอป', icon: 'bank' },
    ],
  },
  withdraw: {
    title: 'ถอนเงินออกจากบัญชี', icon: 'remove', confirm: 'ถอนเงิน', sign: -1,
    options: [
      { key: 'cash', label: 'เป็นเงินสดในร้าน', hint: 'กดเงินสดออกมาเก็บไว้ในร้าน', icon: 'cash' },
      { key: 'outside', label: 'จ่ายออกข้างนอก', hint: 'เงินออกจากระบบ เช่นโอนให้คนอื่นที่ไม่ได้บันทึกเป็นรายจ่าย', icon: 'bank' },
    ],
  },
  move: {
    title: 'โอนไปบัญชีอื่น', icon: 'swap_horiz', confirm: 'โอนเงิน', sign: -1,
    options: [],
  },
}

/**
 * เมนูของบัญชีเงินโอน — กดปุ่ม ⋮ ท้ายบัญชีในหน้ากระเป๋าเงิน
 *
 * งานประจำวันของบัญชีอยู่ที่นี่ทั้งหมด: ฝาก ถอน โอนไปบัญชีอื่น และดูรายการเดินบัญชี
 * ทุกมุมมองอยู่ในป๊อปอัปเดียว (เมนู → ฟอร์ม / รายการรายปี → รายการของเดือน)
 * ไม่ได้แยกเป็นคนละป๊อปอัป เพราะทั้งหมดคือ "เรื่องของบัญชีใบนี้" การเปิดซ้อนกัน
 * หลายชั้นจะทำให้กดปิดแล้วไม่รู้ว่ากลับไปอยู่ตรงไหน
 *
 * ตัวเลขในรายการเดินบัญชีไล่จาก activity_logs ไม่ใช่จากตารางรายการ (ดู accountStatement.js)
 */
export default function AccountMenuPopup({ account, onClose, onEdit }) {
  const [view, setView] = useState('menu')       // menu | deposit | withdraw | move | year | month
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(null)       // 'YYYY-MM'
  const [logs, setLogs] = useState(null)         // null = ยังโหลดไม่เสร็จ
  const [error, setError] = useState('')

  // ฟอร์มฝาก/ถอน/โอน — รีเซ็ตทุกครั้งที่เปิดฟอร์มใหม่
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [option, setOption] = useState('cash')
  const [targetId, setTargetId] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')          // ข้อความบอกว่าทำสำเร็จ กลับมาหน้าเมนู

  const cash = useWalletStore((s) => s.cash)
  const accounts = useWalletStore((s) => s.transferAccounts)
  // ยอดของบัญชีนี้อ่านจาก store ไม่ใช่จาก prop — หลังฝาก/ถอนแล้วยอดต้องขยับทันที
  const live = accounts.find((a) => a.id === account.id) ?? account
  const balance = Number(live.balance) || 0
  const { warning, check, proceed, cancel } = useNegativeConfirm()

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
    () => (logs ? buildYearStatement({ logs, getDelta, currentBalance: balance, year }) : null),
    [logs, getDelta, balance, year],
  )
  const monthData = useMemo(
    () => (logs && month
      ? buildMonthEntries({ logs, getDelta, currentBalance: balance, monthKey: month })
      : null),
    [logs, getDelta, balance, month],
  )

  const loading = logs === null
  const action = ACTIONS[view] ?? null
  const title = action ? action.title
    : view === 'menu' ? 'บัญชีนี้'
    : view === 'year' ? 'รายการเดินบัญชีรายปี'
    : monthLabel(month)
  const sub = formatAccount(account)

  const openAction = (key) => {
    setAmount(''); setDate(format(new Date(), 'yyyy-MM-dd')); setOption('cash'); setTargetId('')
    setError(''); setDone('')
    setView(key)
  }
  const back = () => {
    setError('')
    if (view === 'month') { setView('year'); setMonth(null) }
    else setView('menu')
  }

  const value = Number(amount) || 0
  const after = balance + (action?.sign ?? 0) * value
  const target = accounts.find((a) => a.id === targetId) ?? null
  const others = accounts.filter((a) => a.id !== account.id)

  // ── ทำรายการเงิน ─────────────────────────────────────────────────────────
  const submit = () => {
    if (busy) return
    if (!(value > 0)) return setError('ใส่จำนวนเงิน')
    if (view === 'move' && !target) return setError('เลือกบัญชีปลายทาง')
    const dl = ` (${formatIsoThai(date)})`
    const name = formatAccount(account)

    const execute = async () => {
      setBusy(true); setError('')
      try {
        if (view === 'deposit' && option === 'cash') {
          await transferBetweenWallets('cash', 'transfer', value, {
            description: `ฝากเงินสด ${value.toLocaleString()} บาท เข้าบัญชี "${name}"${dl}`,
          }, account.id)
        } else if (view === 'deposit') {
          await addToWallet('transfer', value, {
            activityType: 'BANK_DEPOSIT',
            description: `รับเงินโอน ${value.toLocaleString()} บาท เข้าบัญชี "${name}"${dl}`,
          }, account.id)
        } else if (view === 'withdraw' && option === 'cash') {
          await transferBetweenWallets('transfer', 'cash', value, {
            description: `ถอนเงิน ${value.toLocaleString()} บาท จากบัญชี "${name}" เป็นเงินสด${dl}`,
          }, account.id)
        } else if (view === 'withdraw') {
          await deductWallet('transfer', value, {
            activityType: 'BANK_WITHDRAW',
            description: `จ่ายเงินออกจากบัญชี "${name}" ${value.toLocaleString()} บาท${dl}`,
          }, account.id)
        } else if (view === 'move') {
          await moveBetweenTransferAccounts(account.id, target.id, value)
        }
        setDone(`${action.confirm} ${fmt(value)} บาท เรียบร้อย`)
        setView('menu')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusy(false)
      }
    }

    // เตือนก่อนถ้ากระเป๋าต้นทางจะติดลบ — ไม่บล็อก เพราะบางทีคนบันทึกย้อนหลังไม่เรียงลำดับ
    if (view === 'deposit' && option === 'cash') check({ method: 'cash', amount: value, onConfirm: execute })
    else if (view === 'withdraw' || view === 'move') check({ method: 'transfer', amount: value, accountId: account.id, onConfirm: execute })
    else execute()
  }

  const footer = (
    // แถบท้ายใช้ขอบในชุดเดียวกับแถบมาตรฐานของ Popup ไม่งั้นปุ่มจะชิดขอบกล่อง
    <div className="flex-none flex items-center gap-2 px-[17px] py-3 border-t border-[#EFEDE7] bg-[#FAF9F6]">
      {view !== 'menu' && (
        <button
          onClick={back}
          disabled={busy}
          className="h-[38px] px-4 rounded-[11px] border border-hairline bg-white text-[13px] font-semibold flex items-center gap-1.5 hover:bg-paper disabled:opacity-50"
        >
          <Icon name="chevron_left" size={17} />
          ย้อนกลับ
        </button>
      )}
      {action ? (
        <button
          onClick={submit}
          disabled={busy || !(value > 0) || (view === 'move' && !target)}
          className="ml-auto h-[38px] px-[18px] rounded-[11px] bg-ink text-white text-[13px] font-semibold hover:bg-black disabled:opacity-40"
        >
          {busy ? 'กำลังบันทึก…' : `${action.confirm} ${value > 0 ? fmt(value) + ' บาท' : ''}`}
        </button>
      ) : (
        <button onClick={onClose} className="ml-auto h-[38px] px-[18px] rounded-[11px] bg-ink text-white text-[13px] font-semibold hover:bg-black">
          ปิด
        </button>
      )}
    </div>
  )

  return (
    <>
    <Popup
      title={title}
      sub={sub}
      icon="account_balance"
      width={view === 'year' || view === 'month' ? 520 : 440}
      onClose={onClose}
      footer={footer}
    >
      {/* ยอดคงเหลือ — อยู่บนสุดทุกมุมมองที่เป็นงานเงิน คนต้องเห็นก่อนตัดสินใจกดตัวเลข */}
      {(view === 'menu' || action) && (
        <div className="rounded-panel bg-paper px-4 py-3.5 flex items-center gap-3">
          <span className="w-10 h-10 flex-none rounded-lg bg-white border border-hairline flex items-center justify-center">
            <AppIcon value={account.icon} size={22} fallback={DEFAULT_ICONS.account} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] text-muted">ยอดคงเหลือตอนนี้</p>
            <p className={`text-[24px] font-semibold tabular-nums leading-tight ${balance < 0 ? 'text-expense' : 'text-ink'}`}>
              {fmt(balance)}
            </p>
          </div>
          {action && value > 0 && (
            <div className="flex-none text-right">
              <p className="text-[11px] text-faint">หลังทำรายการ</p>
              <p className={`text-[15px] font-semibold tabular-nums ${after < 0 ? 'text-expense' : 'text-ink'}`}>
                {fmt(after)}
              </p>
            </div>
          )}
        </div>
      )}

      {view === 'menu' && (
        <>
          {done && (
            <p className="text-[12px] text-income bg-income-soft border border-[#BFE0D2] rounded-ctl px-3 py-2 flex items-center gap-1.5">
              <Icon name="check_circle" size={15} />
              {done}
            </p>
          )}

          {/* งานเงินสามปุ่มเรียงแถวเดียว — สิ่งที่คนเปิดเมนูนี้มาทำบ่อยที่สุด */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => openAction('deposit')}
              className="h-[62px] rounded-ctl bg-income text-white flex flex-col items-center justify-center gap-0.5 hover:brightness-110"
            >
              <Icon name="add" size={19} />
              <span className="text-[12.5px] font-semibold">ฝากเงิน</span>
            </button>
            <button
              onClick={() => openAction('withdraw')}
              className="h-[62px] rounded-ctl bg-pending text-white flex flex-col items-center justify-center gap-0.5 hover:brightness-110"
            >
              <Icon name="remove" size={19} />
              <span className="text-[12.5px] font-semibold">ถอนเงิน</span>
            </button>
            <button
              onClick={() => openAction('move')}
              disabled={others.length === 0}
              title={others.length === 0 ? 'มีบัญชีเดียว ยังไม่มีปลายทางให้โอน' : ''}
              className="h-[62px] rounded-ctl bg-transfer text-white flex flex-col items-center justify-center gap-0.5 hover:brightness-110 disabled:opacity-40"
            >
              <Icon name="swap_horiz" size={19} />
              <span className="text-[12.5px] font-semibold">โอนไปบัญชีอื่น</span>
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
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

      {action && (
        <>
          {action.options.length > 0 && (
            <div>
              <label className="label">{view === 'deposit' ? 'เงินมาจากไหน' : 'เงินไปไหน'}</label>
              <div className="grid grid-cols-2 gap-2">
                {action.options.map((o) => {
                  const on = option === o.key
                  return (
                    <button
                      key={o.key}
                      onClick={() => { setOption(o.key); setError('') }}
                      className={`min-h-[58px] px-3 py-2 rounded-[11px] text-left flex items-start gap-2 transition ${
                        on ? 'bg-ink text-white' : 'border border-hairline bg-white hover:bg-paper'
                      }`}
                    >
                      <UiIcon name={o.icon} tone={on ? 'w' : undefined} size={16} />
                      <span className="min-w-0">
                        <span className="block text-[12.5px] font-semibold leading-tight">{o.label}</span>
                        <span className={`block text-[10.5px] leading-snug mt-0.5 ${on ? 'text-white/70' : 'text-faint'}`}>{o.hint}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
              {option === 'cash' && (
                <p className="text-[11px] text-faint mt-1.5">
                  เงินสดในร้านตอนนี้ <b className="tabular-nums text-ink">{fmt(cash)}</b> บาท
                </p>
              )}
            </div>
          )}

          {view === 'move' && (
            <TransferAccountPicker
              value={targetId}
              onChange={(id) => { setTargetId(id); setError('') }}
              label="ไปบัญชี"
              exclude={[account.id]}
            />
          )}

          <div>
            <label className="label">จำนวนเงิน (บาท)</label>
            <AmountInput
              className="input text-right text-[19px] font-semibold tabular-nums"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError('') }}
              placeholder="0.00"
              autoFocus
            />
          </div>

          <div>
            <label className="label">วันที่</label>
            <DatePicker value={date} onChange={setDate} />
          </div>

          {view === 'move' && target && value > 0 && (
            <p className="text-[11.5px] text-muted bg-[#FAF9F6] border border-[#EFEDE7] rounded-ctl px-3 py-2">
              "{formatAccount(target)}" จะเป็น <b className="tabular-nums text-ink">{fmt(Number(target.balance) + value)}</b> บาท
              · ยอดรวมเงินโอนไม่เปลี่ยน
            </p>
          )}
          {view !== 'move' && option === 'outside' && (
            <p className="text-[11px] text-faint leading-relaxed">
              {view === 'deposit'
                ? 'ใช้กับเงินที่โอนเข้ามาโดยไม่ได้บันทึกเป็นรายรับ เช่นเงินส่วนตัวเติมเข้าร้าน · ถ้าเป็นรายได้ของร้าน ให้บันทึกที่ "บันทึกรายการ" แทน เพื่อให้ขึ้นในรายงาน'
                : 'ใช้กับเงินที่โอนออกโดยไม่ได้เป็นรายจ่ายของร้าน เช่นถอนเงินส่วนตัวคืน · ถ้าเป็นค่าใช้จ่าย ให้บันทึกที่ "บันทึกรายการ" แทน เพื่อให้ขึ้นในรายงาน'}
            </p>
          )}
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
            <span className="ml-auto text-[11px] text-faint">ยอดคงเหลือตอนนี้ {fmt(balance)}</span>
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
        <p className="text-[12px] text-expense bg-expense-soft border border-[#F0C4BE] rounded-ctl px-3 py-2">
          {(view === 'year' || view === 'month') ? 'อ่านความเคลื่อนไหวไม่สำเร็จ — ' : ''}{error}
        </p>
      )}

      {/* บอกที่มาของตัวเลขไว้ เพราะใบนี้ไม่ใช่ใบแจ้งยอดจากธนาคาร */}
      {(view === 'year' || view === 'month') && !loading && (
        <p className="mt-2.5 text-[11px] text-faint leading-relaxed">
          ไล่จากประวัติการใช้งานของแอป (ย้อนหลัง 3 ปี) ไม่ใช่ใบแจ้งยอดจากธนาคาร ·
          ยอดคงเหลือไล่ถอยหลังจากยอดจริงตอนนี้
        </p>
      )}
    </Popup>

    <ConfirmPopup
      open={!!warning}
      title="ยอดเงินจะติดลบ"
      message={warning?.message ?? ''}
      onConfirm={proceed}
      onCancel={cancel}
      confirmLabel="ยืนยัน (ติดลบ)"
      danger
    />
    </>
  )
}
