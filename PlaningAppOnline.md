# แผนการทำ App ให้รองรับ Online

## สถานะปัจจุบัน (Offline-only)

```
[Electron App]
  └── localStorage (Zustand persist)  ← ข้อมูลทั้งหมดอยู่เครื่องเดียว
  └── /receipts, /taxinvoices         ← ไฟล์อยู่ข้าง .exe
  └── SettingApp.txt                  ← config อ่านตอน boot
```

ปัญหาหลัก: ข้อมูลอยู่เครื่องเดียว เปิดจากเครื่องอื่นไม่ได้ ไม่มี user account ไม่มี sync

---

## เป้าหมาย Online

```
[Browser หรือ Electron]  ←→  [Backend API]  ←→  [Cloud Database]
                                    ↕
                              [File Storage]
                              [Auth Service]
```

---

## สิ่งที่ต้องเพิ่ม / เปลี่ยน

### 1. Backend API (ใหม่ทั้งหมด)

ต้องมี server รับ request จาก frontend แทนที่ localStorage  
**ตัวเลือกหลัก:**

| ตัวเลือก | ข้อดี | ข้อเสีย |
|---|---|---|
| **Supabase** (แนะนำ) | all-in-one: DB + Auth + Storage + Realtime, ไม่ต้องเขียน backend | vendor lock-in |
| **Firebase** | real-time ดีมาก, ecosystem ใหญ่ | ราคาแพงขึ้นเรื่อยๆ, NoSQL |
| **Node.js + PostgreSQL** | ควบคุมได้ 100%, self-host ได้ | ต้องเขียน backend เอง, ต้อง deploy เอง |

**สำหรับ App นี้แนะนำ Supabase** เพราะ:
- ไม่ต้องเขียน backend ใหม่
- มี Row Level Security ป้องกันข้อมูลแต่ละร้านไม่ปนกัน
- มี Realtime subscription (sync หลายเครื่องได้)
- Free tier เพียงพอสำหรับร้านขนาดเล็ก

---

### 2. Database (เปลี่ยนจาก localStorage)

#### ตาราง (Tables) ที่ต้องสร้าง

| localStorage key เดิม | ตาราง SQL ใหม่ | หมายเหตุ |
|---|---|---|
| `transactions` | `transactions` | เพิ่ม column `shop_id`, `user_id` |
| `wallet_main` | `wallets` | แยก cash/transfer/sub-wallets เป็น row |
| `categories_data` | `categories`, `vendors`, `quick_items` | 3 ตาราง |
| `pending_data` | `pending_payments`, `tax_invoices`, `pending_incomes` | 3 ตาราง |
| `activity_log` | `activity_logs` | เพิ่ม `shop_id` |
| `app_settings` | `shop_settings` | 1 row ต่อ 1 ร้าน |

ทุกตารางต้องเพิ่ม column: `shop_id` (ข้อมูลของร้านไหน), `created_at`, `updated_at`

---

### 3. Authentication (ใหม่ทั้งหมด)

ปัจจุบันไม่มี login — ต้องเพิ่ม:
- **Login / Register** (email + password หรือ Google OAuth)
- **Shop concept** — 1 user อาจมีหลายร้าน หรือ 1 ร้านมีหลาย user
- **Session management** — เก็บ token ใน memory หรือ httpOnly cookie

**หน้าที่ต้องเพิ่ม:**
- `/login` — หน้า login
- `/register` — สมัครสมาชิก + ตั้งชื่อร้าน
- Guard route — redirect ไป `/login` ถ้ายังไม่ login

---

### 4. Store Layer (เปลี่ยนมาก)

**ปัจจุบัน:** Zustand persist → localStorage → อ่าน/เขียนเอง  
**ใหม่:** Zustand เป็นแค่ cache ใน RAM → ทุก action call API → sync กลับ store

ไฟล์ที่ต้องแก้ทั้ง 5 store:

| ไฟล์ | สิ่งที่เปลี่ยน |
|---|---|
| `useTransactionStore.js` | `addTransaction` → POST /api/transactions |
| `useWalletStore.js` | `setCash` → PATCH /api/wallets |
| `useCategoryStore.js` | `addCategory` → POST /api/categories |
| `usePendingStore.js` | `addPending` → POST /api/pending |
| `useLogStore.js` | `addLog` → POST /api/logs |

**แนวทาง:** เพิ่ม layer `api/` ระหว่าง store กับ server  
Store ยังอยู่ไว้เป็น local cache, optimistic update ก่อน แล้วค่อย sync กับ server

---

### 5. File Storage (เปลี่ยนที่เก็บ)

**ปัจจุบัน:** ไฟล์ใบเสร็จ/ใบกำกับภาษี เก็บข้างๆ .exe ผ่าน Electron IPC  
**ใหม่:** อัปโหลดขึ้น cloud storage

