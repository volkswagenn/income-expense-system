# แผนพัฒนา App บันทึกรายรับ-รายจ่าย

> สถานะ: วางแผน | วันที่: 2026-05-02 | Version เป้าหมาย: 0.0.1 | Revision: 2

---

## 1. Tech Stack

| ส่วน | เทคโนโลยี | เหตุผล |
|---|---|---|
| Framework | React 18 + Vite | HMR เร็ว, ecosystem ใหญ่ |
| Styling | Tailwind CSS v3 | ไม่มี class conflict, ปรับ UI เร็ว |
| State Management | Zustand | เบา, share ข้ามไฟล์ง่าย, persist middleware |
| Routing | React Router v6 | nested route, layout pattern |
| Charts | Recharts | React-native, รองรับ SVG export |
| Excel | xlsx (SheetJS CE) | client-side, ฟรี |
| Chart Export | html2canvas + SVG fallback | แปลง DOM → PNG |
| Data | localStorage + JSON | ไม่ต้อง backend, อ่าน/เขียนง่าย |
| Config | SettingApp.txt ใน /public | fetch() ได้ โดยไม่ต้องแก้ build |

---

## 2. โครงสร้างไฟล์ (File Structure)

```
/public
└── SettingApp.txt                ← config file (fetch ตอน startup)

/src
├── main.jsx                      ← entry point: อ่าน SettingApp.txt → init stores
├── App.jsx                       ← layout: Navbar + Sidebar + <Outlet />
├── router.jsx                    ← กำหนด routes ทั้งหมด

│
├── store/                        ← Zustand stores (แยกตาม domain)
│   ├── useAppStore.js            ← shopName, version, theme
│   ├── useWalletStore.js         ← cash, transfer, subWallets, loans
│   ├── useTransactionStore.js    ← income, expense records
│   ├── usePendingStore.js        ← ค้างชำระ, ใบกำกับภาษีรอ
│   ├── useCategoryStore.js       ← หมวดหมู่, ผู้ขาย, รายการจ่ายบ่อย
│   └── useLogStore.js            ← activity log ทุก action
│
├── lib/                          ← pure functions (ไม่มี side effect)
│   ├── walletEngine.js           ← deductWallet(), addWallet(), transferWallet()
│   ├── logBuilder.js             ← buildLogEntry() สร้าง log object มาตรฐาน
│   ├── settingParser.js          ← parse SettingApp.txt → object
│   ├── excelExporter.js          ← ทุก export-to-excel function
│   ├── chartExporter.js          ← export chart เป็น PNG/SVG
│   └── importProcessor.js        ← validate + process import files
│
├── components/                   ← shared UI components
│   ├── layout/
│   │   ├── Navbar.jsx            ← ชื่อร้าน (แก้ไขได้) + version
│   │   └── Sidebar.jsx           ← เมนู + badge แจ้งเตือน
│   └── shared/
│       ├── ConfirmPopup.jsx      ← popup ยืนยัน (ยอดติดลบ, ลบข้อมูล)
│       ├── TooltipBreakdown.jsx  ← hover แสดงรายละเอียด breakdown
│       ├── DateNavigator.jsx     ← วันที่ + ลูกศร +1/-1
│       ├── EditableDropdown.jsx  ← dropdown สร้าง/แก้ไข/ลบ items ได้
│       ├── StatusBadge.jsx       ← badge: ค้างชำระ, รอใบกำกับ
│       ├── AmountDisplay.jsx     ← แสดงยอดเงิน (รองรับติดลบ + สีแดง)
│       └── SectionCard.jsx       ← wrapper card มาตรฐาน
│
└── pages/                        ← หน้าหลักแต่ละ section
    │
    ├── Dashboard/
    │   ├── index.jsx             ← orchestrator หน้า Dashboard
    │   ├── FilterBar.jsx         ← วันนี้ / เดือนนี้ / กำหนดเอง
    │   ├── IncomeExpenseScroll.jsx ← container 15 วัน เลื่อนได้ + tooltip
    │   ├── FinancialStatus.jsx   ← card ยอดคงเหลือ, หนี้
    │   ├── ChartFiltered.jsx     ← bar chart ตาม filter
    │   └── TrendChart6M.jsx      ← line chart แนวโน้ม 6 เดือน
    │
    ├── Wallet/
    │   ├── index.jsx             ← orchestrator หน้ากระเป๋าเงิน
    │   ├── MainWalletCard.jsx    ← ยอดรวม + เงินสด + เงินโอน + ปุ่มย้าย
    │   ├── PendingPaymentSummary.jsx ← ยอดค้างชำระ → link หน้ารายละเอียด
    │   ├── LoanSummary.jsx       ← ยอดยืมจาก sub-wallet ทั้งหมด
    │   ├── SubWalletList.jsx     ← list กระเป๋าตังค์ทั้งหมด + ปุ่มสร้าง
    │   └── SubWalletCard.jsx     ← card แต่ละกระเป๋า (ฝาก/ถอน/โอน/ยืม)
    │
    ├── Transactions/
    │   ├── index.jsx             ← Tab: รายรับ / รายจ่าย / ประวัติ
    │   ├── IncomeForm.jsx        ← ฟอร์มบันทึกรายรับ
    │   ├── ExpenseForm.jsx       ← ฟอร์มบันทึกรายจ่าย
    │   ├── TransactionLog.jsx    ← ประวัติทุก action (แก้ไข/ลบได้)
    │   └── PendingTracker.jsx    ← ติดตามค้างชำระ + ใบกำกับภาษีรอ
    │
    ├── Reports/
    │   ├── index.jsx             ← orchestrator หน้ารายงาน
    │   ├── ReportSelector.jsx    ← เลือกประเภทรายงาน + ช่วงวันที่
    │   ├── ReportTable.jsx       ← ตารางรายงาน (render ตามประเภท)
    │   ├── ReportChart.jsx       ← กราฟรายงาน (เลือกได้)
    │   └── ExportBar.jsx         ← ปุ่ม export Excel + export รูป
    │
    ├── Import/
    │   ├── index.jsx             ← orchestrator หน้านำเข้าข้อมูล
    │   ├── DateRangePicker.jsx   ← เลือกช่วงเวลา → สร้างแบบฟอร์ม
    │   ├── ImportFormSelector.jsx ← เลือกแบบฟอร์ม 3 แบบ
    │   ├── ImportFormDaily.jsx   ← แบบฟอร์มรายรับรวมตามรายวัน
    │   ├── ImportFormByType.jsx  ← แบบฟอร์มรายรับแยกประเภท
    │   └── ImportFormSummary.jsx ← แบบฟอร์มรายรับ-รายจ่ายรวม
    │
    └── Backup/
        ├── index.jsx             ← orchestrator หน้าสำรองข้อมูล
        ├── BackupFull.jsx        ← backup ทั้งหมด (JSON)
        ├── BackupSettings.jsx    ← backup เฉพาะ settings
        └── LogDownloader.jsx     ← download ไฟล์ log
```

