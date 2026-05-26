# แผนแก้ไขระบบ Cloud Sync — Option A: Event-Driven WebSocket

> วันที่วิเคราะห์: 2026-05-26  
> สถานะ: วางแผนเสร็จ — ยังไม่ได้แก้โค้ด

---

## 1. สาเหตุที่ระบบปัจจุบันไม่ทำงาน

### ปัญหาหลัก: มี 2 เส้นทางข้อมูลที่ไม่เชื่อมกัน

ระบบปัจจุบันมีสถาปัตยกรรมที่แตกแยกออกจากกัน:

```
เส้นทาง A (Frontend ใช้จริง):
  syncApi.js → supabaseUpsertRows() → Supabase Tables โดยตรง
  pullApply.js → supabaseSelectRows() → Supabase Tables โดยตรง

เส้นทาง B (Backend มีแต่ Frontend ไม่เรียก):
  POST /api/sync/push → sync_records table (Prisma) → wsManager.notify()
  GET /api/sync/pull → sync_records table (Prisma)
  WS /api/sync/ws → รอรับ notify แต่ไม่มีใครส่ง
```

**ผลลัพธ์:** `wsManager.notify()` ไม่เคยถูกเรียกเลย เพราะ Frontend ไม่ได้ใช้ Backend `/push`  
**ผลลัพธ์:** WebSocket ทั้งระบบไม่มีประโยชน์ในสภาพปัจจุบัน

---

## 2. ปัญหาทั้งหมดที่ค้นพบ

| # | ปัญหา | ไฟล์ที่เกี่ยวข้อง | ความรุนแรง |
|---|---|---|---|
| 1 | Frontend ไม่ connect WebSocket เลย | `useAutoSync.js` | 🔴 วิกฤต |
| 2 | Polling 30 วินาทีเป็น mechanism หลัก | `useAutoSync.js` line 7 | 🔴 วิกฤต |
| 3 | Push ไป Supabase โดยตรงโดยไม่แจ้ง Backend → WS ไม่ fire | `syncApi.js` | 🔴 วิกฤต |
| 4 | Queue เก็บใน localStorage (5MB limit, synchronous blocking) | `cloudSyncMetadata.js` | 🟡 สำคัญ |
| 5 | Conflict resolution ใช้ client clock (เครื่องต่างกัน เวลาต่างกัน) | `pullApply.js` line 42-46 | 🟡 สำคัญ |
| 6 | Pull ดึงทุกตารางทุกครั้ง (13 tables per pull cycle) | `pullApply.js` line 144 | 🟠 ปานกลาง |
| 7 | WebSocket ไม่มี reconnect logic ฝั่ง client | ไม่มีไฟล์นี้เลย | 🔴 วิกฤต |
| 8 | Token หมดอายุระหว่าง pull ไม่มี retry | `pullApply.js` | 🟠 ปานกลาง |

---

## 3. สถาปัตยกรรมใหม่

### Flow หลัก (ปกติ — WS ต่ออยู่)

```
เครื่อง A:
  1. ผู้ใช้แก้ข้อมูล
  2. enqueueCloudChange() → ยิง event 'zuzoo:queue-updated'
  3. useAutoSync รับ event → debounce 1.5 วิ → pushShopQueue()
  4. pushShopQueue() → supabaseUpsertRows() → Supabase (เหมือนเดิม)
  5. pushShopQueue() → POST /api/sync/notify (ใหม่) → backend ส่ง WS notify

เครื่อง B (เปิดอยู่):
  6. รับ WS message {type: 'changes', syncedAt}
  7. เรียก pullAndApplyShop() ทันที
  8. pullApply ดึงข้อมูลจาก Supabase (เหมือนเดิม)
  9. apply ข้อมูลลง localStorage → UI อัปเดต
```

### Flow สำรอง (WS หลุด)

```
เครื่อง B (WS หลุด):
  → useAutoSync ตรวจว่า WS ไม่ได้ต่ออยู่
  → เปิด fallback polling ทุก 5 นาที (จาก 30 วินาที)
  → พยายาม reconnect WebSocket ด้วย exponential backoff
  → เมื่อ reconnect สำเร็จ → pull ทันที + ปิด fallback polling
```

