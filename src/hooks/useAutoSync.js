import { useCallback, useEffect, useRef } from 'react'
import { isCloudEnabled } from '../services/cloud/cloudConfig'
import { pushShopQueue } from '../services/cloud/syncApi'
import { pullAndApplyShop } from '../services/cloud/pullApply'
import { getPendingCloudQueueItems } from '../lib/cloudSyncMetadata'
import { connectWs, disconnectWs, isWsConnected } from '../services/cloud/wsClient'
import useTransactionStore from '../store/useTransactionStore'
import useWalletStore from '../store/useWalletStore'
import useCategoryStore from '../store/useCategoryStore'
import usePendingStore from '../store/usePendingStore'
import useRecurringStore from '../store/useRecurringStore'
import useLogStore from '../store/useLogStore'

// หลัง pullAndApplyShop เขียนข้อมูลลง localStorage แล้ว
// ต้องบอก Zustand ให้โหลดข้อมูลใหม่จาก storage เข้า memory
// ไม่งั้น UI จะยังแสดงข้อมูลเก่าอยู่แม้ pull สำเร็จ
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

const FALLBACK_POLL_MS = 5 * 60 * 1000
const PUSH_DEBOUNCE_MS = 1500

export function useAutoSync(shopId) {
  const shopIdRef = useRef(shopId)
  shopIdRef.current = shopId
  const pushTimerRef = useRef(null)
  const pollTimerRef = useRef(null)
  const isSyncingRef = useRef(false)

  const doPush = useCallback(async (id) => {
    if (!id || !isCloudEnabled()) return
    const pending = await getPendingCloudQueueItems(id, 1)
    if (pending.length === 0) return
    await pushShopQueue(id).catch(console.warn)
  }, [])

  const doPull = useCallback(async (id) => {
    if (!id || !isCloudEnabled()) return
    await pullAndApplyShop(id).catch(console.warn)
    // Bug fix: บอก Zustand ให้โหลดข้อมูลจาก storage ใหม่เข้า memory
    // pullAndApplyShop เขียนลง localStorage โดยตรง Zustand ไม่รู้ → UI ไม่อัปเดต
    await rehydrateShopStores().catch(console.warn)
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

  const schedulePush = useCallback(() => {
    clearTimeout(pushTimerRef.current)
    pushTimerRef.current = setTimeout(() => {
      doPush(shopIdRef.current)
    }, PUSH_DEBOUNCE_MS)
  }, [doPush])

  const startFallbackPoll = useCallback(() => {
    if (pollTimerRef.current) return
    pollTimerRef.current = setInterval(() => {
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

    doSync()

    connectWs(shopId, () => {
      doPull(shopIdRef.current)
      stopFallbackPoll()
    })

    const fallbackCheckTimer = setTimeout(() => {
      if (!isWsConnected()) startFallbackPoll()
    }, 5_000)

    const handleQueueUpdated = (event) => {
      if (event.detail?.shopId === shopId) schedulePush()
    }
    window.addEventListener('zuzoo:queue-updated', handleQueueUpdated)

    const handleOnline = () => {
      doSync()
      if (!isWsConnected()) startFallbackPoll()
    }
    window.addEventListener('online', handleOnline)

    const handleWsStatus = (event) => {
      if (event.detail?.status === 'open') {
        doPull(shopIdRef.current)
        stopFallbackPoll()
        return
      }
      startFallbackPoll()
    }
    window.addEventListener('zuzoo:sync-ws-status', handleWsStatus)

    return () => {
      disconnectWs()
      stopFallbackPoll()
      clearTimeout(fallbackCheckTimer)
      clearTimeout(pushTimerRef.current)
      window.removeEventListener('zuzoo:queue-updated', handleQueueUpdated)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('zuzoo:sync-ws-status', handleWsStatus)
    }
  }, [shopId, doSync, doPull, schedulePush, startFallbackPoll, stopFallbackPoll])
}
