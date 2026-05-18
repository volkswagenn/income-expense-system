# Design: รายการรอรับเงิน & แก้ไขรายรับอื่นๆ (v2)

---

## ส่วนที่ 1 — แก้ไขรายรับอื่นๆ (ทำทันที)

### ปัญหาปัจจุบัน
`IncomeForm.jsx:78` — สร้าง transaction method='other' แต่เรียกแค่ `addLog()` ไม่มี `addToWallet()`
→ ยอดเงินในกระเป๋าไม่เปลี่ยน ทั้งที่ผู้ใช้ระบุว่าได้รับเงินแล้ว

### UI ใหม่ของ section รายรับอื่นๆ

```
[จำนวนเงิน (บาท)]  [ประเภทรายรับ (required เมื่อมีจำนวน)]

เข้ากระเป๋า:
  ○ เงินสด   ○ เงินโอน   ○ รอรับเงิน
```

**Logic:**
- `otherMethod = 'cash'` → addTransaction(method:'cash', otherIncomeType) + addToWallet('cash') + log ADD_OTHER_INCOME
- `otherMethod = 'transfer'` → addTransaction(method:'transfer', otherIncomeType) + addToWallet('transfer') + log ADD_OTHER_INCOME
- `otherMethod = 'pending'` → ไม่สร้าง transaction ตอนนี้, สร้าง pendingIncome แทน + log OPEN_BILL_INCOME

**Transaction ที่ได้:**
```js
{ type: 'income', method: 'cash' | 'transfer', amount, otherIncomeType: 'บัตรเครดิต', itemName: 'บัตรเครดิต', note }
```

**ตัวระบุ "other income" ในระบบ:**
- `!!t.otherIncomeType` = true → เป็น other income (ใหม่, มี wallet)
- `t.method === 'other'` → เป็น other income เก่า (ไม่มี wallet)

**Validation:**
- ถ้ากรอก `otherAmount` ต้องกรอก `otherType` และเลือก `otherMethod`

---

## ส่วนที่ 2 — รายงาน & ไฟล์แม่แบบ (ทำทันที)

### 2.1 ReportTable.jsx — income_by_type

เพิ่ม column "อื่นๆ" (แสดง other income แยกจาก เงินสด/เงินโอน)

| วันที่ | ยอดรวม | เงินสด | เงินโอน | **อื่นๆ** |
|--------|--------|--------|--------|-------|
| 1 พ.ค. | 5,000 | 3,000 | 1,500 | 500 |

Logic ระบุ other income:
```js
const isOther = (t) => !!t.otherIncomeType || t.method === 'other'
cash  = !isOther && method==='cash'
transfer = !isOther && method==='transfer'
other = isOther
```

### 2.2 exportDailyIncome (Excel + CSV)

คอลัมน์: วันที่ | เงินสด | เงินโอน | รายรับอื่นๆ | รวม | หมายเหตุ

ใช้ logic `isOther` เดียวกัน — อย่า count other income เข้า เงินสด/เงินโอน

### 2.3 exportIncomeByType (Excel + CSV)

คอลัมน์: วันที่ | ประเภท | จำนวนเงิน | หมายเหตุ

ค่า "ประเภท" หลังแก้:
- regular cash → `"เงินสด"`
- regular transfer → `"เงินโอน"`
- other income เข้ากระเป๋าสด → `"บัตรเครดิต (เงินสด)"`
- other income เข้ากระเป๋าโอน → `"ดอกเบี้ย (เงินโอน)"`
- other income เก่า (method='other') → `"บัตรเครดิต (อื่นๆ)"`

### 2.4 ImportFormByType — ไฟล์แม่แบบ

เพิ่ม column "อื่นๆ (บาท)" ให้ตรงกับ report:

HEADERS ใหม่: `['วันที่', 'เงินสด (บาท)', 'เงินโอน (บาท)', 'อื่นๆ (บาท)', 'หมายเหตุ']`

ตาราง: เพิ่ม input field "อื่นๆ"
execute: ถ้า other > 0 → สร้าง transaction method='other' + log ADD_OTHER_INCOME (ยังไม่เข้า wallet ขอ manual review)

---

## ส่วนที่ 3 — รายการรอรับเงิน (Pending Income) — ออกแบบพร้อม implement ถัดไป

### 3.1 Flow ภาพรวม

```
[IncomeForm]
ผู้ใช้กรอกเงิน (สด + โอน + อื่นๆ ตามใจ)
    ↓ กด "รอรับเงิน" (checkbox)
Popup: "เลือกวันที่บันทึกยอดเงิน"
  ┌─────────────────────────────────────────┐
  │  📅 บันทึกวันที่เปิดบิล               │
  │     (date = วันที่บนฟอร์ม)             │
  │                                         │
  │  📬 บันทึกวันที่ได้รับเงิน             │
  │     (date = วันที่กดปุ่มรับเงิน)       │
  └─────────────────────────────────────────┘
    ↓ ยืนยัน
addPendingIncome({
  date: form.date,          // วันที่บนบิล
  amount: cashAmt + transferAmt + otherAmt,  // รวมทุกประเภทเป็นยอดเดียว
  description: `เปิดบิลรอรับเงิน ${date}`,
  note: form.note,
  source: 'main' | 'other',
  recordDateMode: 'bill' | 'receive',  // ตัวเลือกจาก popup
})
addLog(OPEN_BILL_INCOME)
→ form reset, เงินไม่เข้ากระเป๋า
```