### Diagram

```
┌─────────────┐     push data      ┌──────────────────┐
│  เครื่อง A  │──────────────────→ │  Supabase Tables │
│             │   POST /notify     │  (transactions,  │
│             │──────────────────→ │   categories...) │
└─────────────┘                    └──────────────────┘
                                           ↑ pull
┌─────────────┐    WS message      ┌──────────────────┐
│  เครื่อง B  │ ←────────────────  │  Backend Fastify │
│  (ได้รับ    │                    │  /api/sync/ws    │
│   ทันที)    │──────────────────→ │  /api/sync/notify│
└─────────────┘    pull Supabase   └──────────────────┘
```

---

## 4. รายละเอียดการเปลี่ยนแปลงแต่ละไฟล์

---

### 4.1 Backend — `backend/src/modules/sync/sync.routes.ts`

**การเปลี่ยนแปลง:** เพิ่ม endpoint `/notify` ใหม่ ไม่แตะ endpoint เดิมเลย

**เพิ่มต่อท้ายใน `syncRoutes` function:**

```typescript
// POST /api/sync/notify
// Lightweight endpoint: ส่ง WS notification เท่านั้น ไม่บันทึก DB
app.post('/notify', async (request, reply) => {
  const input = z.object({
    shopId: z.string().min(1),
    deviceId: z.string().min(1).default('unknown-device'),
    syncedAt: z.string().datetime().optional(),
  }).parse(request.body)

  if (!await requireShopAccess(request, reply, input.shopId)) return reply

  const syncedAt = input.syncedAt ?? new Date().toISOString()
  wsManager.notify(input.shopId, input.deviceId, syncedAt)

  return { ok: true, syncedAt }
})
```

**ไม่ต้องแก้ไข:** `ws.manager.ts`, `sync.ws.ts`, `allowedTables.ts`, `sanitize.ts`

---

### 4.2 Frontend ใหม่ — `src/services/cloud/wsClient.js`

**การเปลี่ยนแปลง:** สร้างไฟล์ใหม่ทั้งหมด — WebSocket client พร้อม auto-reconnect

```javascript
// src/services/cloud/wsClient.js

import { getCloudConfig, getApiBaseUrl } from './cloudConfig'
import { getCloudDeviceId } from '../../lib/cloudSyncMetadata'

const RECONNECT_BASE_MS   = 2_000   // delay เริ่มต้นก่อน reconnect
const RECONNECT_MAX_MS    = 60_000  // delay สูงสุด 60 วินาที
const RECONNECT_FACTOR    = 2       // exponential backoff multiplier

// State ของ singleton WS client
let socket           = null
let reconnectTimer   = null
let reconnectDelay   = RECONNECT_BASE_MS
let isDestroyed      = false
let activeShopId     = null
let onChangesHandler = null

// --- Helper: สร้าง WebSocket URL ---
function buildWsUrl(shopId) {
  const baseUrl = getApiBaseUrl()
  const config  = getCloudConfig()

  if (!baseUrl || !config.accessToken || !shopId) return null

  // เปลี่ยน https → wss, http → ws
  const wsBase   = baseUrl.replace(/^https/, 'wss').replace(/^http(?!s)/, 'ws')
  const deviceId = getCloudDeviceId()
  const params   = new URLSearchParams({
    token:    config.accessToken,
    shopId:   shopId,
    deviceId: deviceId,
  })
  return `${wsBase}/api/sync/ws?${params}`
}

// --- Helper: schedule reconnect ด้วย exponential backoff ---
function scheduleReconnect() {
  if (isDestroyed) return
  clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => {
    if (!isDestroyed) connectWs(activeShopId, onChangesHandler)
  }, reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay * RECONNECT_FACTOR, RECONNECT_MAX_MS)
}

// --- ตรวจสอบสถานะ ---
export function isWsConnected() {
  return socket !== null && socket.readyState === WebSocket.OPEN
}

// --- เชื่อมต่อ WebSocket ---
export function connectWs(shopId, onChanges) {
  // ปิด socket เดิมก่อน
  if (socket) {
    socket.onclose = null
    socket.onerror = null
    socket.close()
    socket = null
  }

  isDestroyed      = false
  activeShopId     = shopId
  onChangesHandler = onChanges

  const url = buildWsUrl(shopId)
  if (!url) return // cloud ไม่ได้ตั้งค่า หรือไม่มี token

  try {
    socket = new WebSocket(url)
  } catch {
    scheduleReconnect()
    return
  }

  socket.onopen = () => {
    reconnectDelay = RECONNECT_BASE_MS // reset backoff เมื่อ connect สำเร็จ
  }

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      if (msg.type === 'changes' && typeof onChangesHandler === 'function') {
        onChangesHandler(msg.syncedAt)
      }
    } catch {
      // invalid JSON — ignore
    }
  }

  socket.onclose = (event) => {
    socket = null
    // 4001 = token invalid, 4002 = missing shopId → ไม่ reconnect
    if (!isDestroyed && event.code !== 4001 && event.code !== 4002) {
      scheduleReconnect()
    }
  }

  socket.onerror = () => {
    // onclose จะถูกเรียกต่อเอง
  }
}

// --- ตัดการเชื่อมต่อ (เมื่อออกจากร้าน หรือ logout) ---
export function disconnectWs() {
  isDestroyed  = true
  activeShopId = null
  clearTimeout(reconnectTimer)
  if (socket) {
    socket.onclose = null
    socket.onerror = null
    socket.close()
    socket = null
  }
}
```

