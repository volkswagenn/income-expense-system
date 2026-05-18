# ออกแบบฟีเจอร์ รายการประจำ (Recurring Expenses)

> สถานะ: Draft — ยังไม่ได้แก้โค้ด  
> วันที่ออกแบบ: 2026-05-16  
> อัปเดต: ไม่ระบุวิธีชำระตอนสร้างรายการ — ระบุเมื่อกดจ่ายจริง

---

## 1. ภาพรวมฟีเจอร์

ระบบจัดการรายจ่ายที่เกิดขึ้นซ้ำทุกเดือน แบ่งเป็น 2 รูปแบบ:

| รูปแบบ | คำอธิบาย | ตัวอย่าง |
|--------|----------|----------|
| **Fixed** | ยอดคงที่ทุกรอบ | ค่า internet 799 บาท/เดือน |
| **Variable** | รายการเดิม แต่ยอดเปลี่ยนทุกรอบ | ค่าไฟ, ค่าน้ำ |

---

## 2. Data Model (2 collection ใหม่)

### 2.1 `RecurringItem` — template/กฎของรายการ

```typescript
{
  id: string             // uuid
  name: string           // ชื่อรายการ เช่น "ค่า internet"
  category: string       // categoryId จาก useCategoryStore (type='expense')
  // ไม่มี method — ระบุวิธีชำระตอนจ่ายจริงเท่านั้น
  billingDay: number     // วันที่เรียกเก็บในเดือน (1–31)
  amountType: 'fixed' | 'variable'
  fixedAmount?: number   // ใช้เฉพาะ amountType='fixed'
  vendor?: string        // ชื่อผู้รับเงิน (optional)
  note?: string
  enabled: boolean       // เปิด/ปิดโดยไม่ต้องลบ
  createdAt: string      // ISO
  updatedAt: string      // ISO
}
```

### 2.2 `RecurringEntry` — บันทึกสถานะรายเดือน

```typescript
{
  id: string              // uuid
  recurringId: string     // FK → RecurringItem.id
  month: string           // 'YYYY-MM' เช่น '2026-05'
  dueDate: string         // 'YYYY-MM-DD' คำนวณจาก billingDay
  status: 'pending' | 'paid' | 'skipped'
  amount: number          // ยอดจริงที่จ่าย (fixed=ดึงจาก template, variable=user กรอกตอนจ่าย)
  paidAt?: string         // ISO เมื่อ status='paid'
  paidMethod?: 'cash' | 'transfer' | 'pending'  // ระบุตอนกดจ่ายจริง ไม่ใช่ตอนสร้าง
  transactionId?: string  // FK → useTransactionStore (สร้างเมื่อจ่าย)
  pendingPaymentId?: string // FK → usePendingStore.pendingPayments (กรณี paidMethod='pending')
  createdAt: string       // ISO
}
```

---

## 3. Store ใหม่: `useRecurringStore`

### State Shape
```javascript
{
  items: RecurringItem[],    // กฎรายการประจำ
  entries: RecurringEntry[], // บันทึกรายเดือน
}
```

### Actions หลัก
```javascript
// Items (กฎ)
addItem(data)               // สร้าง template ใหม่
updateItem(id, changes)     // แก้ไข template
toggleItem(id)              // เปิด/ปิด enabled
deleteItem(id)              // ลบ template + entries ที่ยังไม่จ่าย

// Entries (รายเดือน)
generateEntries(month)      // สร้าง RecurringEntry สำหรับเดือนนั้น (ถ้ายังไม่มี)
markPaid(entryId, amount, method) // จ่ายแล้ว → สร้าง Transaction + deductWallet
markSkipped(entryId)        // ข้ามเดือนนี้
undoPaid(entryId)           // ยกเลิกการจ่าย → ลบ Transaction + คืนเงิน wallet
getEntriesByMonth(month)    // ดึง entries ของเดือนนั้น
getEntriesByDate(date)      // ดึง entries ที่ครบกำหนดวันนั้น (สำหรับ calendar)
```

### Persistence
```javascript
persist(store, {
  name: `${activeShopId}_recurring_data`  // scoped ต่อ shop เหมือน store อื่น
})
```

---

## 4. Logic สำคัญ

### 4.1 `generateEntries(month: 'YYYY-MM')`
เรียกเมื่อ user เข้าหน้า RecurringPage หรือเปิดแอปครั้งแรกของเดือน

