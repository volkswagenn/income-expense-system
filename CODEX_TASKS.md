# CODEX TASKS — Income Expense System App
> สรุปการแก้ไขที่เสร็จแล้ว + งานที่ต้องทำต่อ

---

## ✅ DONE — การแก้ไขที่เสร็จในSession นี้

### 1. `src/store/useAuthStore.js` — แยก counter login

**เปลี่ยน:**
- `failedLoginCount` (เดิม) → แยกเป็น `failedPasswordCount` + global `pinFailCount`
- เพิ่ม global state: `pinLocked: false`, `pinFailCount: 0`
- `loginByPinOnly`: ถ้า PIN ผิด → increment `pinFailCount` → ถึง `maxPinLoginAttempts` → `pinLocked = true`
- `loginByPassword` สำเร็จ → reset `pinFailCount = 0, pinLocked = false` (user ไหนก็ได้)
- `recordLoginFailure` ตอนนี้ handle แค่ password failures เท่านั้น
- เพิ่ม `maxPinLoginAttempts` state + `setMaxPinLoginAttempts()`
- `partialize` เพิ่ม `maxPinLoginAttempts`, `pinFailCount`, `pinLocked`
- `normalizeUser`: migrate `failedLoginCount` → `failedPasswordCount`

---

### 2. `src/pages/Login/index.jsx` — PIN Tab ใหม่

**เปลี่ยน:**
- `PinTab` อ่าน `pinLocked`, `pinFailCount`, `maxPinLoginAttempts` จาก store โดยตรง
- ถ้า `pinLocked = true` → แสดง UI "🔒 PIN ถูกล็อคชั่วคราว" แทน keypad
- ถ้า `pinFailCount > 0` → แสดง counter "⚠️ กรอกผิดแล้ว X/N ครั้ง" ใต้ข้อความ
- ลบ User Picker ออก (ไม่ต้องเลือก user ก่อนกด PIN)
- ไม่มี `PinBlockedPopup` แล้ว

---

### 3. `src/pages/Settings/index.jsx` — Login Security Panel

**เปลี่ยน:**
- แยก 2 input ในกรอบเดียว:
  - **👤 ชื่อผู้ใช้/รหัสผ่าน** → `maxLoginAttempts` (เกินกำหนด = block account)
  - **🔢 รหัส PIN** → `maxPinLoginAttempts` (เกินกำหนด = lock PIN ทั้งระบบ)
- ปุ่ม save เดียวบันทึกทั้งสองค่า

---

### 4. `src/pages/History/index.jsx` — Fix Tab Permission Gap

**เปลี่ยน:**
```js
// ❌ เดิม (bypass ได้ถ้ามี VIEW_HISTORY)
const hasParentDirectly = role === 'superadmin' || userRoleObj?.permissions?.includes(P.VIEW_HISTORY)
const canViewAllTab = hasParentDirectly || checkPermission(...)

// ✅ ใหม่ (strict — ต้องมี permission tab โดยตรง)
const canViewAllTab   = checkPermission(roles, role, P.VIEW_HISTORY_ALL)
const canViewMoneyTab = checkPermission(roles, role, P.VIEW_HISTORY_MONEY)
```

---

### 5. `src/pages/GlobalHistory/index.jsx` — Fix Tab Permission Gap

เหมือน History แต่ใช้ `P.VIEW_GLOBAL_HISTORY_ALL` และ `P.VIEW_GLOBAL_HISTORY_MONEY`

---

### 6. `src/components/layout/Navbar.jsx` — Fix Permission Checks

**เปลี่ยน:**
- Import เพิ่ม: `useRoleStore`, `checkPermission`, `getRoleInfo`, `P`
- เพิ่ม: `canManageSettings`, `canAccessUsersPage`, `roleInfo`
- ปุ่ม "ตั้งค่าระบบ" → ครอบด้วย `{canManageSettings && ...}` (เดิมแสดงทุก user)
- ปุ่ม "จัดการผู้ใช้" → ใช้ `canAccessUsersPage` แทน `role === 'admin'` (superadmin เห็นด้วย)
- Role badge → ใช้ `roleInfo.icon + roleInfo.label` แทน hardcode

---

---

## 🔲 TODO — งานที่ต้องทำต่อ (Supabase Integration)

### TASK A — Navbar: เพิ่มปุ่ม Sync Cloud

**ไฟล์:** `src/components/layout/Navbar.jsx`

เพิ่มปุ่ม sync ใน Navbar แสดงเฉพาะเมื่อ cloud enabled:

```
[🔄] หรือ [☁️ ซิงก์]
```

**Spec:**
- อ่าน `cloudConfig.enabled` จาก `services/cloud/cloudConfig.js`
- ถ้า enabled → แสดงปุ่ม (icon + status indicator)
- Status:
  - idle → ☁️ สีเทา
  - syncing → 🔄 หมุน
  - success → ✅ สีเขียว (3 วิ แล้วกลับ idle)
  - error → ⚠️ สีแดง (แสดง tooltip error)
- กดปุ่ม → trigger `pushAllShopQueues()` + `pullAndApplyAllShops()`
- วางไว้ก่อนปุ่ม avatar user (ฝั่งขวา)
- แสดงเฉพาะใน Navbar ของระบบร้านค้า (ไม่แสดงใน HomeNavbar)

---

### TASK B — Supabase: สร้าง Project + Schema

**สร้าง tables ใน Supabase:**

