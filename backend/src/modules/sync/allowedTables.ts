export const ALLOWED_SYNC_TABLES = new Set([
  'transactions',
  'pending_payments',
  'pending_incomes',
  'tax_invoices',
  'recurring_items',
  'recurring_entries',
  'categories',
  'vendors',
  'quick_items',
  'wallet_state',
  'sub_wallets',
  'loans',
  'activity_logs',
  'app_settings',
])

export const TABLE_ORDER: Record<string, number> = {
  categories: 10,
  vendors: 10,
  quick_items: 20,
  wallet_state: 30,
  sub_wallets: 40,
  loans: 40,
  recurring_items: 50,
  recurring_entries: 60,
  transactions: 70,
  pending_payments: 80,
  pending_incomes: 80,
  tax_invoices: 90,
  activity_logs: 100,
  app_settings: 110,
}

export function assertAllowedTable(tableName: string) {
  if (!ALLOWED_SYNC_TABLES.has(tableName)) {
    throw new Error(`Unsupported sync table: ${tableName}`)
  }
}

