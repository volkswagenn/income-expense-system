# JodFlow — สถาปัตยกรรมระบบออนไลน์ (Vercel + Supabase)

เอกสารนี้คือแบบของระบบหลังเปลี่ยนจากแอปที่เก็บข้อมูลในเครื่อง (localStorage) มาเป็น
**เว็บแอปออนไลน์เต็มรูปแบบ ไม่มีโหมด local เลย** — เปิดเว็บ → ล็อกอิน → ข้อมูลทั้งหมดอยู่บน Supabase

## 1. ภาพรวม

```
                ┌──────────────────────────────┐
   ผู้ใช้ ──────▶│  Vercel (static hosting)     │   ไฟล์ที่ vite build ออกมา
                │  React SPA (Vite)            │   ไม่มี server ของเราเอง
                └───────────────┬──────────────┘
                                │  supabase-js (HTTPS + WebSocket)
                ┌───────────────▼──────────────────────────────────┐
                │  Supabase                                        │
                │   • Auth        — อีเมล + รหัสผ่าน                │
                │   • Postgres    — ข้อมูลทั้งหมด + RLS + RPC       │
                │   • Realtime    — ทุกเครื่องเห็นการแก้ทันที        │
                │   • Storage     — ไฟล์แนบ (ใบเสร็จ/ใบกำกับภาษี)   │
                └──────────────────────────────────────────────────┘
```

**ไม่ต้องมี backend เขียนเอง และไม่ต้องใช้ Vercel Serverless Function** — เบราว์เซอร์คุยกับ
Supabase ตรงๆ ผ่าน anon key ส่วนความปลอดภัยบังคับด้วย RLS ที่ฐานข้อมูล

> anon key เป็นค่าสาธารณะ ใครเปิด DevTools ก็เห็น — **RLS คือด่านเดียวที่กันข้อมูลจริง**
> ห้ามนำ `service_role` key มาไว้ฝั่ง client ไม่ว่ากรณีใด

## 2. โครงสร้างผู้ใช้และสิทธิ์

| ตาราง | หน้าที่ |
|---|---|
| `auth.users` | Supabase Auth จัดการเอง (อีเมล + รหัสผ่าน) |
| `profiles` | ชื่อที่แสดง ผูก 1:1 กับ auth.users (สร้างอัตโนมัติด้วย trigger) |
| `shops` | ร้าน = ขอบเขตข้อมูล 1 ชุด |
| `shop_members` | ใครอยู่ร้านไหน role อะไร |

**role มี 3 ระดับ**

| role | ดูข้อมูล | บันทึก/แก้ไข | จัดการสมาชิก + ตั้งค่า + ล้างข้อมูล |
|---|:--:|:--:|:--:|
| `owner` | ✅ | ✅ | ✅ |
| `editor` | ✅ | ✅ | ❌ |
| `viewer` | ✅ | ❌ | ❌ |

ตอนนี้ใช้ร้านเดียว แต่สคีมารองรับหลายร้านอยู่แล้ว (ทุกตารางมี `shop_id`) — วันหลังจะเปิดหลายร้าน
ก็แค่เพิ่มหน้าสลับร้าน ไม่ต้องแก้ฐานข้อมูล

**การเพิ่มสมาชิก**: owner เชิญจากหน้า "สมาชิก" → ระบบเรียก Supabase Auth ให้ส่งอีเมลเชิญ →
เมื่อผู้ถูกเชิญตั้งรหัสผ่านเสร็จ owner กดกำหนด role ให้ (หรือใช้ตาราง `shop_invites` ในเฟสถัดไป
ถ้าอยากให้ผูก role ล่วงหน้าอัตโนมัติ)

## 3. ฐานข้อมูล

ไฟล์ SQL รันตามลำดับใน Supabase SQL Editor:

| ไฟล์ | เนื้อหา |
|---|---|
| [supabase/01_schema.sql](supabase/01_schema.sql) | ตารางทั้งหมด + index + trigger + เปิด realtime |
| [supabase/02_policies.sql](supabase/02_policies.sql) | RLS ทุกตาราง + policy ของ Storage |
| [supabase/03_functions.sql](supabase/03_functions.sql) | RPC สำหรับงานที่ต้องจบในครั้งเดียว |

### ตารางข้อมูล (ทุกตารางมี `shop_id`)

