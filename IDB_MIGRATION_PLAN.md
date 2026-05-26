# แผนย้าย Storage จาก localStorage → IndexedDB (idb-keyval)

> วันที่วางแผน: 2026-05-26  
> สถานะ: พร้อมให้ Codex implement  
> ห้ามแก้ไขโค้ดก่อนอ่านแผนนี้ทั้งหมด

---

## ภาพรวม

แทนที่ localStorage ด้วย **IndexedDB ผ่าน idb-keyval** ซึ่งเป็น library ขนาด ~1KB gzip  
ทำเป็น 2 Phase เพื่อลดความเสี่ยง

| Phase | สิ่งที่ทำ | ไฟล์ที่แก้ | ความเสี่ยง |
|---|---|---|---|
| **Phase 1** | ย้าย Sync Queue ไป IndexedDB | 2 ไฟล์ | ต่ำ |
| **Phase 2** | ย้าย Zustand Stores + pullApply ไป IndexedDB | 17 ไฟล์ | กลาง |

---

## สิ่งที่ **ไม่ต้องย้าย** (คงไว้ใน localStorage ตลอดไป)

ไฟล์/key เหล่านี้ต้องเป็น synchronous และเล็กมาก — ห้ามย้าย:

```
zuzoo_cloud_config_v1          → cloudConfig.js        (ต้องอ่านตอน boot)
zuzoo_cloud_device_id          → cloudSyncMetadata.js  (ต้องอ่านตอน boot, sync)
zuzoo_cloud_last_pull_at_*     → pullApply.js          (timestamp เล็กมาก)
zuzoo_shop_session_settings_v1 → shopSessions.js       (heartbeat sync)
zuzoo_shop_sessions_v1         → shopSessions.js       (heartbeat sync)
sessionStorage ทั้งหมด         → ห้ามแตะ
```

---

## ขั้นตอนที่ 0 — ติดตั้ง Package

```bash
npm install idb-keyval
```

ไม่ต้องเพิ่ม devDependencies เพราะใช้ใน production code

---

---

# PHASE 1 — ย้าย Sync Queue ไป IndexedDB

**เหตุผลทำก่อน:** Queue โตไม่จำกัด, กิน 5MB pool เดียวกับข้อมูลทั้งหมด, เป็น async อยู่แล้ว

---

## ไฟล์ P1-1: `src/lib/cloudSyncMetadata.js`

**ความเปลี่ยนแปลง:** `readQueue` และ `writeQueue` กลายเป็น async ใช้ idb-keyval แทน localStorage  
ส่วนอื่นของไฟล์ (deviceId, getCloudQueueKey ฯลฯ) **ไม่แตะ**

### เพิ่ม import ที่บรรทัดแรกของไฟล์:
```js
import { get as idbGet, set as idbSet } from 'idb-keyval'
```

### แทนที่ฟังก์ชัน `readQueue` (บรรทัด 39-47):
```js
// เดิม (synchronous localStorage):
function readQueue(shopId = activeShopId) {
  try {
    const raw = localStorage.getItem(getCloudQueueKey(shopId))
    const queue = raw ? JSON.parse(raw) : []
    return Array.isArray(queue) ? queue : []
  } catch {
    return []
  }
}

// ใหม่ (async IndexedDB):
async function readQueue(shopId = activeShopId) {
  try {
    const queue = await idbGet(getCloudQueueKey(shopId))
    return Array.isArray(queue) ? queue : []
  } catch {
    return []
  }
}
```

### แทนที่ฟังก์ชัน `writeQueue` (บรรทัด 49-55):
```js
// เดิม (synchronous localStorage):
function writeQueue(queue, shopId = activeShopId) {
  try {
    localStorage.setItem(getCloudQueueKey(shopId), JSON.stringify(queue))
  } catch {
    // Cloud queue is a sidecar. Never interrupt the offline/local workflow.
  }
}

// ใหม่ (async IndexedDB):
async function writeQueue(queue, shopId = activeShopId) {
  try {
    await idbSet(getCloudQueueKey(shopId), queue)
  } catch {
    // Cloud queue is a sidecar. Never interrupt the offline/local workflow.
  }
}
```