---

## 3. Data Schema (localStorage)

### 3.1 SettingApp.txt (plain text ใน /public)
```
File Version = 0.0.1
Name Shop = ZuZoo Pet Shop
```

### 3.2 localStorage Keys

```js
// app_settings
{
  version: "0.0.1",
  shopName: "ZuZoo Pet Shop",
  shopNameOverride: null       // ถ้าผู้ใช้เปลี่ยนชื่อใน UI จะเก็บที่นี่
}

// wallet_main
{
  cash: 0,
  transfer: 0
  // total คำนวณ on-the-fly: cash + transfer (ไม่เก็บแยก)
}

// wallet_sub  → Array
[{
  id: "uuid",
  name: "ชื่อกระเป๋า",
  balance: 0,
  createdAt: "ISO8601"
}]

// transactions → Array
[{
  id: "uuid",
  date: "YYYY-MM-DD",
  type: "income" | "expense",
  amount: 0,
  method: "cash" | "transfer" | "pending" | "other",
  category: "category_id" | null,
  itemName: "string",          // ชื่อรายการจ่าย
  vendor: "string",            // ผู้ขาย/ร้านค้า
  receiptNo: "string",
  taxStatus: "none" | "received" | "waiting",
  dueDate: "YYYY-MM-DD" | null, // วันที่กำหนดชำระ (pending)
  paidAt: "ISO8601" | null,     // วันที่ชำระจริง
  note: "string",
  otherIncomeType: "string"    // สำหรับ income ประเภทอื่นๆ
}]

// activity_log → Array  (ดู section 6 สำหรับ schema เต็ม)
[{ ... }]

// pending_payments → Array
[{
  id: "uuid",
  transactionId: "ref",
  amount: 0,
  dueDate: "YYYY-MM-DD",
  status: "pending" | "paid",
  paidAt: "ISO8601" | null,
  paidMethod: "cash" | "transfer" | null
}]

// tax_invoices → Array
[{
  id: "uuid",
  transactionId: "ref",
  status: "waiting" | "received",
  receivedAt: "ISO8601" | null
}]

// categories → Array
[{
  id: "uuid",
  name: "string",
  type: "income" | "expense",
  deleted: false              // soft delete
}]

// vendors → Array
[{ id, name, deleted: false }]

// quick_items → Array (รายการจ่ายบ่อย)
[{ id, name, category: "category_id", deleted: false }]

// loans_from_sub → Array
[{
  id: "uuid",
  subWalletId: "ref",
  amount: 0,
  method: "cash" | "transfer",
  borrowedAt: "ISO8601",
  returned: false,
  returnedAt: "ISO8601" | null
}]
```