- **เงิน** — `wallet_state` (เงินสด), `transfer_accounts` (บัญชีธนาคาร), `sub_wallets`, `loans`
- **อ้างอิง** — `categories` (2 ชั้น แยก income/expense), `vendors`, `quick_items`
- **ธุรกรรม** — `transactions`, `pending_payments`, `pending_incomes`, `tax_invoices`
- **รายการประจำ** — `recurring_items`, `recurring_entries` (unique `recurring_id + month` → กด generate ซ้ำไม่เกิดรายการซ้ำ)
- **อื่นๆ** — `calendar_notes`, `activity_logs`, `shop_settings`

### จุดสำคัญที่ต่างจากของเดิม

**1. ยอดเงินต้องขยับผ่าน RPC เท่านั้น**
ของเดิมทำงานคนเดียวจึงอ่านยอด → บวกเลขใน JS → เขียนกลับได้ พอมีหลายคนออนไลน์พร้อมกัน
วิธีนี้จะทำให้ยอดหาย (สองคนกดพร้อมกัน คนหลังเขียนทับคนแรก)
ทุกการขยับยอดจึงต้องเป็น `set balance = balance + delta` ที่ฝั่ง Postgres ผ่านฟังก์ชัน
`adjust_cash` / `adjust_transfer_account` / `adjust_sub_wallet` / `apply_wallet_effect`

**2. งานหลายสเต็ปต้องอยู่ใน transaction เดียว**
เช่น "บันทึกรายจ่าย" = insert transaction + ตัดเงิน + เขียน log ถ้าทำแยก 3 คำสั่งแล้วเน็ตหลุด
กลางทาง ข้อมูลจะเพี้ยน → รวมเป็น RPC เดียว: `post_transaction(...)`, `cancel_transaction(...)`

**3. เลิกใช้ id ที่ client สร้าง (uuid v4 จาก JS)**
ใช้ `gen_random_uuid()` ของ Postgres เป็นค่า default แล้วให้ insert คืน row กลับมา

**4. หมวดหมู่ "อื่นๆ" ไม่ใช่ค่าคงที่ในโค้ดอีกต่อไป**
ของเดิมฮาร์ดโค้ด `cat-8` / `cat-income-1` — ตอนนี้ trigger สร้างให้ตอนสร้างร้าน แล้ว client
หา fallback ด้วย query (`type = 'expense' and parent_id is null and name = 'อื่นๆ'`)

## 4. โครงสร้างฝั่ง client

```
src/
  lib/
    supabase.js          createClient จาก VITE_SUPABASE_URL / ANON_KEY
    api/                 ชั้นเข้าถึงข้อมูล 1 ไฟล์ต่อโดเมน — ที่เดียวที่รู้จัก supabase
      transactions.js    list / create (post_transaction) / update / cancel
      wallet.js          ยอดเงิน + บัญชีโอน + กระเป๋าย่อย + ยืม-คืน (เรียก RPC)
      pending.js         ค้างชำระ / รอรับเงิน / ใบกำกับภาษี
      recurring.js       รายการประจำ + entries
      categories.js      หมวดหมู่ / ผู้ขาย / รายการด่วน
      notes.js  logs.js  settings.js  members.js  storage.js
    realtime.js          subscribe postgres_changes ตาม shop_id แล้วยิงเข้า store
  auth/
    AuthProvider.jsx     session + profile + shop + role (React context)
    LoginPage.jsx        อีเมล + รหัสผ่าน / ลืมรหัสผ่าน
    RequireAuth.jsx      กันเส้นทางที่ยังไม่ล็อกอิน
    RequireRole.jsx      กันปุ่ม/หน้าที่ viewer ห้ามใช้
  store/                 zustand เหมือนเดิม แต่ตัด persist ออก
```

**store เปลี่ยนบทบาท** จาก "ที่เก็บข้อมูลถาวร" → "แคชของข้อมูลบนเซิร์ฟเวอร์"

