# วิเคราะห์: Sync Issues & UX ที่ควรปรับปรุง

---

## ส่วนที่ 1 — Sync Issues (ข้อมูลไม่สอดคล้องกัน)

มี 3 จุดที่มีปัญหา "linked records ไม่ได้รับการอัปเดต" เหมือน taxStatus sync

---

### 🔴 Issue 1 — แก้ไขวิธีชำระ (method) ใน EditTransactionPopup

**สถานการณ์ที่เกิด:**

| เปลี่ยนจาก | เปลี่ยนเป็น | สิ่งที่ควรเกิด | สิ่งที่เกิดจริง |
|---|---|---|---|
| `pending` | `cash/transfer` | ลบ pendingPayment card ออก | card ยังอยู่ (ค้างในระบบ) |
| `cash/transfer` | `pending` | สร้าง pendingPayment card ใหม่ | ไม่สร้าง (ไม่มี card) |

**code ที่เป็นปัญหา** — `EditTransactionPopup.jsx` line 84-88:
```js
// เรียกเสมอ — ไม่สนใจว่า method เปลี่ยนหรือไม่
syncPendingByTxId(transaction.id, { description, amount, dueDate })
```

**ผลที่เห็น:** กระเป๋าเงินถูกปรับยอดถูกต้อง (เพราะ wallet delta logic ทำงาน)
แต่การ์ด "ค้างชำระ" ยังค้างอยู่หน้า PendingTracker แม้จ่ายจริงแล้ว
หรือไม่มีการ์ดปรากฏเมื่อเปลี่ยนมาเป็น pending

**แนวทางแก้:** เพิ่ม logic เช่นเดียวกับ taxStatus:
- `pending → non-pending` → `deletePendingByTxId(transaction.id)`
- `non-pending → pending` → `addPending({ transactionId, amount, dueDate, description })`
- `pending → pending` → `syncPendingByTxId(...)` (เหมือนเดิม)

---

### 🔴 Issue 2 — ลบ Transaction ทิ้ง orphan records

**สถานการณ์:** user ลบ transaction จากหน้า "ประวัติธุรกรรม"

**code ที่เป็นปัญหา** — `useTransactionStore.js`:
```js
deleteTransaction: (id) =>
  set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) }))
```
ลบแค่ transaction — ไม่แตะ pendingPayments หรือ taxInvoices

**ผลที่เห็น:**
- การ์ด "ค้างชำระ" ยังอยู่หน้า PendingTracker ทั้งที่ transaction ถูกลบแล้ว
- การ์ด "รอใบกำกับภาษี" ยังอยู่ทั้งที่บิลถูกลบแล้ว
- กด "จ่าย" การ์ดที่ค้างอยู่ได้ → เงินหายออกจากกระเป๋า แต่ไม่มี transaction ปลายทาง

**แนวทางแก้ (2 แบบ):**

แบบ A — Cascade delete อัตโนมัติ:
```
deleteTransaction(id) → ด้วยกัน:
  deletePendingByTxId(id)
  deleteTaxInvoiceByTxId(id)
```

แบบ B — เตือนก่อนลบ:
```
ถ้า transaction มี linked records → ขึ้น popup:
"รายการนี้มีบิลค้างชำระ / รอใบกำกับภาษีที่เชื่อมอยู่
ยืนยันการลบจะลบรายการที่เชื่อมโยงทั้งหมดด้วย"
```

**แนะนำ:** แบบ A ง่ายกว่า เพราะ orphan record ไม่มีประโยชน์เมื่อ transaction หายไปแล้ว

---

### 🟡 Issue 3 — ชำระ Pending แล้ว Transaction method ไม่อัปเดต

**สถานการณ์:** user กด "จ่ายเงินสด" ใน PendingTracker

**code ปัจจุบัน** — `PendingTracker.jsx` executePay:
```js
deductWallet(method, item.amount, { ... })
payPending(item.id, method)   ← mark pending card เป็น 'paid'
// ไม่มี: updateTransaction(item.transactionId, { method: method })
```

**ผลที่เห็น:**
- pendingPayment card → status `paid` ✓
- กระเป๋าเงิน → ถูกหัก ✓
- Transaction record → method ยังเป็น `'pending'` ✗

ผลกระทบ: หน้า Reports/History แสดง transaction นี้เป็น "ค้างชำระ" ตลอด
แม้จะชำระแล้ว ตัวเลขอาจคลาดเคลื่อนถ้ามี filter แยกตาม method

**แนวทางแก้:**
```js
// ใน executePay — เพิ่ม
if (item.transactionId) {
  updateTransaction(item.transactionId, { method: method })
}
```

---

## ส่วนที่ 2 — UX ที่ควรปรับปรุง

### 🔧 UX-1 ปุ่ม "แก้ไข" บนการ์ด PendingPayment

**ปัญหาเดิม:** ถ้าต้องการแก้ไขรายละเอียดบิลค้างชำระ (เช่น เปลี่ยนยอด, วันครบกำหนด)
user ต้องไป → ประวัติการทำรายการ → ค้นหา → แก้ไข → กลับมา

**เสนอ:** เพิ่มปุ่ม "✏️ แก้ไข" บนการ์ด PendingItem ใน PendingTracker
→ เปิด EditTransactionPopup ของ transaction ที่ link อยู่ (ผ่าน `item.transactionId`)