| ส่วน | สิ่งที่เปลี่ยน |
|---|---|
| `electron/main.cjs` — `save-file` handler | ยังใช้ได้ถ้า deploy เป็น Electron, ไม่ใช้ถ้าเป็น web |
| `src/lib/fileHelper.js` | เพิ่ม path ใหม่: upload ไป Supabase Storage แทน |
| `FolderManager.jsx` | เปลี่ยนจากเปิด folder ในเครื่อง → แสดงลิสต์ไฟล์จาก cloud |

Storage bucket ที่ต้องสร้าง:
- `receipts/` — ใบเสร็จ
- `taxinvoices/` — ใบกำกับภาษี

---

### 6. Backup / Restore (ปรับปรุง)

**ปัจจุบัน:** อ่าน localStorage ทั้งหมด → export เป็น JSON  
**ใหม่:** มี 2 รูปแบบ

- **Auto cloud backup** — ข้อมูลอยู่ server แล้ว ไม่ต้อง backup เอง
- **Manual export** — ยังทำได้เหมือนเดิม แต่ดึงจาก API แทน localStorage

ไฟล์ `BackupFull.jsx` ต้องเปลี่ยน `localStorage.getItem` → fetch จาก API

---

### 7. Real-time Sync (optional แต่ดีมาก)

ถ้าใช้ Supabase Realtime:
- เปิด 2 เครื่องพร้อมกัน เครื่องหนึ่งเพิ่มรายการ อีกเครื่องได้รับอัตโนมัติ
- ต้อง subscribe ใน store แต่ละตัวตอน init

---

## การ Deploy

### ตัวเลือก A: ยังเป็น Electron + Online
- ข้อดี: หน้าตา UX เหมือนเดิม, ใช้งาน offline ได้บางส่วน
- ข้อเสีย: ต้อง install app, ต้องออก version ใหม่เวลาแก้ bug

### ตัวเลือก B: เปลี่ยนเป็น Web App (แนะนำถ้าทำ online)
- ข้อดี: เปิดจาก browser ได้เลย, อัปเดตทันที, ทุกอุปกรณ์
- ข้อเสีย: ต้องมี hosting (Vercel, Netlify ฟรี), ไม่มี native file access
- **Hosting:** Vercel (frontend) + Supabase (backend/DB/storage) — ฟรีทั้งคู่ระดับเริ่มต้น

---

## ลำดับการทำงาน (Phase)

### Phase 1 — Foundation (ทำก่อน)
1. ตั้ง Supabase project, สร้าง tables ทั้งหมด
2. เพิ่มระบบ Auth (Login/Register/Logout)
3. Guard routes ทั้งหมด

### Phase 2 — Migrate Stores
4. แก้ `useTransactionStore` ให้ใช้ API แทน localStorage
5. แก้ `useWalletStore`
6. แก้ `useCategoryStore`, `usePendingStore`, `useLogStore`
7. ทดสอบ CRUD ทั้งหมดผ่าน API

### Phase 3 — File & Backup
8. ย้าย file storage ไป Supabase Storage
9. แก้ BackupFull ให้ดึงจาก API
10. ทดสอบ export/import

### Phase 4 — Polish
11. Migration tool: แปลงข้อมูลจาก localStorage เดิมไป server (สำหรับผู้ใช้เก่า)
12. Real-time sync
13. ทดสอบ multi-device

---

## ความเสี่ยงและสิ่งที่ต้องระวัง

| ความเสี่ยง | วิธีรับมือ |
|---|---|
| ข้อมูลเก่าในเครื่อง user สูญหาย | ทำ migration tool ใน Phase 4 ก่อนหยุด support offline |
| API ช้า → UX แย่ลง | ใช้ optimistic update (update UI ก่อน แล้วค่อย sync) |
| Offline แล้วใช้ไม่ได้ | เก็บ cache ใน Zustand ไว้อ่าน, แจ้ง user ว่าออฟไลน์อยู่ |
| Security — ข้อมูลร้านปนกัน | Row Level Security ใน Supabase บังคับใส่ทุกตาราง |
| ค่าใช้จ่าย | Supabase free tier: 500MB DB, 1GB storage — เพียงพอสำหรับร้านเล็ก |

---

## สรุปไฟล์ที่ต้องแก้

```
เพิ่มใหม่:
  src/api/               ← layer ติดต่อ Supabase
  src/pages/Login/       ← หน้า login/register
  src/lib/supabase.js    ← supabase client

แก้ทั้งหมด:
  src/store/*.js         ← ทุก store (5 ไฟล์)
  src/lib/fileHelper.js  ← file upload
  src/pages/Backup/BackupFull.jsx

แก้บางส่วน:
  src/router.jsx         ← เพิ่ม auth guard
  src/App.jsx            ← init auth session
  electron/main.cjs      ← ถ้ายังทำ Electron

ไม่ต้องแก้:
  UI components ทั้งหมด (หน้าตาเหมือนเดิม)
  src/lib/csvExporter.js, excelExporter.js, chartExporter.js
  src/pages/Reports/, Dashboard/, Transactions/ (logic ส่วนใหญ่)
```
