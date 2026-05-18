import { useCallback, useEffect, useRef } from 'react'
import { isCloudEnabled } from '../services/cloud/cloudConfig'
import { pushShopQueue } from '../services/cloud/syncApi'
import { pullAndApplyShop } from '../services/cloud/pullApply'
import { getPendingCloudQueueItems } from '../lib/cloudSyncMetadata'

const POLL_INTERVAL_MS = 30 * 1000   // pull ทุก 30 วินาที
const PUSH_DEBOUNCE_MS = 1500        // หน่วงหลัง enqueue ก่อน push (รวมหลาย action)

export function useAutoSync(shopId) {
  const shopIdRef = useRef(shopId)
  shopIdRef.current = shopId
  const pushTimerRef = useRef(null)
  const isSyncingRef = useRef(false)

  const doPush = useCallback(async (id) => {
    if (!id || !isCloudEnabled()) return
    const pending = getPendingCloudQueueItems(id, 1)
    if (pending.length === 0) return
    await pushShopQueue(id).catch(console.warn)
  }, [])

  const doPull = useCallback(async (id) => {
    if (!id || !isCloudEnabled()) return
    await pullAndApplyShop(id).catch(console.warn)
  }, [])

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

  // push ทันที (debounced) เมื่อมี item เข้า queue
  const schedulePush = useCallback(() => {
    clearTimeout(pushTimerRef.current)
    pushTimerRef.current = setTimeout(() => {
      doPush(shopIdRef.current)
    }, PUSH_DEBOUNCE_MS)
  }, [doPush])

  useEffect(() => {
    if (!shopId) return

    // sync ครั้งแรกเมื่อเข้าร้าน
    doSync()

    // poll ทุก 30s สำหรับ pull
    const pollTimer = setInterval(doSync, POLL_INTERVAL_MS)

    // push ทันทีเมื่อ enqueue มีข้อมูลใหม่
    const handleQueueUpdated = (e) => {
      if (e.detail?.shopId === shopId) schedulePush()
    }
    window.addEventListener('zuzoo:queue-updated', handleQueueUpdated)

    // push เมื่อกลับมา online
    window.addEventListener('online', doSync)

    return () => {
      clearInterval(pollTimer)
      clearTimeout(pushTimerRef.current)
      window.removeEventListener('zuzoo:queue-updated', handleQueueUpdated)
      window.removeEventListener('online', doSync)
    }
  }, [shopId, doSync, schedulePush])
}
