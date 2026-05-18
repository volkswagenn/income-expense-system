// Reads active shop ID from localStorage synchronously at module load time.
// Stores import this to initialize their persist keys before React mounts.
export const activeShopId = (() => {
  try {
    const raw = localStorage.getItem('zuzoo_shop_registry')
    if (!raw) return null
    return JSON.parse(raw)?.state?.activeShopId ?? null
  } catch {
    return null
  }
})()