---

### 4.3 Frontend — `src/services/cloud/syncApi.js`

**การเปลี่ยนแปลง:** เพิ่มการเรียก `/api/sync/notify` หลัง push สำเร็จ

**เพิ่ม import ที่หัวไฟล์:**
```javascript
import { getCloudConfig, getApiBaseUrl } from './cloudConfig'
```

**เพิ่มฟังก์ชัน helper ใหม่ (ก่อน `pushShopQueue`):**
```javascript
async function notifyBackend(shopId, deviceId, syncedAt) {
  const baseUrl = getApiBaseUrl()
  const config  = getCloudConfig()
  if (!baseUrl || !config.accessToken) return

  try {
    await fetch(`${baseUrl}/api/sync/notify`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${config.accessToken}`,
      },
      body: JSON.stringify({ shopId, deviceId, syncedAt }),
    })
  } catch {
    // notify failure ห้ามขัด local push — silent fail
  }
}
```

**แก้ไขใน `pushShopQueue` — หลัง `saveCloudConfig(...)` สำเร็จ:**
```javascript
// เดิม:
markCloudQueueItemsSynced(shopId, applied, syncedAt)
pruneSyncedCloudQueueItems(shopId)
saveCloudConfig({ lastSyncAt: syncedAt, lastSyncError: null })
return { ok: true, applied, failed, syncedAt }

// ใหม่: เพิ่มบรรทัด notifyBackend ก่อน return
markCloudQueueItemsSynced(shopId, applied, syncedAt)
pruneSyncedCloudQueueItems(shopId)
saveCloudConfig({ lastSyncAt: syncedAt, lastSyncError: null })
await notifyBackend(shopId, getCloudDeviceId(), syncedAt)  // <-- เพิ่ม
return { ok: true, applied, failed, syncedAt }
```

---

### 4.4 Frontend — `src/hooks/useAutoSync.js`

**การเปลี่ยนแปลง:** แทนที่ 30s polling ด้วย WebSocket + fallback 5 นาที

**ไฟล์ใหม่ทั้งหมด:**

```javascript
// src/hooks/useAutoSync.js

import { useCallback, useEffect, useRef } from 'react'
import { isCloudEnabled } from '../services/cloud/cloudConfig'
import { pushShopQueue } from '../services/cloud/syncApi'
import { pullAndApplyShop } from '../services/cloud/pullApply'
import { getPendingCloudQueueItems } from '../lib/cloudSyncMetadata'
import { connectWs, disconnectWs, isWsConnected } from '../services/cloud/wsClient'

