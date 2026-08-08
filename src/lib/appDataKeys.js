export const LOG_KEY = 'default_activity_log'

export const APP_DATA_KEYS = [
  'default_transactions',
  'default_pending_data',
  'default_wallet_main',
  'default_categories_data',
  LOG_KEY,
  'default_calendar_notes',
  'default_app_settings',
  'default_recurring_data',
]

export function removeAllAppData() {
  APP_DATA_KEYS.forEach((key) => localStorage.removeItem(key))

  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith('draft:'))
      .forEach((key) => sessionStorage.removeItem(key))
  } catch { /* noop */ }
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
