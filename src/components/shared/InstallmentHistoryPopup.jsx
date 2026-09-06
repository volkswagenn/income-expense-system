import { useMemo } from 'react'
import Popup from './Popup'
import useCreditCardStore from '../../store/useCreditCardStore'
import useWalletStore from '../../store/useWalletStore'
import { formatIsoThai } from '../../lib/cardCycle'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

/** timestamptz หรือ date → 'YYYY-MM-DD' ตามเวลาเครื่อง (ไม่ใช่ UTC ไม่งั้นวันเลื่อน) */
const dayOf = (v) => {
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** ห่างกันกี่วันแบบนับวันล้วน — ไม่เอาเวลามาเกี่ยว ไม่งั้นจ่ายตอนเย็นวันครบกำหนดจะกลายเป็นช้า */
const daysBetween = (a, b) => {
  if (!a || !b) return null
  const [y1, m1, d1] = a.split('-').map(Number)
  const [y2, m2, d2] = b.split('-').map(Number)
  return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86400000)
}

/**
 * ประวัติการผ่อนของสัญญาหนึ่งฉบับ — ย้อนดูได้แม้ผ่อนครบไปแล้ว
 *
 * ตอบสามคำถามที่ตารางงวดเดิมตอบไม่ได้
 *   1. สัญญานี้ตกลงกันไว้ว่ายังไง — กี่งวด ยอดเท่าไร ดอกเบี้ยเท่าไร เริ่มเมื่อไร จบเมื่อไร
 *   2. แต่ละงวด "จ่ายจริง" วันไหน — ไม่ใช่แค่วันครบกำหนดที่ตั้งไว้ตอนทำสัญญา
 *   3. จ่ายตรงหรือช้า และช้ากี่วัน
 *
 * วันที่จ่ายจริงมาจากสองทางที่ต่างกันโดยสิ้นเชิง จึงต้องไล่หาให้ถูกทาง
 *   • กดจ่ายค่างวดเองในแอป → งวดเก็บ paid_at ของตัวเอง เส้นตายคือวันครบกำหนดของงวด
 *   • งวดเข้าบิลบัตรแล้วจ่ายที่บิล → ต้องไปอ่านวันที่จ่ายของ "ใบแจ้งยอด" ที่งวดผูกอยู่
 *     และเส้นตายคือวันครบกำหนดของบิลใบนั้น ไม่ใช่วันครบกำหนดของงวด (สองวันนี้ต่างกันได้
 *     เช่นงวดครบกำหนดวันที่ 7 แต่ถูกเก็บในบิลที่ครบกำหนดวันที่ 10)
 */
