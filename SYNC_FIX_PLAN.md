# SYNC_FIX_PLAN.md
# แผนแก้ไขระบบ Cloud Sync ทั้งหมด

> สำหรับ Codex — อ่านทั้งหมดก่อนเริ่ม แล้วทำตามลำดับ Phase ห้ามข้าม

---

## สาเหตุหลักที่ระบบ Sync ไม่ทำงาน (Root Causes)

### 1. `getApiBaseUrl()` คืนค่า Supabase URL ไม่ใช่ Backend URL (CRITICAL)
ไฟล์ `src/services/cloud/cloudConfig.js`:
```js
export function getApiBaseUrl() {
  return getSupabaseUrl()  // ← ผิด! คืนค่า Supabase URL ตลอด
}
```
`.env.example` ไม่มี `VITE_BACKEND_URL` เลย ทำให้ทุกที่ที่เรียก `getApiBaseUrl()` ได้ URL ของ Supabase
ผลลัพธ์:
- `notifyBackend()` ใน `syncApi.js` → POST ไปที่ `https://xxx.supabase.co/api/sync/notify` → **404**
- `buildWsUrl()` ใน `wsClient.js` → connect ไปที่ `wss://xxx.supabase.co/api/sync/ws` → **ไม่มีอยู่**

### 2. `accessToken` บังคับก่อน WebSocket จะ connect (CRITICAL)
ไฟล์ `src/services/cloud/wsClient.js`:
```js
function buildWsUrl(shopId) {
  if (!baseUrl || !config.accessToken || !shopId) return null  // accessToken = null → return null
}
```
App ใช้ custom auth (username/PIN local) ไม่ใช่ Supabase Auth → `accessToken` มักจะว่างเปล่า → WS ไม่เคย connect

### 3. ไม่มี Backend URL แยกใน Config (CRITICAL)
`saveCloudConfig()` force-sync `supabaseUrl` กับ `apiBaseUrl` ให้เท่ากันเสมอ ทำให้ไม่มีทางแยก Backend URL ออกมาได้

### 4. Fallback Poll 5 นาที (HIGH)
เมื่อ WebSocket ไม่ได้ต่อ ระบบจะ sync ทุก **5 นาที** ทำให้ sync ช้ามาก

### 5. Error ถูก Swallow ทิ้งทั้งหมด (HIGH)
ทุก error ถูก `.catch(console.warn)` ผู้ใช้ไม่รู้ว่า sync ทำงานหรือล้มเหลว

---

## วิธีแก้ที่เลือก: แทนที่ Custom WebSocket ด้วย Supabase Realtime Broadcast

**ทำไมถึงเลือกแนวทางนี้:**
- Supabase Realtime ทำงานกับ Supabase URL + Anon Key ที่มีอยู่แล้ว ไม่ต้องการ Backend URL แยก
- ไม่ต้องการ `accessToken` จาก backend
- Real-time จริง (< 500ms) ไม่ใช่ polling
- ลดความซับซ้อนของระบบลงมาก
- `@supabase/supabase-js` มีในโปรเจคอยู่แล้ว

**Flow ใหม่:**
```
Machine A: เพิ่ม transaction
  → pushShopQueue() → supabaseUpsertRows() → ข้อมูลเข้า Supabase ✅
  → broadcastSync() → Supabase Realtime Broadcast channel `shop-sync:{shopId}` ✅

Machine B: ได้รับ Broadcast event
  → onBroadcast() → doPull() → pullAndApplyShop() → อ่าน Supabase ✅
  → rehydrateShopStores() → Zustand โหลดข้อมูลใหม่ → UI อัปเดต ✅
```

---

## ไฟล์ที่ต้องแก้ไข