// Fallback polling เปิดเฉพาะตอน WS หลุด
const FALLBACK_POLL_MS  = 5 * 60 * 1000   // 5 นาที (จาก 30 วินาที)
const PUSH_DEBOUNCE_MS  = 1500            // เหมือนเดิม

export function useAutoSync(shopId) {
  const shopIdRef     = useRef(shopId)
  shopIdRef.current   = shopId
  const pushTimerRef  = useRef(null)
  const pollTimerRef  = useRef(null)
  const isSyncingRef  = useRef(false)

  // --- Push ---
  const doPush = useCallback(async (id) => {
    if (!id || !isCloudEnabled()) return
    const pending = getPendingCloudQueueItems(id, 1)
    if (pending.length === 0) return
    await pushShopQueue(id).catch(console.warn)
  }, [])

  // --- Pull ---
  const doPull = useCallback(async (id) => {
    if (!id || !isCloudEnabled()) return
    await pullAndApplyShop(id).catch(console.warn)
  }, [])

  // --- Sync = push + pull ---
  const doSync = useCallback(async () => {
    const id = shopIdRef.current
    if (!id || !isCloudEnabled() || isSyncingRef.current) return
    isSyncingRef.current = true
    try {
      await doPush(id)
      await doPull(id)
    } finally {
      isSyncingRef.current = false
    }
  }, [doPush, doPull])

  // --- Debounced push เมื่อ queue มีของ ---
  const schedulePush = useCallback(() => {
    clearTimeout(pushTimerRef.current)
    pushTimerRef.current = setTimeout(() => {
      doPush(shopIdRef.current)
    }, PUSH_DEBOUNCE_MS)
  }, [doPush])

  // --- Fallback poll (เปิดเมื่อ WS หลุด) ---
  const startFallbackPoll = useCallback(() => {
    if (pollTimerRef.current) return // กำลัง poll อยู่แล้ว
    pollTimerRef.current = setInterval(() => {
      // ถ้า WS reconnect สำเร็จแล้ว ให้หยุด poll
      if (isWsConnected()) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
        return
      }
      doSync()
    }, FALLBACK_POLL_MS)
  }, [doSync])

  const stopFallbackPoll = useCallback(() => {
    clearInterval(pollTimerRef.current)
    pollTimerRef.current = null
  }, [])

  useEffect(() => {
    if (!shopId || !isCloudEnabled()) return

    // 1. Sync ครั้งแรกเมื่อเข้าร้าน
    doSync()

    // 2. เชื่อม WebSocket
    connectWs(shopId, (_syncedAt) => {
      // ได้รับ notification จากเครื่องอื่น → pull ทันที
      doPull(shopIdRef.current)
      // หยุด fallback poll เพราะ WS ทำงานแล้ว
      stopFallbackPoll()
    })

    // 3. Fallback poll เผื่อ WS หลุด (ตรวจหลังจาก connect ได้ 5 วินาที)
    const fallbackCheckTimer = setTimeout(() => {
      if (!isWsConnected()) startFallbackPoll()
    }, 5_000)

    // 4. Push ทันทีเมื่อ enqueue มีของ
    const handleQueueUpdated = (e) => {
      if (e.detail?.shopId === shopId) schedulePush()
    }
    window.addEventListener('zuzoo:queue-updated', handleQueueUpdated)

    // 5. Sync เมื่อกลับมา online
    const handleOnline = () => {
      doSync()
      if (!isWsConnected()) startFallbackPoll()
    }
    window.addEventListener('online', handleOnline)

    return () => {
      disconnectWs()
      stopFallbackPoll()
      clearTimeout(fallbackCheckTimer)
      clearTimeout(pushTimerRef.current)
      window.removeEventListener('zuzoo:queue-updated', handleQueueUpdated)
      window.removeEventListener('online', handleOnline)
    }
  }, [shopId, doSync, doPull, schedulePush, startFallbackPoll, stopFallbackPoll])
}
```

---

## 5. สรุปการเปลี่ยนแปลงทั้งหมด

### ไฟล์ที่ต้องแก้ไข

| ไฟล์ | ประเภท | สิ่งที่เปลี่ยน |
|---|---|---|
| `backend/src/modules/sync/sync.routes.ts` | แก้ไข | เพิ่ม `POST /api/sync/notify` endpoint |
| `src/services/cloud/syncApi.js` | แก้ไข | เพิ่ม `notifyBackend()` + เรียกหลัง push สำเร็จ |
| `src/hooks/useAutoSync.js` | เขียนใหม่ | แทนที่ 30s poll ด้วย WebSocket + fallback 5 นาที |
| `src/services/cloud/wsClient.js` | สร้างใหม่ | WebSocket client singleton พร้อม auto-reconnect |

### ไฟล์ที่ไม่ต้องแก้ไขเลย

- `src/services/cloud/pullApply.js` — pull logic ยังคงเดิม
- `src/services/cloud/apiClient.js` — Supabase client ยังคงเดิม
- `src/services/cloud/cloudConfig.js` — config ยังคงเดิม
- `src/services/cloud/authSync.js` — auth sync ยังคงเดิม
- `src/services/cloud/shopSync.js` — shop sync ยังคงเดิม
- `src/lib/cloudSyncMetadata.js` — queue management ยังคงเดิม
- `backend/src/modules/sync/ws.manager.ts` — ไม่ต้องแก้
- `backend/src/modules/sync/sync.ws.ts` — ไม่ต้องแก้

---

## 6. ผลลัพธ์ที่คาดหวังหลังแก้ไข

| Metric | ก่อน | หลัง |
|---|---|---|
| HTTP requests ต่อชั่วโมง (ไม่มีการแก้ข้อมูล) | ~120 ครั้ง (30s polling) | ~0-2 ครั้ง (heartbeat เท่านั้น) |
| เวลา sync หลังเครื่องอื่นแก้ข้อมูล | 0–30 วินาที (รอ poll รอบหน้า) | < 1 วินาที (WS notification) |
| หน้าเว็บค้าง | มี (poll ทุก 30 วิ) | ไม่มี (event-driven) |
| Sync เมื่อ WS หลุด | poll ทุก 30 วิเหมือนเดิม | poll ทุก 5 นาที + reconnect อัตโนมัติ |
| จำนวนไฟล์ที่ต้องแก้ | — | 4 ไฟล์ (1 ใหม่, 3 แก้) |

---

## 7. ลำดับการ implement ที่แนะนำ

```
Step 1: Backend — เพิ่ม POST /api/sync/notify ใน sync.routes.ts
Step 2: Frontend — สร้าง src/services/cloud/wsClient.js
Step 3: Frontend — แก้ src/services/cloud/syncApi.js (เพิ่ม notifyBackend)
Step 4: Frontend — เขียนใหม่ src/hooks/useAutoSync.js
Step 5: ทดสอบด้วยเครื่อง 2 เครื่อง (หรือ 2 tab)
```

---

## 8. ข้อควรระวังสำหรับ Codex

1. **`wsClient.js` ต้องเป็น singleton** — ห้ามสร้าง WebSocket ใหม่ทุกครั้งที่ component re-render
2. **`notifyBackend()` ใน syncApi.js ต้อง silent fail** — ถ้า notify ล้มเหลว ห้าม throw error ขัด push ที่สำเร็จแล้ว
3. **`disconnectWs()` ต้องเรียกใน cleanup** ของ useEffect ทุกครั้ง เพื่อป้องกัน memory leak
4. **WebSocket URL** ต้องเปลี่ยน `https://` → `wss://` และ `http://` → `ws://`
5. **Token หมดอายุ:** ถ้า WS close ด้วย code 4001 (Invalid token) → ไม่ต้อง reconnect, ต้อง refresh token ก่อน
6. **ห้ามแก้ไข** `pullApply.js`, `apiClient.js`, `cloudSyncMetadata.js` — เส้นทาง data ยังคงเดิม

---

*จบแผน — พร้อมส่งให้ Codex implement*