```
สำหรับแต่ละ RecurringItem ที่ enabled=true:
  ถ้ายังไม่มี RecurringEntry ของ (recurringId, month):
    คำนวณ dueDate = YYYY-MM-{billingDay} (clamp ถึงวันสุดท้ายของเดือน)
    สร้าง RecurringEntry { status='pending', amount=fixedAmount (ถ้า fixed) หรือ 0 (variable) }
```

### 4.2 `markPaid(entryId, amount, paidMethod)`
`paidMethod` มาจาก user เลือกตอนกดจ่ายจริงใน PayEntryPopup เสมอ — ไม่มีค่า default จาก template
```
1. willGoNegative(paidMethod, amount) → ถ้าใช่ → แจ้งเตือน confirm ก่อน
2. addTransaction({ type:'expense', date:today, amount, category, method:paidMethod, itemName, vendor, note })
3. ถ้า paidMethod='pending' → addPending({ transactionId, amount, dueDate, description })
4. ถ้า paidMethod!='pending' → deductWallet(paidMethod, amount, logData)
5. updateEntry(entryId, { status:'paid', transactionId, paidAt, paidMethod, amount })
6. addLog(buildLogEntry({ activityType:'RECURRING_PAID', ... }))
```

### 4.3 `undoPaid(entryId)`
```
1. ดึง transactionId และ paidMethod จาก entry (ใช้ paidMethod ที่บันทึกไว้ตอนจ่าย)
2. deleteTransaction(transactionId)
3. ถ้า pendingPaymentId → deletePending(pendingPaymentId)
4. ถ้า paidMethod!='pending' → addToWallet(paidMethod, amount) (คืนเงินตามช่องทางที่จ่ายจริง)
5. updateEntry(entryId, { status:'pending', transactionId:null, paidAt:null, paidMethod:null })
6. addLog(...)
```

### 4.4 billingDay Overflow
```javascript
// billingDay=31 แต่เดือนกุมภาพันธ์มี 28 วัน
function computeDueDate(year, month, billingDay) {
  const lastDay = getDaysInMonth(new Date(year, month - 1))
  const day = Math.min(billingDay, lastDay)
  return format(new Date(year, month - 1, day), 'yyyy-MM-dd')
}
```

---

## 5. UI / Pages

### 5.1 Entry Point — Tab ใหม่ใน Transactions Page

```
บันทึกรายรับ-รายจ่าย
├── 📥 บันทึกรายรับ
├── 📤 บันทึกรายจ่าย
├── 🔁 รายการประจำ        ← TAB ใหม่
└── 📋 ประวัติการทำรายการ
```

### 5.2 Layout ของ RecurringPage

```
┌─────────────────────────────────────────────────┐
│  🔁 รายการประจำ                    [+ เพิ่มรายการ] │
├─────────────────────────────────────────────────┤
│  ◀ เมษายน 2569   พ.ค. 2569   มิถุนายน 2569 ▶    │
├─────────────────────────────────────────────────┤
│  สรุปเดือนนี้                                     │
│  ✅ จ่ายแล้ว 3 รายการ   2,397 บาท                │
│  ⏳ รอจ่าย   2 รายการ   1,200 บาท                │
│  รวมทั้งหมด              3,597 บาท                │
├─────────────────────────────────────────────────┤
│  รายการ                                           │
│  ┌──────────────────────────────────────────┐   │
│  │ ✅  ค่า internet   799 บาท   ทุกวันที่ 5  │   │
│  │     หมวด: สาธารณูปโภค  จ่ายด้วย: โอนเงิน│   │ ← แสดง paidMethod เฉพาะหลังจ่ายแล้ว
│  ├──────────────────────────────────────────┤   │
│  │ ⏳  ค่าไฟ         —  บาท   ทุกวันที่ 20  │   │ ← variable: ยังไม่ได้กรอกยอด
│  │     หมวด: สาธารณูปโภค          [กรอกยอด]│   │
│  ├──────────────────────────────────────────┤   │
│  │ ⏳  ค่าน้ำ        350 บาท   ทุกวันที่ 20 │   │
│  │     หมวด: สาธารณูปโภค          [จ่ายแล้ว]│   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘

หมายเหตุ: ไม่แสดงวิธีชำระในการ์ด จนกว่าจะจ่ายจริง (ดึงจาก paidMethod ใน Entry)
```

### 5.3 Form สร้าง/แก้ไข RecurringItem (Modal/Panel)

