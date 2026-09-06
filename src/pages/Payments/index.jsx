import { useMemo, useState } from 'react'
import { format, subMonths } from 'date-fns'
import usePaymentHistory, { PAYMENT_KINDS } from '../../hooks/usePaymentHistory'
import usePaymentSlipStore from '../../store/usePaymentSlipStore'
import useLogStore from '../../store/useLogStore'
import { buildLogEntry } from '../../lib/logBuilder'
import Icon from '../../components/shared/Icon'
import Popup from '../../components/shared/Popup'
import FileUploadPopup from '../../components/shared/FileUploadPopup'
import AttachmentViewerPopup, { getAttachments } from '../../components/shared/AttachmentViewer'
import DateRangeFilter from '../../components/shared/DateRangeFilter'
import { formatIsoThai } from '../../lib/cardCycle'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

/**
 * '2026-09-06T13:45:00' → '6 ก.ย. 2569 13:45'
 *
 * ค่าที่เก็บมามีสองแบบ: บางตารางเก็บเป็นวันที่ล้วน ('2026-09-05') บางตารางเก็บ
 * เวลาเต็ม การเอาวันที่ล้วนไปแปลงเป็นเวลาจะได้เวลาปลอมตามโซนเวลา (07:00)
 * จึงดูจากรูปแบบของค่าที่เก็บ ไม่ใช่จากผลการแปลง
 * และเวลาเที่ยงตรงคือค่าตั้งต้นตอนผู้ใช้เลือกแค่วันที่ ไม่ใช่เวลาจ่ายจริง จึงไม่โชว์
 */
function whenText(value) {
  if (!value) return '—'
  const hasTime = typeof value === 'string' && value.includes('T')
  if (!hasTime) return formatIsoThai(value)
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return formatIsoThai(value)
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return time === '12:00' ? formatIsoThai(value) : `${formatIsoThai(value)} ${time}`
}

function monthLabel(day) {
  if (!day) return 'ไม่ระบุวันที่'
  const [y, m] = day.split('-').map(Number)
  return `${THAI_MONTHS[m - 1]} ${y + 543}`
}

/**
 * ประวัติการจ่าย — ทุกครั้งที่เงินออกไปปิดภาระ รวมไว้ที่เดียว
 *
 * ทำไมต้องแยกจาก "ประวัติทั้งหมด": หน้านั้นเป็นบันทึกเหตุการณ์ของระบบ (ใครแก้อะไร)
 * ส่วนหน้านี้ตอบคำถามเดียวคือ "จ่ายอะไรไปแล้วบ้าง และหลักฐานอยู่ไหน"
 * ซึ่งเป็นสิ่งที่ต้องหาเจอย้อนหลังเป็นปี ตอนสัญญาปิดไปแล้วหรือตอนมีข้อโต้แย้ง
 */