---

## 4. Activity Log Schema (รายละเอียด)

```js
// activity_log entry
{
  id: "uuid",
  timestamp: "ISO8601",            // วันที่และเวลาเกิดเหตุการณ์
  activityType: "ADD_INCOME"       // ดู enum ด้านล่าง
    | "ADD_EXPENSE"
    | "EDIT_INCOME"
    | "EDIT_EXPENSE"
    | "DELETE_TRANSACTION"
    | "PAY_PENDING"                // ชำระค้างชำระ (log สร้างตอนกดจ่าย ไม่สร้างตอนสร้างบิล)
    | "CASH_DEPOSIT"               // ฝากเงินสด
    | "TRANSFER_TO_WALLET"         // ย้ายเงินสด → เงินโอน
    | "WITHDRAW_FROM_TRANSFER"     // ถอนเงินโอน → เงินสด
    | "SUB_CREATE"
    | "SUB_DEPOSIT"
    | "SUB_WITHDRAW"
    | "SUB_TRANSFER"
    | "SUB_BORROW"
    | "IMPORT_DATA"
    | "RESTORE_BACKUP",

  description: "string",           // คำอธิบายอ่านง่าย เช่น "เพิ่มรายจ่าย: ค่าไฟ 1,200 บาท"

  // รายละเอียดการเปลี่ยนแปลง
  oldValue: {} | null,             // ค่าเดิม (null ถ้าเป็นการสร้างใหม่)
  newValue: {} | null,             // ค่าใหม่ (null ถ้าเป็นการลบ)
  changeNote: "string",            // หมายเหตุ/เหตุผลในการแก้ไข

  // ผลกับกระเป๋าเงิน
  walletEffect: {
    target: "cash" | "transfer" | "sub:{id}" | null,
    delta: 0                       // + เพิ่ม / - ลด
  },

  // สถานะ
  status: "success" | "failed",
  errorMessage: "string" | null,

  // ข้อมูลระบบ
  sessionId: "string",             // random ID ต่อ session (สร้างตอนเปิด app)
  deviceInfo: "string"             // navigator.userAgent (ไม่มี IP เพราะ local app)
}
```