```
ชื่อรายการ*        [ค่า internet              ]
หมวดหมู่*          [สาธารณูปโภค          ▼   ]  ← จาก useCategoryStore type='expense'
ประเภทยอด         ◉ คงที่  ○ เปลี่ยนแปลง
ยอดเงิน (บาท)*    [799                        ]  ← แสดงเฉพาะถ้าเลือก "คงที่"
เรียกเก็บทุกวันที่*[5                         ]  (1–31)
ผู้รับเงิน        [AIS                        ]  (optional)
หมายเหตุ          [                           ]
สถานะ             ☑ เปิดใช้งาน

⚠️ ไม่มีฟิลด์ "วิธีชำระ" — จะระบุตอนกดจ่ายจริงแต่ละเดือน
                                [ยกเลิก] [บันทึก]
```

### 5.4 Action เมื่อคลิก Entry — PayEntryPopup

Popup นี้รวม 2 step เป็น flow เดียวกัน:

**กรณี Fixed (มียอดจาก template แล้ว):**
```
popup → "บันทึกการจ่าย ค่า internet"
─────────────────────────────────────
ยอดเงิน:   799 บาท  (แสดงค่า, แก้ได้)
วิธีชำระ*: [เลือกวิธีชำระ       ▼]   ← บังคับเลือก ไม่มีค่า default
           ○ เงินสด
           ○ โอนเงิน
           ○ ค้างชำระ
─────────────────────────────────────
              [ยกเลิก]  [จ่ายแล้ว ✓]
```

**กรณี Variable (ยังไม่มียอด):**
```
popup → "บันทึกการจ่าย ค่าไฟ"
─────────────────────────────────────
ยอดเงิน*:  [          ] บาท   ← บังคับกรอก
วิธีชำระ*: [เลือกวิธีชำระ       ▼]   ← บังคับเลือก ไม่มีค่า default
           ○ เงินสด
           ○ โอนเงิน
           ○ ค้างชำระ
─────────────────────────────────────
              [ยกเลิก]  [จ่ายแล้ว ✓]
```

> ทั้ง 2 กรณีต้องเลือกวิธีชำระก่อนกด "จ่ายแล้ว" เสมอ — ปุ่มจะ disabled จนกว่าจะครบ

---

## 6. Dashboard Integration

### 6.1 Card ใหม่ใน FinancialStatus

```
┌─────────────────────────────┐
│ 🔁 รายจ่ายประจำเดือนนี้      │
│                              │
│  รวมทั้งหมด    3,597 บาท    │
│  จ่ายแล้ว   ✅ 2,397 บาท    │
│  รอจ่าย     ⏳ 1,200 บาท    │
│                              │
│  [ดูรายละเอียด →]           │
└─────────────────────────────┘
```

วางต่อจาก card ค้างชำระปัจจุบัน ลิงก์ไปหน้า `/transactions?tab=recurring`

### 6.2 Calendar Integration

**CalendarDayCell** — เพิ่ม prop ใหม่ `recurringItems[]`

```
วันที่ 5 พ.ค.
┌────────────────────┐
│  5                  │
│  🔁 ค่า internet    │  ← indicator สีม่วง (due/paid)
│  +500 รายรับ        │
│  -200 รายจ่าย       │
│  ● ● ●              │  dots เดิม
└────────────────────┘
```

- **สีม่วง (ringing)**: มี recurring ที่ยัง pending
- **สีเขียวอ่อน**: recurring ที่จ่ายแล้ว
- **สีส้ม**: เลยกำหนดแล้วยังไม่จ่าย (dueDate < today && status='pending')

**CalendarView** — เพิ่ม map `recurringByDate`:
```javascript
const recurringByDate = useMemo(() => {
  const map = {}
  entries.forEach(entry => {
    if (!map[entry.dueDate]) map[entry.dueDate] = []
    map[entry.dueDate].push(entry)
  })
  return map
}, [entries])
```

---

## 7. จุดที่ต้อง Sync กับระบบเดิม

### 7.1 useCategoryStore
| จุด Sync | รายละเอียด | ความเสี่ยง |
|---------|-----------|-----------|
| ดึง category | RecurringItem.category → `getCategoryName(id)` | หาก category ถูก soft-delete, id ยังอยู่แต่ชื่อหาย → แสดงผล fallback "หมวดหมู่ที่ถูกลบ" |
| สร้าง Transaction | ต้องส่ง categoryId ที่ถูกต้องไปยัง addTransaction | ถ้า category ถูกลบก่อนที่จะ markPaid → Transaction จะมี category ที่ไม่มีในรายการ |
| Filter | หน้า RecurringPage ต้องกรอง category type='expense' เท่านั้น | ป้องกัน user เลือก category type='income' มาใส่รายจ่ายประจำ |

