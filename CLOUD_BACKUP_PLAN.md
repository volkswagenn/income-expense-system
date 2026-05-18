# Cloud Backup Plan

## เป้าหมาย

ออกแบบระบบ Cloud Backup / Cloud Restore / Multi-device Access สำหรับแอพบันทึกรายรับ-รายจ่ายร้านค้า โดยยังคงแนวคิด local-first:

- ใช้งาน offline ได้ืn
- ข้อมูลหลักยังอยู่ local
- cloud เป็นที่เก็บ backup และเป็นท่อ sync ข้ามเครื่อง
- หลายเครื่องสามารถเรียกใช้ข้อมูลร้านเดียวกันได้
- ลดปัญหาข้อมูลทับกัน ข้อมูลฟื้นคืนชีพ ข้อมูลหายเงียบ และ schema local/cloud ไม่ตรงกัน

หลักคิดสำคัญ:

> Offline-first ที่จะมี cloud ไม่ใช่ offline app ที่ค่อยแปะ cloud ทีหลัง

ดังนั้นแม้จะเริ่มจากคำว่า "backup" ก็ควรวาง metadata และ sync semantics ให้พร้อมตั้งแต่แรก

---

## แนวทางหลัก

ไม่ควรเริ่มจากการ upload localStorage ทั้งก้อนอย่างเดียว เพราะถ้าใช้หลายเครื่องจะเกิด divergence เร็วมาก

ควรออกแบบเป็น 2 ชั้น:

## 1. Cloud Snapshot Backup

ใช้สำหรับ:

- สำรองข้อมูลทั้งร้านหรือทุกร้านเป็น snapshot
- กู้คืนฉุกเฉิน
- rollback กลับไปยังจุดเวลาหนึ่ง
- ย้ายข้อมูลไปเครื่องใหม่แบบง่าย

ข้อดี:

- ทำง่าย
- เหมาะกับระยะเริ่มต้น
- ผู้ใช้เข้าใจง่าย

ข้อจำกัด:

- ไม่ใช่ sync หลายเครื่องแบบสมบูรณ์
- ถ้าเครื่อง A และ B แก้ข้อมูลพร้อมกัน snapshot อาจทับกัน
- restore ผิดจังหวะอาจทำให้ข้อมูลใหม่หาย

## 2. Cloud Incremental Sync Log

ใช้สำหรับ:

- sync การเปลี่ยนแปลงทีละรายการ
- รองรับหลายเครื่อง
- เก็บประวัติการเปลี่ยนแปลง
- รองรับ retry, dead-letter, conflict

ข้อดี:

- เหมาะกับ multi-device จริง
- ลดการทับข้อมูลทั้งก้อน
- ตรวจย้อนหลังได้

ข้อจำกัด:

- ต้องมี schema และ metadata ชัด
- ต้องมี sync engine
- ต้องนิยาม conflict policy ตั้งแต่ต้น

---

## Data Model Metadata ที่ต้องมี

ทุก record สำคัญควรมี field ต่อไปนี้ตั้งแต่ schema รุ่นแรกที่ cloud-ready:

```text
id: UUID ที่ client สร้างเอง
accountId: เจ้าของบัญชี
shopId: ร้าน / สาขา
createdAt: เวลาสร้าง
updatedAt: เวลาแก้ไขล่าสุด
deletedAt: soft delete / tombstone
version: เลข version ของ record
deviceId: เครื่องที่แก้ล่าสุด
syncStatus: pending / synced / error
lastSyncedAt: sync ล่าสุด
```

ข้อกำหนด:

- ห้ามใช้ auto-increment id เป็น identity หลักใน local-first multi-device
- ห้าม hard delete record สำคัญ ให้ใช้ `deletedAt`
- ทุก record ที่ถูกแก้ต้องเปลี่ยน `updatedAt` และ `version`
- ทุก record ที่รอ sync ต้องเข้า sync queue

---

## Identity Model

ต้องแยกตัวตนให้ชัด:

```text
Account / User
  └── Shop / Tenant
        └── Device
```

Field ที่ควรมี:

```text
accountId
shopId
deviceId
deviceName
devicePlatform
lastSeenAt
createdAt
revokedAt
```

ตัวอย่าง device:

- PC หน้าร้าน
- Notebook เจ้าของร้าน
- Tablet สาขา 2

ประโยชน์:

- รู้ว่าเครื่องไหนแก้ข้อมูล
- revoke เครื่องที่ไม่ใช้แล้วได้
- debug sync ได้ง่ายขึ้น
- แสดงสถานะเครื่องล่าสุดให้ผู้ใช้เห็นได้

---

## Cloud Tables ที่ควรมี

## Core Identity

```text
accounts
devices
shops
shop_members
```

## Business Data

```text
transactions
wallet_main
sub_wallets
loans
pending_payments
pending_incomes
tax_invoices
categories
vendors
quick_items
calendar_notes
activity_logs
app_settings
```

