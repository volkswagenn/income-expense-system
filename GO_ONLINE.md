# JodFlow — ขั้นตอนการนำระบบขึ้นออนไลน์ (runbook)

เอกสารนี้คือ **ลำดับงานที่ต้องทำจริง** เพื่อเปลี่ยน JodFlow จากแอปในเครื่อง (localStorage)
ไปเป็นเว็บแอปออนไลน์บน Vercel + Supabase ตามแบบใน [ARCHITECTURE.md](ARCHITECTURE.md)

- ARCHITECTURE.md = *ระบบจะหน้าตาแบบไหน*
- ไฟล์นี้ = *ต้องกดอะไร เขียนอะไร ตามลำดับไหน และรู้ได้ยังไงว่าผ่าน*

---

## 0. สถานะปัจจุบัน (อัปเดต 2 ก.ย. 2026)

| ส่วน | สถานะ |
|---|---|
| แบบสถาปัตยกรรม `ARCHITECTURE.md` | ✅ เสร็จ |
| ฐานข้อมูล `supabase/setup.sql` (= schema + columns + policies + functions + wallet + card) | ✅ ติดตั้งบน Supabase แล้ว |
| **แพตช์ `supabase/fix.sql`** (post_transaction, คอลัมน์ recurring_entries, edit_transaction, bucket) | ⚠️ **ต้องรันบนฐานข้อมูลที่ติดตั้งไว้แล้ว** — ไม่รัน = รายการที่บันทึกไม่มีชื่อ/หมวด และหน้ารายการประจำใช้ไม่ได้ |
| **แพตช์ `supabase/card.sql`** (บัตรเครดิตทั้งระบบ: รอบบิล จ่ายบิล ผ่อนชำระ เงินคืน หักบัญชีจำลอง) | ⚠️ **ต้องรันหลัง `fix.sql`** — ไม่รัน = หัวข้อบัตรเครดิตว่างเปล่าและเลือกบัตรในฟอร์มไม่ได้ (ส่วนอื่นของแอปยังใช้ได้ตามปกติ) |
| **แพตช์ `supabase/debt.sql`** (หนี้สินและลูกหนี้: ตาราง `debts`, `debt_entries`, ระยะสั้น/ยาว, ทับ `clear_shop_data`) | ⚠️ ต้องรันหลัง `card.sql` — ไม่รัน = หัวข้อหนี้สินว่างเปล่า (ส่วนอื่นยังใช้ได้) |
| **แพตช์ `supabase/account.sql`** (บัญชีธนาคาร: ประเภทบัญชี, เลขบัญชี) | ⚠️ รันเมื่อไรก็ได้ — ไม่รัน = บันทึกบัญชีจากเมนู "จัดการข้อมูล" ไม่ได้ (คอลัมน์ไม่มี) |
| **`card.sql` รอบใหม่** (กดเงินสด `card_advances`, จ่ายเกินเป็นเครดิต, ค่าธรรมเนียมรายปี) | ⚠️ รัน `card.sql` ซ้ำทั้งไฟล์ — ไม่รัน = ปุ่มกดเงินสดกับค่าธรรมเนียมรายปีใช้ไม่ได้ |
| `vercel.json` + `.env.example` + `.env.local` | ✅ พร้อม |
| `src/lib/supabase.js`, `src/lib/api/`, `src/auth/` | ✅ เสร็จ |
| store ทั้ง 8 ตัว | ✅ ไม่มี `persist` แล้ว เป็นแคชของเซิร์ฟเวอร์ |
| งานที่แตะเงิน | ✅ ผ่าน RPC ทั้งหมด (post/edit/cancel_transaction, pay/receive, move_*, borrow/return) |
| Realtime (`src/lib/realtime.js`) | ✅ ฟัง postgres_changes ทุกตารางของร้าน + refetch ตอนกลับมาที่แท็บ |
| ไฟล์แนบ (`src/lib/api/attachments.js`) | ✅ อัปโหลดขึ้น bucket `attachments` + ดูผ่าน signed URL |
| สิทธิ์ตาม role ใน UI | ⚠️ viewer ยังเห็นปุ่มแก้ไข (ฐานข้อมูลปฏิเสธให้ แต่ UI ยังไม่ซ่อน) |
| เช็คลิสต์ก่อนใช้จริง (ข้อ 4) | ❌ ยังไม่ได้ทดสอบ |