> **หมายเหตุ:** ไม่มี IP Address เนื่องจากเป็น local web app (ไม่มี server) ใช้ `sessionId` แทน

---

## 5. Routing Plan

```
/                         → redirect → /dashboard
/dashboard                → Dashboard/index.jsx
/wallet                   → Wallet/index.jsx
/wallet/pending           → PendingPaymentSummary full page
/transactions             → Transactions/index.jsx (default tab: รายรับ)
/transactions/log         → TransactionLog full page
/reports                  → Reports/index.jsx
/import                   → Import/index.jsx
/backup                   → Backup/index.jsx
```

---

## 6. Flow การทำงานหลัก

### 6.1 Startup
```
เปิด App
  → main.jsx: fetch("/SettingApp.txt")
  → settingParser.js: parse key = value
  → useAppStore.init({ shopName, version })
  → ถ้า localStorage ว่าง → seed default data
  → สร้าง sessionId ใหม่ → เก็บใน useAppStore
  → render App.jsx
```

### 6.2 บันทึกรายจ่าย (เงินสด/เงินโอน)
```
กรอก ExpenseForm → กดบันทึก
  → walletEngine.deductWallet(method, amount)
    → ตรวจ: balance - amount < 0?
      → ใช่: ConfirmPopup "ยอดเงินจะติดลบ ยืนยัน?"
        → ยืนยัน → ดำเนินการ
        → ยกเลิก → หยุด
    → บันทึก transaction
    → อัปเดต wallet balance
    → logBuilder.buildLogEntry("ADD_EXPENSE", ...) → useLogStore.add()
```

### 6.3 บันทึกรายจ่าย (ค้างชำระ)
```
เลือก method = "pending" → ใส่ dueDate → กดบันทึก
  → บันทึก transaction (method=pending)
  → เพิ่ม pending_payments entry
  → ไม่ตัดยอด wallet
  → ไม่สร้าง log (log จะสร้างเฉพาะตอนกดชำระเท่านั้น)
  → แสดง badge จำนวนค้างชำระใน Sidebar
```

### 6.4 ชำระค้างชำระ
```
หน้า PendingTracker → กดชำระ → เลือก method
  → walletEngine.deductWallet(method, amount)
    → ตรวจยอดติดลบ → ConfirmPopup ถ้าจำเป็น
  → อัปเดต pending_payments status = "paid", paidAt = now
  → logBuilder.buildLogEntry("PAY_PENDING", ...) → บันทึก log ณ เวลานี้
```

### 6.5 Sub-wallet Borrow
```
SubWalletCard → ปุ่มยืมเงิน → เลือก cash/transfer → ใส่จำนวน
  → ลด sub-wallet balance
  → เพิ่ม main wallet (cash หรือ transfer)
  → บันทึก loans_from_sub
  → logBuilder.buildLogEntry("SUB_BORROW", ...)
```

### 6.6 นำเข้าข้อมูล (Import)
```
เลือกช่วงวันที่ → เลือกแบบฟอร์ม
  → สร้าง template ตาม date range (row = 1 วัน)
  → ผู้ใช้กรอกข้อมูล
  → กดนำเข้า
  → importProcessor.validate() → แสดง error ถ้ามี
  → importProcessor.process():
      แบบ "รายรับรวมรายวัน" → สร้าง income transaction (method=cash)
      แบบ "รายรับแยกประเภท" → สร้าง income transaction แยก type
      แบบ "รายรับ-รายจ่ายรวม" → income(cash) + expense(ไม่ระบุหมวดหมู่)
  → logBuilder.buildLogEntry("IMPORT_DATA", ...)
```

---

## 7. Dashboard — IncomeExpenseScroll

