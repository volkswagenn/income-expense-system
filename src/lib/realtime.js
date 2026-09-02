import { supabase } from './supabase'
import useAppStore from '../store/useAppStore'
import useCategoryStore from '../store/useCategoryStore'
import useNoteStore from '../store/useNoteStore'
import usePendingStore from '../store/usePendingStore'
import useRecurringStore from '../store/useRecurringStore'
import useTransactionStore from '../store/useTransactionStore'
import useWalletStore from '../store/useWalletStore'

/**
 * ให้ทุกเครื่องที่เปิดอยู่เห็นการแก้ไขของกันและกัน
 *
 * วิธี: ฟัง postgres_changes ของทุกตารางในร้าน (กรองด้วย shop_id) แล้ว "ดึงใหม่ทั้งชุด"
 * ของ store ที่เกี่ยวข้อง แทนที่จะพยายามแพตช์ทีละแถวจาก payload
 *   • ปลอดภัยกว่า — งานที่แตะเงินแก้หลายตารางในทรานแซกชันเดียว ถ้าแพตช์ทีละ event
 *     จะมีจังหวะที่หน้าจอเห็นครึ่งเดียว (รายการมาแล้วแต่ยอดยังไม่ขยับ)
 *   • ง่ายกว่า — ไม่ต้องแปลง payload snake_case → camelCase และไม่ต้องกรอง echo ของตัวเอง
 *     (event จากสิ่งที่เครื่องนี้เพิ่งทำ แค่ทำให้ดึงซ้ำอีกรอบ ไม่เสียหาย)
 * event ที่มาติดกันถูกรวมเป็นครั้งเดียวด้วย debounce สั้นๆ
 *
 * เสริมด้วย: กลับมาที่แท็บหลังซ่อนไว้นานเกิน STALE_AFTER_MS → ดึงทั้งหมดใหม่ เผื่อ
 * websocket หลุดไปตอนเครื่องหลับแล้ว event หายไประหว่างนั้น
 */

const TABLE_STORES = {
  transactions: [useTransactionStore],
  wallet_state: [useWalletStore],
  transfer_accounts: [useWalletStore],
  sub_wallets: [useWalletStore],
  loans: [useWalletStore],
  pending_payments: [usePendingStore],
  pending_incomes: [usePendingStore],
  tax_invoices: [usePendingStore],
  recurring_items: [useRecurringStore],
  recurring_entries: [useRecurringStore],
  categories: [useCategoryStore],
  vendors: [useCategoryStore],
  quick_items: [useCategoryStore],
  calendar_notes: [useNoteStore],
  shop_settings: [useAppStore],
}

const DEBOUNCE_MS = 400
const STALE_AFTER_MS = 30_000

/** ดึงข้อมูลของทุก store ใหม่ (ไม่รวมประวัติ ซึ่งโหลดทีละหน้าตอนเปิดหน้าประวัติ) */
export async function refreshAllStores() {
  const stores = new Set(Object.values(TABLE_STORES).flat())
  await Promise.all([...stores].map((s) => s.getState().refresh()))
}

/**
 * เริ่มฟังการเปลี่ยนแปลงของร้านนี้ — คืนฟังก์ชันสำหรับหยุดฟัง (ใช้ใน useEffect)
 * @param {string} shopId
 * @param {(status: 'connected'|'disconnected') => void} [onStatus]
 */
export function subscribeRealtime(shopId, onStatus) {
  if (!shopId) return () => {}

  const dirty = new Set()
  let timer = null

  const flush = () => {
    timer = null
    const stores = new Set([...dirty].flatMap((table) => TABLE_STORES[table] ?? []))
    dirty.clear()
    for (const store of stores) {
      store.getState().refresh().catch((err) => {
        console.warn('ดึงข้อมูลตาม realtime ไม่สำเร็จ:', err?.message ?? err)
      })
    }
  }

  const channel = supabase.channel(`shop:${shopId}`)
  for (const table of Object.keys(TABLE_STORES)) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `shop_id=eq.${shopId}` },
      () => {
        dirty.add(table)
        if (!timer) timer = setTimeout(flush, DEBOUNCE_MS)
      }
    )
  }
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') onStatus?.('connected')
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') onStatus?.('disconnected')
  })

  // กลับมาที่แท็บหลังหายไปนาน → ดึงใหม่ทั้งชุด
  let hiddenAt = null
  const onVisibility = () => {
    if (document.hidden) {
      hiddenAt = Date.now()
      return
    }
    if (hiddenAt && Date.now() - hiddenAt >= STALE_AFTER_MS) {
      refreshAllStores().catch((err) => console.warn('ดึงข้อมูลตอนกลับมาที่แท็บไม่สำเร็จ:', err?.message ?? err))
    }
    hiddenAt = null
  }
  document.addEventListener('visibilitychange', onVisibility)

  return () => {
    if (timer) clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisibility)
    supabase.removeChannel(channel)
  }
}