ลำดับการรัน SQL บนฐานข้อมูลที่ติดตั้งไปแล้ว: `fix.sql` → `card.sql` → `debt.sql` → `account.sql` (รันซ้ำได้ ไม่ลบข้อมูล)
ฐานข้อมูลใหม่เอี่ยม: `setup.sql` ไฟล์เดียวจบ เพราะรวม card ไว้ให้แล้ว
`card.sql` ทับฟังก์ชันชุดเดียวกับ `fix.sql` จึงต้องรันทีหลังเสมอ และถ้ารัน `columns.sql` ใหม่เมื่อไร
ต้องรัน `card.sql` ซ้ำอีกครั้ง เพราะ `columns.sql` จะตั้ง constraint ของ `transactions.method` กลับเป็นชุดที่ไม่มี `'card'`

ไฟล์ SQL ในโฟลเดอร์ `supabase/` ตอนนี้: `setup.sql` (ติดตั้งครั้งแรกทั้งชุด), `fix.sql` (แพตช์ฐานข้อมูลเดิม),
`card.sql` (บัตรเครดิตทั้งระบบ รวมกดเงินสด/จ่ายเกิน/ค่าธรรมเนียมรายปี), `debt.sql` (หนี้สินและลูกหนี้),
`account.sql` (บัญชีธนาคาร: ประเภท/เลขบัญชี),
`recurring.sql` (แพตช์รายการประจำ), `check.sql` / `access.sql` (ตรวจ/ซ่อมสิทธิ์)
ชื่อไฟล์ `01_schema.sql` … `05_wallet_functions.sql` ที่อ้างถึงด้านล่างคือชื่อเดิมของ `schema.sql` … `wallet.sql`

---

## 1. ข้อสรุปที่ตัดสินใจแล้ว + เรื่องที่ต้องอุดก่อนเริ่ม

### 1.1 อีเมล — ✅ ตัดสินใจแล้ว: **ปิดการยืนยันอีเมล ไม่ต่อ SMTP**

Authentication → Providers → Email → ปิด **"Confirm email"**

**ผลที่ตามมาที่ต้องรับรู้:**
- ไม่มีอีเมลออกจากระบบเลย → **หน้า "ลืมรหัสผ่าน" ใช้ไม่ได้จริง** อย่าใส่ปุ่มนั้นในเฟส 2 (หรือใส่แล้วให้ข้อความว่า "ติดต่อเจ้าของร้าน")
- ใครลืมรหัสผ่าน → owner เข้า Supabase → Authentication → Users → เลือกคนนั้น → **Reset password** ตั้งใหม่ให้
- ถ้าวันหลังมีสมาชิกเยอะขึ้นจนวิธีนี้ไม่ไหว ค่อยกลับมาต่อ SMTP (Resend/Brevo มี free tier) แล้วเปิด "Confirm email" กลับ — เปลี่ยนทีหลังได้ ไม่ต้องแก้โค้ด

### 1.2 การเพิ่มสมาชิก — ✅ ตัดสินใจแล้ว: **owner สร้างบัญชีให้เองจากหน้า Supabase**

**ไม่ต้องเขียนโค้ดเพิ่มเลย** — ตัดปัญหา service_role key และ policy `profiles_select` ทิ้งไปทั้งหมด

ขั้นตอนตอนจะเพิ่มคน (owner ทำเอง ~1 นาทีต่อคน):

1. Supabase → Authentication → Users → **Add user** → ใส่อีเมล + รหัสผ่านชั่วคราว → ติ๊ก **Auto Confirm User**
2. รัน SQL นี้เพื่อดึงเข้าร้าน (แก้อีเมลกับ role ตามต้องการ):

```sql
insert into shop_members (shop_id, user_id, role)
select s.id, u.id, 'editor'          -- 'editor' หรือ 'viewer'
  from shops s, auth.users u
 where s.name = 'ร้านของฉัน' and u.email = 'สมาชิก@example.com'
on conflict (shop_id, user_id) do update set role = excluded.role;
```

