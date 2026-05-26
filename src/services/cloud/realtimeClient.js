/**
 * realtimeClient.js — Supabase Realtime (postgres_changes + Broadcast fallback)
 *
 * กลไกหลัก: postgres_changes
 *   Machine A push ข้อมูลไป Supabase → Supabase ยิง event พร้อมข้อมูลไปหา Machine B
 *   Machine B รับ event → apply โดยตรงใน localStorage + Zustand → UI อัปเดต ~200-400ms
 *   ไม่ต้อง pull รอบใหม่เลย
 *
 * กลไกสำรอง: Broadcast
 *   ยิงหลัง push สำเร็จเสมอ → ถ้า postgres_changes ไม่ได้เปิด →
 *   Machine B รับ broadcast → trigger doPull เป็น fallback
 *
 * ข้อกำหนดบน Supabase Dashboard:
 *   ต้องเปิด Realtime สำหรับแต่ละ table ใน Database → Replication
 *   tables: transactions, pending_payments, pending_incomes, tax_invoices,
 *           recurring_items, recurring_entries, categories, vendors, quick_items,
 *           sub_wallets, loans, wallet_state, activity_logs
 */

import { getSupabaseClient } from './apiClient'
import { getCloudDeviceId } from '../../lib/cloudSyncMetadata'
import { isCloudEnabled } from './cloudConfig'
import { applyArrayUpsert, applyArrayDelete, applyWalletState, rowToPayload } from './pullApply'

import useTransactionStore from '../../store/useTransactionStore'
import useWalletStore from '../../store/useWalletStore'
import useCategoryStore from '../../store/useCategoryStore'
import usePendingStore from '../../store/usePendingStore'
import useRecurringStore from '../../store/useRecurringStore'
import useLogStore from '../../store/useLogStore'

// ─── Constants ────────────────────────────────────────────────────────────────

// ทุก table ที่ sync ผ่าน realtime
const REALTIME_TABLES = [
  'transactions',
  'pending_payments',
  'pending_incomes',
  'tax_invoices',
  'recurring_items',
  'recurring_entries',
  'categories',
  'vendors',
  'quick_items',
  'sub_wallets',
  'loans',
  'wallet_state',
  'activity_logs',
]

// map table → ฟังก์ชัน rehydrate Zustand store ที่เกี่ยวข้อง
// rehydrate เฉพาะ store ที่เปลี่ยน ไม่ต้องรีโหลดทั้งหมด
const TABLE_REHYDRATE = {
  transactions:     () => useTransactionStore.persist.rehydrate(),
  pending_payments: () => usePendingStore.persist.rehydrate(),
  pending_incomes:  () => usePendingStore.persist.rehydrate(),
  tax_invoices:     () => usePendingStore.persist.rehydrate(),
  recurring_items:  () => useRecurringStore.persist.rehydrate(),
  recurring_entries:() => useRecurringStore.persist.rehydrate(),
  categories:       () => useCategoryStore.persist.rehydrate(),
  vendors:          () => useCategoryStore.persist.rehydrate(),
  quick_items:      () => useCategoryStore.persist.rehydrate(),
  sub_wallets:      () => useWalletStore.persist.rehydrate(),
  loans:            () => useWalletStore.persist.rehydrate(),
  wallet_state:     () => useWalletStore.persist.rehydrate(),
  activity_logs:    () => useLogStore.persist.rehydrate(),
}

// ─── Module state ─────────────────────────────────────────────────────────────

let activeChannel = null
let activeShopId = null
let realtimeStatus = 'CLOSED'
let onFallbackHandler = null  // callback สำหรับ broadcast fallback → trigger pull

// ─── Internal helpers ─────────────────────────────────────────────────────────

function dispatchStatus(status, shopId = activeShopId) {
  realtimeStatus = status
  try {
    window.dispatchEvent(new CustomEvent('zuzoo:realtime-status', { detail: { status, shopId } }))
  } catch { /* ignore in non-browser env */ }
}

/**
 * Apply ข้อมูลจาก realtime event เข้า localStorage + Zustand โดยตรง
 * ไม่ต้อง pull รอบใหม่
 */