### 3.2 การ์ดรายการรอรับเงิน

แสดงที่:
- PendingTracker Tab "รอรับเงิน" (ด้านล่าง transaction page)
- PendingIncomeSummary (หน้า กระเป๋าเงินหลัก)

หน้าตาการ์ด:
```
┌─────────────────────────────────────────────┐
│  เปิดบิลรอรับเงิน 25 พ.ค. 2569              │ ← description
│  สร้างเมื่อ: 25 พ.ค. 2569 09:30             │ ← createdAt
│  หมายเหตุ: ค่าอาหารสัตว์เลี้ยง             │ ← note (ถ้ามี)
│                                             │
│  ████████ 1,500 บาท                         │ ← amount (เขียว)
│                                             │
│  [💵 รับเงินสด] [🏦 รับเงินโอน]  [ลบ]     │
└─────────────────────────────────────────────┘
```

### 3.3 Flow การรับเงิน

```
กดปุ่ม "รับเงินสด" หรือ "รับเงินโอน"
    ↓
ConfirmPopup: "ยืนยันรับเงิน 1,500 บาท (เงินสด)?"
    ↓ ยืนยัน
txDate = (recordDateMode === 'bill') ? pendingIncome.date : today
addTransaction({ date: txDate, type:'income', method: 'cash'|'transfer', amount })
addToWallet(method, amount, { activityType: 'RECEIVE_INCOME' })
receivePendingIncome(id, method)  → status='received', receivedAt, receivedMethod
addLog(RECEIVE_INCOME, description: `รับเงิน ${amount} บาท (${method}) จากบิล ${pendingIncome.date}`)
```

### 3.4 Data Model (usePendingStore เพิ่ม)

```js
pendingIncomes: [{
  id: uuid,
  status: 'pending' | 'received',
  createdAt: ISO,
  receivedAt: null | ISO,
  receivedMethod: null | 'cash' | 'transfer',
  date: 'yyyy-MM-dd',          // วันที่เปิดบิล
  amount: number,
  description: string,
  note: string,
  source: 'main' | 'other',
  otherIncomeType: string,     // เฉพาะ source='other'
  recordDateMode: 'bill' | 'receive',
  transactionId: null | uuid,  // link หลังรับเงิน
}]

Actions:
  addPendingIncome(data) → item
  receivePendingIncome(id, method) → { receivedAt, receivedMethod }
  deletePendingIncome(id)
  getPendingIncomeUnpaid() → filter status='pending'
  getPendingIncomeTotal()  → sum
```

---

## ส่วนที่ 4 — Log Actions ทั้งหมด

| activityType | เมื่อไหร่ | ตัวอย่าง description |
|---|---|---|
| `ADD_INCOME_MAIN` | บันทึกเงินสด/โอนปกติ | "รับเงินสด 3,000 บาท" |
| `ADD_OTHER_INCOME` | บันทึกรายรับอื่นๆ เข้ากระเป๋า | "บัตรเครดิต 500 บาท → กระเป๋าเงินสด" |
| `OPEN_BILL_INCOME` | สร้างรายการรอรับเงิน | "เปิดบิลรอรับเงิน 1,500 บาท (25 พ.ค. 2569)" |
| `RECEIVE_INCOME` | กดรับเงินจาก pending | "รับเงิน 1,500 บาท (เงินโอน) จากบิล 25/5/69" |

---

## ลำดับการ Implement

### Phase 1 — เสร็จแล้ว ✅
- [x] logBuilder.js: เพิ่ม 3 activity labels
- [x] ReportTable.jsx: เพิ่ม column อื่นๆ ใน income_by_type
- [x] excelExporter.js: fix isOther + method in parentheses
- [x] csvExporter.js: เดียวกัน
- [x] ImportFormByType.jsx: เพิ่ม column อื่นๆ
- [x] index.css: เพิ่ม badge-green

### Phase 2 — เสร็จแล้ว ✅
- [x] usePendingStore.js: เพิ่ม pendingIncomes[] + 4 actions
- [x] IncomeForm.jsx: checkbox รอรับเงิน + popup เลือกวันที่ + wallet selector รายรับอื่นๆ
- [x] PendingTracker.jsx: เพิ่ม Tab "รอรับเงิน" + PendingIncomeItem component
- [x] PendingIncomeSummary.jsx: สร้างใหม่ (summary card สำหรับ Wallet page)
- [x] Wallet/index.jsx: เพิ่ม section "รอรับเงิน"

---

## สิ่งที่ไม่ต้องแก้
- `useTransactionStore.js` — transaction สร้างตอนรับเงินเท่านั้น
- `walletEngine.js` — ใช้ addToWallet ที่มีอยู่
- `ExpenseForm.jsx` — ไม่เกี่ยว
- `ImportFormDaily.jsx` / `ImportFormSummary.jsx` — ไม่มี other income ใน template เหล่านี้
