# แผน: Sync ใบกำกับภาษีเมื่อแก้ไขบิล

## ปัญหาปัจจุบัน

ใน `EditTransactionPopup.jsx` line 91-95 เรียก `syncTaxInvoiceByTxId` เสมอทุก save:

```
syncTaxInvoiceByTxId(transaction.id, { itemName, receiptNo, amount })
```

ซึ่ง sync ได้แค่ **ข้อมูล** ของ taxInvoice ที่มีอยู่แล้ว  
แต่ **ไม่สร้าง** taxInvoice ใหม่ และ **ไม่ลบ** taxInvoice เก่าออก
เมื่อ user เปลี่ยน taxStatus

---

## 4 กรณีที่ต้องจัดการ

| # | taxStatus เดิม | taxStatus ใหม่ | สิ่งที่ต้องทำ |
|---|---|---|---|
| A | `none` หรือ `received` | `waiting` | **สร้าง** taxInvoice card ใหม่ + log |
| B | `waiting` | `none` หรือ `received` | **ลบ** taxInvoice card ที่มีอยู่ + log |
| C | `waiting` | `waiting` | **sync** ข้อมูล (เหมือนเดิม) |
| D | `none`/`received` | `none`/`received` | ไม่ทำอะไร |

---

## ไฟล์ที่ต้องแก้ไข

### 1. `src/store/usePendingStore.js` — เพิ่ม action ใหม่

ขาด action สำหรับลบ taxInvoice โดยอ้างอิงจาก `transactionId` (ต่างจาก `deleteTaxInvoice` ที่ลบด้วย id ของ taxInvoice):

```
เพิ่ม: deleteTaxInvoiceByTxId(transactionId)
  → filter out taxInvoice ที่ t.transactionId === transactionId
```

---

### 2. `src/components/shared/EditTransactionPopup.jsx` — logic หลัก

#### 2a. เพิ่ม import

```
import { addTaxInvoice, deleteTaxInvoiceByTxId, syncTaxInvoiceByTxId }
  ← destructure จาก usePendingStore()
```

#### 2b. แทนที่ sync แบบ unconditional ด้วย logic 4 กรณี

ใน `handleConfirm` แทนที่ block ที่เป็น:
```
syncTaxInvoiceByTxId(transaction.id, { ... })   ← ลบออก
```

แทนด้วย:

```
const oldTax = transaction.taxStatus   // ค่าเดิมก่อนแก้ไข
const newTax = form.taxStatus          // ค่าใหม่ที่ user เลือก

if (newTax === 'waiting' && oldTax !== 'waiting') {
  // กรณี A: สร้างใหม่
  addTaxInvoice({
    transactionId: transaction.id,
    itemName: form.itemName,
    receiptNo: form.receiptNo,
    amount: newAmt,
    dueDate: form.dueDate || null,
    createdAt: new Date().toISOString(),
  })
  addLog(buildLogEntry({
    activityType: 'CREATE_TAX_INVOICE',
    description: `สร้างการ์ดรอใบกำกับภาษี: "${form.itemName}" ${newAmt.toLocaleString()} บาท`,
    newValue: { transactionId: transaction.id, itemName: form.itemName },
  }))

} else if (oldTax === 'waiting' && newTax !== 'waiting') {
  // กรณี B: ลบออก
  deleteTaxInvoiceByTxId(transaction.id)
  addLog(buildLogEntry({
    activityType: 'DELETE_TAX_INVOICE',
    description: `ยกเลิกการรอใบกำกับภาษี: "${form.itemName}"`,
    oldValue: { transactionId: transaction.id, itemName: transaction.itemName },
  }))

} else if (oldTax === 'waiting' && newTax === 'waiting') {
  // กรณี C: sync ข้อมูล
  syncTaxInvoiceByTxId(transaction.id, {
    itemName: form.itemName,
    receiptNo: form.receiptNo,
    amount: newAmt,
  })
}
// กรณี D: ไม่ทำอะไร
```

---

### 3. `src/lib/logBuilder.js` — เพิ่ม label ใหม่ใน ACTIVITY_LABELS