3. บอกอีเมล + รหัสผ่านให้เจ้าตัวปากเปล่า แล้วให้เขาเปลี่ยนรหัสเองในแอป (ต้องมีหน้า "เปลี่ยนรหัสผ่าน" ในเฟส 2 — `supabase.auth.updateUser({ password })` บรรทัดเดียว **อันนี้ทำงานได้ไม่ต้องพึ่งอีเมล**)

> ⚠️ **หน้า "จัดการสมาชิก" ในแอปจึงเป็นแค่หน้าอ่านอย่างเดียว** (ดูรายชื่อ + เปลี่ยน role ของคนที่อยู่ในร้านแล้ว)
> การเพิ่ม/ลบคนทำจาก Supabase console เท่านั้น — เฟส 6 เบาลงมาก

### 1.3 RPC ที่ยังขาด — งานแตะเงินหลายสเต็ปยังไม่มีตัวรองรับ

`03_functions.sql` มี `post_transaction` / `cancel_transaction` / `adjust_*` แล้ว แต่ `src/lib/walletEngine.js`
มีงานที่ **ขยับเงิน 2 ก้อนในครั้งเดียว** ซึ่งถ้าปล่อยให้ client เรียก `apply_wallet_effect` สองรอบ
แล้วเน็ตหลุดคั่นกลาง = เงินหายจริง ต้องเพิ่ม RPC ให้ครบก่อนเฟส 4:

| ฟังก์ชันเดิมใน walletEngine.js | RPC ที่ต้องเพิ่ม |
|---|---|
| `transferBetweenWallets` (เงินสด ↔ บัญชีโอน) | `move_cash_transfer(...)` |
| `depositToSubWallet` / `withdrawFromSubWallet` | `move_sub_wallet(...)` |
| `transferBetweenSubWallets` | `move_between_sub_wallets(...)` |
| `borrowFromSubWallet` (ตัดกระเป๋าย่อย + เข้าเงินสด/โอน + insert `loans`) | `borrow_from_sub_wallet(...)` |
| `returnLoan` (ตัดเงินสด/โอน + คืนกระเป๋าย่อย + update `loans`) | `return_loan(...)` |
| จ่ายรายการค้าง (insert tx + ปิด pending + ตัดเงิน + log) | `pay_pending_payment(...)` |
| รับเงินที่รออยู่ (insert tx + ปิด pending + เพิ่มเงิน + log) | `receive_pending_income(...)` |

### 1.4 ข้อมูลเดิมในเครื่อง — ✅ ตัดสินใจแล้ว: **เริ่มจากศูนย์ ไม่ย้ายข้อมูลเก่า**

🔴 **ทำก่อนแตะโค้ดบรรทัดแรก**: เปิดแอปเวอร์ชันปัจจุบัน → หน้า **Backup** → กด export ทั้ง `.json` และ `.xlsx`
เก็บไว้นอกโฟลเดอร์โปรเจกต์ เพราะพอเข้าเฟส 8 หน้า restore จะถูกรื้อทิ้ง และข้อมูลใน localStorage
จะกู้ไม่ได้อีกเลยถ้าเผลอล้าง browser data

### 1.5 เก็บงานปัจจุบันเข้า git ก่อน

ตอนนี้ working tree มีไฟล์ถูกลบค้างไว้เยอะมาก (backend/, electron/, เอกสาร planning เก่า ~40 ไฟล์)
ยังไม่ได้ commit → **ยังไม่มีจุดย้อนกลับ** ควร commit สถานะนี้ก่อนเริ่มแตะโค้ดใหม่

```bash
git add -A && git commit -m "chore: reset to v3 online-first baseline"
```

---

## 2. งานบน console (ทำเอง ~30 นาที ไม่ต้องแตะโค้ด)

ทำได้เลยตอนนี้ ไม่ต้องรอโค้ดเสร็จ