## Sync System

```text
sync_changes
sync_cursors
sync_dead_letters
sync_conflicts
cloud_snapshots
cloud_files
```

## File Storage Metadata

```text
file_attachments
```

Field ตัวอย่าง:

```text
id
accountId
shopId
entityType
entityId
localPath
cloudKey
filename
mimeType
size
checksum
uploadedAt
deletedAt
```

---

## Single Source of Truth

สำหรับ local-first:

- UI ทุกหน้าควรอ่าน local store เท่านั้น
- cloud เป็นท่อ sync ไม่ใช่แหล่งที่ UI บางหน้าอ่านตรง
- Dashboard, History, Reports, Wallet ต้องอ่านจาก local source เดียวกัน

ห้ามมี pattern:

```text
Dashboard อ่าน cloud
History อ่าน local
Reports อ่าน localStorage อีกแบบ
```

เพราะจะทำให้ตัวเลขขัดกัน

---

## Timezone Policy

ต้องกำหนดนโยบายเดียวทั้งระบบ:

- เก็บ timestamp เป็น UTC
- แสดงผลตาม locale/timezone ผู้ใช้
- รายงานของร้านให้ fix timezone ของร้าน เช่น `Asia/Bangkok`
- ห้ามให้ client/server bucket วันคนละแบบ

ควรมี shared util:

```text
toUtc()
fromUtc()
getBusinessDate(timezone)
startOfBusinessDay(timezone)
endOfBusinessDay(timezone)
```

---

## Conflict Resolution

สำหรับ V1 แนะนำ:

- Last-write-wins ด้วย server timestamp สำหรับ field ทั่วไป
- ทุก conflict ต้องบันทึกลง `sync_conflicts`
- ถ้าเป็นข้อมูลเงิน ต้องมี audit log เสมอ
- transaction ไม่ควรถูก merge เงียบ ๆ

ข้อมูลที่ต้องระวัง:

- transaction
- wallet balance
- pending payment
- tax invoice
- restore snapshot

แนวทาง:

```text
ถ้าแก้ record เดียวกันจาก 2 เครื่อง:
1. เก็บทั้ง local version และ cloud version
2. ใช้ server-latest เป็นค่าหลักชั่วคราว
3. สร้าง conflict record
4. แสดงในหน้า Sync Health / Reconcile
```

---

## Dependency Order ของ Sync

ลำดับ push/pull ที่ควรกำหนด:

1. account / device / shop
2. app_settings
3. categories / vendors / quick_items
4. wallet_main / sub_wallets
5. transactions
6. pending_payments / pending_incomes
7. tax_invoices
8. calendar_notes
9. activity_logs
10. file_attachments

เหตุผล:

- categories ต้องมาก่อน transactions ที่อ้าง category
- shops ต้องมาก่อนข้อมูลทุกชนิด
- files ควรตามหลัง metadata หรือ sync แยก queue

---

## Sync Engine Design

Sync engine ควรเป็น module singleton นอก React:

```text
syncEngine.start()
syncEngine.stop()
syncEngine.enqueue(change)
syncEngine.retry(changeId)
syncEngine.subscribe(listener)
syncEngine.getStatus()
```

React hook ควรเป็น read-only subscriber:

```text
useSyncStatus()
usePendingChanges()
useSyncErrors()
```

ห้ามให้หลาย component สร้าง sync engine เอง

---

## Sync Queue

ทุก local mutation ควรสร้าง change:

```text
changeId
accountId
shopId
entityType
entityId
operation: create / update / delete
payload
baseVersion
localVersion
deviceId
createdAt
retryCount
status
lastError
```

สถานะ:

```text
pending
syncing
synced
failed
dead_letter
conflict
```

ต้องมี:

- retry + exponential backoff
- dead-letter ที่ผู้ใช้เห็น
- manual retry
- reconcile tool

---

## Cloud Backup Flow

## เปิดใช้ Cloud Backup

```text
1. ผู้ใช้กด เปิดใช้ Cloud Backup
2. Login / สมัคร account
3. สร้างหรือผูก deviceId
4. เลือกร้านที่จะ backup
5. Upload snapshot แรกขึ้น cloud
6. สร้าง sync cursor
7. เปิด incremental sync
```

## Backup Now

```text
1. ตรวจ local health
2. flush pending sync queue เท่าที่ทำได้
3. สร้าง snapshot
4. upload snapshot
5. บันทึก activity log
6. แสดง last backup time
```

## Restore บนเครื่องใหม่

```text
1. Login
2. เลือก account/shop
3. แสดง snapshot ล่าสุดและรายการ snapshot เก่า
4. เลือก restore
5. ดาวน์โหลด snapshot
6. สร้าง local store
7. pull changes หลัง snapshot
8. rebuild local state
9. เปิดร้าน
```

---

## UI ที่ควรเพิ่มใน Settings หน้าแรก

