# Cloud Upload Implementation Status

เอกสารนี้สรุปการอัปเดตจากแนวทาง `Prepare-upload-system-to-cloud.md` ของ Cal POS โดยปรับให้เข้ากับระบบปัจจุบันแบบไม่เปลี่ยน flow การทำงานเดิม

## สิ่งที่อัปเดตแล้ว

### 1. Cloud metadata sidecar

เพิ่มไฟล์ `src/lib/cloudSyncMetadata.js`

หน้าที่:
- สร้าง `deviceId` ประจำเครื่อง
- เติม metadata ให้ record ใหม่/record ที่แก้ไข
- เพิ่ม `shopId`, `deviceId`, `updatedAt`, `deletedAt`, `syncStatus`, `cloudSync`
- สร้าง local sync queue ต่อร้านใน localStorage

queue key:

```text
{shopId}_cloud_sync_queue_v1
```

### 2. Write-ahead queue แบบไม่กระทบ offline flow

store หลักที่ถูกผูก queue แล้ว:
- `transactions`
- `pending_payments`
- `pending_incomes`
- `tax_invoices`
- `recurring_items`
- `recurring_entries`
- `categories`
- `vendors`
- `quick_items`
- `wallet_state`
- `sub_wallets`
- `loans`

ทุก create/update/delete จะยังทำงานกับ localStorage เดิม แต่จะ enqueue ข้อมูลไว้สำหรับ cloud sync ในอนาคตควบคู่กัน

### 3. Delete tracking

รายการที่ลบยังคงถูกลบออกจาก UI ตาม flow เดิม แต่ระบบจะสร้าง queue action:

```text
action: delete
payload: { id, shopId, deletedAt, updatedAt, cloudSync }
```

เพื่อเตรียมให้ backend ทำ tombstone / SyncLog ตอนเปิด cloud จริง

### 4. Cloud Status ในหน้า Settings

เพิ่ม Tab `Cloud Status` ใน `ตั้งค่าระบบ`

หน้าที่:
- แสดง `deviceId` ของเครื่อง
- แสดงจำนวน queue ทั้งหมด / pending / failed / dead ต่อร้าน
- ดาวน์โหลดรายงาน `cloud-upload-readiness`
- จัดระเบียบ queue เพื่อลดรายการ upsert ซ้ำของ record เดียวกัน
- ไม่มีการเชื่อมต่อ network หรือส่งข้อมูลออกจากเครื่อง

### 5. Queue cleanup รวมกับระบบล้างข้อมูล

เพิ่ม `cloud_sync_queue_v1` เข้า `SHOP_DATA_BASES`

ผลลัพธ์:
- backup รายร้านจะรวม queue readiness ไปด้วย
- reset/l้างข้อมูลร้านจะล้าง queue ของร้านนั้นด้วย
- ไม่กระทบ flow การบันทึกข้อมูลหลัก เพราะ queue เป็น sidecar เท่านั้น

## สิ่งที่ตั้งใจยังไม่อัปเดต เพราะอาจกระทบ flow

### 1. ยังไม่ย้าย localStorage ไป Dexie

เหตุผล:
- กระทบ storage layer ทั้งระบบ
- เสี่ยงข้อมูลเดิม migrate ผิด
- ต้องมี migration และ regression test เต็มระบบก่อน

### 2. ยังไม่เปิด API sync จริง

เหตุผล:
- ยังไม่มี backend, JWT, schema, conflict resolution, retry/dead-letter UI
- ถ้าเปิด push/pull ตอนนี้มีโอกาสทำให้ข้อมูล local/cloud ไม่ตรงกัน

### 3. ยังไม่ sync user/password/PIN

เหตุผล:
- user store มี `passwordPlain` และ `pinPlain` สำหรับ permission ดูรหัส
- ห้ามส่งข้อมูลนี้เข้า queue/cloud ตรงๆ
- ต้องออกแบบ backend auth แยก โดยใช้ hash/token เท่านั้น

### 4. ยังไม่เปลี่ยน hard delete เป็น soft delete ใน UI

เหตุผล:
- บางหน้าใช้การ filter รายการหลังลบเป็น flow เดิม
- ตอนนี้ใช้ queue delete เป็น sidecar ก่อน
- หากจะทำ soft delete จริง ต้องปรับทุก selector ให้กรอง `deletedAt`

## ความเสี่ยงที่ยังเหลือ

1. **Queue ยังเป็น localStorage**
   ถ้ามี transaction เยอะมาก queue อาจโต ต้องมี pruning / compaction ก่อนเปิด sync จริง

2. **ไม่มี backend validation**
   ข้อมูลที่ enqueue ยังเป็น snapshot จาก client ต้องตรวจ type ด้วย schema กลางก่อน push

3. **ไฟล์แนบยังเป็น path local**
   queue เก็บ metadata ของบิลได้ แต่ไฟล์จริงต้องมี upload pipeline ไป cloud storage

4. **ยังไม่มี conflict strategy ในโค้ดจริง**
   มี metadata `updatedAt/revision` แล้ว แต่ยังไม่มี pull/apply/conflict handling

5. **ยังไม่มี dead-letter UI**
   ตอนนี้มีหน้าแสดงจำนวน failed/dead แล้ว แต่ยังไม่มี retry จริง เพราะยังไม่มี backend sync

## ขั้นถัดไปที่ควรทำ

1. เพิ่มหน้า Cloud Sync Status ใน Settings
2. เพิ่ม queue compaction เช่น record เดียวกัน upsert หลายครั้งให้เหลือ snapshot ล่าสุด
3. เพิ่ม export queue/debug report สำหรับทดสอบ
4. ออกแบบ backend schema ตาม entity จริงของแอปนี้
5. ทำ cloud backup + restore พร้อมไฟล์แนบก่อน realtime sync
6. แยก auth cloud ออกจาก auth local และห้าม sync plain password/PIN

## สรุป

การอัปเดตรอบนี้เป็นการเตรียมฐาน cloud sync แบบปลอดภัยต่อระบบปัจจุบัน:

- ไม่เปลี่ยนหน้าจอ
- ไม่เปลี่ยน flow การบันทึก
- ไม่เปิด network sync
- ไม่แตะข้อมูล auth ขึ้น queue
- เพิ่ม metadata และ queue เพื่อรองรับ backend/cloud ในเฟสถัดไป
- Manual cloud bridge added in this update:
  - `src/services/cloud/cloudConfig.js`
  - `src/services/cloud/apiClient.js`
  - `src/services/cloud/syncApi.js`
  - `.env.example`
  - `CLOUD_BACKEND_CONTRACT.md`
  - Settings > Cloud Status can save API URL, check `/health`, and manually push queue to `/api/sync/push`
  - Cloud sync remains disabled by default and never auto-runs
  - Pull/apply, auth sync, and attachment upload remain locked until backend conflict/security rules exist