- Container แนวนอน เลื่อนซ้าย-ขวาด้วย scroll หรือปุ่มลูกศร
- แสดง 15 วันล่าสุด (ปรับตาม filter)
- แต่ละ card: วันที่ | ยอดรายรับ | ยอดรายจ่าย
- **Hover ยอดรายรับ** → Tooltip:
  - เงินสด: {จำนวน} (แสดงเสมอ)
  - เงินโอน: {จำนวน} (แสดงเสมอ)
  - รายรับประเภทอื่น: แสดงเฉพาะมียอด
- **Hover ยอดรายจ่าย** → Tooltip:
  - แสดงเฉพาะหมวดหมู่ที่มียอด

---

## 8. Reports — ประเภทและ Import Support

| ประเภทรายงาน | Export Excel | Export รูป | ใช้เป็น Import template |
|---|---|---|---|
| รายรับรวมตามรายวัน | ✓ | — | ✓ (import เป็นเงินสด) |
| รายรับแยกประเภท | ✓ | — | ✓ |
| รายจ่าย | ✓ | — | — |
| รายจ่ายแยกประเภท | ✓ | — | — |
| รายรับ-รายจ่ายรวม | ✓ | — | ✓ (income=cash, expense=ไม่ระบุหมวด) |
| กราฟรายรับ | — | ✓ PNG | — |
| กราฟรายจ่าย | — | ✓ PNG | — |
| กราฟรายรับ-รายจ่าย | — | ✓ PNG | — |

---

## 9. Backup — ฟีเจอร์

| ฟีเจอร์ | รายละเอียด | Format |
|---|---|---|
| สำรองข้อมูลทั้งหมด | ทุก localStorage key | `.json` |
| สำรองเฉพาะ Settings | `app_settings`, `categories`, `vendors`, `quick_items` | `.json` |
| ดาวน์โหลด Log | `activity_log` ทั้งหมด | `.json` หรือ `.csv` |
| Restore | อ่านไฟล์ backup แล้ว merge หรือ overwrite | — |

---

## 10. Sidebar — Badges แจ้งเตือน

```
├── Dashboard
├── กระเป๋าเงินหลัก
├── บันทึกรายรับ-รายจ่าย
│     └── [3] ← จำนวนค้างชำระ
│     └── [2] ← จำนวนรอใบกำกับภาษี
├── รายงาน
├── นำเข้าข้อมูล
└── สำรองข้อมูล
```

---

## 11. จุดเสี่ยงที่มีโอกาสผิดพลาด

---

### ⛔ CRITICAL (ถ้าพลาดระบบพัง)

**[C1] wallet total เป็น derived value เท่านั้น**
- ห้ามเก็บ `total` ใน localStorage แยก ต้องคำนวณจาก `cash + transfer` เสมอ
- ถ้าเก็บแยก → มีโอกาสค่าไม่ sync → ยอดผิด
- **วิธีแก้:** `useWalletStore` expose `total` เป็น getter: `() => state.cash + state.transfer`

**[C2] Log ค้างชำระ — สร้างตอนจ่ายเท่านั้น**
- ตอนสร้างบิลค้างชำระ → ห้ามสร้าง log
- Log สร้างเฉพาะตอน `PAY_PENDING` เท่านั้น
- **ความเสี่ยง:** นักพัฒนาเข้าใจผิด → สร้าง log สองครั้ง → ยอดเงิน recalculate ผิด

**[C3] walletEngine เป็น single source of truth**
- ทุกการเพิ่ม/ลด wallet ต้องผ่าน `walletEngine.js` เท่านั้น
- ห้าม update wallet balance โดยตรงจาก component
- **ความเสี่ยง:** มีการ patch wallet จาก 2 ที่ → race condition, ยอดผิด

---

### ⚠️ HIGH RISK