```
ปัจจุบัน:  [💵 จ่ายเงินสด] [🏦 จ่ายเงินโอน] [ลบ]
เสนอ:      [💵 จ่ายเงินสด] [🏦 จ่ายเงินโอน] [✏️] [ลบ]
```

ต้องทำ: ดึง transaction ด้วย `item.transactionId` จาก useTransactionStore ก่อนเปิด popup

---

### 🔧 UX-2 แสดง dueDate ของใบกำกับภาษี (วันคาดได้รับ)

**ปัญหาเดิม:** taxInvoice ไม่มี dueDate → dot สีม่วงบนปฏิทินไม่เคยปรากฏ

**เสนอ:** เพิ่ม field "วันที่คาดว่าจะได้รับใบ" ใน ExpenseForm และ EditTransactionPopup
เมื่อ `taxStatus === 'waiting'`:

```
[ใบกำกับภาษี: รอใบ ▾]  [วันที่คาดว่าจะได้รับ: ____]
```

field นี้จะถูกส่งต่อไปใน `addTaxInvoice({ ..., dueDate: form.taxDueDate })`
→ dot สีม่วงบนปฏิทินจะปรากฏในวันนั้น

---

### 🔧 UX-3 Toast/Feedback หลัง save รายการ

**ปัญหาเดิม:** หลัง save expense ที่มี taxStatus=waiting หรือ method=pending
ระบบทำงานแล้ว แต่ user ไม่รู้ว่า "การ์ดถูกสร้างที่ไหน"

**เสนอ:** แสดง toast notification ที่มี link:
```
✓ บันทึกแล้ว — สร้างบิลค้างชำระ "ซื้อของ" 6,840 บาท
  [ดูรายการค้างชำระ →]
```
```
✓ บันทึกแล้ว — เพิ่มรายการรอใบกำกับภาษี
  [ดูรายการ →]
```

---

### 🔧 UX-4 หน้า Dashboard — ปุ่ม "หนี้ค้างชำระ" และ "รอรับเงิน"

**ปัจจุบัน:** คลิก card → ไปหน้า `/wallet/pending` หรือ `/wallet`
แต่ต้องหา sub-tab เองว่าอยู่ที่ไหน

**เสนอ:** เพิ่ม URL hash:
- `/wallet?tab=payment` → เปิด tab ค้างชำระทันที
- `/wallet?tab=income` → เปิด tab รอรับเงินทันที

(Transactions page ก็ใช้แนวเดียวกันสำหรับ pre-select tab)

---

### 🔧 UX-5 EditTransactionPopup — แสดง status ของ linked records

**ปัจจุบัน:** เมื่อเปิด edit popup ไม่รู้ว่า transaction นี้มีบิลค้างชำระหรือ taxInvoice ค้างอยู่ไหม

**เสนอ:** แสดง banner เล็กๆ ด้านล่าง header:

```
┌─────────────────────────────────────────┐
│ แก้ไขรายการรายจ่าย                       │
│ ⚠️ มีบิลค้างชำระที่เชื่อมอยู่ (ยังไม่ชำระ) │
└─────────────────────────────────────────┘
```

หรือถ้า taxInvoice:
```
│ 📋 มีใบกำกับภาษีที่รอรับอยู่              │
```

ทำให้ user เข้าใจ side effect ก่อนกดแก้ไข

---

## สรุปภาพรวม

### Sync Issues (ต้องแก้ — ข้อมูลผิด)

| Priority | Issue | ไฟล์หลัก | Effort |
|---|---|---|---|
| 🔴 สูง | taxStatus sync (แผนที่วางไว้แล้ว) | EditTransactionPopup | S |
| 🔴 สูง | method sync (pending ↔ non-pending) | EditTransactionPopup + usePendingStore | S |
| 🔴 สูง | delete transaction → orphan records | useTransactionStore หรือ TransactionHistoryPanel | S |
| 🟡 กลาง | pay pending → transaction method ไม่อัปเดต | PendingTracker | XS |

### UX Improvements (เพิ่มความสะดวก)

| Priority | UX | ไฟล์หลัก | Effort |
|---|---|---|---|
| 🟡 กลาง | UX-1 ปุ่มแก้ไขบนการ์ด pending | PendingTracker | S |
| 🟡 กลาง | UX-2 dueDate ของ taxInvoice | ExpenseForm + EditPopup | S |
| 🟢 ต่ำ | UX-3 Toast หลัง save | ExpenseForm | XS |
| 🟢 ต่ำ | UX-4 URL tab deep link | WalletPage + Dashboard | XS |
| 🟢 ต่ำ | UX-5 Banner linked records ใน Edit popup | EditTransactionPopup | XS |

---

## แนะนำ: ทำร่วมกันในรอบเดียว

Issues 1-3 (Sync) + UX-1 และ UX-2 ควรทำพร้อมกัน เพราะแก้ไฟล์เดียวกัน:
- `EditTransactionPopup.jsx` — taxStatus + method sync + banner
- `usePendingStore.js` — deletePendingByTxId + deleteTaxInvoiceByTxId
- `PendingTracker.jsx` — pay sync + edit button
- `ExpenseForm.jsx` — taxDueDate field
