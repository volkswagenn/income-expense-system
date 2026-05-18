# แนวทางการพัฒนา

---

## Feature 1 — Sub Tab "บันทึกรายจ่าย" : เพิ่มระบบ Upload เอกสาร

### 1.1 เพิ่มตัวเลือก "ใบเสร็จ" ใน Dropdown ใบกำกับภาษี

| ค่า (value)  | ข้อความ (label)         |
|--------------|-------------------------|
| `none`       | ไม่ต้องการ              |
| `receipt`    | ใบเสร็จ ← เพิ่มใหม่     |
| `received`   | มีใบกำกับภาษี           |
| `waiting`    | รอใบกำกับภาษี           |

ไฟล์ที่เปลี่ยน: `src/pages/Transactions/ExpenseForm.jsx`

---

### 1.2 Logic ปุ่ม Upload หลังบันทึก

เพิ่ม state `savedMeta: { taxStatus, date } | null` เหมือนที่ทำใน IncomeForm

| taxStatus       | ปุ่มที่แสดง                    | folder ปลายทาง  |
|-----------------|-------------------------------|-----------------|
| `none`          | ไม่แสดง                       | —               |
| `receipt`       | 📎 อัปโหลดใบเสร็จ             | `receipts/`     |
| `waiting`       | 📎 อัปโหลดใบเสร็จ             | `receipts/`     |
| `received`      | 📎 อัปโหลดใบกำกับภาษี         | `taxinvoices/`  |

- ปุ่มอยู่ในแถบสีน้ำเงินใต้ปุ่มบันทึก (เหมือน IncomeForm)
- กด ✕ ปิดได้ถ้าไม่ต้องการอัปโหลด
- แสดง path ที่บันทึกหลัง upload สำเร็จ
- ใช้ `FileUploadPopup` เดิม (ไม่ต้องสร้าง component ใหม่)

ไฟล์ที่เปลี่ยน: `src/pages/Transactions/ExpenseForm.jsx`

---

## Feature 2 — Tab "นำเข้าข้อมูล" : ปรับปรุง UX

### 2.1 เปลี่ยน Date Filter เป็น DateRangeFilter

**ปัจจุบัน:** input date สองช่อง (ตั้งแต่ / ถึง) แบบ raw  
**ปรับปรุง:** ใช้ `<DateRangeFilter>` component เดียวกับ Dashboard และ History

- มีปุ่ม: วันนี้ / เมื่อวาน / เดือน+ปี (dropdown) / กำหนดเอง
- เปลี่ยน state: เพิ่ม `filter` state ('today'|'yesterday'|'month'|'custom')
- ค่าเริ่มต้น: เดือนปัจจุบัน

ไฟล์ที่เปลี่ยน: `src/pages/Import/index.jsx`

---

### 2.2 ปุ่ม Download CSV — อยู่ใน Section ฟอร์ม (หลัง Generate)

**ตำแหน่ง:** แถบปุ่มใต้ชื่อ SectionCard ของฟอร์ม (ก่อน table)

- Download ไฟล์ CSV ที่มี **หัวข้อ + ข้อมูลปัจจุบันในฟอร์ม** (รวมตัวเลขที่กรอกไว้แล้ว)
- ถ้ายังไม่กรอก → แถวมีแค่วันที่ ช่องอื่นว่าง
- บันทึกที่ `Documents/ZuZoo/templates/แม่แบบ_<ประเภท>_<วันที่>.csv`
- แสดง status หลัง download (✓ / ⚠️) เหมือน ExportBar

**หัวข้อ CSV แต่ละแบบ:**

| แบบฟอร์ม        | หัวข้อคอลัมน์                                      |
|-----------------|----------------------------------------------------|
| รายรับรวมรายวัน | วันที่, ยอดรวม (บาท), หมายเหตุ                    |
| รายรับแยกประเภท | วันที่, เงินสด (บาท), เงินโอน (บาท), หมายเหตุ    |
| รายรับ-รายจ่าย  | วันที่, รายรับ (บาท), รายจ่าย (บาท), หมายเหตุ    |

ไฟล์ที่เปลี่ยน:
- `src/pages/Import/ImportFormDaily.jsx`
- `src/pages/Import/ImportFormByType.jsx`
- `src/pages/Import/ImportFormSummary.jsx`

---

### 2.3 ปุ่ม Upload CSV — อยู่ใน Section ฟอร์ม เดียวกัน

**ตำแหน่ง:** ปุ่มอยู่ข้างๆ ปุ่ม Download CSV ในแถบเดียวกัน

**Flow เมื่ออัปโหลด:**
1. user เลือกไฟล์ CSV / Excel
2. parse ด้วย XLSX → map คอลัมน์ (Thai header → internal key)
3. **ดึงเฉพาะแถวที่วันที่อยู่ในช่วง** startDate–endDate ของฟอร์ม
4. merge ข้อมูลลงใน `rows` state ของฟอร์ม (overwrite แต่ละ cell ที่มีค่า, ไม่ลบแถวที่ไม่มีในไฟล์)
5. แสดง toast/notice: "โหลดข้อมูลจากไฟล์แล้ว X แถว" — ไม่มี popup ยืนยัน
6. user ตรวจสอบแก้ไขเพิ่มเติมได้ในฟอร์ม แล้วกด "📥 นำเข้าข้อมูล" ตามปกติ

**ต่างจาก ImportUploader เดิม (global upload):**
| | ImportUploader เดิม | Upload ใน Form (ใหม่) |
|---|---|---|
| ตำแหน่ง | Section แยก | อยู่ใน form section |
| ผล | บันทึกลง DB ทันที | โหลดเข้าฟอร์มให้ตรวจสอบก่อน |
| Overwrite confirm | มี popup | ไม่มี (merge เงียบๆ) |

ไฟล์ที่เปลี่ยน:
- `src/pages/Import/ImportFormDaily.jsx`
- `src/pages/Import/ImportFormByType.jsx`
- `src/pages/Import/ImportFormSummary.jsx`

---

## สรุปไฟล์ที่ต้องแก้

| ไฟล์                                        | งานที่ทำ                                              |
|---------------------------------------------|-------------------------------------------------------|
| `src/pages/Transactions/ExpenseForm.jsx`    | เพิ่ม receipt option + savedMeta + upload prompt      |
| `src/pages/Import/index.jsx`               | เปลี่ยนเป็น DateRangeFilter                           |
| `src/pages/Import/ImportFormDaily.jsx`     | เพิ่มปุ่ม Download + Upload, ฟังก์ชัน merge rows     |
| `src/pages/Import/ImportFormByType.jsx`    | เพิ่มปุ่ม Download + Upload, ฟังก์ชัน merge rows     |
| `src/pages/Import/ImportFormSummary.jsx`   | เพิ่มปุ่ม Download + Upload, ฟังก์ชัน merge rows     |

**ไม่ต้องสร้างไฟล์ใหม่** — ใช้ component ที่มีอยู่แล้ว (`FileUploadPopup`, `DateRangeFilter`, `saveAppFile`, XLSX)

---

## หมายเหตุ: ImportUploader (global) ที่มีอยู่แล้ว

`src/pages/Import/ImportUploader.jsx` ที่สร้างใน session ก่อน ทำงานต่างออกไป (import ตรงสู่ DB พร้อม overwrite checklist) — ควรตัดสินใจว่าจะ:
- **คงไว้**: ใช้เป็น advanced import option แยกต่างหาก
- **ลบทิ้ง**: แทนที่ด้วย flow ใหม่ที่ผ่านฟอร์มก่อน