### แทนที่ฟังก์ชัน `updateQueueItems` (บรรทัด 57-62):
```js
// เดิม:
function updateQueueItems(shopId, updater) {
  const queue = readQueue(shopId)
  const next = queue.map(updater)
  writeQueue(next, shopId)
  return next
}

// ใหม่ (async):
async function updateQueueItems(shopId, updater) {
  const queue = await readQueue(shopId)
  const next = queue.map(updater)
  await writeQueue(next, shopId)
  return next
}
```

### แก้ไขฟังก์ชันที่เรียก readQueue/writeQueue ให้เป็น async ทั้งหมด:

ฟังก์ชันต่อไปนี้ต้องเพิ่ม `async` นำหน้า และ `await` หน้าการเรียก readQueue/writeQueue/updateQueueItems:

```
enqueueCloudChange()      → async, await readQueue, await writeQueue
getCloudQueueSummary()    → async, await readQueue
getCloudQueueItems()      → async, await readQueue
getPendingCloudQueueItems() → async, await readQueue
markCloudQueueItemsSyncing() → async, await updateQueueItems
markCloudQueueItemsSynced()  → async, await updateQueueItems
markCloudQueueItemFailed()   → async, await updateQueueItems
resetStuckCloudQueueItems()  → async, await updateQueueItems
pruneSyncedCloudQueueItems() → async, await readQueue, await writeQueue
compactCloudQueue()          → async, await readQueue, await writeQueue
buildCloudQueueReport()      → async, await readQueue (ใน shopReports.map ต้องใช้ Promise.all)
```

### ตัวอย่าง `enqueueCloudChange` หลังแก้:
```js
export async function enqueueCloudChange(tableName, recordId, action, payload, options = {}) {
  if (!recordId) return null
  const timestamp = options.timestamp ?? nowIso()
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    tableName,
    recordId,
    action,
    payload,
    status: CLOUD_SYNC_STATUS.PENDING,
    attempts: 0,
    shopId: getCloudShopId(options.shopId),
    deviceId: getCloudDeviceId(),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const queue = await readQueue(options.shopId)
  await writeQueue([...queue, item], options.shopId)
  try {
    window.dispatchEvent(new CustomEvent('zuzoo:queue-updated', {
      detail: { shopId: item.shopId },
    }))
  } catch { /* ignore in non-browser env */ }
  return item
}
```

### ตัวอย่าง `buildCloudQueueReport` หลังแก้:
```js
export async function buildCloudQueueReport(shops = []) {
  const deviceId = getCloudDeviceId()
  const generatedAt = nowIso()
  const shopReports = await Promise.all(shops.map(async (shop) => {
    const items = await readQueue(shop.id)
    // ... ส่วนที่เหลือเหมือนเดิม
  }))
  // ... ส่วนที่เหลือเหมือนเดิม
}
```

### เพิ่มฟังก์ชัน migration สำหรับ queue (ใส่ท้ายไฟล์):
```js
// ย้าย queue เก่าจาก localStorage ไป IndexedDB (ทำครั้งเดียว)
export async function migrateQueueFromLocalStorage(shopIds = []) {
  for (const shopId of shopIds) {
    const key = getCloudQueueKey(shopId)
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const existing = await idbGet(key)
      if (existing) continue // ถ้ามีอยู่แล้วใน IDB ไม่ต้อง migrate
      const queue = JSON.parse(raw)
      if (Array.isArray(queue) && queue.length > 0) {
        await idbSet(key, queue)
      }
      localStorage.removeItem(key)
    } catch {
      // silent — ไม่ขัด workflow
    }
  }
}
```

---

## ผลกระทบ Phase 1 ต่อไฟล์อื่น

เนื่องจาก cloudSyncMetadata functions กลายเป็น async ทั้งหมด  
ไฟล์ที่เรียกใช้ต้องเพิ่ม `await` แต่ส่วนใหญ่เป็น async อยู่แล้ว:

| ไฟล์ | ฟังก์ชันที่ได้รับผล | ต้องแก้ไหม |
|---|---|---|
| `src/services/cloud/syncApi.js` | `getPendingCloudQueueItems`, `markCloudQueueItemsSyncing`, `markCloudQueueItemsSynced`, `markCloudQueueItemFailed`, `resetStuckCloudQueueItems`, `pruneSyncedCloudQueueItems` | ✅ ต้องเพิ่ม await |
| `src/services/cloud/pullApply.js` | `getCloudQueueItems` | ✅ ต้องเพิ่ม await |
| `src/hooks/useAutoSync.js` | `getPendingCloudQueueItems` | ✅ ต้องเพิ่ม await |

### แก้ `src/services/cloud/syncApi.js`:
ฟังก์ชัน `pushShopQueue` เรียก `getPendingCloudQueueItems`, `markCloudQueueItemsSyncing` ฯลฯ  
ทุกการเรียกเหล่านี้ต้องเพิ่ม `await` นำหน้า — ฟังก์ชันเป็น async อยู่แล้ว ไม่ต้องเปลี่ยน signature

```js
// ตัวอย่างบรรทัดที่ต้องเพิ่ม await:
resetStuckCloudQueueItems(shopId)              → await resetStuckCloudQueueItems(shopId)
const changes = getPendingCloudQueueItems(...) → const changes = await getPendingCloudQueueItems(...)
markCloudQueueItemsSyncing(...)               → await markCloudQueueItemsSyncing(...)
markCloudQueueItemsSynced(...)                → await markCloudQueueItemsSynced(...)
markCloudQueueItemFailed(...)                 → await markCloudQueueItemFailed(...)
pruneSyncedCloudQueueItems(shopId)            → await pruneSyncedCloudQueueItems(shopId)
```

### แก้ `src/services/cloud/pullApply.js`:
```js
// บรรทัดที่ต้องเพิ่ม await:
return getCloudQueueItems(shopId).some(...)   → (await getCloudQueueItems(shopId)).some(...)
// หมายเหตุ: ฟังก์ชัน hasLocalPending() ต้องกลายเป็น async ด้วย
async function hasLocalPending(shopId, tableName, recordId) {
  return (await getCloudQueueItems(shopId)).some((item) =>
    item.tableName === tableName &&
    item.recordId === recordId &&
    ['pending', 'syncing', 'failed'].includes(item.status)
  )
}
// และทุกที่ที่เรียก hasLocalPending ต้องเพิ่ม await
```

### แก้ `src/hooks/useAutoSync.js`:
```js
// ใน doPush:
const pending = getPendingCloudQueueItems(id, 1)   → const pending = await getPendingCloudQueueItems(id, 1)
```

---

---

# PHASE 2 — ย้าย Zustand Stores + pullApply ไป IndexedDB

**ทำหลัง Phase 1 เสร็จและทดสอบแล้วเท่านั้น**

---

## ไฟล์ P2-1: `src/lib/idbStorage.js` *(สร้างใหม่)*

ไฟล์นี้เป็น Zustand custom storage adapter ใช้ร่วมกันทุก store

```js
// src/lib/idbStorage.js
import { get, set, del } from 'idb-keyval'
import { createJSONStorage } from 'zustand/middleware'

// Raw idb-keyval adapter (ไม่ใช้ JSON encode เพราะ idb-keyval เก็บ object ได้เลย)
const idbKeyValAdapter = {
  getItem: async (name) => {
    const val = await get(name)
    // คืนค่าเป็น JSON string เพราะ Zustand persist คาด string
    return val !== undefined ? JSON.stringify(val) : null
  },
  setItem: async (name, value) => {
    // value มาเป็น JSON string จาก Zustand — แปลงกลับเป็น object ก่อนเก็บ
    await set(name, JSON.parse(value))
  },
  removeItem: async (name) => {
    await del(name)
  },
}

// Export เป็น createJSONStorage เพื่อใช้กับ Zustand persist
export const idbStorage = createJSONStorage(() => idbKeyValAdapter)
```

---

## ไฟล์ P2-2: `src/lib/migrateToIdb.js` *(สร้างใหม่)*

ไฟล์นี้ migrate ข้อมูลเก่าจาก localStorage ไป IndexedDB ทำ **ครั้งเดียว** ตอน app boot

