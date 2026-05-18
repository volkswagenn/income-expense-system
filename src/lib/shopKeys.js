export const SHOP_DATA_BASES = [
  'transactions',
  'pending_data',
  'wallet_main',
  'categories_data',
  'activity_log',
  'calendar_notes',
  'app_settings',
  'recurring_data',
  'cloud_sync_queue_v1',
]

export const shopDataKeys = (shopId) => SHOP_DATA_BASES.map((b) => `${shopId}_${b}`)

export const DEFAULT_SHOP_DATA_KEYS = SHOP_DATA_BASES.map((base) => `default_${base}`)

export function isKnownShopDataKey(key) {
  return SHOP_DATA_BASES.some((base) => key === `default_${base}` || key.endsWith(`_${base}`))
}

export function removeShopData(shopId) {
  shopDataKeys(shopId).forEach((key) => localStorage.removeItem(key))
}

export function removeAllAppData() {
  const keys = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (key === 'zuzoo_shop_registry' || isKnownShopDataKey(key)) keys.push(key)
  }
  keys.forEach((key) => localStorage.removeItem(key))

  try {
    const draftKeys = []
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i)
      if (key?.startsWith('draft:')) draftKeys.push(key)
    }
    draftKeys.forEach((key) => sessionStorage.removeItem(key))
  } catch {}
}

export function removeDraftData() {
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith('draft:'))
      .forEach((key) => sessionStorage.removeItem(key))
  } catch {}
}

export function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
