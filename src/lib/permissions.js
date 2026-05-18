// ─── Permission keys ──────────────────────────────────────────
export const P = {
  VIEW_SHOPS:          'view_shops',
  MANAGE_USERS:        'manage_users',
  MANAGE_ROLES:        'manage_roles',
  MANAGE_USER_BLOCK:   'manage_user_block',
  VIEW_USER_SECRET:    'view_user_secret',
  VIEW_SHOP_SESSIONS:  'view_shop_sessions',
  MANAGE_SHOP_SESSIONS:'manage_shop_sessions',
  MANAGE_SETTINGS:     'manage_settings',
  VIEW_DASHBOARD:      'view_dashboard',
  VIEW_WALLET:         'view_wallet',
  VIEW_PENDING_TASKS:  'view_pending_tasks',
  VIEW_PENDING_PAYMENT:'view_pending_payment',
  VIEW_PENDING_INCOME: 'view_pending_income',
  MANAGE_TRANSACTIONS: 'manage_transactions',
  MANAGE_INCOME:       'manage_income',
  MANAGE_EXPENSE:      'manage_expense',
  MANAGE_RECURRING:    'manage_recurring',
  VIEW_REPORTS:        'view_reports',
  VIEW_HISTORY:        'view_history',
  VIEW_HISTORY_ALL:    'view_history_all',
  VIEW_HISTORY_MONEY:  'view_history_money',
  VIEW_HISTORY_ACTOR:  'view_history_actor',
  IMPORT_DATA:         'import_data',
  MANAGE_BACKUP:       'manage_backup',
  MANAGE_STORE_USERS:       'manage_store_users',
  MANAGE_STORE_ROLES:       'manage_store_roles',
  MANAGE_STORE_USER_BLOCK:  'manage_store_user_block',
  VIEW_STORE_USER_SECRET:   'view_store_user_secret',
  VIEW_OWN_SHOP_SESSIONS:   'view_own_shop_sessions',
  MANAGE_OWN_SHOP_SESSIONS: 'manage_own_shop_sessions',
  VIEW_GLOBAL_HISTORY:      'view_global_history',
  VIEW_GLOBAL_HISTORY_ALL:  'view_global_history_all',
  VIEW_GLOBAL_HISTORY_MONEY:'view_global_history_money',
  VIEW_GLOBAL_HISTORY_ACTOR:'view_global_history_actor',
}