| # | ทำที่ไหน | ทำอะไร | เช็คยังไงว่าผ่าน |
|---|---|---|---|
| 2.1 | supabase.com | สร้าง project ใหม่ เลือก region **Singapore** (ใกล้ไทยสุด) ตั้งรหัส DB แล้ว**เก็บไว้ให้ดี** | project ขึ้นสถานะ Active |
| 2.2 | SQL Editor | รัน `supabase/01_schema.sql` | Table Editor เห็นตารางครบ 20 ตาราง |
| 2.3 | SQL Editor | รัน `supabase/02_policies.sql` | ทุกตารางมีป้าย "RLS enabled" และมี bucket `attachments` |
| 2.4 | SQL Editor | รัน `supabase/03_functions.sql` | Database → Functions เห็น `post_transaction` ฯลฯ |
| 2.5 | Authentication → Providers | เปิด Email, **ปิด "Confirm email"** (ตามข้อ 1.1) | — |
| 2.6 | Authentication → Users | กด **Add user** สร้างบัญชี owner ของคุณเอง ติ๊ก **Auto Confirm User** | ตาราง `profiles` มีแถวนั้นโผล่เอง (พิสูจน์ว่า trigger ทำงาน) |
| 2.7 | SQL Editor | สร้างร้านแรก (ดูคำสั่งข้างล่าง) | `shop_members` มีคุณเป็น `owner`, `wallet_state`/`categories` ถูกสร้างให้อัตโนมัติ |
| 2.8 | Settings → API | คัดลอก **Project URL** + **anon public key** ใส่ไฟล์ `.env.local` | ดูข้อ 3.1 |

คำสั่งข้อ 2.7 — **แก้อีเมลทั้ง 1 จุดให้เป็นอีเมลที่สร้างไว้ในข้อ 2.6 ก่อนกด Run**:

```sql
do $$
declare v_user uuid; v_shop uuid;
begin
  select id into v_user from auth.users where email = 'อีเมลคุณ@example.com';
  if v_user is null then
    raise exception 'ไม่พบผู้ใช้อีเมลนี้ — ทำข้อ 2.6 (Add user) ให้เสร็จก่อน';
  end if;

  insert into shops (name, created_by) values ('ร้านของฉัน', v_user) returning id into v_shop;

  insert into shop_members (shop_id, user_id, role) values (v_shop, v_user, 'owner')
  on conflict (shop_id, user_id) do update set role = 'owner';

  raise notice 'สร้างร้านเรียบร้อย shop_id = %', v_shop;
end $$;
```

> ⚠️ **ต้องรัน `01_schema.sql` เวอร์ชันล่าสุดก่อน** — เวอร์ชันแรกมีบั๊ก: trigger `handle_new_shop` เรียก
> `auth.uid()` ซึ่งใน SQL Editor เป็น NULL เสมอ แล้ว insert ชน NOT NULL → **พังทั้งคำสั่ง**
> (`on conflict do nothing` กันแค่คีย์ซ้ำ ไม่ได้กันค่าว่าง) เวอร์ชันปัจจุบันครอบ `if auth.uid() is not null` ไว้แล้ว
> ถ้ารันไฟล์เก่าไปแล้ว ให้รันเฉพาะบล็อก `create or replace function public.handle_new_shop()` ใหม่อีกรอบ

---

## 3. งานฝั่งโค้ด — 9 เฟส แต่ละเฟสจบแล้วต้องทดสอบผ่านจริงก่อนไปต่อ

### เฟส 1 — ต่อ Supabase ให้ติด
- `npm i @supabase/supabase-js`
- สร้าง `.env.local` จาก `.env.example` ใส่ค่าจริง (ไฟล์นี้อยู่ใน .gitignore แล้ว ✅)
- สร้าง `src/lib/supabase.js` → `createClient(import.meta.env.VITE_SUPABASE_URL, ...ANON_KEY)`
- **ผ่านเมื่อ**: `npm run dev` แล้วเรียก `supabase.from('shops').select()` ใน console ไม่ error

### เฟส 2 — Auth
- `src/auth/AuthProvider.jsx` (session + profile + shop + role), `LoginPage.jsx`, `RequireAuth.jsx`
- **ไม่ต้องทำหน้า "ลืมรหัสผ่าน"** (ไม่มี SMTP ตามข้อ 1.1) — แต่**ต้องมี "เปลี่ยนรหัสผ่าน"** ในหน้าตั้งค่า
  ผ่าน `supabase.auth.updateUser({ password })` เพราะสมาชิกใหม่ทุกคนได้รหัสชั่วคราวมาจาก owner