```
CREATE_TAX_INVOICE: 'สร้างรอใบกำกับภาษี',
DELETE_TAX_INVOICE: 'ยกเลิกรอใบกำกับภาษี',
```

---

## ข้อมูลที่ taxInvoice card จะมี (กรณี A)

| Field | ที่มา |
|---|---|
| `transactionId` | `transaction.id` — ใช้ link กลับ |
| `itemName` | `form.itemName` |
| `receiptNo` | `form.receiptNo` |
| `amount` | `newAmt` |
| `dueDate` | `form.dueDate` ถ้ามี (ตอนนี้แสดงเฉพาะ method=pending) |
| `status` | `'waiting'` (default ของ addTaxInvoice) |
| `createdAt` | `new Date().toISOString()` |

---

## Flow ที่ถูกต้องหลัง fix

```
User เปิด Edit popup
  └── เปลี่ยน taxStatus จาก "ไม่ต้องการ" → "รอใบกำกับภาษี"
        └── กด "ยืนยันการแก้ไข"
              ├── updateTransaction(id, { ...form })        ← อัปเดต transaction
              ├── addTaxInvoice({ transactionId: id, ... }) ← สร้างการ์ดใหม่ [กรณี A]
              ├── addLog(CREATE_TAX_INVOICE)                ← บันทึก log
              └── onClose()

              → ผลลัพธ์ Realtime:
                  ✓ การ์ด "รอใบกำกับภาษี" ปรากฏในหน้า Wallet/Transactions ทันที
                  ✓ Dot สีม่วงปรากฏบนปฏิทิน (ถ้ามี dueDate)
                  ✓ Log บันทึกการเปลี่ยนแปลง

User เปิด Edit popup
  └── เปลี่ยน taxStatus จาก "รอใบกำกับภาษี" → "ไม่ต้องการ"
        └── กด "ยืนยันการแก้ไข"
              ├── updateTransaction(id, { ...form })        ← อัปเดต transaction
              ├── deleteTaxInvoiceByTxId(id)                ← ลบการ์ดออก [กรณี B]
              ├── addLog(DELETE_TAX_INVOICE)                ← บันทึก log
              └── onClose()

              → ผลลัพธ์ Realtime:
                  ✓ การ์ด "รอใบกำกับภาษี" หายออกทันที
                  ✓ Dot สีม่วงหายจากปฏิทิน
                  ✓ Log บันทึกการเปลี่ยนแปลง
```

---

## สิ่งที่ Realtime ทำงานได้เองโดยไม่ต้องแก้เพิ่ม

เนื่องจาก UI ทั้งหมดดึงข้อมูลจาก Zustand store โดยตรง:
- `usePendingStore().taxInvoices` → card ในหน้า Wallet/Transactions อัปเดตทันที
- `useNoteStore().notes` (calendar) → calendar re-render ทันที
- ไม่มี polling / manual refresh

---

## สรุปไฟล์และขอบเขตการแก้ไข

| ไฟล์ | การเปลี่ยนแปลง | บรรทัดโดยประมาณ |
|---|---|---|
| `src/store/usePendingStore.js` | เพิ่ม `deleteTaxInvoiceByTxId` | +5 บรรทัด |
| `src/components/shared/EditTransactionPopup.jsx` | แทนที่ sync ด้วย logic 4 กรณี | ~20 บรรทัด |
| `src/lib/logBuilder.js` | เพิ่ม 2 label | +2 บรรทัด |

**ไม่ต้องแก้:** store อื่น, UI component อื่น, router, ทุกหน้าที่แสดง taxInvoice

---

## หมายเหตุ: dueDate ของ taxInvoice

ปัจจุบัน field `dueDate` ใน Edit form แสดงเฉพาะเมื่อ `method === 'pending'`  
ถ้าต้องการให้ Dot สีม่วงปรากฏบนปฏิทินสำหรับ taxInvoice ที่สร้างจาก Edit  
ต้องเพิ่ม field "วันที่คาดว่าจะได้รับใบ" แยกต่างหาก — นี่คือ enhancement แยกในอนาคต  
ตอนนี้ dueDate จะเป็น `null` หรือค่าจาก form.dueDate ถ้ามี
