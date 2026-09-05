import { formatThaiShort, formatThaiDate } from '../../lib/cardCycle'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

/**
 * ป้ายงวดผ่อนทั้งสัญญา — งวดละหนึ่งป้าย บอกวันครบกำหนดและค่างวด
 *
 * มีไว้เพราะตอนบันทึกสัญญาที่ผ่อนมาก่อนแล้ว ("กรอกยอดเก่า") ตัวเลข "จ่ายมาแล้ว
 * กี่งวด" อย่างเดียวตรวจไม่ได้เลยว่ากรอกถูกไหม ต้องเห็นเป็นวันที่ว่างวดถัดไปที่
 * ต้องจ่ายคือเดือนไหน ถึงจะเทียบกับสลิปในมือได้
 *
 * กดที่ป้ายได้ = ตั้งว่าจ่ายมาถึงงวดนั้นแล้ว (กดซ้ำที่งวดล่าสุดคือถอยกลับหนึ่งงวด)
 * เร็วกว่าและผิดยากกว่าการนับเลขใส่ช่องเอง
 *
 * @param rows      ตารางงวด [{ seq, dueDate, amount, closingDate? }]
 * @param paidCount จ่ายมาแล้วกี่งวด (งวด 1..paidCount = เขียว)
 * @param maxPaid   งวดที่ครบกำหนดแล้วจริงมากสุด — เกินนี้กดเลือกไม่ได้
 * @param onPickPaid กดป้ายแล้วให้ตั้งจำนวนงวดที่จ่ายแล้วเป็นเท่าไร (ไม่ส่ง = ดูอย่างเดียว)
 * @param tone      สีกรอบให้เข้ากับกล่องที่ครอบอยู่ (rose = รายจ่าย, amber = หนี้สิน)
 */
export default function InstallmentPips({
  rows = [], paidCount = 0, maxPaid = null, onPickPaid = null, tone = 'rose', showAmount = true,
}) {
  if (!Array.isArray(rows) || rows.length === 0) return null

  const paid = Math.max(0, Math.min(Number(paidCount) || 0, rows.length))
  const limit = maxPaid == null ? rows.length : Math.max(0, Math.min(Number(maxPaid) || 0, rows.length))
  const next = rows[paid] ?? null
  const t = tone === 'amber'
    ? { text: 'text-amber-900', soft: 'text-amber-700', idle: 'border-amber-200 bg-white/70 hover:bg-white' }
    : { text: 'text-rose-900', soft: 'text-rose-600', idle: 'border-rose-200 bg-white/70 hover:bg-white' }

  return (
    <div className="mt-1.5">
      {/* บรรทัดนี้คือคำตอบของ "รอบที่จะถูกเรียกเก็บตอนนี้คือวันไหน" ต้องอยู่บนสุด
          ไม่ใช่ให้ไปไล่นับเอาเองจากป้าย */}
      <p className={`text-[11.5px] ${t.text} mb-1`}>
        {next ? (
          <>
            งวดที่ต้องจ่ายรอบถัดไปคือ <strong>งวดที่ {next.seq}</strong> ครบกำหนด{' '}
            <strong>{formatThaiDate(next.dueDate)}</strong>
            {next.closingDate ? ` (เข้าบิลรอบ ${formatThaiShort(next.closingDate)})` : ''}
          </>
        ) : (
          <>ทุกงวดถูกทำเครื่องหมายว่าจ่ายแล้ว — สัญญานี้ปิดแล้ว</>
        )}
      </p>

      {/* ป้ายกว้างเท่าที่ข้อความต้องการ ไม่ใช่หารความกว้างที่มีตามจำนวนคอลัมน์ตายตัว
          สามคอลัมน์บนกล่องกว้างเกือบพันพิกเซล ทำให้ป้ายที่มีแค่ งวด/วันที่/ค่างวด
          ยืดเป็นสามเท่าของเนื้อหา เหลือที่ว่างจนอ่านเป็นตารางไม่ออก
          auto-fill จึงใส่ป้ายเท่าที่ความกว้างจริงรับไหว จอแคบก็ลดคอลัมน์ให้เอง */}
      <div className="grid gap-1 grid-cols-[repeat(auto-fill,minmax(88px,1fr))]">
        {rows.map((r) => {
          const isPaid = r.seq <= paid
          const isNext = r.seq === paid + 1
          const canPick = !!onPickPaid && r.seq <= limit
          const cls = isPaid
            ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
            : isNext
              ? 'border-ink bg-white text-ink ring-1 ring-ink'
              : `${t.idle} ${t.text}`
          return (
            <button
              key={r.seq}
              type="button"
              disabled={!canPick}
              // กดที่งวดล่าสุดที่จ่ายแล้ว = ถอยกลับหนึ่งงวด ไม่งั้นกดเกินแล้วแก้ไม่ได้
              onClick={canPick ? () => onPickPaid(r.seq === paid ? r.seq - 1 : r.seq) : undefined}
              title={
                canPick
                  ? (isPaid ? `กดเพื่อถอยกลับ — ยังไม่จ่ายถึงงวดที่ ${r.seq}` : `กดเพื่อบอกว่าจ่ายมาแล้วถึงงวดที่ ${r.seq}`)
                  : `งวดนี้ยังไม่ครบกำหนด (${formatThaiDate(r.dueDate)}) จึงบอกว่าจ่ายแล้วไม่ได้`
              }
              className={`rounded-lg border px-1.5 py-1 text-left leading-tight ${cls} ${
                canPick ? 'cursor-pointer' : 'cursor-default'
              } disabled:cursor-default`}
            >
              <span className="flex items-center gap-1 text-[10.5px] font-semibold">
                {isPaid && <span className="text-emerald-600">✓</span>}
                งวด {r.seq}
              </span>
              <span className="block text-[10.5px] tabular-nums opacity-80">{formatThaiShort(r.dueDate)}</span>
              {showAmount && (
                <span className="block text-[10.5px] tabular-nums font-medium">{fmt(r.amount)}</span>
              )}
            </button>
          )
        })}
      </div>

      {onPickPaid && (
        <p className={`text-[11px] ${t.soft} mt-1`}>
          {limit === 0
            // งวดแรกยังไม่ถึงกำหนด = สัญญาใหม่ ไม่มีงวดไหนจ่ายมาก่อนได้เลย
            // ต้องบอกตรงๆ ไม่งั้นจะนั่งกดป้ายที่กดไม่ได้แล้วนึกว่าปุ่มเสีย
            ? 'ยังไม่มีงวดไหนครบกำหนด จึงบอกว่าจ่ายมาแล้วไม่ได้ — ถ้าเป็นสัญญาเก่า ให้เลื่อนวันที่ของรายการย้อนหลังไปที่วันที่ซื้อจริงก่อน'
            : `กดที่ป้ายงวด = บอกว่าจ่ายมาแล้วถึงงวดนั้น · เขียว = จ่ายแล้ว · กรอบเข้ม = งวดถัดไปที่ต้องจ่าย${
              limit < rows.length ? ` · เลือกได้ถึงงวดที่ ${limit} เพราะงวดหลังจากนั้นยังไม่ครบกำหนด` : ''
            }`}
        </p>
      )}
    </div>
  )
}
