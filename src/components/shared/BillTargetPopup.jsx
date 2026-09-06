import { useState } from 'react'
import Popup from './Popup'
import Icon from './Icon'
import { formatCard } from './CreditCardPicker'
import { cyclePeriod, formatThaiDate, formatIsoThai } from '../../lib/cardCycle'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

/**
 * เลือกว่ายอดรูดนี้จะไปอยู่ในบิลใบไหน
 *
 * ขึ้นเฉพาะตอนที่บัตรมีบิลที่ปิดรอบไปแล้วแต่ยังไม่จ่าย เพราะนั่นคือช่วงที่คนเปิดบิลจริง
 * ของธนาคารแล้วมาคีย์รายการที่เห็นในบิล วันที่ที่คีย์คือ "วันนี้" ซึ่งเลยวันสรุปยอดไปแล้ว
 * ถ้าปล่อยตามกฎวันที่ รายการจะไปโผล่บิลรอบหน้า ทั้งที่ธนาคารเก็บในใบที่กำลังจะจ่าย
 *
 * ค่าเริ่มต้นเลือกให้ตามวันที่รูด: ตกในช่วงของบิลใบไหนก็ใบนั้น ไม่ตกใบไหน = บิลรอบถัดไป
 * ผู้ใช้กดเปลี่ยนได้หนึ่งคลิก
 *
 * @param card       บัตรที่รูด
 * @param amount     ยอดที่กำลังจะบันทึก
 * @param date       วันที่รูด 'yyyy-MM-dd'
 * @param statements บิลของบัตรนี้ที่ปิดรอบแล้วและยังไม่จ่ายจบ (เรียงตามวันครบกำหนด)
 * @param onPick     (statementId | null) — null = บิลรอบถัดไปตามปกติ
 */
export default function BillTargetPopup({ card, amount, date, statements = [], onPick, onClose }) {
  const inside = statements.find((s) => date >= s.periodStart && date <= s.periodEnd)
  const [choice, setChoice] = useState(inside ? inside.id : null)

  const next = cyclePeriod(card.closingDay, card.dueDay, new Date(`${date}T00:00:00`))
  const amt = Number(amount) || 0

  const Option = ({ on, onClick, title, sub, right, tone = '' }) => (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 text-left rounded-ctl border px-3 py-2.5 transition ${
        on ? 'border-ink shadow-[0_0_0_1px_#16181D] bg-[#F2FAD9]' : 'border-hairline bg-white hover:border-ink'
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className={`block text-[13px] font-semibold ${tone}`}>{title}</span>
        <span className="block text-[11.5px] text-faint">{sub}</span>
      </span>
      {right && <span className="flex-none text-right text-[12px] tabular-nums text-muted">{right}</span>}
      <span className={`flex-none w-[22px] h-[22px] rounded-full flex items-center justify-center ${on ? 'bg-ink' : 'border border-[#D8D4C9]'}`}>
        {on && <Icon name="check" size={15} className="text-lime" />}
      </span>
    </button>
  )

  return (
    <Popup
      title="รายการนี้อยู่ในบิลใบไหน"
      sub={`${formatCard(card)} · ${fmt(amt)} บาท · รูดวันที่ ${formatIsoThai(date)}`}
      icon="credit_card"
      headTone="danger"
      width={480}
      onClose={onClose}
      onConfirm={() => onPick(choice)}
      confirmLabel="บันทึกเข้าบิลนี้"
    >
      <p className="text-[12.5px] text-muted leading-relaxed">
        บัตรใบนี้เลยวันสรุปยอดมาแล้วและยังมีบิลที่ยังไม่จ่าย ถ้ารายการนี้อยู่ในบิลใบนั้น
        (ดูจากบิลจริงของธนาคาร) ให้เลือกใบนั้น ยอดที่ต้องจ่ายจะถูกบวกเพิ่มทันที
        ไม่งั้นรายการจะไปอยู่บิลรอบถัดไปตามวันที่รูด
      </p>

      <div className="space-y-1.5">
        {statements.map((s) => {
          const left = Number(s.amount || 0) - Number(s.paidAmount || 0)
          return (
            <Option
              key={s.id}
              on={choice === s.id}
              onClick={() => setChoice(s.id)}
              title={`บิลที่ครบกำหนด ${formatIsoThai(s.dueDate)}`}
              sub={`ปิดรอบ ${formatIsoThai(s.periodEnd)} · ออกบิลไปแล้ว${
                inside?.id === s.id ? ' · วันที่รูดอยู่ในรอบนี้' : ''
              }`}
              right={`${fmt(left)} → ${fmt(left + amt)}`}
              tone="text-[#A93A2E]"
            />
          )
        })}
        <Option
          on={choice === null}
          onClick={() => setChoice(null)}
          title={`บิลรอบถัดไป · ครบกำหนด ${formatThaiDate(next.due)}`}
          sub={`ตัดรอบ ${formatThaiDate(next.end)} · ยังไม่ออกบิล${inside ? '' : ' · ตรงตามวันที่รูด'}`}
        />
      </div>

      <p className="text-[11px] text-faint">
        เปลี่ยนใจทีหลังได้ที่หน้าบัตร — เมนู ⋮ ท้ายรายการมี “ใส่เข้าบิล / เอาออกจากบิล”
      </p>
    </Popup>
  )
}