**แนวทาง:** ตรวจสอบ `category.deleted` ตอนแสดงผล; ถ้าลบแล้วให้แสดง badge "หมวดหมู่ถูกลบ" สีแดงบน RecurringItem

### 7.2 useTransactionStore
| จุด Sync | รายละเอียด | ความเสี่ยง |
|---------|-----------|-----------|
| สร้าง Transaction | `markPaid` → `addTransaction(...)` | ต้องบันทึก `transactionId` กลับใน RecurringEntry ทันที เพื่อ `undoPaid` ใช้ |
| ลบ Transaction | `undoPaid` → `deleteTransaction(transactionId)` | ถ้า user ลบ Transaction จากหน้า History โดยตรง → Entry ยังแสดง `status='paid'` แต่ Transaction ไม่มีแล้ว |
| ซ้ำซ้อน | User อาจบันทึกรายจ่ายเดียวกันทั้งจาก ExpenseForm และ markPaid | ไม่มีระบบตรวจจับอัตโนมัติ ต้องให้ user รับผิดชอบ |

**แนวทาง:** เพิ่ม field `recurringEntryId` ใน Transaction object เพื่อตรวจสอบย้อนกลับ; ถ้า Transaction ถูกลบ → ใช้ Zustand subscribe หรือ check ตอน render entry

### 7.3 usePendingStore
| จุด Sync | รายละเอียด | ความเสี่ยง |
|---------|-----------|-----------|
| method='pending' | `markPaid` → `addPending(...)` → บันทึก `pendingPaymentId` ใน Entry | ต้อง sync สถานะ: ถ้า user ไปจ่าย pending จากหน้า Wallet โดยตรง → Entry ยังเป็น 'pending' |
| ลบ Pending | `undoPaid` → `deletePending(pendingPaymentId)` | ถ้า user ลบ Pending จากหน้า Wallet โดยตรง → Entry ยัง reference pendingPaymentId ที่ไม่มีแล้ว |

**แนวทาง:** เพิ่ม field `recurringEntryId` ใน PendingPayment เพื่อ traceback; เพิ่ม function `syncRecurringFromPending(pendingId, status)` ใน useRecurringStore

### 7.4 useWalletStore
| จุด Sync | รายละเอียด | ความเสี่ยง |
|---------|-----------|-----------|
| หักเงิน | ใช้ `deductWallet(paidMethod, amount)` จาก walletEngine.js | ต้องเรียก `willGoNegative()` ก่อนเสมอ — `paidMethod` มาจาก user เลือกใน PayEntryPopup เสมอ |
| คืนเงิน | `undoPaid` → `addToWallet(paidMethod, amount)` | ต้องอ่าน `paidMethod` จาก Entry ที่บันทึกไว้ตอนจ่าย — ไม่มี method บน template อีกต่อไป ดังนั้น paidMethod ต้องถูก persist ใน Entry อย่างแม่นยำ |

### 7.5 useLogStore
รายการ `activityType` ใหม่ที่ต้องเพิ่มใน `ACTIVITY_LABELS` (logBuilder.js):
```javascript
RECURRING_CREATE:   'สร้างรายการประจำ'
RECURRING_UPDATE:   'แก้ไขรายการประจำ'
RECURRING_DELETE:   'ลบรายการประจำ'
RECURRING_PAID:     'จ่ายรายการประจำ'
RECURRING_UNPAID:   'ยกเลิกการจ่ายรายการประจำ'
RECURRING_SKIPPED:  'ข้ามรายการประจำ'
RECURRING_GENERATE: 'สร้างรายการประจำรายเดือน'
```

### 7.6 CalendarView / CalendarDayCell
| จุด Sync | รายละเอียด | ความเสี่ยง |
|---------|-----------|-----------|
| เพิ่ม data source | CalendarView ต้องอ่าน useRecurringStore.entries | เพิ่ม re-render source อีก 1 store → ระวัง performance บน 42 cells |
| Props explosion | CalendarDayCell มี 5 props แล้ว (date, transactions, pending, tax, note) จะเพิ่มเป็น 6 | พิจารณา merge เป็น single `events[]` object แทน |
| billingDay vs month view | ถ้า user ดู calendar เดือนต่างกัน entries ต้องมีอยู่ก่อน (generateEntries ต้องถูกเรียก) | ถ้า navigate ไปเดือนหน้าโดยไม่เคย generate → ไม่มี entries แสดง |