#### Global Tables
```sql
-- shops
CREATE TABLE shops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color_id TEXT,
  config JSONB DEFAULT '{}',
  device_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- users (local auth, sync ขึ้นเพื่อ multi-device)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  role TEXT,
  shop_access TEXT[],
  password_hash TEXT,
  pin_hash TEXT,
  is_blocked BOOLEAN DEFAULT FALSE,
  blocked_reason TEXT,
  device_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- roles
CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  shop_id TEXT,
  label TEXT,
  icon TEXT,
  badge_class TEXT,
  permissions TEXT[],
  is_system BOOLEAN DEFAULT FALSE,
  locked BOOLEAN DEFAULT FALSE,
  device_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Per-Shop Tables (ทุก table มี shop_id, device_id, updated_at, deleted_at)
```sql
-- transactions, pending_payments, pending_incomes, tax_invoices
-- recurring_items, recurring_entries
-- categories, vendors, quick_items
-- sub_wallets, loans
-- wallet_state (1 row ต่อ shop)
-- activity_logs

-- Pattern:
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  device_id TEXT,
  payload JSONB NOT NULL,   -- full record
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
-- Repeat for all per-shop tables
```

**RLS Policy:**
```sql
-- ใช้ service_role key จาก backend relay → bypass RLS
-- หรือ custom claim: shop_id ใน JWT
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop_isolation" ON transactions
  USING (shop_id = current_setting('app.current_shop_id', true));
```

---

### TASK C — Replace apiClient.js ด้วย Supabase

**ไฟล์:** `src/services/cloud/apiClient.js`

เปลี่ยนจาก custom fetch → Supabase JS SDK:

```
เดิม:
  POST /api/sync/push    → ใหม่: supabase.from(tableName).upsert(records)
  GET  /api/sync/pull    → ใหม่: supabase.from(tableName).select().gt('updated_at', since)
  POST /api/auth/refresh → ใหม่: supabase.auth.refreshSession() หรือ custom JWT
  GET  /health           → ใหม่: supabase.from('shops').select('id').limit(1)
```

**Config ที่ต้องเปลี่ยน** ใน `cloudConfig.js`:
```js
{
  enabled: boolean,
  supabaseUrl: string,      // เดิม apiBaseUrl
  supabaseAnonKey: string,  // new
  accessToken: string,      // Supabase session token
  // ... ที่เหลือเหมือนเดิม
}
```

---

### TASK D — Supabase Push Logic

**ไฟล์:** `src/services/cloud/syncApi.js`

แทนที่ `pushShopQueue()` ให้ใช้ Supabase SDK:

1. ดึง queue items ที่ `status = PENDING` ของ shop
2. Group by `tableName`
3. สำหรับ `action = 'upsert'` → `supabase.from(tableName).upsert(payload, { onConflict: 'id' })`
4. สำหรับ `action = 'delete'` → `supabase.from(tableName).update({ deleted_at: now }).eq('id', recordId)`
5. อัปเดต queue item status เป็น SYNCED / FAILED

---

### TASK E — Supabase Pull Logic

**ไฟล์:** `src/services/cloud/pullApply.js`

แทนที่ `pullAndApplyShop()` ให้ใช้ Supabase SDK:

1. ดึง `lastPullAt` จาก localStorage
2. Query: `supabase.from(tableName).select().eq('shop_id', shopId).gt('updated_at', lastPullAt).neq('device_id', myDeviceId)`
3. Apply ตาม TABLE_TARGETS เหมือนเดิม (logic conflict resolution ไม่เปลี่ยน)
4. อัปเดต `lastPullAt`

---

### TASK F — Settings Page: Cloud Config UI

**ไฟล์:** `src/pages/Settings/index.jsx`

เพิ่ม Tab ใหม่: **☁️ Cloud Sync** (แสดงเฉพาะ superadmin)

Fields:
- Toggle on/off
- Supabase URL input
- Supabase Anon Key input
- ปุ่ม "ทดสอบการเชื่อมต่อ" (health check)
- สถานะ last sync per shop
- ปุ่ม "Full Sync" (force pull ทั้งหมด)
- ปุ่ม "Reset Queue" (clear stuck items)

---

### TASK G — Migration Tool (First Sync)

เมื่อ user เปิด cloud เป็นครั้งแรก:
1. ตรวจว่า Supabase ว่างเปล่า (ไม่มีข้อมูล shop นี้)
2. ถ้าว่าง → push ข้อมูล localStorage ทั้งหมดขึ้น Supabase ครั้งเดียว
3. ถ้าไม่ว่าง → pull ลงมา merge

---

## 📋 สรุป Priority

| # | Task | Priority | หมายเหตุ |
|---|------|----------|----------|
| A | Navbar Sync Button | สูง | UX entry point |
| B | Supabase Schema | สูง | ต้องทำก่อนอื่น |
| C | Replace apiClient | สูง | core layer |
| D | Push Logic | สูง | - |
| E | Pull Logic | สูง | - |
| F | Settings Cloud UI | กลาง | ปรับจากที่มีอยู่ |
| G | Migration Tool | กลาง | first-time setup |

---

## 🏗️ Architecture Summary

```
[Local Zustand Store] 
       ↓ on change
[Cloud Sync Queue] (localStorage)
       ↓ manual trigger (Navbar button)
[syncApi.js → Supabase SDK]
       ↓
[Supabase Database]
       ↑ pull delta
[pullApply.js → Zustand Store]
```

**Sync Frequency:** Manual (ปุ่ม Navbar) + Auto pull เมื่อเปิดร้าน  
**Conflict:** Last-write-wins (updatedAt) + Local pending blocks cloud overwrite  
**Auth:** Local auth คงไว้ / Supabase ใช้ service key ผ่าน backend relay  
**Realtime:** ❌ ไม่ใช้ Supabase Realtime  
