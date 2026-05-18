# Cloud Backend Contract

เอกสารนี้คือสัญญา API สำหรับ backend ที่ frontend รองรับในโหมด manual cloud sync

## Environment

Frontend อ่านค่าเริ่มต้นจาก:

```env
VITE_API_BASE_URL=https://your-backend.example.com
```

ผู้ใช้ยังสามารถแก้ API URL ในหน้า `ตั้งค่าระบบ > Cloud Status` ได้

## Health

```http
GET /health
```

Response ตัวอย่าง:

```json
{
  "ok": true,
  "status": "healthy",
  "version": "1.0.0"
}
```

## Push Queue

```http
POST /api/sync/push
Content-Type: application/json
Authorization: Bearer <accessToken>
```

Request:

```json
{
  "shopId": "shop-id",
  "deviceId": "device-id",
  "changes": [
    {
      "id": "queue-item-id",
      "tableName": "transactions",
      "recordId": "record-id",
      "action": "upsert",
      "payload": {},
      "status": "pending",
      "attempts": 0,
      "shopId": "shop-id",
      "deviceId": "device-id",
      "createdAt": "2026-05-17T00:00:00.000Z",
      "updatedAt": "2026-05-17T00:00:00.000Z"
    }
  ]
}
```

Response:

```json
{
  "ok": true,
  "applied": ["queue-item-id"],
  "failed": [
    {
      "id": "queue-item-id-2",
      "recordId": "record-id-2",
      "message": "validation failed"
    }
  ],
  "syncedAt": "2026-05-17T00:00:00.000Z"
}
```

Frontend behavior:
- `applied` จะถูก mark เป็น `synced`
- `failed` จะถูก mark เป็น `failed`
- failed ครบ 10 ครั้งจะเป็น `dead`
- synced item จะถูก prune เก็บไว้เฉพาะรายการล่าสุดบางส่วน

## Pull Queue

Frontend เปิด `pull/apply` แบบ manual ผ่านหน้า `ตั้งค่าระบบ > Cloud Status` แล้ว แต่ยังไม่ใช่ auto sync scheduler แบบ Cal POS

```http
GET /api/sync/pull?shopId=<shopId>&since=<cursor>
Authorization: Bearer <accessToken>
```

Response:

```json
{
  "syncedAt": "2026-05-17T00:00:00.000Z",
  "changes": [
    {
      "shopId": "shop-id",
      "tableName": "transactions",
      "recordId": "record-id",
      "payload": {},
      "updatedAt": "2026-05-17T00:00:00.000Z",
      "deletedAt": null,
      "deviceId": "device-id",
      "actorId": "account-id"
    }
  ],
  "deletes": [
    {
      "shopId": "shop-id",
      "tableName": "transactions",
      "recordId": "record-id",
      "updatedAt": "2026-05-17T00:00:00.000Z",
      "deletedAt": "2026-05-17T00:00:00.000Z",
      "deviceId": "device-id",
      "actorId": "account-id"
    }
  ]
}
```

Frontend behavior:
- ข้าม record ที่มาจาก device เดียวกัน
- ข้าม record ที่เครื่องนี้ยังมี queue `pending`, `syncing`, หรือ `failed` เพื่อกัน overwrite
- ใช้ `updatedAt` จาก server เพื่อเลือกข้อมูลที่ใหม่กว่า
- หลัง apply แล้วควร reload แอพ เพื่อให้ store ทุกหน้าอ่าน localStorage ล่าสุดครบถ้วน

## Table Names ที่ Frontend ส่งได้

```text
transactions
pending_payments
pending_incomes
tax_invoices
recurring_items
recurring_entries
categories
vendors
quick_items
wallet_state
sub_wallets
loans
activity_logs
```

## Backend Rules ที่จำเป็น

1. Validate `shopId` ทุก request
2. Validate permission ฝั่ง server เสมอ
3. ห้ามรับหรือบันทึก plain password / plain PIN
4. ใช้ `id` + `shopId` เป็น idempotency key
5. `delete` ต้องสร้าง tombstone / SyncLog ไม่ลบทิ้งเงียบๆ
6. ใช้ server receipt time เป็น `syncedAt`
7. Push order ควรจัดตาม dependency:

```text
categories/vendors
wallet_state
sub_wallets/loans
recurring_items
recurring_entries
transactions
pending_payments
pending_incomes
tax_invoices
activity_logs
```

## Production Warning

`ALLOW_DEV_NO_AUTH=true` ใช้ได้เฉพาะ dev เท่านั้น ห้ามเปิดใน cloud production เพราะจะทำให้ endpoint sync รับข้อมูลโดยไม่ยืนยันตัวตน