// ─── Permission metadata (label + group) ──────────────────────
export const PERMISSION_LABELS = {
  [P.VIEW_SHOPS]:          { label: 'ดูรายการร้านค้า',        group: 'หน้าหลัก',   icon: '🏪' },
  [P.MANAGE_USERS]:        { label: 'จัดการผู้ใช้งานระบบหลัก', group: 'หน้าหลัก',   icon: '👥' },
  [P.MANAGE_ROLES]:        { label: 'จัดการ Role',            group: 'หน้าหลัก',   icon: '🎭', parent: P.MANAGE_USERS, kind: 'detail' },
  [P.MANAGE_USER_BLOCK]:   { label: 'บล็อก/ปลดบล็อกผู้ใช้',  group: 'หน้าหลัก',   icon: '⛔', parent: P.MANAGE_USERS, kind: 'detail' },
  [P.VIEW_USER_SECRET]:    { label: 'แสดงรหัสผ่าน/PIN',       group: 'หน้าหลัก',   icon: '🔐', parent: P.MANAGE_USERS, kind: 'detail' },
  [P.MANAGE_SETTINGS]:     { label: 'ตั้งค่าระบบ',            group: 'หน้าหลัก',   icon: '⚙️' },
  [P.VIEW_GLOBAL_HISTORY]:      { label: 'ประวัติทั้งหมด (ระบบหลัก)',        group: 'หน้าหลัก', icon: '🕐' },
  [P.VIEW_GLOBAL_HISTORY_ALL]:  { label: 'ประวัติทั้งหมด',                   group: 'หน้าหลัก', icon: '📋', parent: P.VIEW_GLOBAL_HISTORY, kind: 'tab' },
  [P.VIEW_GLOBAL_HISTORY_MONEY]:{ label: 'ประวัติรายการเงิน',                group: 'หน้าหลัก', icon: '💰', parent: P.VIEW_GLOBAL_HISTORY, kind: 'tab' },
  [P.VIEW_GLOBAL_HISTORY_ACTOR]:{ label: 'ดูผู้ทำรายการในประวัติระบบหลัก',  group: 'หน้าหลัก', icon: '👤', parent: P.VIEW_GLOBAL_HISTORY, kind: 'detail' },
  [P.VIEW_DASHBOARD]:      { label: 'Dashboard',              group: 'ภายในร้าน',  icon: '📊' },
  [P.VIEW_WALLET]:         { label: 'กระเป๋าเงินหลัก',        group: 'ภายในร้าน',  icon: '👛' },
  [P.VIEW_PENDING_TASKS]:  { label: 'รายการรอดำเนินการ',     group: 'ภายในร้าน',  icon: '⏳' },
  [P.VIEW_PENDING_PAYMENT]:{ label: 'รายการค้างจ่าย',         group: 'ภายในร้าน',  icon: '🧾', parent: P.VIEW_PENDING_TASKS, kind: 'tab' },
  [P.VIEW_PENDING_INCOME]: { label: 'รายการรอรับเงิน',        group: 'ภายในร้าน',  icon: '💵', parent: P.VIEW_PENDING_TASKS, kind: 'tab' },
  [P.MANAGE_TRANSACTIONS]: { label: 'เข้าเมนูบันทึกรายรับ-รายจ่าย',  group: 'ภายในร้าน',  icon: '📝' },
  [P.MANAGE_INCOME]:       { label: 'บันทึกรายรับ',              group: 'ภายในร้าน',  icon: '📥', parent: P.MANAGE_TRANSACTIONS, kind: 'tab' },
  [P.MANAGE_EXPENSE]:      { label: 'บันทึกรายจ่าย',             group: 'ภายในร้าน',  icon: '📤', parent: P.MANAGE_TRANSACTIONS, kind: 'tab' },
  [P.MANAGE_RECURRING]:    { label: 'จัดการรายการประจำ',         group: 'ภายในร้าน',  icon: '🔁', parent: P.MANAGE_TRANSACTIONS, kind: 'tab' },
  [P.VIEW_REPORTS]:        { label: 'รายงาน',                 group: 'ภายในร้าน',  icon: '📈' },
  [P.VIEW_HISTORY]:        { label: 'ประวัติทั้งหมด',             group: 'ภายในร้าน',  icon: '🕐' },
  [P.VIEW_HISTORY_ALL]:    { label: 'ประวัติทั้งหมด',             group: 'ภายในร้าน',  icon: '📋', parent: P.VIEW_HISTORY, kind: 'tab' },
  [P.VIEW_HISTORY_MONEY]:  { label: 'ประวัติรายการเงิน',          group: 'ภายในร้าน',  icon: '💰', parent: P.VIEW_HISTORY, kind: 'tab' },
  [P.VIEW_HISTORY_ACTOR]:  { label: 'ดูผู้ทำรายการในประวัติ',    group: 'ภายในร้าน',  icon: '👤', parent: P.VIEW_HISTORY, kind: 'detail' },
  [P.IMPORT_DATA]:         { label: 'นำเข้าข้อมูล',           group: 'ภายในร้าน',  icon: '📥' },
  [P.MANAGE_BACKUP]:       { label: 'สำรองข้อมูล',            group: 'ภายในร้าน',  icon: '💾' },
  [P.MANAGE_STORE_USERS]:      { label: 'จัดการผู้ใช้งาน (ร้านค้า)',        group: 'ภายในร้าน',  icon: '👥' },
  [P.MANAGE_STORE_ROLES]:      { label: 'จัดการ Role (ร้านค้า)',           group: 'ภายในร้าน',  icon: '🎭', parent: P.MANAGE_STORE_USERS, kind: 'detail' },
  [P.MANAGE_STORE_USER_BLOCK]: { label: 'บล็อก/ปลดบล็อกผู้ใช้ (ร้านค้า)', group: 'ภายในร้าน',  icon: '⛔', parent: P.MANAGE_STORE_USERS, kind: 'detail' },
  [P.VIEW_STORE_USER_SECRET]:  { label: 'แสดงรหัสผ่าน/PIN (ร้านค้า)',     group: 'ภายในร้าน',  icon: '🔐', parent: P.MANAGE_STORE_USERS, kind: 'detail' },
}