```js
// src/lib/migrateToIdb.js
import { get as idbGet, set as idbSet } from 'idb-keyval'

const MIGRATION_FLAG = 'zuzoo_idb_migrated_v1'

// รายชื่อ localStorage keys ที่ต้อง migrate (global keys ที่ไม่ขึ้นกับ shopId)
const GLOBAL_STORE_KEYS = [
  'zuzoo_auth_v2',
  'zuzoo_roles_v1',
  'zuzoo_shop_registry',
  'global_activity_log',
]

// ชื่อ suffix ของ store ที่ขึ้นกับ shopId
const SHOP_STORE_SUFFIXES = [
  'transactions',
  'wallet_main',
  'categories_data',
  'pending_data',
  'recurring_data',
  'activity_log',
  'calendar_notes',
  'app_settings',
]

function getAllShopIds() {
  try {
    const raw = localStorage.getItem('zuzoo_shop_registry')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    const shops = parsed?.state?.shops ?? []
    return shops.map((s) => s.id).filter(Boolean)
  } catch {
    return []
  }
}

async function migrateKey(lsKey) {
  try {
    const raw = localStorage.getItem(lsKey)
    if (!raw) return
    const existing = await idbGet(lsKey)
    if (existing !== undefined) return // มีอยู่แล้วใน IDB — ข้าม
    await idbSet(lsKey, JSON.parse(raw))
    // ลบออกจาก localStorage หลัง migrate สำเร็จ
    localStorage.removeItem(lsKey)
  } catch {
    // silent — ถ้า migrate ไม่ได้ก็ยังใช้ localStorage ได้
  }
}

export async function runIdbMigration() {
  // ถ้า migrate แล้ว ข้ามทันที
  if (localStorage.getItem(MIGRATION_FLAG)) return

  const shopIds = getAllShopIds()

  // migrate global stores
  for (const key of GLOBAL_STORE_KEYS) {
    await migrateKey(key)
  }

  // migrate shop-specific stores
  const defaultPrefixes = SHOP_STORE_SUFFIXES.map((s) => `default_${s}`)
  for (const prefix of defaultPrefixes) {
    await migrateKey(prefix)
  }
  for (const shopId of shopIds) {
    for (const suffix of SHOP_STORE_SUFFIXES) {
      await migrateKey(`${shopId}_${suffix}`)
    }
  }

  // ตั้ง flag ว่า migrate แล้ว
  localStorage.setItem(MIGRATION_FLAG, '1')
}
```

---

## ไฟล์ P2-3: `src/main.jsx`

เรียก `runIdbMigration()` ก่อน render React app เพื่อให้ Zustand hydrate จาก IndexedDB

```js
// เพิ่ม import:
import { runIdbMigration } from './lib/migrateToIdb'

// แก้ไข bootstrap เป็น async:
// เดิม:
ReactDOM.createRoot(document.getElementById('root')).render(<App />)

// ใหม่:
runIdbMigration().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(<App />)
})
```

> **หมายเหตุ:** `finally` ทำให้ app render แม้ migrate ล้มเหลว — ป้องกัน app ค้างตลอด

---

## ไฟล์ P2-4 ถึง P2-15: Zustand Stores ทั้ง 12 ไฟล์

**pattern การเปลี่ยนแปลงเหมือนกันทุกไฟล์:**

1. เพิ่ม import `idbStorage`
2. เพิ่ม `storage: idbStorage` ในส่วน config ของ `persist`

### ตัวอย่าง Pattern (ใช้กับทุก store):
```js
// เพิ่ม import ที่หัวไฟล์:
import { idbStorage } from '../lib/idbStorage'

// แก้ไข persist config:
// เดิม:
persist(storeFn, { name: `${activeShopId}_transactions` })

// ใหม่:
persist(storeFn, { name: `${activeShopId}_transactions`, storage: idbStorage })
```

### รายการไฟล์และ key ที่ต้องแก้:

| ไฟล์ | persist name (key) |
|---|---|
| `src/store/useTransactionStore.js` | `${activeShopId}_transactions` หรือ `default_transactions` |
| `src/store/useWalletStore.js` | `${activeShopId}_wallet_main` หรือ `default_wallet_main` |
| `src/store/useCategoryStore.js` | `${activeShopId}_categories_data` หรือ `default_categories_data` |
| `src/store/usePendingStore.js` | `${activeShopId}_pending_data` หรือ `default_pending_data` |
| `src/store/useRecurringStore.js` | `${activeShopId}_recurring_data` หรือ `default_recurring_data` |
| `src/store/useLogStore.js` | `${activeShopId}_activity_log` หรือ `default_activity_log` |
| `src/store/useNoteStore.js` | `${activeShopId}_calendar_notes` หรือ `default_calendar_notes` |
| `src/store/useAppStore.js` | `${activeShopId}_app_settings` หรือ `default_app_settings` |
| `src/store/useAuthStore.js` | `zuzoo_auth_v2` |
| `src/store/useRoleStore.js` | `zuzoo_roles_v1` |
| `src/store/useShopStore.js` | `zuzoo_shop_registry` |
| `src/store/useGlobalLogStore.js` | `global_activity_log` |

> **สำคัญ:** ชื่อ key (`name:`) ต้องคงเดิมทุกตัว — เปลี่ยนแค่ storage backend เท่านั้น

---

## ไฟล์ P2-16: `src/services/cloud/pullApply.js`

**ความเปลี่ยนแปลง:** `readPersisted` และ `writePersisted` กลายเป็น async ใช้ idb-keyval

### เพิ่ม import ที่หัวไฟล์:
```js
import { get as idbGet, set as idbSet } from 'idb-keyval'
```

### แทนที่ `readPersisted` (บรรทัด 27-31):
```js
// เดิม:
function readPersisted(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? { state: {}, version: 0 }
  } catch {
    return { state: {}, version: 0 }
  }
}

// ใหม่ (async):
async function readPersisted(key) {
  try {
    const val = await idbGet(key)
    return val ?? { state: {}, version: 0 }
  } catch {
    return { state: {}, version: 0 }
  }
}
```

### แทนที่ `writePersisted` (บรรทัด 33-38):
```js
// เดิม:
function writePersisted(key, persisted) {
  localStorage.setItem(key, JSON.stringify({
    version: persisted.version ?? 0,
    state: persisted.state ?? {},
  }))
}

// ใหม่ (async):
async function writePersisted(key, persisted) {
  try {
    await idbSet(key, {
      version: persisted.version ?? 0,
      state: persisted.state ?? {},
    })
  } catch {
    // silent — ไม่ขัด flow
  }
}
```

### แก้ไข `applyArrayUpsert`, `applyArrayDelete`, `applyWalletState` ให้เป็น async:

```js
// applyArrayUpsert:
async function applyArrayUpsert(shopId, tableName, payload) {
  const target = TABLE_TARGETS[tableName]
  if (!target || !payload?.id) return { applied: false, reason: 'unsupported' }
  if (await hasLocalPending(shopId, tableName, payload.id)) return { applied: false, reason: 'local-pending' }

  const key = persistedKey(shopId, target.keyBase)
  const persisted = await readPersisted(key)          // ← await
  const state = persisted.state ?? {}
  const list = Array.isArray(state[target.field]) ? state[target.field] : []
  const index = list.findIndex((item) => item.id === payload.id)
  const local = index >= 0 ? list[index] : null

  if (!isNewer(payload, local)) return { applied: false, reason: 'not-newer' }
  const nextList = index >= 0
    ? list.map((item) => item.id === payload.id ? payload : item)
    : [payload, ...list]
  await writePersisted(key, { ...persisted, state: { ...state, [target.field]: nextList } })  // ← await
  return { applied: true }
}

// applyArrayDelete:
async function applyArrayDelete(shopId, tableName, recordId) {
  const target = TABLE_TARGETS[tableName]
  if (!target || !recordId) return { applied: false, reason: 'unsupported' }
  if (await hasLocalPending(shopId, tableName, recordId)) return { applied: false, reason: 'local-pending' }

  const key = persistedKey(shopId, target.keyBase)
  const persisted = await readPersisted(key)          // ← await
  const state = persisted.state ?? {}
  const list = Array.isArray(state[target.field]) ? state[target.field] : []
  const nextList = list.filter((item) => item.id !== recordId)
  if (nextList.length === list.length) return { applied: false, reason: 'missing' }
  await writePersisted(key, { ...persisted, state: { ...state, [target.field]: nextList } })  // ← await
  return { applied: true }
}

// applyWalletState:
async function applyWalletState(shopId, payload) {
  if (!payload?.id) return { applied: false, reason: 'invalid-wallet' }
  if (await hasLocalPending(shopId, 'wallet_state', payload.id)) return { applied: false, reason: 'local-pending' }
  const key = persistedKey(shopId, 'wallet_main')
  const persisted = await readPersisted(key)          // ← await
  const state = persisted.state ?? {}
  const localUpdatedAt = state.cloudSync?.updatedAt || state.updatedAt
  if (localUpdatedAt && payload.updatedAt && new Date(payload.updatedAt).getTime() <= new Date(localUpdatedAt).getTime()) {
    return { applied: false, reason: 'not-newer' }
  }
  await writePersisted(key, {                         // ← await
    ...persisted,
    state: {
      ...state,
      cash: Number(payload.cash ?? state.cash ?? 0),
      transfer: Number(payload.transfer ?? state.transfer ?? 0),
      subWallets: Array.isArray(payload.subWallets) ? payload.subWallets : (state.subWallets ?? []),
      loans: Array.isArray(payload.loans) ? payload.loans : (state.loans ?? []),
      updatedAt: payload.updatedAt,
      cloudSync: payload.cloudSync,
    },
  })
  return { applied: true }
}
```

### แก้ไข `pullAndApplyShop` — เพิ่ม await ทุกที่ที่เรียก apply functions:

```js
// ใน for loop ของ pullAndApplyShop:
const result = tableName === 'wallet_state'
  ? await applyWalletState(shopId, payload)      // ← await
  : await applyArrayUpsert(shopId, tableName, payload)  // ← await

// delete case:
recordResult(stats, await applyArrayDelete(shopId, tableName, row.id))  // ← await
```

---

## ไฟล์ P2-17: `src/lib/shopKeys.js`

**ความเปลี่ยนแปลง:** `removeShopData` ต้องลบทั้ง localStorage และ IndexedDB  
เพิ่ม async support

### เพิ่ม import ที่หัวไฟล์:
```js
import { del as idbDel } from 'idb-keyval'
```

### แทนที่ `removeShopData`:
```js
// เดิม:
export function removeShopData(shopId) {
  shopDataKeys(shopId).forEach((key) => localStorage.removeItem(key))
}

// ใหม่ (async, ลบทั้ง localStorage และ IndexedDB):
export async function removeShopData(shopId) {
  const keys = shopDataKeys(shopId)
  // ลบจาก localStorage (เผื่อยังมีข้อมูลเก่า)
  keys.forEach((key) => localStorage.removeItem(key))
  // ลบจาก IndexedDB
  await Promise.all(keys.map((key) => idbDel(key).catch(() => {})))
}
```

### แทนที่ `removeAllAppData`:
```js
// ใหม่ (async):
export async function removeAllAppData() {
  // ลบจาก localStorage
  const keys = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (key === 'zuzoo_shop_registry' || isKnownShopDataKey(key)) keys.push(key)
  }
  keys.forEach((key) => localStorage.removeItem(key))

  // ลบ global keys จาก IndexedDB
  const idbGlobalKeys = [
    'zuzoo_auth_v2',
    'zuzoo_roles_v1',
    'zuzoo_shop_registry',
    'global_activity_log',
  ]
  await Promise.all(idbGlobalKeys.map((key) => idbDel(key).catch(() => {})))

  // ลบ session storage drafts
  try {
    const draftKeys = []
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i)
      if (key?.startsWith('draft:')) draftKeys.push(key)
    }
    draftKeys.forEach((key) => sessionStorage.removeItem(key))
  } catch {}
}
```

---

## สรุปไฟล์ทั้งหมดที่ต้องแก้ไข