**แนวทาง:** เรียก `generateEntries` อัตโนมัติเมื่อ CalendarView เปลี่ยนเดือน

---

## 8. ความเสี่ยงและจุดที่อาจผิดพลาด

### 🔴 ความเสี่ยงสูง

#### R1 — Transaction ถูกลบจากภายนอก (History page)
**สถานการณ์:** User ลบ Transaction จากหน้า History → RecurringEntry ยังแสดง status='paid' แต่ข้อมูลไม่ตรงกัน  
**ผลกระทบ:** เงินใน wallet ถูกหักแล้ว แต่ RecurringEntry ไม่รู้  
**วิธีแก้ไข:** ใน `deleteTransaction` ของ useTransactionStore เพิ่ม logic ตรวจสอบ recurringEntries ที่ reference transactionId นั้นและ reset status='pending'  
**ทางเลือก:** เพิ่ม warning เมื่อลบ transaction ที่มี field `recurringEntryId`

#### R2 — Double Payment
**สถานการณ์:** User กด markPaid บน RecurringEntry และยังบันทึกรายจ่ายเดียวกันใน ExpenseForm ด้วย  
**ผลกระทบ:** เงินถูกหัก 2 รอบ, รายจ่ายซ้ำใน report  
**วิธีแก้ไข:** ไม่มีวิธีป้องกันอัตโนมัติ 100% → เพิ่ม UI hint บน ExpenseForm ว่า "มีรายการประจำ [ค่าไฟ] ที่ยังรอจ่ายในเดือนนี้" เพื่อเตือน user

#### R3 — generateEntries timing
**สถานการณ์:** ถ้าเรียก generateEntries ช้าไป หรือเรียกซ้ำหลายครั้ง → อาจสร้าง Entry ซ้ำ  
**ผลกระทบ:** Entry ซ้ำกัน → แสดงผลผิด, คำนวณยอดซ้ำ  
**วิธีแก้ไข:** ใช้ composite key check `(recurringId, month)` ก่อนสร้าง Entry ทุกครั้ง → idempotent operation

### 🟡 ความเสี่ยงปานกลาง

#### R4 — billingDay Overflow ในเดือนสั้น
**สถานการณ์:** billingDay=31, เดือนกุมภาพันธ์ปีปกติมี 28 วัน  
**ผลกระทบ:** วันครบกำหนดคำนวณผิด  
**วิธีแก้ไข:** `Math.min(billingDay, getDaysInMonth(month))` ทุกครั้งที่ compute dueDate

#### R5 — Category Soft Delete
**สถานการณ์:** Category ถูก soft-delete หลังจากสร้าง RecurringItem แล้ว  
**ผลกระทบ:** แสดง categoryId แทนชื่อ, Transaction ที่สร้างจะมี deleted category  
**วิธีแก้ไข:** Fallback text "หมวดหมู่ถูกลบ" + badge แจ้งเตือนบน RecurringItem ว่าควรแก้ไข

#### R6 — PendingPayment ถูกจ่ายจากหน้า Wallet โดยตรง
**สถานการณ์:** user เลือก paidMethod='pending' ตอนกดจ่าย → สร้าง PendingPayment → ภายหลัง user ไปกด "จ่ายแล้ว" จากหน้า Wallet โดยตรง  
**ผลกระทบ:** usePendingStore.status='paid' แต่ RecurringEntry.status ยังเป็น 'pending' แม้ว่าเงินจ่ายไปแล้ว  
**วิธีแก้ไข:** เพิ่ม `recurringEntryId` field ใน PendingPayment → เมื่อ `payPending()` ถูกเรียก → sync RecurringEntry ด้วย  
**หมายเหตุ:** ความเสี่ยงนี้ยังคงอยู่แม้จะไม่มี method บน template แล้ว เพราะ paidMethod='pending' ถูกเลือกตอนจ่าย

#### R7 — Performance ของ Calendar
**สถานการณ์:** Recurring entries เพิ่มขึ้นเรื่อยๆ ทุกเดือน → CalendarView ต้อง process ข้อมูลมากขึ้น  
**ผลกระทบ:** render ช้าลงบน device ประสิทธิภาพต่ำ  
**วิธีแก้ไข:** filter entries ให้เหลือเฉพาะเดือนที่แสดงก่อน useMemo; พิจารณา index by date

### 🟢 ความเสี่ยงต่ำ