| ไฟล์ | การกระทำ |
|------|----------|
| `src/services/cloud/realtimeClient.js` | **สร้างใหม่** |
| `src/services/cloud/syncApi.js` | **แก้ไข** — ลบ `notifyBackend`, เพิ่ม `broadcastSync` |
| `src/hooks/useAutoSync.js` | **แก้ไข** — แทน wsClient ด้วย realtimeClient |
| `src/services/cloud/cloudConfig.js` | **แก้ไข** — แยก `getApiBaseUrl` ออกจาก `getSupabaseUrl` |
| `src/services/cloud/wsClient.js` | **ลบทิ้ง** (ไม่ใช้แล้ว) |

Backend ไม่ต้องแก้ไข — endpoint `/notify` และ `/ws` ยังอยู่ได้ไม่เสียหาย

---

## Phase 1: สร้าง `realtimeClient.js` (ไฟล์ใหม่)

**สร้างไฟล์:** `src/services/cloud/realtimeClient.js`

```js
/**
 * realtimeClient.js
 * Supabase Realtime Broadcast — ใช้แทน custom WebSocket
 *
 * ทำงานอย่างไร:
 * - แต่ละ shopId มี channel ชื่อ `shop-sync:{shopId}`
 * - Machine A หลัง push สำเร็จ → broadcastSync() ส่ง event ไปทุกเครื่องใน channel
 * - Machine B ที่ subscribe อยู่ → รับ event → trigger pull ทันที
 * - ไม่ต้องการ accessToken จาก backend
 * - ไม่ต้องการ VITE_BACKEND_URL
 */

import { getSupabaseClient } from './apiClient'
import { getCloudDeviceId } from '../../lib/cloudSyncMetadata'
import { isCloudEnabled } from './cloudConfig'

let activeChannel = null
let activeShopId = null
let onChangesHandler = null

function getChannelName(shopId) {
  return `shop-sync:${shopId}`
}

/**
 * เชื่อมต่อ Realtime channel สำหรับ shop นี้
 * @param {string} shopId
 * @param {function} onChanges - callback เมื่อได้รับ sync event จากเครื่องอื่น
 */
export function connectRealtime(shopId, onChanges) {
  if (!shopId || !isCloudEnabled()) return

  // ถ้า shopId เดิม channel เดิมยังอยู่ ไม่ต้อง reconnect
  if (activeShopId === shopId && activeChannel) return

  disconnectRealtime()

  activeShopId = shopId
  onChangesHandler = onChanges

  try {
    const supabase = getSupabaseClient()
    activeChannel = supabase
      .channel(getChannelName(shopId))
      .on('broadcast', { event: 'sync' }, (msg) => {
        const payload = msg?.payload ?? {}
        // ไม่รับ event ของตัวเอง
        if (payload.fromDeviceId && payload.fromDeviceId === getCloudDeviceId()) return
        if (typeof onChangesHandler === 'function') {
          onChangesHandler(payload.syncedAt ?? null)
        }
      })
      .subscribe((status) => {
        window.dispatchEvent(
          new CustomEvent('zuzoo:realtime-status', { detail: { status, shopId } })
        )
      })
  } catch (err) {
    console.warn('[realtimeClient] connect failed:', err?.message)
  }
}

/**
 * ส่ง Broadcast ไปแจ้งเครื่องอื่นให้ pull ข้อมูลใหม่
 * เรียกหลัง pushShopQueue() สำเร็จ
 * @param {string} shopId
 * @param {string} syncedAt - ISO timestamp ของการ push
 */
export async function broadcastSync(shopId, syncedAt) {
  if (!isCloudEnabled()) return
  if (!activeChannel || activeShopId !== shopId) return

  try {
    await activeChannel.send({
      type: 'broadcast',
      event: 'sync',
      payload: {
        shopId,
        syncedAt: syncedAt ?? new Date().toISOString(),
        fromDeviceId: getCloudDeviceId(),
      },
    })
  } catch (err) {
    // Broadcast failure must not block a completed push
    console.warn('[realtimeClient] broadcast failed:', err?.message)
  }
}

/**
 * ตัดการเชื่อมต่อ Realtime channel
 */
export function disconnectRealtime() {
  if (activeChannel) {
    try {
      activeChannel.unsubscribe()
    } catch {
      // ignore
    }
    activeChannel = null
  }
  activeShopId = null
  onChangesHandler = null
}

/**
 * ตรวจสอบว่า Realtime channel กำลัง subscribe อยู่หรือไม่
 */
export function isRealtimeConnected() {
  return activeChannel !== null
}
```