async function applyRealtimeRow(shopId, tableName, eventType, newRow, oldRow) {
  try {
    if (eventType === 'DELETE') {
      // Hard delete — ลบออกจาก list
      const recordId = oldRow?.id ?? newRow?.id
      if (recordId) await applyArrayDelete(shopId, tableName, recordId)
    } else {
      // INSERT หรือ UPDATE
      if (newRow.deleted_at) {
        // Soft delete — ลบออกจาก list เหมือนกัน
        await applyArrayDelete(shopId, tableName, newRow.id)
      } else {
        const payload = rowToPayload(newRow)
        if (tableName === 'wallet_state') {
          await applyWalletState(shopId, payload)
        } else {
          await applyArrayUpsert(shopId, tableName, payload)
        }
      }
    }

    // Rehydrate เฉพาะ store ที่ได้รับผลกระทบ → UI อัปเดตทันที
    const rehydrate = TABLE_REHYDRATE[tableName]
    if (rehydrate) await rehydrate()
  } catch (err) {
    console.warn(`[realtimeClient] apply ${tableName} (${eventType}) failed:`, err?.message)
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * เชื่อมต่อ Realtime channel สำหรับ shop นี้
 *
 * @param {string} shopId
 * @param {function} onFallback - เรียกเมื่อได้รับ broadcast fallback event
 *                                (กรณี postgres_changes ไม่ได้เปิดในตาราง)
 */
export function connectRealtime(shopId, onFallback) {
  if (!shopId || !isCloudEnabled()) return
  if (activeShopId === shopId && activeChannel) {
    // อัปเดต callback ใหม่ถ้ามี
    onFallbackHandler = onFallback ?? null
    return
  }

  disconnectRealtime()
  activeShopId = shopId
  onFallbackHandler = onFallback ?? null

  const localDeviceId = getCloudDeviceId()

  try {
    const supabase = getSupabaseClient()

    // ใช้ channel เดียวสำหรับทั้ง postgres_changes และ broadcast
    let ch = supabase.channel(`shop-realtime:${shopId}`)

    // ── postgres_changes: subscribe ทุก table ──────────────────────────────
    for (const tableName of REALTIME_TABLES) {
      ch = ch.on(
        'postgres_changes',
        {
          event: '*',            // INSERT | UPDATE | DELETE
          schema: 'public',
          table: tableName,
          filter: `shop_id=eq.${shopId}`,
        },
        (payload) => {
          const newRow = payload.new ?? {}
          const oldRow = payload.old ?? {}
          const deviceId = newRow.device_id ?? oldRow.device_id

          // ข้ามถ้าเป็นเครื่องตัวเอง (เราส่งขึ้นไปเอง ไม่ต้องรับกลับมา)
          if (deviceId && deviceId === localDeviceId) return

          applyRealtimeRow(shopId, tableName, payload.eventType, newRow, oldRow)
        }
      )
    }

    // ── Broadcast fallback: กรณี postgres_changes ไม่ได้เปิดในตาราง ──────
    ch = ch.on('broadcast', { event: 'sync' }, (message) => {
      const fromDeviceId = message?.payload?.fromDeviceId
      if (fromDeviceId && fromDeviceId === localDeviceId) return
      if (typeof onFallbackHandler === 'function') {
        onFallbackHandler(message?.payload?.syncedAt ?? null)
      }
    })

    activeChannel = ch.subscribe((status) => {
      dispatchStatus(status, shopId)
    })
  } catch (err) {
    console.warn('[realtimeClient] connect failed:', err?.message)
    dispatchStatus('CHANNEL_ERROR', shopId)
  }
}

/**
 * ส่ง Broadcast fallback หลัง push สำเร็จ
 * ทำงานร่วมกับ postgres_changes: ถ้า postgres_changes ทำงาน → broadcast เป็น no-op
 * ถ้า postgres_changes ไม่ทำงาน → broadcast trigger pull บน Machine อื่น
 */
export async function broadcastSync(shopId, syncedAt) {
  if (!isCloudEnabled() || !activeChannel || activeShopId !== shopId) return
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
    // broadcast failure must not block a completed push
    console.warn('[realtimeClient] broadcast failed:', err?.message)
  }
}

/**
 * ตัดการเชื่อมต่อ Realtime channel
 */
export function disconnectRealtime() {
  if (activeChannel) {
    try { activeChannel.unsubscribe() } catch { /* ignore */ }
    activeChannel = null
  }
  const closedShopId = activeShopId
  activeShopId = null
  onFallbackHandler = null
  dispatchStatus('CLOSED', closedShopId)
}

/**
 * ตรวจสอบว่า Realtime channel subscribe อยู่หรือไม่
 */
export function isRealtimeConnected() {
  return activeChannel !== null && realtimeStatus === 'SUBSCRIBED'
}