#### R8 — Shop Switch
**สถานการณ์:** User switch ร้านค้า → recurring ของร้านเก่าโหลดมาผสมกัน  
**ผลกระทบ:** ข้อมูลปน  
**วิธีแก้ไข:** persist key ใช้ `${activeShopId}_recurring_data` เหมือน store อื่น ✓

#### R9 — Import/Backup ไม่ครอบคลุม
**สถานการณ์:** ระบบ backup/import ปัจจุบันอาจไม่รวม recurring store  
**ผลกระทบ:** restore ข้อมูลแล้วหาย recurring items  
**วิธีแก้ไข:** ต้องเพิ่ม recurring store เข้าในกระบวนการ backup/restore (BackupFull.jsx, importProcessor.js)

---

## 9. Files ที่ต้องสร้างใหม่

```
src/
├── store/
│   └── useRecurringStore.js          ← Store หลัก
├── pages/
│   └── Recurring/
│       ├── index.jsx                 ← RecurringPage (tab content)
│       ├── RecurringItemForm.jsx     ← Modal สร้าง/แก้ไข template
│       ├── RecurringEntryCard.jsx    ← Card รายการแต่ละรายการ
│       └── PayEntryPopup.jsx         ← Popup กรอกยอด + ยืนยันจ่าย
```

---

## 10. Files ที่ต้องแก้ไข

| File | การเปลี่ยนแปลง |
|------|--------------|
| `src/pages/Transactions/index.jsx` | เพิ่ม tab "🔁 รายการประจำ" + import RecurringPage |
| `src/pages/Dashboard/CalendarView.jsx` | เพิ่ม useRecurringStore, สร้าง `recurringByDate` map, ส่ง prop ใหม่ |
| `src/pages/Dashboard/CalendarDayCell.jsx` | รับ prop `recurringEntries[]`, render recurring indicators |
| `src/pages/Dashboard/FinancialStatus.jsx` | เพิ่ม recurring summary card |
| `src/lib/logBuilder.js` | เพิ่ม ACTIVITY_LABELS 7 รายการใหม่ |
| `src/pages/Backup/BackupFull.jsx` | เพิ่ม recurring store ใน backup payload |
| `src/lib/importProcessor.js` | handle recurring data ใน restore flow |
| `src/store/usePendingStore.js` | เพิ่ม `recurringEntryId` field ใน PendingPayment, เพิ่ม sync function |
| `src/store/useTransactionStore.js` | เพิ่ม `recurringEntryId` field ใน Transaction (optional แต่แนะนำ) |
| `src/router.jsx` | ไม่ต้องเพิ่ม route (เป็น tab ภายใน /transactions) |

---

## 11. ลำดับการพัฒนาที่แนะนำ

```
Phase 1 — Core Store
  [1] สร้าง useRecurringStore (items + entries, generateEntries, markPaid, undoPaid)
  [2] เพิ่ม activityType ใหม่ใน logBuilder.js

Phase 2 — UI หลัก
  [3] สร้าง RecurringItemForm (modal สร้าง/แก้)
  [4] สร้าง RecurringEntryCard + PayEntryPopup
  [5] สร้าง RecurringPage (list + summary)
  [6] เพิ่ม tab ใน TransactionsPage

Phase 3 — Dashboard Integration
  [7] เพิ่ม recurring card ใน FinancialStatus
  [8] เพิ่ม recurring indicators ใน CalendarDayCell + CalendarView

Phase 4 — Sync & Safety
  [9] เพิ่ม recurringEntryId ใน Transaction + PendingPayment
  [10] เพิ่ม sync logic เมื่อ deleteTransaction / payPending ถูกเรียก
  [11] เพิ่ม warning บน ExpenseForm เมื่อมี recurring pending
  [12] เพิ่มใน Backup/Restore flow
```

---

## 12. สิ่งที่ยังไม่ออกแบบ (Scope ต่อไป)

- **Notification/Reminder** — แจ้งเตือนล่วงหน้า N วัน (useAppStore มี `notifyDaysBefore` แล้ว รอเชื่อม)
- **ความถี่อื่นนอกจาก Monthly** — weekly, quarterly, yearly
- **Auto-pay** — จ่ายอัตโนมัติเมื่อถึงวันครบกำหนด (ต้องการ background job หรือ app open trigger)
- **รายรับประจำ** — รูปแบบเดียวกันแต่เป็น income (เงินเดือน, ค่าเช่า)
- **History ของ RecurringItem** — ดูยอดย้อนหลังหลายเดือนเป็น trend chart