export default function PaymentsPage() {
  const rows = usePaymentHistory()
  const saveSlip = usePaymentSlipStore((s) => s.save)
  const removeSlip = usePaymentSlipStore((s) => s.remove)
  const { addLog } = useLogStore()

  const [kind, setKind] = useState('all')
  const [q, setQ] = useState('')
  // เริ่มที่ 12 เดือนล่าสุด ไม่ใช่เดือนนี้ — หน้านี้มีไว้หาย้อนหลัง ถ้าเปิดมาเห็นแค่
  // เดือนปัจจุบันจะดูเหมือนไม่มีประวัติ ทั้งที่ของอยู่ครบแค่ถูกกรองออก
  const [filter, setFilter] = useState('year')
  const [startDate, setStartDate] = useState(format(subMonths(new Date(), 12), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [detail, setDetail] = useState(null)
  const [uploadFor, setUploadFor] = useState(null)
  const [viewSlip, setViewSlip] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (kind !== 'all' && r.kind !== kind) return false
      if (startDate && r.day && r.day < startDate) return false
      if (endDate && r.day && r.day > endDate) return false
      if (!kw) return true
      return `${r.title} ${r.detail ?? ''} ${r.source ?? ''}`.toLowerCase().includes(kw)
    })
  }, [rows, kind, q, startDate, endDate])

  const total = shown.reduce((n, r) => n + (r.incoming ? 0 : r.amount), 0)
  const withSlip = shown.filter((r) => getAttachments(r.slip).length > 0).length

  // จัดกลุ่มตามเดือน — ประวัติยาวเป็นปี ถ้าไล่เป็นรายการยาวรวดเดียวจะหาไม่เจอ
  const groups = useMemo(() => {
    const map = new Map()
    for (const r of shown) {
      const k = r.day ? r.day.slice(0, 7) : 'unknown'
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(r)
    }
    return [...map.entries()]
  }, [shown])

  const attachSlip = async (row, paths) => {
    setBusy(true); setError('')
    try {
      const attachments = paths.map((path, i) => ({
        path, type: 'slip', label: paths.length > 1 ? `สลิป ${i + 1}` : 'สลิปโอนเงิน',
        uploadedAt: new Date().toISOString(),
      }))
      await saveSlip({ kind: row.kind, refId: row.refId, paidAt: row.paidAt, attachments })
      await addLog(buildLogEntry({
        activityType: 'ATTACH_PAYMENT_SLIP',
        description: `แนบสลิปการจ่าย "${row.title}" ${fmt(row.amount)} บาท`,
        newValue: { kind: row.kind, refId: row.refId, files: paths.length },
      }))
      setDetail((d) => (d && d.key === row.key ? { ...d, slip: { ...d.slip, attachments } } : d))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
      setUploadFor(null)
    }
  }

  const dropSlip = async (row) => {
    if (!row.slip?.id) return
    setBusy(true); setError('')
    try {
      await removeSlip(row.slip.id)
      setDetail((d) => (d && d.key === row.key ? { ...d, slip: null } : d))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const KindChip = ({ value, label, count }) => (
    <button
      onClick={() => setKind(value)}
      className={`h-[34px] px-3 rounded-ctl border text-[12.5px] font-semibold flex items-center gap-2 transition ${
        kind === value ? 'bg-ink text-white border-ink' : 'bg-white border-hairline hover:border-ink'
      }`}
    >
      {label}
      <span className={`tabular-nums text-[11.5px] ${kind === value ? 'text-[#B9BEC6]' : 'text-faint'}`}>{count}</span>
    </button>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="bg-ink rounded-panel px-4 py-3.5">
          <div className="text-[11.5px] text-[#9AA0A8]">จ่ายไปแล้วในช่วงที่เลือก</div>
          <div className="tabular-nums text-[26px] font-semibold text-white tracking-[-0.02em] mt-0.5">{fmt(total)}</div>
        </div>
        <div className="card px-4 py-3.5">
          <div className="text-[11.5px] text-muted">จำนวนครั้ง</div>
          <div className="tabular-nums text-[22px] font-semibold text-[#3F444C] mt-0.5">{shown.length}</div>
        </div>
        <div className="card px-4 py-3.5">
          <div className="text-[11.5px] text-muted">มีสลิปแนบแล้ว</div>
          <div className="tabular-nums text-[22px] font-semibold text-income mt-0.5">{withSlip}</div>
        </div>
        <div className="card px-4 py-3.5">
          <div className="text-[11.5px] text-muted">ยังไม่มีสลิป</div>
          <div className="tabular-nums text-[22px] font-semibold text-[#3F444C] mt-0.5">{shown.length - withSlip}</div>
        </div>
      </div>

      <div className="card px-4 py-3 flex flex-col gap-2.5">
        <DateRangeFilter
          filter={filter} setFilter={setFilter}
          startDate={startDate} endDate={endDate}
          setStartDate={setStartDate} setEndDate={setEndDate}
          compact
        />
        <div className="flex items-center gap-2 flex-wrap">
          <KindChip value="all" label="ทั้งหมด" count={rows.length} />
          {Object.entries(PAYMENT_KINDS).map(([k, meta]) => (
            <KindChip key={k} value={k} label={meta.label} count={rows.filter((r) => r.kind === k).length} />
          ))}
          <div className="flex-1 min-w-[180px] h-[34px] px-3 border border-hairline rounded-ctl bg-white flex items-center gap-2">
            <Icon name="search" size={16} className="text-faint flex-none" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาชื่อรายการหรือบัญชี"
              className="flex-1 min-w-0 bg-transparent outline-none text-[12.5px]"
            />
          </div>
        </div>
      </div>

      {error && <p className="text-[12.5px] text-expense bg-expense-soft border border-[#F0C4BE] rounded-ctl px-3.5 py-2.5">{error}</p>}

      {shown.length === 0 ? (
        <div className="card px-4 py-10 text-center text-[12.5px] text-muted">
          {rows.length === 0
            ? 'ยังไม่มีประวัติการจ่าย — เมื่อจ่ายบิลบัตร ค่างวด หรือรายการค้างชำระ จะมาอยู่ที่นี่'
            : 'ไม่พบรายการที่ตรงกับที่กรอง'}
        </div>
      ) : groups.map(([month, list]) => (
        <div key={month} className="card overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 pt-3 pb-2 border-b border-[#F2F0EA]">
            <span className="text-sm font-semibold">{monthLabel(list[0].day)}</span>
            <span className="tabular-nums text-[11px] font-semibold bg-paper rounded-md px-2 py-0.5">{list.length} ครั้ง</span>
            <span className="tabular-nums ml-auto text-[13px] font-bold">
              {fmt(list.reduce((n, r) => n + (r.incoming ? 0 : r.amount), 0))}
            </span>
          </div>
          <div className="px-4 py-1.5">
            {list.map((r) => {
              const meta = PAYMENT_KINDS[r.kind]
              const files = getAttachments(r.slip)
              return (
                <div key={r.key} className="flex items-center gap-3 py-2 border-t border-[#F6F4EF] first:border-t-0">
                  <span className={`w-8 h-8 flex-none rounded-[10px] flex items-center justify-center ${meta.tone}`}>
                    <Icon name={meta.icon} size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-medium truncate">{r.title}</span>
                    <span className="block text-[11px] text-faint truncate">
                      {whenText(r.paidAt)}
                      {r.detail && ` · ${r.detail}`}
                      {r.source && ` · ${r.incoming ? 'เข้า' : 'จาก'}${r.source}`}
                    </span>
                  </span>
                  {files.length > 0 ? (
                    <button
                      onClick={() => setViewSlip(files)}
                      className="flex-none h-[30px] px-2.5 rounded-[9px] border border-hairline bg-white text-[11.5px] font-semibold flex items-center gap-1 hover:bg-paper"
                    >
                      <Icon name="receipt_long" size={15} />
                      ดูสลิป{files.length > 1 ? ` ${files.length}` : ''}
                    </button>
                  ) : (
                    <button
                      onClick={() => setUploadFor(r)}
                      className="flex-none h-[30px] px-2.5 rounded-[9px] border border-dashed border-[#D8D4C9] text-[11.5px] text-muted hover:border-ink hover:text-ink"
                    >
                      + แนบสลิป
                    </button>
                  )}
                  <span className={`tabular-nums flex-none w-[104px] text-right text-[13px] font-semibold ${
                    r.incoming ? 'text-income' : 'text-ink'
                  }`}>
                    {r.incoming ? '+' : ''}{fmt(r.amount)}
                  </span>
                  <button
                    onClick={() => setDetail(r)}
                    className="flex-none w-7 h-7 rounded-[8px] flex items-center justify-center text-faint hover:text-ink hover:bg-paper"
                    title="ดูรายละเอียด"
                  >
                    <Icon name="chevron_right" size={18} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {detail && (
        <Popup
          title="รายละเอียดการจ่าย"
          sub={detail.title}
          icon={PAYMENT_KINDS[detail.kind].icon}
          width={460}
          onClose={() => setDetail(null)}
        >
          <div className="rounded-ctl bg-paper px-3.5 py-3">
            <div className="text-[11.5px] text-muted">{PAYMENT_KINDS[detail.kind].label}</div>
            <div className={`tabular-nums text-[26px] font-semibold mt-0.5 ${detail.incoming ? 'text-income' : 'text-ink'}`}>
              {detail.incoming ? '+' : ''}{fmt(detail.amount)}
            </div>
          </div>

          {[
            ['จ่ายเมื่อ', whenText(detail.paidAt)],
            ['รายการ', detail.title],
            ['รายละเอียด', detail.detail || '—'],
            [detail.incoming ? 'เข้ากระเป๋า' : 'ตัดจาก', detail.source || '—'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-2.5 py-1.5 border-t border-[#F6F4EF]">
              <span className="flex-none w-[110px] text-[11.5px] text-faint">{k}</span>
              <span className="flex-1 min-w-0 text-[12.5px] text-right">{v}</span>
            </div>
          ))}

          {detail.legacy && (
            <p className="text-[11px] text-faint leading-relaxed">
              บิลใบนี้จ่ายไว้ก่อนระบบจะแยกเก็บการจ่ายทีละครั้ง จึงแสดงเป็นยอดรวมที่จ่ายไปทั้งหมดของใบ
            </p>
          )}

          <div className="border-t border-[#F6F4EF] pt-2.5">
            <div className="text-[11.5px] text-faint mb-1.5">สลิป / หลักฐานการโอน</div>
            {getAttachments(detail.slip).length > 0 ? (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setViewSlip(getAttachments(detail.slip))}
                  className="h-[34px] px-3 rounded-[9px] bg-ink text-white text-[12px] font-semibold flex items-center gap-1.5 hover:bg-black"
                >
                  <Icon name="receipt_long" size={16} />
                  เปิดดูสลิป
                </button>
                <button
                  onClick={() => setUploadFor(detail)}
                  className="h-[34px] px-3 rounded-[9px] border border-hairline bg-white text-[12px] hover:bg-paper"
                >
                  เปลี่ยนไฟล์
                </button>
                <button
                  onClick={() => dropSlip(detail)}
                  disabled={busy}
                  className="h-[34px] px-3 rounded-[9px] border border-hairline bg-white text-[12px] text-expense hover:bg-expense-soft disabled:opacity-50"
                >
                  เอาสลิปออก
                </button>
              </div>
            ) : (
              <button
                onClick={() => setUploadFor(detail)}
                className="h-[34px] px-3 rounded-[9px] border border-dashed border-[#D8D4C9] text-[12px] text-muted hover:border-ink hover:text-ink"
              >
                + แนบสลิปการโอน
              </button>
            )}
          </div>
        </Popup>
      )}

      {uploadFor && (
        <FileUploadPopup
          title="แนบสลิปการจ่าย"
          description={`${uploadFor.title} · ${fmt(uploadFor.amount)} บาท`}
          createdAt={uploadFor.paidAt}
          filenamePrefix="slip"
          folderBase="slips"
          onConfirm={(saved) => {
            const paths = saved ? (Array.isArray(saved) ? saved : [saved]) : []
            if (paths.length === 0) return setUploadFor(null)
            attachSlip(uploadFor, paths)
          }}
          onCancel={() => setUploadFor(null)}
        />
      )}

      {viewSlip && <AttachmentViewerPopup attachments={viewSlip} onClose={() => setViewSlip(null)} />}
    </div>
  )
}
