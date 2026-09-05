import Popup from './Popup'
import { formatCard } from './CreditCardPicker'
import ExpenseForm from '../../pages/Transactions/ExpenseForm'

/**
 * บันทึกยอดรูดบัตรจากหน้าบัตร
 *
 * ข้างในคือฟอร์มรายจ่ายตัวเดียวกับหน้าบันทึกรายการ ไม่ใช่ฟอร์มย่อคนละชุด
 *   ตอนแรกทำเป็นฟอร์มสั้นๆ ห้าช่อง แล้วพบว่ามันขาดของที่คนใช้จริงต้องการอยู่ดี
 *   (ผ่อน ใบกำกับภาษี ไฟล์แนบ รายการที่บันทึกไว้ แป้นตัวเลข) และถ้าเติมให้ครบ
 *   ก็จะกลายเป็นฟอร์มรายจ่ายอีกชุดที่ต้องตามแก้คู่กันไปตลอด
 *   จึงส่ง lockCardId เข้าไปแทน แล้วให้ฟอร์มเดิมล็อกช่องทางจ่ายเป็นบัตรใบนี้
 *
 * props: card (ใบที่เปิดอยู่), onClose, onSaved
 */
export default function CardChargePopup({ card, onClose, onSaved }) {
  return (
    <Popup
      title="เพิ่มรายการรูดบัตร"
      sub={formatCard(card)}
      icon="credit_card"
      headTone="danger"
      width={760}
      onClose={onClose}
      bodyClassName=""
    >
      <ExpenseForm
        lockCardId={card.id}
        onSaved={() => { onSaved?.(); onClose() }}
      />
    </Popup>
  )
}
