import useTransactionStore, { INITIAL as TX_INITIAL }        from '../store/useTransactionStore'
import usePendingStore,     { INITIAL as PENDING_INITIAL }    from '../store/usePendingStore'
import useWalletStore,      { INITIAL as WALLET_INITIAL }     from '../store/useWalletStore'
import useCategoryStore,    { INITIAL as CAT_INITIAL }        from '../store/useCategoryStore'
import useLogStore,         { INITIAL as LOG_INITIAL }        from '../store/useLogStore'
import useNoteStore,        { INITIAL as NOTE_INITIAL }       from '../store/useNoteStore'
import useAppStore,         { INITIAL_PERSISTED as APP_INITIAL } from '../store/useAppStore'
import useRecurringStore,   { INITIAL as RECURRING_INITIAL }  from '../store/useRecurringStore'

const STORE_CONFIGS = [
  { store: useTransactionStore, base: 'transactions',    initial: TX_INITIAL },
  { store: usePendingStore,     base: 'pending_data',   initial: PENDING_INITIAL },
  { store: useWalletStore,      base: 'wallet_main',    initial: WALLET_INITIAL },
  { store: useCategoryStore,    base: 'categories_data', initial: CAT_INITIAL },
  { store: useLogStore,         base: 'activity_log',   initial: LOG_INITIAL },
  { store: useNoteStore,        base: 'calendar_notes', initial: NOTE_INITIAL },
  { store: useAppStore,         base: 'app_settings',   initial: APP_INITIAL },
  { store: useRecurringStore,   base: 'recurring_data', initial: RECURRING_INITIAL },
]

// Switch all data stores to the given shop's localStorage namespace.
// For new shops (no existing data), seeds localStorage with initial state
// so rehydrate loads defaults instead of leftover state from the previous shop.
// Never calls _reset() — that would write empty state to the current key,
// wiping the shop's saved data before the key is changed.
export function switchToShop(shopId) {
  for (const { store, base, initial } of STORE_CONFIGS) {
    const newKey = `${shopId}_${base}`
    if (!localStorage.getItem(newKey)) {
      localStorage.setItem(newKey, JSON.stringify({ state: initial, version: 0 }))
    }
    store.persist.setOptions({ name: newKey })
    store.persist.rehydrate()
  }
}
