# Planning: Update App แบบไม่ต้อง Install ใหม่ (Patch File)

## แนวคิด
ส่งเฉพาะไฟล์ที่เปลี่ยนแปลงให้ user เอาไปทับไฟล์เดิม โดยไม่ต้องรัน installer

---

## โครงสร้างไฟล์หลังจาก Build

เมื่อรัน `npm run electron:build` จะได้โฟลเดอร์ `release/win-unpacked/` ที่มีโครงสร้างดังนี้:

```
release/win-unpacked/
├── บันทึกรายรับ-รายจ่าย.exe        (~150 MB) ← Electron runtime
├── resources/
│   ├── app.asar                     (~20-40 MB) ← โค้ดแอปทั้งหมด
│   └── SettingApp.txt               (< 1 KB) ← version / ชื่อร้าน
├── locales/                         ← ภาษา
├── d3dcompiler_47.dll
├── ffmpeg.dll
├── libEGL.dll
├── libGLESv2.dll
├── vk_swiftshader.dll
└── ... dll อื่นๆ
```

---

## ไฟล์ไหนเปลี่ยนบ้างตอน Build

| ไฟล์ | เปลี่ยนเมื่อไหร่ | ขนาด |
|---|---|---|
| `resources/app.asar` | **ทุก build** (รวมโค้ด React + Electron ทั้งหมด) | ~20-40 MB |
| `resources/SettingApp.txt` | ตอนอัปเดต version / ชื่อร้าน | < 1 KB |
| `บันทึกรายรับ-รายจ่าย.exe` | เฉพาะตอนอัปเดต Electron package version | ~150 MB |
| `*.dll`, `locales/` | เฉพาะตอนอัปเดต Electron package version | ~100+ MB |

### สรุป: ทุก build ที่แก้ code → ส่งแค่ `app.asar` ไฟล์เดียว

---

## ทำไม app.asar ถึงเปลี่ยนทุก build

`app.asar` คือไฟล์ archive ที่บรรจุโค้ดทั้งหมดไว้ในไฟล์เดียว ประกอบด้วย:

```
app.asar (ข้างใน)
├── dist/              ← React build ทั้งหมด (HTML, CSS, JS)
├── electron/
│   ├── main.cjs      ← Electron main process
│   └── preload.cjs   ← Electron preload
└── package.json
```

เมื่อ build ใหม่ ไฟล์นี้ถูก repack ทั้งหมด → timestamp และ checksum เปลี่ยนทุกครั้ง

---

## เรื่อง Timestamp

- `app.asar` จะมี timestamp = เวลาที่ build เสมอ
- ใช้ timestamp เพื่อตรวจสอบว่า user copy ไฟล์ใหม่แล้วหรือยัง
- เปรียบ timestamp ของ app.asar ในเครื่อง user กับ version ที่แจ้งไว้ได้

```
ตัวอย่าง:
  ไฟล์เก่า: app.asar  (modified: 1 เม.ย. 2569 10:00)
  ไฟล์ใหม่: app.asar  (modified: 4 พ.ค. 2569 14:30)
  → user เห็นว่าไฟล์ใหม่กว่า → ต้องทำการ copy ทับ
```

---

## ขั้นตอน Update แบบ Patch File

### ฝั่ง Developer (ทำทุกครั้งที่ update)

```
1. แก้ไข code ตามต้องการ
2. อัปเดต version ใน SettingApp.txt (ถ้ามีการ update version)
3. รัน: npm run electron:build
4. ไปที่โฟลเดอร์ release/win-unpacked/resources/
5. หยิบไฟล์ที่ต้องส่ง:
     - app.asar              (บังคับ ทุก build)
     - SettingApp.txt        (ถ้า version เปลี่ยน)
6. ใส่ zip หรือส่งตรงให้ user
```

### ฝั่ง User (ทำทุกครั้งที่ได้รับไฟล์ update)

```
1. ปิดแอป บันทึกรายรับ-รายจ่าย ให้สนิท
2. เปิด File Explorer ไปที่โฟลเดอร์ที่ติดตั้งแอป เช่น:
     C:\Program Files\บันทึกรายรับ-รายจ่าย\resources\
3. copy ไฟล์ app.asar ที่ได้รับมาทับไฟล์เดิม
4. copy SettingApp.txt ทับ (ถ้าได้รับมาด้วย)
5. เปิดแอปใหม่ → ได้เวอร์ชันล่าสุด
```

---

## จำนวนไฟล์ที่ส่งแต่ละครั้ง

| สถานการณ์ | ไฟล์ที่ส่ง | ขนาดรวม |
|---|---|---|
| แก้ bug / เพิ่ม feature ทั่วไป | `app.asar` | ~20-40 MB |
| แก้ code + เปลี่ยน version | `app.asar` + `SettingApp.txt` | ~20-40 MB |
| อัปเดต Electron version ด้วย | ส่ง installer เต็ม (.exe) แทน | ~200 MB |

---

## ข้อดี / ข้อเสีย เทียบกับส่ง Installer เต็ม

| หัวข้อ | Patch (app.asar) | Installer (.exe) |
|---|---|---|
| ขนาดไฟล์ที่ส่ง | เล็ก ~20-40 MB | ใหญ่ ~200 MB |
| ความยากของ user | ต้อง copy เองถูก folder | ดับเบิลคลิกเดียว |
| โอกาส user ทำผิด | มี (copy ผิด folder) | น้อยมาก |
| ข้อมูลหาย | ไม่หาย (ไม่แตะ userData) | ไม่หาย (ถ้าแก้ APP_DATA_ROOT แล้ว) |
| เหมาะกับ | update บ่อย, ไฟล์ใหญ่ส่งยาก | update นานๆ ครั้ง |

---

## ความเสี่ยงหลักของวิธีนี้

```
⚠️  User copy ไปผิด folder
     → แอปยังเปิดได้แต่เวอร์ชันไม่เปลี่ยน
     → วิธีเช็ค: ดู version ในแอป หรือดู timestamp ของ app.asar

⚠️  User ไม่ปิดแอปก่อน copy
     → Windows ล็อคไฟล์ → copy ไม่ได้ หรือ error
     → ต้องแจ้ง user ให้ปิดแอปก่อนเสมอ

⚠️  User ลืม copy SettingApp.txt
     → เวอร์ชันในแอปแสดงเลขเก่า (แต่โค้ดใหม่)
     → ไม่กระทบการทำงาน แค่เลข version ไม่ตรง
```

---

## วิธีตรวจสอบว่า Update สำเร็จ

**วิธีที่ 1 — ดู Version ในแอป**
```
เปิดแอป → ดูเลข version ที่แสดงในแอป
ถ้าตรงกับที่ developer แจ้ง → update สำเร็จ
```

**วิธีที่ 2 — ดู Timestamp ของไฟล์**
```
คลิกขวา app.asar → Properties → Modified date
ถ้าตรงกับวันที่ developer ส่งไฟล์ให้ → update สำเร็จ
```