เพิ่ม section:

```text
Cloud Backup
```

ควรมี:

- สถานะ cloud: offline / connected / syncing / error
- account ที่ login
- device name
- last backup time
- last sync time
- pending changes count
- failed changes count
- conflict count
- ปุ่ม Backup Now
- ปุ่ม Restore from Cloud
- ปุ่ม Device Manager
- ปุ่ม Reconcile

## Device Manager

ควรแสดง:

- รายชื่อเครื่อง
- เครื่องนี้คือเครื่องไหน
- platform
- last seen
- ปุ่ม revoke

## Sync Health

ควรแสดง:

- pending queue
- failed queue
- dead-letter
- conflict list
- retry all
- export diagnostic

---

## File Attachment Cloud Plan

ไฟล์ใบเสร็จ/ใบกำกับไม่ควรฝังใน JSON backup โดยตรง

ควรใช้ object storage:

```text
cloudKey = accountId/shopId/entityType/entityId/fileId.ext
```

Metadata ต้องมี:

```text
checksum
size
mimeType
uploadedAt
linked entity
```

Flow:

```text
1. บันทึกไฟล์ local
2. สร้าง file metadata
3. enqueue upload
4. upload cloud storage
5. update cloudKey/uploadedAt
6. sync metadata
```

Restore:

```text
1. restore file metadata
2. ดาวน์โหลดไฟล์ที่ยังไม่มีในเครื่อง
3. verify checksum
4. mark missing ถ้าโหลดไม่ได้
```

---

## Migration จาก Local ปัจจุบัน

แอพปัจจุบันใช้ localStorage แยกตามร้าน:

```text
<shopId>_transactions
<shopId>_wallet_main
<shopId>_pending_data
<shopId>_categories_data
<shopId>_activity_log
<shopId>_calendar_notes
<shopId>_app_settings
```

แผน migration:

```text
1. อ่าน registry ร้าน
2. อ่าน keys ของแต่ละร้าน
3. เติม metadata ให้ record เดิม:
   - accountId
   - shopId
   - deviceId
   - updatedAt
   - version = 1
   - deletedAt = null
   - syncStatus = pending
4. สร้าง initial snapshot
5. upload snapshot
6. สร้าง sync queue สำหรับ records เดิม
```

ข้อควรระวัง:

- ห้ามเปลี่ยน id เดิมถ้ามีการอ้างอิงกัน
- transactionId ใน pending/tax invoice ต้อง map ให้ถูก
- ถ้า record ไม่มี createdAt ต้องใช้ fallback ที่ชัดเจน
- activity log เก่าควรเก็บไว้ แต่ mark ว่าเป็น imported legacy log

---

## Phase Plan

## Phase 1: Cloud Snapshot Backup

ทำก่อน:

- account login
- deviceId
- upload snapshot ร้านเดียว
- upload snapshot ทุกร้าน
- restore snapshot
- audit log cloud backup/restore
- UI cloud status ใน Settings

ยังไม่ต้อง sync realtime

## Phase 2: Sync-ready Local Metadata

เพิ่ม:

- metadata ในทุก store
- migration local data เดิม
- sync queue local
- tombstone
- health check

## Phase 3: Incremental Sync

เพิ่ม:

- push changes
- pull changes
- dependency order
- retry/backoff
- dead-letter
- server cursor

## Phase 4: Multi-device

เพิ่ม:

- Device Manager
- conflict list
- reconcile tools
- status per shop
- manual retry

## Phase 5: Cloud File Storage

เพิ่ม:

- upload receipts/tax invoices
- file metadata
- checksum
- missing file detector
- restore files

---

## Checklist ก่อนเริ่มเขียนโค้ด

- เลือก backend stack
- เลือก auth provider
- เลือก database
- เลือก object storage
- นิยาม schema กลาง
- นิยาม timezone policy
- นิยาม conflict policy
- นิยาม sync order
- นิยาม device identity
- วางแผน migration localStorage
- วางแผน UI cloud settings
- วางแผน observability/dead-letter

---

## ข้อสรุป

สำหรับแอพนี้ควรเริ่ม cloud ด้วยแนวคิด:

```text
Local-first + Cloud snapshot + Sync-ready metadata
```

ไม่ควรเริ่มจากการเอา localStorage ทั้งก้อนไปวาง cloud อย่างเดียว เพราะเมื่อมีหลายเครื่องจะเจอปัญหา:

- ข้อมูลทับกัน
- ข้อมูลฟื้นคืนชีพ
- ลบแล้วกลับมา
- เวลาไม่ตรง
- schema local/cloud ไม่ตรง
- sync fail เงียบ

Cloud backup ที่เรียกใช้ได้หลายเครื่องควรถูกออกแบบเป็น sync system ตั้งแต่แรก แม้ phase แรกจะปล่อยเป็น snapshot backup ก่อนก็ตาม