- ตัด `persist(...)` ออกทุกตัว และตัด `migrate` / `onRehydrateStorage` ที่มีไว้แก้ข้อมูลเก่า
- action ทุกตัวกลายเป็น async: เรียก `api/*` → สำเร็จค่อย `set(...)`
- ใช้ optimistic update ได้ในงานที่ผิดพลาดยาก (แก้โน้ต) ส่วนงานที่แตะเงินให้รอผลจริงจากเซิร์ฟเวอร์
- ยอดเงินหลัง RPC ให้ใช้ค่าที่ฟังก์ชันคืนกลับมา ไม่คำนวณเองซ้ำ

**ลำดับการเปิดแอป**

```
main.jsx
  └─ getSession()
       ├─ ไม่มี session → <LoginPage/>
       └─ มี session → โหลด profile + shop + role
                        → โหลดข้อมูลตั้งต้นทั้งหมดขนานกัน (Promise.all)
                        → เปิด realtime subscription
                        → render <RouterProvider/>
```

ระหว่างโหลดแสดงหน้า loading, ถ้าโหลดไม่สำเร็จแสดงหน้า error + ปุ่มลองใหม่
(ระบบนี้ออนไลน์อย่างเดียว — ออฟไลน์ = ใช้งานไม่ได้ ต้องบอกผู้ใช้ตรงๆ ไม่ใช่เงียบแล้วข้อมูลหาย)

**สิ่งที่ต้องถอดออกจากโค้ดปัจจุบัน**

| ของเดิม | ทำอย่างไร |
|---|---|
| `src/lib/appDataKeys.js` (ล้าง localStorage) | เปลี่ยนเป็น RPC `clear_shop_data` (เฉพาะ owner) |
| `main.jsx` fetch `SettingApp.txt` | เลิกใช้ — เวอร์ชันอ่านจาก `package.json` ผ่าน `import.meta.env`, ค่า `notifyDaysBefore` ย้ายไป `shop_settings` |
| `public/SettingApp.txt` | ลบทิ้ง |
| หน้า Backup → Restore จากไฟล์ .json | เปลี่ยนเป็น "ส่งออกข้อมูล" อย่างเดียว (ดาวน์โหลด .json/.xlsx จากข้อมูลบนคลาวด์) ส่วนการกู้คืนใช้ point-in-time recovery ของ Supabase |
| `sessionStorage` draft (`useFormDraft`) | เก็บไว้ได้ เป็นแค่ร่างในแท็บ ไม่ใช่ข้อมูลระบบ |

## 5. Realtime

subscribe ครั้งเดียวต่อ 1 ร้าน แล้ว fan-out เข้า store:

```js
supabase.channel(`shop:${shopId}`)
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'transactions', filter: `shop_id=eq.${shopId}` },
      handleTransactionChange)
  // ...ทำแบบเดียวกันกับตารางที่เหลือ
  .subscribe()
```

- ตารางที่เปิด realtime ไว้แล้วอยู่ท้ายไฟล์ `01_schema.sql`
- เมื่อ tab กลับมา active (`visibilitychange`) ให้ refetch ข้อมูลใหม่ทั้งชุด กัน event ที่ตกหล่นตอนหลับ

## 6. ไฟล์แนบ (Supabase Storage)

- bucket `attachments` แบบ private
- พาธบังคับ: `<shop_id>/<receipts|taxinvoices>/<YYYY>/<MM>/<filename>` — RLS อ่าน `shop_id`
  จากส่วนแรกของพาธ ทำให้ข้ามร้านกันไม่ได้
- อัปโหลด: `supabase.storage.from('attachments').upload(path, file)` แล้วเก็บ **path** ลงคอลัมน์
  `attachments jsonb` ของรายการนั้น
- แสดงผล: ขอ `createSignedUrl(path, 60)` ตอนเปิดดู → `AttachmentViewer` กลับมา preview รูป/PDF
  ได้จริงอีกครั้ง (ตอนนี้ทำไม่ได้เพราะไฟล์ไปอยู่ในโฟลเดอร์ดาวน์โหลดของผู้ใช้)

## 7. Deploy

**Vercel** — import repo → Framework `Vite` → build `npm run build` → output `dist`
ตั้ง Environment Variables ทั้ง Production/Preview:

| ตัวแปร | ค่า |
|---|---|
| `VITE_SUPABASE_URL` | จาก Supabase → Settings → API |
| `VITE_SUPABASE_ANON_KEY` | anon public key |

[vercel.json](vercel.json) มี rewrite ทุกเส้นทางไป `index.html` ไว้แล้ว