- แก้ `src/main.jsx`: ตัด `fetch('./SettingApp.txt')` ออก → เช็ค session ก่อน render
- ลบ `public/SettingApp.txt` + `src/lib/settingParser.js`, เวอร์ชันอ่านจาก `package.json` แทน
- **ผ่านเมื่อ**: ปิดแท็บแล้วเปิดใหม่ยังล็อกอินค้างอยู่ / กด logout แล้วเด้งกลับหน้า login / เปลี่ยนรหัสผ่านแล้วล็อกอินด้วยรหัสใหม่ได้

### เฟส 3 — ชั้น `src/lib/api/` + รื้อ store (**เฟสที่ใหญ่ที่สุด**)
- เขียน `api/` ทีละโดเมนตาม ARCHITECTURE.md ข้อ 4
- ทุก store: ตัด `persist(...)` + `migrate` + `onRehydrateStorage` ออก, action ทุกตัวเป็น async
- เลิกสร้าง id เองด้วย `uuid` (9 ไฟล์) → ใช้ค่าที่ insert คืนมา
- ลำดับ boot: `Promise.all` โหลดข้อมูลตั้งต้น → มีหน้า loading + หน้า error + ปุ่มลองใหม่
- **ผ่านเมื่อ**: ล้าง localStorage ทิ้งทั้งหมดแล้ว refresh ข้อมูลยังอยู่ครบ

### เฟส 4 — ย้ายงานที่แตะเงินไป RPC
- เพิ่ม RPC ที่ขาดตามข้อ 1.3 ลงใน `03_functions.sql` แล้วรันซ้ำ (ทุกฟังก์ชันเป็น `create or replace` รันทับได้ปลอดภัย)
- รื้อ `src/lib/walletEngine.js` ให้เรียก RPC แทนการคำนวณใน JS
- **ผ่านเมื่อ**: เปิด 2 เบราว์เซอร์ กดบันทึกรายจ่ายพร้อมกัน → ยอดเงินลดครบทั้ง 2 รายการ ไม่ทับกัน

### เฟส 5 — Realtime
- `src/lib/realtime.js` subscribe `postgres_changes` ตาม `shop_id` → fan-out เข้า store
- refetch ใหม่ทั้งชุดตอน `visibilitychange` กลับมา active
- **ผ่านเมื่อ**: เครื่อง A บันทึก เครื่อง B เห็นภายใน ~1 วินาทีโดยไม่ต้อง refresh

### เฟส 6 — สิทธิ์ตาม role + หน้าสมาชิก (เบาลงมากหลังตัดสินใจข้อ 1.2)
- `RequireRole.jsx` + ซ่อน/ปิดปุ่มทั้งหมดที่ viewer ห้ามใช้
- หน้า "สมาชิก" = **อ่านอย่างเดียว** — แสดงรายชื่อ + role จาก `shop_members` join `profiles`
  (owner เปลี่ยน role ได้จากในแอป เพราะ policy `shop_members_write` อนุญาต แต่ **เพิ่ม/ลบคนทำที่ Supabase console**)
- **ผ่านเมื่อ**: ล็อกอินด้วย viewer แล้วกดแก้ไม่ได้ **และ** ยิง insert ตรงจาก console ก็โดน RLS ปฏิเสธ

### เฟส 7 — ไฟล์แนบขึ้น Storage
- อัปโหลดตามพาธ `<shop_id>/<receipts|taxinvoices>/<YYYY>/<MM>/<file>` เก็บ path ลง `attachments jsonb`
- `AttachmentViewer` เปิดดูผ่าน `createSignedUrl(path, 60)`
- **ผ่านเมื่อ**: แนบบิลจากมือถือ แล้วเปิดดูได้จากคอมอีกเครื่อง
- ⚠️ policy ใน `02_policies.sql:117` cast โฟลเดอร์แรกเป็น uuid — ถ้าพาธผิดรูปจะ **error แปลกๆ แทนที่จะขึ้นว่าไม่มีสิทธิ์** ต้องคุมพาธให้ถูกจาก client เสมอ
- ⚠️ `clear_shop_data` ลบเฉพาะแถวใน DB **ไม่ได้ลบไฟล์ใน Storage** → ไฟล์จะค้างกินพื้นที่ ควรลบไฟล์จาก client ก่อนเรียก RPC