---

## Phase 2: แก้ไข `syncApi.js`

**ไฟล์:** `src/services/cloud/syncApi.js`

### 2.1 เพิ่ม import `broadcastSync`

เพิ่มที่บรรทัด import บนสุด:
```js
import { broadcastSync } from './realtimeClient'
```

### 2.2 ลบ `notifyBackend()` ทั้งฟังก์ชัน

ลบโค้ดบรรทัด 54–71 ทั้งหมด:
```js
// ลบทิ้งทั้งหมด:
async function notifyBackend(shopId, deviceId, syncedAt) {
  const baseUrl = getApiBaseUrl()
  const config = getCloudConfig()
  if (!baseUrl || !config.accessToken) return
  try {
    await fetch(`${baseUrl}/api/sync/notify`, { ... })
  } catch { /* silent */ }
}
```

### 2.3 แทนที่ `notifyBackend` ด้วย `broadcastSync` ใน `pushShopQueue()`

หาบรรทัดที่มี:
```js
await notifyBackend(shopId, getCloudDeviceId(), syncedAt)
```

แทนที่ด้วย:
```js
await broadcastSync(shopId, syncedAt)
```

### 2.4 ลบ import ที่ไม่ใช้แล้ว

ลบ import `getApiBaseUrl` และ `getCloudConfig` ออกจาก cloudConfig import ถ้าไม่มีที่อื่นใช้:
```js
// เปลี่ยนจาก:
import { getApiBaseUrl, getCloudConfig, isCloudEnabled, saveCloudConfig } from './cloudConfig'
// เป็น:
import { isCloudEnabled, saveCloudConfig } from './cloudConfig'
```

---

## Phase 3: แก้ไข `useAutoSync.js`

**ไฟล์:** `src/hooks/useAutoSync.js`

### 3.1 เปลี่ยน import

ลบ:
```js
import { connectWs, disconnectWs, isWsConnected } from '../services/cloud/wsClient'
```

เพิ่ม:
```js
import { connectRealtime, disconnectRealtime, isRealtimeConnected } from '../services/cloud/realtimeClient'
```

### 3.2 ลด FALLBACK_POLL_MS

เปลี่ยนจาก:
```js
const FALLBACK_POLL_MS = 5 * 60 * 1000  // 5 นาที
```
เป็น:
```js
const FALLBACK_POLL_MS = 60 * 1000  // 1 นาที (fallback ถ้า Realtime ขาด)
```

### 3.3 แทนที่ Logic ทั้งหมดใน `useEffect`

แทนที่ `useEffect` เดิมทั้งหมดด้วยโค้ดใหม่นี้:

```js
useEffect(() => {
  if (!shopId || !isCloudEnabled()) return

  // Initial sync เมื่อเข้าร้าน
  doSync()

  // เชื่อมต่อ Supabase Realtime Broadcast
  // เมื่อเครื่องอื่น push เสร็จ จะ broadcast มาที่นี่ → pull ทันที
  connectRealtime(shopId, () => {
    doPull(shopIdRef.current)
  })

  // Fallback poll — กรณี Realtime ขาดการเชื่อมต่อ
  const fallbackCheckTimer = setTimeout(() => {
    if (!isRealtimeConnected()) startFallbackPoll()
  }, 5_000)

  // Push เมื่อมี queue item ใหม่จาก local action
  const handleQueueUpdated = (event) => {
    if (event.detail?.shopId === shopId) schedulePush()
  }
  window.addEventListener('zuzoo:queue-updated', handleQueueUpdated)

  // Sync เมื่อกลับมา online
  const handleOnline = () => {
    doSync()
    if (!isRealtimeConnected()) startFallbackPoll()
  }
  window.addEventListener('online', handleOnline)

  // ตรวจสอบสถานะ Realtime channel
  const handleRealtimeStatus = (event) => {
    const { status } = event.detail ?? {}
    if (status === 'SUBSCRIBED') {
      stopFallbackPoll()
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      startFallbackPoll()
    }
  }
  window.addEventListener('zuzoo:realtime-status', handleRealtimeStatus)

  return () => {
    disconnectRealtime()
    stopFallbackPoll()
    clearTimeout(fallbackCheckTimer)
    clearTimeout(pushTimerRef.current)
    window.removeEventListener('zuzoo:queue-updated', handleQueueUpdated)
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('zuzoo:realtime-status', handleRealtimeStatus)
  }
}, [shopId, doSync, doPull, schedulePush, startFallbackPoll, stopFallbackPoll])
```

### 3.4 แก้ `startFallbackPoll` — ใช้ `isRealtimeConnected` แทน `isWsConnected`

เปลี่ยนใน `startFallbackPoll`:
```js
// จาก:
if (isWsConnected()) {
// เป็น:
if (isRealtimeConnected()) {
```

### 3.5 ลบ import และ state ที่ไม่ใช้แล้ว

ลบ:
```js
// ลบออก — ไม่ใช้แล้ว
import { connectWs, disconnectWs, isWsConnected } from '../services/cloud/wsClient'
```

---

## Phase 4: แก้ไข `cloudConfig.js`

**ไฟล์:** `src/services/cloud/cloudConfig.js`

### 4.1 แยก `getApiBaseUrl` ออกจาก `getSupabaseUrl`

เปลี่ยนจาก:
```js
export function getApiBaseUrl() {
  return getSupabaseUrl()
}
```

เป็น:
```js
/**
 * ใช้สำหรับ Backend API เท่านั้น (ไม่ใช่ Supabase)
 * ถ้าไม่มี VITE_BACKEND_URL จะ return '' ซึ่งทำให้ฟีเจอร์ Backend-only ถูก skip
 */
export function getApiBaseUrl() {
  const fromEnv = import.meta.env.VITE_BACKEND_URL || ''
  if (fromEnv) return fromEnv.replace(/\/+$/, '')
  const config = getCloudConfig()
  return String(config.backendUrl || '').replace(/\/+$/, '')
}
```

---

## Phase 5: ลบ `wsClient.js`

**ลบไฟล์:** `src/services/cloud/wsClient.js`

ไม่มีที่ไหนใช้แล้วหลังจาก Phase 3 เสร็จ ให้ลบทิ้งเพื่อป้องกันความสับสน

---

## Phase 6: ตรวจสอบ Bug Fixes ที่ต้องมีอยู่แล้ว

### 6.1 `shopSync.js` — `pushShopToCloud` และ `pushAllShopsToCloud`

ตรวจสอบว่าทั้ง 2 ฟังก์ชันมี `name` field ใน rows:

```js
// pushShopToCloud — ต้องมี:
await supabaseUpsertRows('shops', [{
  id: shop.id,
  name: shop.name ?? shop.id,   // ← ต้องมีบรรทัดนี้
  payload: { ...shop, updatedAt: now },
  updated_at: now,
  deleted_at: null,
}])

// pushAllShopsToCloud — ต้องมี:
const rows = shops.map((s) => ({
  id: s.id,
  name: s.name ?? s.id,   // ← ต้องมีบรรทัดนี้
  payload: { ...s, updatedAt: now },
  updated_at: now,
  deleted_at: null,
}))
```

ถ้ายังไม่มี ให้เพิ่ม

### 6.2 `useAutoSync.js` — `rehydrateShopStores` ต้องมีอยู่

ตรวจสอบว่า `rehydrateShopStores()` ถูกเรียกใน `doPull` แล้ว:

```js
const doPull = useCallback(async (id) => {
  if (!id || !isCloudEnabled()) return
  await pullAndApplyShop(id).catch(console.warn)
  await rehydrateShopStores().catch(console.warn)  // ← ต้องมีบรรทัดนี้
}, [])
```

ถ้ายังไม่มี ให้เพิ่ม พร้อม import stores ทั้งหมดที่ด้านบนไฟล์:

```js
import useTransactionStore from '../store/useTransactionStore'
import useWalletStore from '../store/useWalletStore'
import useCategoryStore from '../store/useCategoryStore'
import usePendingStore from '../store/usePendingStore'
import useRecurringStore from '../store/useRecurringStore'
import useLogStore from '../store/useLogStore'

async function rehydrateShopStores() {
  await Promise.all([
    useTransactionStore.persist.rehydrate(),
    useWalletStore.persist.rehydrate(),
    useCategoryStore.persist.rehydrate(),
    usePendingStore.persist.rehydrate(),
    useRecurringStore.persist.rehydrate(),
    useLogStore.persist.rehydrate(),
  ])
}
```

---

## Phase 7: ตั้งค่า Supabase Realtime (ใน Supabase Dashboard)

> **สำคัญ**: Codex ทำส่วนนี้ไม่ได้ — ต้องให้ผู้ดูแลระบบทำเองในขั้นตอนแยก

1. ไปที่ Supabase Dashboard → Project → Realtime
2. ตรวจสอบว่า Realtime service **Enabled**
3. สำหรับ Broadcast: ไม่ต้องเปิด postgres_changes ใดเป็นพิเศษ Broadcast ทำงานได้เลย
4. ถ้าจะใช้ `postgres_changes` ในอนาคต ต้องเปิด Realtime ของแต่ละ table ใน Database → Replication

---

## สรุปไฟล์และการกระทำทั้งหมด

```
src/services/cloud/
├── realtimeClient.js      ← สร้างใหม่ (Phase 1)
├── syncApi.js             ← แก้ไข: ลบ notifyBackend, เพิ่ม broadcastSync (Phase 2)
├── cloudConfig.js         ← แก้ไข: แยก getApiBaseUrl (Phase 4)
├── wsClient.js            ← ลบทิ้ง (Phase 5)
└── shopSync.js            ← ตรวจสอบ name field (Phase 6.1)

src/hooks/
└── useAutoSync.js         ← แก้ไข: ใช้ realtimeClient (Phase 3)
```

---

## ทดสอบหลัง Deploy

1. เปิดแอปบน **Machine A** และ **Machine B** พร้อมกัน เข้าร้านเดียวกัน
2. Machine A: เพิ่ม transaction ใหม่
3. Machine B: ภายใน **1–2 วินาที** ควรเห็น transaction ปรากฏโดยไม่ต้อง refresh
4. ถ้าไม่เร็วขนาดนั้น ให้ตรวจสอบ Browser Console ว่ามี `[realtimeClient]` error หรือไม่
5. ทดสอบ offline: ปิด WiFi บน Machine A → เพิ่มข้อมูล → เปิด WiFi → ภายใน 1 นาที Machine B ควรได้รับข้อมูล (fallback poll)

---

## หมายเหตุสำคัญสำหรับ Codex

- **ห้ามแก้ไข backend** — backend ไม่ใช่ต้นเหตุของปัญหา
- **ห้ามเปลี่ยน `pullAndApplyShop`** — logic การ pull ถูกต้องแล้ว
- **ห้ามเปลี่ยน `pushShopQueue`** — logic การ push ถูกต้องแล้ว
- สิ่งที่เปลี่ยนคือ **transport layer**: จาก custom WebSocket (ที่ connect ผิด URL) เป็น Supabase Realtime Broadcast (ที่ใช้ connection เดิมกับ Supabase)
- `idb-keyval` ยังใช้งานอยู่ใน `cloudSyncMetadata.js` — ไม่ต้องแก้