Object.assign(PERMISSION_LABELS, {
  [P.VIEW_SHOP_SESSIONS]: {
    label: 'ดู Monitor การเข้าใช้งานร้านค้า',
    group: 'หน้าหลัก',
    icon: '👁️',
    parent: P.VIEW_SHOPS,
    kind: 'detail',
  },
  [P.MANAGE_SHOP_SESSIONS]: {
    label: 'จัดการ Session ร้านค้า',
    group: 'หน้าหลัก',
    icon: '🧹',
    parent: P.VIEW_SHOP_SESSIONS,
    kind: 'detail',
  },
  [P.VIEW_OWN_SHOP_SESSIONS]: {
    label: 'ดู Monitor พนักงานในร้าน',
    group: 'ภายในร้าน',
    icon: '👁️',
    parent: P.MANAGE_STORE_USERS,
    kind: 'detail',
  },
  [P.MANAGE_OWN_SHOP_SESSIONS]: {
    label: 'จัดการ Session พนักงานในร้าน',
    group: 'ภายในร้าน',
    icon: '🧹',
    parent: P.VIEW_OWN_SHOP_SESSIONS,
    kind: 'detail',
  },
})

export const PERMISSION_GROUPS = ['หน้าหลัก', 'ภายในร้าน']

// ─── Default role definitions (used for store initialization) ─
export const DEFAULT_ROLES = [
  {
    id: 'superadmin',
    label: 'ผู้ดูแลระบบสูงสุด',
    icon: '👑',
    badgeClass: 'bg-red-100 text-red-700',
    permissions: Object.values(P),
    isSystem: true,
    locked: true,  // cannot edit or delete
    desc: 'ระดับสูงสุดของระบบ สิทธิ์ทั้งหมด ไม่สามารถแก้ไขได้',
  },
  {
    id: 'admin',
    label: 'ผู้ดูแลระบบ',
    icon: '🛡️',
    badgeClass: 'bg-amber-100 text-amber-700',
    permissions: Object.values(P),
    isSystem: true,
    locked: false,
    desc: 'จัดการผู้ใช้ ตั้งค่าระบบ และจัดการ Role ได้',
  },
]

// Badge color presets for custom roles
export const BADGE_PRESETS = [
  { value: 'bg-red-100 text-red-700',       preview: 'bg-red-400',     label: 'แดง' },
  { value: 'bg-orange-100 text-orange-700', preview: 'bg-orange-400',  label: 'ส้ม' },
  { value: 'bg-amber-100 text-amber-700',   preview: 'bg-amber-400',   label: 'เหลือง' },
  { value: 'bg-emerald-100 text-emerald-700', preview: 'bg-emerald-400', label: 'เขียว' },
  { value: 'bg-blue-100 text-blue-700',     preview: 'bg-blue-400',    label: 'น้ำเงิน' },
  { value: 'bg-purple-100 text-purple-700', preview: 'bg-purple-400',  label: 'ม่วง' },
  { value: 'bg-pink-100 text-pink-700',     preview: 'bg-pink-400',    label: 'ชมพู' },
  { value: 'bg-gray-100 text-gray-700',     preview: 'bg-gray-400',    label: 'เทา' },
]

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Check if userRoleId has permission — reads from dynamic roles array.
 * superadmin always returns true.
 */
export function checkPermission(roles, userRoleId, permission) {
  if (Array.isArray(permission)) return permission.some((p) => checkPermission(roles, userRoleId, p))
  if (userRoleId === 'superadmin') return true
  const role = roles?.find((r) => r.id === userRoleId)
  if (!role) return false
  if (role.permissions?.includes(permission)) return true
  const childPerms = Object.values(P).filter((p) => PERMISSION_LABELS[p]?.parent === permission)
  if (childPerms.length > 0) return childPerms.some((p) => role.permissions?.includes(p))
  if (permission === P.MANAGE_TRANSACTIONS) {
    return [P.MANAGE_INCOME, P.MANAGE_EXPENSE, P.MANAGE_RECURRING].some((p) => role.permissions?.includes(p))
  }
  return false
}

export function getRoleInfo(roles, roleId) {
  return roles?.find((r) => r.id === roleId) ?? { label: roleId, icon: '👤', badgeClass: 'bg-gray-100 text-gray-600' }
}

export function isAdminRole(role) {
  return role === 'superadmin' || role === 'admin'
}

export function canManageRole(actorRole, targetRole) {
  if (actorRole === 'superadmin') return true
  if (actorRole === 'admin') return targetRole !== 'superadmin' && targetRole !== 'admin'
  return false
}

export function migrateRole(oldRole) {
  if (oldRole === 'superadmin' || oldRole === 'admin') return oldRole
  if (oldRole === 'user' || oldRole === 'manager' || oldRole === 'staff' || oldRole === 'viewer') return 'admin'
  return oldRole
}