**[H1] อ่าน SettingApp.txt**
- Web app อ่าน local file โดยตรงไม่ได้
- **วิธีแก้:** วางใน `/public`, ใช้ `fetch("/SettingApp.txt")`
- ถ้าผู้ใช้เปลี่ยนชื่อร้านใน UI → เก็บใน `app_settings.shopNameOverride` ใน localStorage
- ลำดับ priority: `shopNameOverride` > `SettingApp.txt`

**[H2] ยอดติดลบ — ต้องตรวจทุก path**
- จุดที่ตัดเงิน: บันทึกรายจ่าย, ชำระค้างชำระ, ถอนจาก sub-wallet, ย้ายเงินระหว่างกระเป๋า
- **วิธีแก้:** ทุกจุดใช้ `walletEngine.deductWallet()` ซึ่ง check + trigger ConfirmPopup อยู่แล้ว

**[H3] State sync ระหว่างหน้า**
- ยอดเงินแสดงหลายหน้า (Dashboard, Wallet, Sidebar badge)
- **วิธีแก้:** ทุก component subscribe `useWalletStore` และ `usePendingStore` ตรงๆ ไม่ส่ง props ผ่านหลายชั้น

**[H4] Import ข้อมูล — validate ก่อนเสมอ**
- ถ้า import แล้วข้อมูลผิด → ยอดในระบบผิดหมด
- **วิธีแก้:** `importProcessor.validate()` ตรวจ: ตัวเลขเป็นตัวเลข, วันที่ถูกรูปแบบ, ไม่มีช่องว่างที่จำเป็น → แสดง error list ก่อน import
- มีปุ่ม "ยืนยันนำเข้า" พร้อม preview จำนวน record ที่จะเพิ่ม

---

### 🔶 MEDIUM RISK

**[M1] Soft delete สำหรับ categories/vendors/quick_items**
- ถ้าลบ category ที่มี transaction อ้างถึง → transaction แสดง category เป็น `"[ลบแล้ว]"`
- **วิธีแก้:** ใช้ `deleted: true` flag อย่า hard delete ออกจาก array

**[M2] Excel Export — date format**
- SheetJS จะแปลง Date object เป็น serial number
- **วิธีแก้:** format date เป็น string `"DD/MM/YYYY"` ก่อนส่งเข้า SheetJS ทุกครั้ง

**[M3] Chart Export ภาษาไทย**
- html2canvas อาจ render font ภาษาไทยเป็นกล่องสี่เหลี่ยม
- **วิธีแก้:** ใช้ SVG export ของ Recharts ก่อน (รองรับ unicode ดีกว่า), fallback html2canvas

**[M4] Parse SettingApp.txt**
- ต้องรองรับ: spaces รอบ `=`, BOM character, บรรทัดว่าง, comment (`#`)
- **วิธีแก้:** `settingParser.js` ใช้ regex `/^\s*([^=\s]+)\s*=\s*(.+)\s*$/` และ skip บรรทัดที่ขึ้นต้น `#`

**[M5] SessionId**
- สร้างใหม่ทุกครั้งที่เปิด App (`crypto.randomUUID()`)
- เก็บใน `sessionStorage` (ไม่ใช่ localStorage) เพื่อให้ reset เมื่อปิด tab

**[M6] Restore Backup ทับข้อมูลเดิม**
- ถ้า restore ผิด → ข้อมูลหาย
- **วิธีแก้:** ก่อน restore ให้ auto-backup ไฟล์ปัจจุบันก่อนเสมอ + ConfirmPopup แจ้งเตือน

---

### 🔷 LOW RISK

**[L1] localStorage เกิน 5MB**
- สะสม log นาน → อาจเกิน limit
- **วิธีแก้:** แจ้งเตือนเมื่อ log เกิน 1,000 entries, แนะนำให้ download + clear log เก่า

**[L2] Import template ไม่ตรงกับ format ที่คาดหวัง**
- ผู้ใช้แก้ไข Excel แล้ว column หาย
- **วิธีแก้:** `importProcessor.validate()` ตรวจ header ก่อนประมวลผล