**Supabase** — Authentication → URL Configuration ใส่ Site URL เป็นโดเมนจริงบน Vercel และเพิ่ม
โดเมน preview ลง Redirect URLs (ไม่งั้นลิงก์ยืนยันอีเมล/รีเซ็ตรหัสผ่านจะเด้งกลับผิดที่)

**เรื่องเส้นทาง URL**: ตอนนี้ใช้ `createHashRouter` (URL เป็น `/#/dashboard`) ซึ่งใช้งานได้เลย
ถ้าอยากได้ URL สวย (`/dashboard`) ต้องเปลี่ยนเป็น `createBrowserRouter` **พร้อมกับ** แก้
`base: './'` เป็น `base: '/'` ใน [vite.config.js](vite.config.js) — สองอย่างนี้ต้องเปลี่ยนคู่กัน
ไม่งั้นหน้าที่ลึกกว่า 1 ชั้นจะโหลด asset ไม่เจอ

## 8. ลำดับการทำงาน (แนะนำทำทีละเฟส แต่ละเฟสจบแล้วใช้งานได้)

| เฟส | งาน | ผลลัพธ์ที่ตรวจได้ |
|---|---|---|
| 1 | สร้างโปรเจกต์ Supabase, รัน SQL ทั้ง 3 ไฟล์, ตั้ง env, `src/lib/supabase.js` | ต่อฐานข้อมูลได้ |
| 2 | Auth: LoginPage, AuthProvider, RequireAuth, สร้างร้านแรก + owner | ล็อกอินแล้วเข้าแอปได้ |
| 3 | ชั้น `api/` + แปลง store ทุกตัวเป็น async, ลำดับ boot, ตัด persist | ข้อมูลทั้งหมดอ่าน/เขียนบนคลาวด์ |
| 4 | ย้ายงานที่แตะเงินไปใช้ RPC (`post_transaction`, `cancel_transaction`, `adjust_*`) | เปิด 2 เครื่องกดพร้อมกัน ยอดไม่เพี้ยน |
| 5 | Realtime + refetch ตอน tab กลับมา | เครื่อง A บันทึก เครื่อง B เห็นใน ~1 วินาที |
| 6 | สิทธิ์ตาม role: ซ่อน/ปิดปุ่มสำหรับ viewer + หน้าจัดการสมาชิก | viewer กดแก้ไม่ได้ทั้ง UI และ DB |
| 7 | ไฟล์แนบขึ้น Storage + preview ด้วย signed URL | แนบบิลแล้วเปิดดูได้จากทุกเครื่อง |
| 8 | รื้อหน้า Backup เป็น export อย่างเดียว, ย้าย settings ไป `shop_settings` | ไม่มีอะไรอ้าง localStorage เหลือ |
| 9 | Deploy Vercel + ตั้ง redirect URL + ทดสอบจริงบนมือถือ | ใช้งานจริงได้ |

## 9. ข้อควรระวัง

- **ทุกตารางต้องมี RLS** ลืมเปิดแม้ตารางเดียว = ข้อมูลร้านอื่นรั่วทันที (นโยบายใน `02_policies.sql`
  วน loop ครอบทุกตารางไว้แล้ว เพิ่มตารางใหม่ต้องเพิ่มชื่อเข้า array ด้วย)
- **`activity_logs` ห้ามแก้ย้อนหลัง** — policy อนุญาตแค่ insert/select และให้ owner ลบได้ (ล้าง log เก่า)
- **ไม่มีเพดาน 5,000 log แบบเดิมแล้ว** เพราะไม่ติดโควตา localStorage แต่ควรมีปุ่มลบ log เก่า
  และหน้า History ต้องใช้ pagination แทนการโหลดทั้งหมด
- **จำนวนแถวโตขึ้นเรื่อยๆ** — หน้า Dashboard/รายงานต้อง query แบบมีช่วงวันที่เสมอ อย่าดึงทั้งตาราง
- **ออฟไลน์ = ใช้ไม่ได้** ตามที่ออกแบบไว้ ต้องมี UI แจ้งเตือนชัดเจนเมื่อ request ล้มเหลว
- **ข้อมูลเดิมใน localStorage จะไม่ถูกย้าย** ตามที่ตกลงกันไว้ — เริ่มจากศูนย์บนคลาวด์