### เฟส 8 — เก็บกวาด localStorage ที่เหลือ
- `src/lib/appDataKeys.js` → เรียก RPC `clear_shop_data` แทน
- หน้า Backup: เหลือแค่ "ส่งออก" (ตัด restore จากไฟล์ทิ้ง), ค่า `notifyDaysBefore` ย้ายไป `shop_settings`
- หน้า History ต้องทำ pagination (ไม่มีเพดาน 5,000 log แล้ว จะโหลดทั้งตารางไม่ไหว)
- **ผ่านเมื่อ**: `grep -rn "localStorage" src/` เหลือเฉพาะ `useFormDraft` (ร่างในแท็บ ไม่ใช่ข้อมูลระบบ)

### เฟส 9 — ขึ้น Vercel
- push ขึ้น GitHub → Vercel import repo → framework auto-detect เป็น Vite
- ใส่ env `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` ให้ **ทั้ง Production และ Preview**
- Supabase → Authentication → URL Configuration: Site URL = โดเมนจริง, เพิ่มโดเมน preview ลง Redirect URLs
  (ยังต้องตั้งแม้ไม่ใช้อีเมล — supabase-js ใช้ค่านี้ตรวจ redirect ตอนจัดการ session)
- **ผ่านเมื่อ**: เปิดจากมือถือผ่าน 4G ล็อกอิน บันทึกรายการ แล้วเห็นบนคอมทันที

---

## 4. เช็คลิสต์ก่อนประกาศใช้จริง

- [ ] ลองล็อกอินด้วยบัญชี viewer แล้วยิง `insert` ตรงจาก DevTools → **ต้องโดนปฏิเสธ**
- [ ] เปิดแอปโดย**ไม่ล็อกอิน** แล้วยิง `select` ตรงจาก DevTools → ต้องได้ผลลัพธ์ว่าง
- [ ] ปิดเน็ตกลางคัน → ต้องมี UI แจ้งชัดเจน ไม่ใช่เงียบแล้วข้อมูลหาย
- [ ] ยอดเงินหลังทดสอบยิงพร้อมกัน 2 เครื่อง ตรงกับที่ควรเป็น
- [ ] Supabase → Database → Backups เปิด PITR ไว้ (แผน Free เก็บย้อนหลังได้จำกัด — ถ้าข้อมูลสำคัญควรอัป Pro)
- [ ] ตั้งเตือนตัวเอง: **project ที่ไม่มีคนใช้เกิน 1 สัปดาห์บนแผน Free จะถูก pause อัตโนมัติ**
- [ ] `service_role` key ไม่โผล่ที่ไหนในโค้ด: `grep -rn "service_role" src/` ต้องว่าง

## 5. หลังขึ้นระบบ

- log จะโตขึ้นเรื่อยๆ ไม่มีเพดานแล้ว → ทำปุ่มลบ log เก่าให้ owner
- หน้า Dashboard/รายงานต้อง query แบบมีช่วงวันที่เสมอ อย่าดึงทั้งตาราง
- เก็บ export รายเดือนไว้เองสักชุด เผื่อกรณีเลวร้ายที่สุด

---

## สรุปว่าตอนนี้ควรทำอะไรก่อน

ตัดสินใจครบแล้วทั้ง 3 ข้อ (1.1 ปิดยืนยันอีเมล / 1.2 owner สร้างบัญชีจาก console / 1.4 เริ่มจากศูนย์)
เหลือแค่ลงมือ:

1. 🔴 **export ข้อมูลเดิมจากหน้า Backup เก็บไว้** (ข้อ 1.4) — ทำก่อนอย่างอื่นทั้งหมด
2. commit สถานะปัจจุบัน (ข้อ 1.5) — 1 นาที
3. ทำข้อ 2 ทั้งหมดบน console ให้จบ (~30 นาที) — ทำคู่ขนานกับการเขียนโค้ดได้
4. เริ่มเฟส 1 → 9 ตามลำดับ ห้ามข้าม (เฟส 3 ใหญ่สุด, เฟส 4 ต้องเพิ่ม RPC ตามข้อ 1.3 ก่อน)

> เหลือเรื่องเดียวที่ยังไม่ได้ตัดสิน: **RPC ที่ขาด 7 ตัวในข้อ 1.3** — อันนั้นไม่ใช่ทางเลือก แต่เป็นงานที่ต้องเขียนเพิ่ม
> ยังไม่ต้องรีบ ทำตอนเข้าเฟส 4