**[L3] ไม่มี multi-device sync**
- ข้อมูลอยู่แค่เครื่องเดียว
- **วิธีแก้:** แจ้งในหน้า Backup ชัดเจน, ส่งเสริมให้ backup สม่ำเสมอ

**[L4] EditableDropdown UX**
- ถ้า dropdown มี item เยอะ → หา item ยาก
- **วิธีแก้:** เพิ่ม search/filter ใน dropdown ตั้งแต่แรก

---

## 12. Sprint Plan

```
Sprint 1 — Foundation (ไม่มี logic)
  [ ] Vite + React + Tailwind + Zustand + React Router setup
  [ ] /public/SettingApp.txt
  [ ] main.jsx: fetch + parse + init stores
  [ ] Navbar + Sidebar (routing, badges placeholder)
  [ ] shared components: ConfirmPopup, DateNavigator, EditableDropdown, SectionCard

Sprint 2 — Wallet Engine + Transaction Core
  [ ] useWalletStore (cash, transfer, derived total)
  [ ] walletEngine.js (deduct, add, transfer) + negative check
  [ ] useTransactionStore
  [ ] IncomeForm + ExpenseForm (+ EditableDropdown)
  [ ] usePendingStore + PendingTracker

Sprint 3 — Log System + Transaction History
  [ ] useLogStore + logBuilder.js (ทุก activityType)
  [ ] TransactionLog (แสดง, แก้ไข, ลบ)
  [ ] sessionId management

Sprint 4 — Wallet Pages
  [ ] MainWalletCard (ย้ายเงิน + log)
  [ ] SubWalletCard (สร้าง, ฝาก, ถอน, โอน, ยืม + log)
  [ ] LoanSummary + PendingPaymentSummary

Sprint 5 — Dashboard
  [ ] FilterBar
  [ ] IncomeExpenseScroll (15 วัน + Tooltip breakdown)
  [ ] FinancialStatus cards
  [ ] ChartFiltered + TrendChart6M

Sprint 6 — Reports + Export
  [ ] ReportTable (ทุกประเภท + date range)
  [ ] ReportChart
  [ ] excelExporter.js (SheetJS + date string fix)
  [ ] chartExporter.js (SVG + html2canvas fallback)

Sprint 7 — Import + Backup
  [ ] importProcessor.js (validate + process 3 แบบ)
  [ ] Import pages (DateRangePicker + 3 forms)
  [ ] Backup/Restore (full, settings, log)
  [ ] Auto-backup ก่อน restore

Sprint 8 — Polish + QA
  [ ] Sidebar badges (จำนวนค้างชำระ, รอใบกำกับ)
  [ ] Responsive layout
  [ ] Error boundaries
  [ ] ทดสอบ edge cases ทุก critical path
  [ ] ทดสอบ SettingApp.txt รูปแบบต่างๆ
```

---

## 13. สรุปจุดเสี่ยงสำคัญที่สุด

| ลำดับ | ID | ปัญหา | ผลกระทบ | แนวทาง |
|---|---|---|---|---|
| 1 | C1 | wallet total เป็น derived value | ยอดผิด ไม่ sync | derived getter ใน Zustand |
| 2 | C2 | Log ค้างชำระสร้างผิดเวลา | ประวัติและยอดเงินผิด | สร้าง log เฉพาะ PAY_PENDING |
| 3 | C3 | ไม่ผ่าน walletEngine | race condition | enforce ผ่าน engine เดียว |
| 4 | H4 | Import ไม่ validate | ข้อมูลระบบพัง | validate + preview ก่อนเสมอ |
| 5 | M6 | Restore ทับข้อมูล | ข้อมูลหาย | auto-backup ก่อน restore |

---

*ไฟล์นี้เป็นแผนเท่านั้น ยังไม่มีการสร้าง code ใดๆ*