export default function InstallmentHistoryPopup({ installment, onClose }) {
  const progress = useCreditCardStore((s) => s.getInstallmentProgress(installment.id))
  const statements = useCreditCardStore((s) => s.statements)
  const legs = useCreditCardStore((s) => s.statementPayments)
  const cardLabel = useCreditCardStore((s) => s.getCardLabel(installment.cardId))
  const accounts = useWalletStore((s) => s.transferAccounts)

  const rows = useMemo(() => {
    if (!progress) return []
    const accountName = (id) => accounts.find((a) => a.id === id)?.name ?? 'บัญชีที่ถูกลบไปแล้ว'
    // ใบที่จ่ายแล้วแต่ยังไม่มี paid_at (ข้อมูลเก่า) — ถอยไปอ่านขาจ่ายล่าสุดของใบนั้น
    const lastLegOf = (statementId) => legs
      .filter((l) => l.statementId === statementId)
      .map((l) => dayOf(l.paidAt))
      .filter(Boolean)
      .sort()
      .at(-1) ?? null

    return progress.rows.map((r) => {
      const stmt = r.statementId ? statements.find((s) => s.id === r.statementId) : null
      const viaBill = !!stmt
      const deadline = viaBill ? stmt.dueDate : r.dueDate

      let paidOn = null
      let via = 'ยังไม่ถึงรอบ'
      if (r.status === 'prepaid') {
        via = 'จ่ายมาก่อนเริ่มใช้แอป'
      } else if (r.paidMethod) {
        // จ่ายค่างวดเองในแอป — เงินออกจากกระเป๋าตรงๆ ไม่ผ่านบิล
        paidOn = dayOf(r.paidAt)
        via = r.paidMethod === 'transfer' ? `โอนจาก ${accountName(r.transferAccountId)}` : 'เงินสด'
      } else if (viaBill && stmt.status === 'paid') {
        paidOn = dayOf(stmt.paidAt) ?? lastLegOf(stmt.id)
        via = `จ่ายรวมในบิลรอบ ${stmt.cycle}`
      } else if (viaBill) {
        via = `อยู่ในบิลรอบ ${stmt.cycle} รอจ่าย`
      } else if (r.status === 'billed') {
        via = 'เข้าบิลแล้ว รอจ่าย'
      }

      const late = paidOn && deadline ? daysBetween(paidOn, deadline) : null
      return { ...r, deadline, paidOn, via, late, viaBill }
    })
  }, [progress, statements, legs, accounts])

  if (!progress) return null

  const paidRows = rows.filter((r) => r.paidOn)
  const onTime = paidRows.filter((r) => r.late != null && r.late <= 0).length
  const lateRows = paidRows.filter((r) => r.late > 0)
  const worstLate = lateRows.reduce((n, r) => Math.max(n, r.late), 0)
  const lastPaid = paidRows.map((r) => r.paidOn).sort().at(-1) ?? null

  const total = Number(installment.totalAmount)
  const principal = Number(installment.principalAmount ?? installment.totalAmount)
  const interest = Math.round((total - principal) * 100) / 100
  const hasTiers = Array.isArray(installment.tiers) && installment.tiers.length > 1
  const finished = installment.status === 'completed'
  const doneCount = progress.paidCount + progress.prepaidCount

  return (
    <Popup
      title={installment.name}
      sub={`${finished ? 'ผ่อนครบแล้ว' : 'กำลังผ่อน'} · ${cardLabel}`}
      icon="credit_card"
      width={720}
      onClose={onClose}
      footer={null}
    >
      {/* สรุปสัญญา — ตอบว่า "ตกลงกันไว้ว่ายังไง" ก่อนจะไล่ดูทีละงวด */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { t: 'จำนวนงวด', v: `${installment.months} งวด`, s: `จ่ายแล้ว ${doneCount} งวด` },
          {
            t: 'ยอดเต็มทั้งสัญญา',
            v: fmt(total),
            s: hasTiers ? `ขั้นบันได ${installment.tiers.length} ช่วง`
              : interest > 0 ? `ราคา ${fmt(principal)} + ดอกเบี้ย ${fmt(interest)}`
                : 'ผ่อน 0%',
          },
          {
            t: 'งวดละ',
            v: hasTiers ? 'ไม่เท่ากัน' : fmt(installment.monthlyAmount),
            s: hasTiers ? installment.tiers.map((x) => `งวด ${x.from}-${x.to} ละ ${fmt(x.amount)}`).join(' · ') : '',
          },
          {
            t: finished ? 'จ่ายครบเมื่อ' : 'คงเหลือ',
            v: finished ? (lastPaid ? formatIsoThai(lastPaid) : '—') : fmt(progress.unpaidAmount),
            s: finished ? '' : `อีก ${progress.remainingCount + progress.billedCount} งวด`,
          },
        ].map((b) => (
          <div key={b.t} className="rounded-ctl border border-hairline bg-paper px-2.5 py-2">
            <div className="text-[10.5px] text-faint">{b.t}</div>
            <div className="tabular-nums text-[14px] font-bold text-ink leading-tight mt-0.5">{b.v}</div>
            {b.s && <div className="text-[10.5px] text-faint leading-snug mt-0.5">{b.s}</div>}
          </div>
        ))}
      </div>

      {/* จ่ายตรงหรือไม่ — คำถามที่ตารางงวดเดิมไม่เคยตอบ */}
      {paidRows.length > 0 && (
        <div className={`rounded-ctl px-3 py-2 text-[12px] ${
          lateRows.length === 0
            ? 'bg-income-soft text-[#0F6A50]'
            : 'bg-pending-soft text-[#8A6A15]'
        }`}>
          {lateRows.length === 0
            ? `จ่ายตรงเวลาทุกงวดที่จ่ายไปแล้ว (${onTime} งวด)`
            : `ตรงเวลา ${onTime} งวด · ช้า ${lateRows.length} งวด (ช้าสุด ${worstLate} วัน — งวดที่ ${lateRows.map((r) => r.seq).join(', ')})`}
        </div>
      )}

      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-[12px] min-w-[560px]">
          <thead>
            <tr className="text-faint text-left">
              <th className="py-1 pr-2 font-medium">งวด</th>
              <th className="py-1 pr-2 font-medium">ครบกำหนด</th>
              <th className="py-1 pr-2 font-medium">จ่ายจริง</th>
              <th className="py-1 pr-2 font-medium">ตรงเวลาไหม</th>
              <th className="py-1 pr-2 font-medium text-right">ยอด</th>
              <th className="py-1 font-medium">จ่ายทางไหน</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[#F2F0EA]">
                <td className="py-1.5 pr-2 tabular-nums text-muted">{r.seq}</td>
                <td className="py-1.5 pr-2 tabular-nums text-muted whitespace-nowrap">
                  {formatIsoThai(r.deadline)}
                  {/* เส้นตายจริงคือของบิล ถ้าต่างจากวันครบกำหนดของงวดต้องบอก ไม่งั้นดูเหมือนคิดผิด */}
                  {r.viaBill && r.deadline !== r.dueDate && (
                    <span className="block text-[10px] text-faint">ตามบิล (งวดตั้งไว้ {formatIsoThai(r.dueDate)})</span>
                  )}
                </td>
                <td className="py-1.5 pr-2 tabular-nums whitespace-nowrap">
                  {r.paidOn ? <span className="text-income font-semibold">{formatIsoThai(r.paidOn)}</span> : <span className="text-faint">—</span>}
                </td>
                <td className="py-1.5 pr-2 whitespace-nowrap">
                  {r.late == null ? <span className="text-faint">—</span>
                    : r.late <= 0
                      ? <span className="text-income">✓ ตรงเวลา{r.late < 0 ? ` (ก่อน ${-r.late} วัน)` : ''}</span>
                      : <span className="text-[#A93A2E]">ช้า {r.late} วัน</span>}
                </td>
                <td className="py-1.5 pr-2 tabular-nums text-right font-semibold">{fmt(r.paidAmount ?? r.amount)}</td>
                <td className="py-1.5 text-muted">{r.via}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-faint leading-relaxed">
        งวดที่เก็บรวมในบิลบัตรถือว่าจ่ายเมื่อบิลใบนั้นถูกจ่าย จึงใช้วันครบกำหนดของบิลเป็นเส้นตาย
        ส่วนงวดที่กดจ่ายเองในแอปใช้วันครบกำหนดของงวด · งวดที่บันทึกว่าผ่อนมาก่อนเริ่มใช้แอป
        ไม่มีวันที่จ่ายให้ตรวจ เพราะเกิดขึ้นก่อนระบบรู้จักสัญญานี้
      </p>
    </Popup>
  )
}
