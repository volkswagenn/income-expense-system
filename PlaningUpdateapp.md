# Planning: แก้ปัญหาไฟล์หายตอน Update App

## 1. สาเหตุที่ข้อมูลหายตอน Over-install

### ปัญหาคือ APP_DATA_ROOT ปัจจุบัน

```
// electron/main.cjs (ปัจจุบัน)
const APP_DATA_ROOT = isDev
  ? path.join(__dirname, '..')
  : path.dirname(app.getPath('exe'))   // ← ปัญหาอยู่ที่นี่
```

`path.dirname(app.getPath('exe'))` = โฟลเดอร์ที่ติดตั้งแอป เช่น:

```
C:\Program Files\บันทึกรายรับ-รายจ่าย\
├── บันทึกรายรับ-รายจ่าย.exe
├── receipts\          ← เก็บใบเสร็จ (โฟลเดอร์ที่หาย!)
├── taxinvoices\       ← เก็บใบกำกับภาษี (โฟลเดอร์ที่หาย!)
├── SettingApp.txt     ← ไฟล์ตั้งค่า
└── resources\
    └── app.asar       ← code ของแอป
```

เมื่อ NSIS installer ติดตั้งทับ — มันเขียนทับโฟลเดอร์ติดตั้งทั้งหมด
ไฟล์ใบเสร็จและใบกำกับภาษีที่ user สะสมไว้จึงหายทุกครั้ง

---

## 2. วิธีแก้ — ย้าย APP_DATA_ROOT ออกจากโฟลเดอร์ติดตั้ง

เปลี่ยนไปใช้ `app.getPath('userData')` ซึ่ง Electron จัดการให้
NSIS **ไม่มีสิทธิ์แตะต้อง** โฟลเดอร์นี้

```
ก่อนแก้:  C:\Program Files\บันทึกรายรับ-รายจ่าย\receipts\
หลังแก้:  C:\Users\{user}\AppData\Roaming\cashflow-app\receipts\
```

### ผลลัพธ์หลังแก้

```
C:\Program Files\บันทึกรายรับ-รายจ่าย\     ← NSIS ควบคุม (โค้ดแอป)
├── บันทึกรายรับ-รายจ่าย.exe
└── resources\
    └── app.asar

C:\Users\{user}\AppData\Roaming\cashflow-app\  ← Electron ควบคุม (ข้อมูล user)
├── receipts\          ← ปลอดภัย 100%
├── taxinvoices\       ← ปลอดภัย 100%
├── SettingApp.txt     ← ปลอดภัย 100%
└── Local Storage\     ← Zustand data (เดิมอยู่ที่นี่อยู่แล้ว)
```

---

## 3. สิ่งที่ต้องเปลี่ยนในโค้ด

### ไฟล์ที่ต้องแก้

| ไฟล์ | สิ่งที่ต้องทำ |
|---|---|
| `electron/main.cjs` | เปลี่ยน APP_DATA_ROOT เป็น `app.getPath('userData')` |
| `electron/main.cjs` | เพิ่ม migration logic (ย้ายไฟล์เก่าจากโฟลเดอร์ติดตั้ง → userData ครั้งแรก) |
| `public/SettingApp.txt` | ต้องมีกลไก copy ไป userData ถ้ายังไม่มี |
| `package.json` | ตรวจสอบ extraResources ให้ถูกต้อง |

### ไฟล์ที่ไม่ต้องแก้

- React components ทั้งหมด (ไม่รู้จัก path โดยตรง)
- Store ทั้งหมด (Zustand อยู่ใน localStorage เดิม)
- electron/preload.cjs (logic ไม่เปลี่ยน)

---

## 4. Migration Logic (สำคัญ)

เมื่อ user อัปเดตจากเวอร์ชันเก่า → เวอร์ชันใหม่
ไฟล์เก่ายังอยู่ที่โฟลเดอร์ติดตั้ง ต้องย้ายมาให้อัตโนมัติ

### ขั้นตอน migration เมื่อเปิดแอปครั้งแรกหลัง update

```
1. เช็คว่า userData/receipts มีอยู่หรือยัง
2. ถ้ายังไม่มี → เช็คว่า oldPath/receipts มีไฟล์อยู่ไหม
3. ถ้ามี → copy ทั้งโฟลเดอร์มาที่ userData
4. ทำเหมือนกันกับ taxinvoices และ SettingApp.txt
5. บันทึก flag ว่า migration เสร็จแล้ว (ไม่ต้องทำซ้ำ)
```

---

## 5. ไฟล์ที่ต้องส่งให้ผู้ใช้ตอน Update

### ส่งแค่ไฟล์เดียว

```
บันทึกรายรับ-รายจ่าย Setup 0.2.0.exe
```

### สิ่งที่ผู้ใช้ต้องทำ

```
1. ดับเบิลคลิก installer
2. กด "Next" ตามปกติ (ไม่ต้อง uninstall ของเดิมก่อน)
3. เสร็จ — เปิดแอปได้เลย
```

ข้อมูลทั้งหมดอยู่ครบ ไม่มีอะไรหาย

---

## 6. สิ่งที่ผู้ใช้จะเห็นเมื่อเปิดแอปหลัง Update ครั้งแรก

```
เปิดแอป
  ↓
ระบบตรวจพบว่าเป็นการ update ครั้งแรก
  ↓
ย้ายไฟล์ใบเสร็จ/ใบกำกับภาษีเก่ามาที่ที่ใหม่อัตโนมัติ (พื้นหลัง)
  ↓
แอปพร้อมใช้งาน — ข้อมูลทุกอย่างอยู่ครบ
```

---

## 7. Update Flow สรุป (วิธีที่ 2 หลังแก้)

```
[Developer]
    ↓  แก้ไข code
    ↓  อัปเดต version ใน SettingApp.txt
    ↓  รัน npm run electron:build
    ↓  ได้ไฟล์ release/บันทึกรายรับ-รายจ่าย Setup X.X.X.exe
    ↓  ส่งไฟล์ให้ผู้ใช้

[ผู้ใช้]
    ↓  รับไฟล์ installer
    ↓  ดับเบิลคลิก → ติดตั้งทับของเดิม
    ↓  เปิดแอป
    ↓  ระบบ migrate ไฟล์เก่าอัตโนมัติ (ครั้งแรกครั้งเดียว)
    ↓  ใช้งานได้ปกติ ข้อมูลครบ
```

---

## 8. ความเสี่ยงและการป้องกัน

| ความเสี่ยง | การป้องกัน |
|---|---|
| migration ล้มเหลว ไฟล์ยังอยู่ที่เดิม | log error + แจ้ง user ให้ copy เอง |
| SettingApp.txt ไม่ถูก copy ไป userData | bundle default ไว้ใน app แล้ว copy เมื่อไม่พบ |
| user กด uninstall แล้วค่อย install ใหม่ | แจ้งเตือนใน release note ห้าม uninstall |

---

## 9. สรุปสิ่งที่ต้องทำ (เรียงลำดับ)

- [ ] แก้ `APP_DATA_ROOT` ใน `electron/main.cjs`
- [ ] เพิ่ม migration function สำหรับไฟล์เก่า
- [ ] จัดการ `SettingApp.txt` ให้อ่านจาก userData
- [ ] ทดสอบ build → install → update → ตรวจว่าไฟล์ครบ
- [ ] เขียน release note แจ้ง user วิธี update ที่ถูกต้อง