### Phase 1 (ทำก่อน):
| ไฟล์ | ประเภทการเปลี่ยน |
|---|---|
| `package.json` | เพิ่ม `idb-keyval` |
| `src/lib/cloudSyncMetadata.js` | readQueue/writeQueue/updateQueueItems → async idb-keyval |
| `src/services/cloud/syncApi.js` | เพิ่ม await หน้า queue functions |
| `src/services/cloud/pullApply.js` | hasLocalPending → async, เพิ่ม await |
| `src/hooks/useAutoSync.js` | เพิ่ม await หน้า getPendingCloudQueueItems |

### Phase 2 (ทำต่อหลัง Phase 1 ผ่านแล้ว):
| ไฟล์ | ประเภทการเปลี่ยน |
|---|---|
| `src/lib/idbStorage.js` | **สร้างใหม่** — Zustand storage adapter |
| `src/lib/migrateToIdb.js` | **สร้างใหม่** — one-time migration |
| `src/main.jsx` | เรียก runIdbMigration() ก่อน render |
| `src/store/useTransactionStore.js` | เพิ่ม `storage: idbStorage` |
| `src/store/useWalletStore.js` | เพิ่ม `storage: idbStorage` |
| `src/store/useCategoryStore.js` | เพิ่ม `storage: idbStorage` |
| `src/store/usePendingStore.js` | เพิ่ม `storage: idbStorage` |
| `src/store/useRecurringStore.js` | เพิ่ม `storage: idbStorage` |
| `src/store/useLogStore.js` | เพิ่ม `storage: idbStorage` |
| `src/store/useNoteStore.js` | เพิ่ม `storage: idbStorage` |
| `src/store/useAppStore.js` | เพิ่ม `storage: idbStorage` |
| `src/store/useAuthStore.js` | เพิ่ม `storage: idbStorage` |
| `src/store/useRoleStore.js` | เพิ่ม `storage: idbStorage` |
| `src/store/useShopStore.js` | เพิ่ม `storage: idbStorage` |
| `src/store/useGlobalLogStore.js` | เพิ่ม `storage: idbStorage` |
| `src/services/cloud/pullApply.js` | readPersisted/writePersisted/apply* → async idb-keyval |
| `src/lib/shopKeys.js` | removeShopData/removeAllAppData → async + ลบ IDB |

### ไม่ต้องแก้ไข:
```
src/services/cloud/cloudConfig.js    → คงไว้ใน localStorage
src/services/cloud/wsClient.js       → ไม่เกี่ยวกับ storage
src/services/cloud/authSync.js       → ไม่เกี่ยวกับ storage
src/services/cloud/shopSync.js       → ไม่เกี่ยวกับ storage
src/lib/shopSessions.js              → คงไว้ใน localStorage (sync heartbeat)
src/lib/activeShop.js                → ไม่เกี่ยวกับ persistent storage
```

---

## ข้อควรระวังสำหรับ Codex

1. **ลำดับการทำ**: Phase 1 ก่อน → ทดสอบ → Phase 2
2. **ห้ามเปลี่ยนชื่อ key** (`name:` ใน persist config) เพราะใช้ค้นหา IndexedDB เหมือนกัน
3. **migration flag** `zuzoo_idb_migrated_v1` ต้องอยู่ใน localStorage เท่านั้น (ไม่ใช่ IndexedDB)
4. **`removeShopData` กลายเป็น async** — ตรวจหาทุกที่ที่เรียกใช้และเพิ่ม `await`
5. **Zustand hydration** — เมื่อ storage เป็น async, Zustand จะ render ก่อนที่ข้อมูลจะโหลด ต้องใช้ `useStore.persist.hasHydrated()` หรือ `onRehydrateStorage` ถ้าพบปัญหา
6. **idb-keyval เก็บต่อ origin** — ข้อมูลแยกกันระหว่าง `http://localhost:5173` และ `https://production.com` ซึ่งเป็นเรื่องปกติ
7. **ห้ามลบ localStorage fallback** ใน `readPersisted` เพราะต้องรองรับกรณีที่ migrate ยังไม่เสร็จ

---

*จบแผน — พร้อมให้ Codex implement Phase 1 ก่อน*
