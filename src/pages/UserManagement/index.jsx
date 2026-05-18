import { useState } from 'react'
import useAuthStore from '../../store/useAuthStore'
import useShopStore from '../../store/useShopStore'
import useRoleStore from '../../store/useRoleStore'
import { getRoleInfo, canManageRole, isAdminRole, checkPermission, P } from '../../lib/permissions'
import RoleManagementPage from '../RoleManagement'
import useGlobalLogStore from '../../store/useGlobalLogStore'
import { buildLogEntry } from '../../lib/logBuilder'

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-purple-500',
  'bg-orange-500', 'bg-rose-500', 'bg-teal-500',
]
function avatarColor(id) {
  const n = [...(id || '')].reduce((a, c) => a + c.charCodeAt(0), 0)
  return AVATAR_COLORS[n % AVATAR_COLORS.length]
}
function initials(name = '') {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

// ─── Shop Access selector ─────────────────────────────────────

function ShopAccessField({ value, onChange, shops }) {
  // value: null = all, string[] = assigned
  const isAll = value === null

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <label className={`flex-1 flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${
          isAll ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
        }`}>
          <input
            type="radio"
            checked={isAll}
            onChange={() => onChange(null)}
          />
          <div>
            <p className="text-sm font-medium text-gray-900">🌐 ทุกร้าน</p>
            <p className="text-xs text-gray-400">เข้าถึงร้านใหม่โดยอัตโนมัติ</p>
          </div>
        </label>
        <label className={`flex-1 flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${
          !isAll ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
        }`}>
          <input
            type="radio"
            checked={!isAll}
            onChange={() => onChange([])}
          />
          <div>
            <p className="text-sm font-medium text-gray-900">🏪 เฉพาะร้านที่เลือก</p>
            <p className="text-xs text-gray-400">เลือกร้านด้านล่าง</p>
          </div>
        </label>
      </div>

      {!isAll && (
        <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 max-h-48 overflow-y-auto">
          {shops.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">ยังไม่มีร้านในระบบ</p>
          ) : (
            shops.map((shop) => {
              const checked = Array.isArray(value) && value.includes(shop.id)
              return (
                <label key={shop.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const ids = Array.isArray(value) ? value : []
                      onChange(checked ? ids.filter((id) => id !== shop.id) : [...ids, shop.id])
                    }}
                    className="rounded"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{shop.name}</p>
                    <p className="text-xs text-gray-400">{shop.code ?? shop.id.slice(0, 8)}</p>
                  </div>
                </label>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

// ─── Create / Edit Modal ─────────────────────────────────────

function SecretField({ label, value, emptyText = 'ไม่มีข้อมูลรหัสเดิม' }) {
  const [visible, setVisible] = useState(false)
  const displayValue = value || emptyText
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex gap-2">
        <input
          className={`input flex-1 ${value ? 'font-mono' : 'text-gray-400'}`}
          type={visible ? 'text' : 'password'}
          value={displayValue}
          readOnly
        />
        <button type="button" className="btn btn-secondary px-3" onClick={() => setVisible((v) => !v)}>
          {visible ? 'ซ่อน' : 'ดู'}
        </button>
      </div>
      {!value && <p className="text-xs text-amber-600 mt-1">ข้อมูลเก่าบางบัญชีถูกเก็บเป็น hash จึงดูรหัสเดิมไม่ได้ ต้องตั้งรหัสใหม่ก่อน</p>}
    </div>
  )
}

function UserModal({ user, currentUser, roles, shops, canViewSecrets, onClose, onSave }) {
  const isEdit = Boolean(user)
  const isBuiltinAdmin = user?.id === 'admin'

  const defaultRole = isBuiltinAdmin ? 'superadmin' : (isEdit ? user.role : 'admin')
  const defaultAccess = isEdit ? (user.shopAccess ?? null) : []

  const [form, setForm] = useState({
    displayName: user?.displayName ?? '',
    username: user?.username ?? '',
    role: defaultRole,
    shopAccess: defaultAccess,
    password: '',
    confirmPassword: '',
    pin: '',
    confirmPin: '',
    clearPin: false,
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [showPasswordInput, setShowPasswordInput] = useState(false)
  const [showPinInput, setShowPinInput] = useState(false)

  const setField = (key, val) => {
    setForm((f) => ({ ...f, [key]: val }))
    setErrors((e) => ({ ...e, [key]: '' }))
  }

  // Admin-role users always get all-shops access
  const effectiveRole = isBuiltinAdmin ? 'superadmin' : form.role
  const effectiveAccess = isAdminRole(effectiveRole) ? null : form.shopAccess

  const validate = () => {
    const e = {}
    if (!form.displayName.trim()) e.displayName = 'กรุณากรอกชื่อที่แสดง'
    if (!isEdit && !form.username.trim()) e.username = 'กรุณากรอกชื่อผู้ใช้'
    if (!isEdit && !form.password) e.password = 'กรุณากรอกรหัสผ่าน'
    if (form.password && form.password !== form.confirmPassword) e.confirmPassword = 'รหัสผ่านไม่ตรงกัน'
    if (form.pin && form.pin.length !== 6) e.pin = 'PIN ต้องมี 6 หลัก'
    if (form.pin && form.pin !== form.confirmPin) e.confirmPin = 'รหัส PIN ไม่ตรงกัน'
    return e
  }

  const handleSave = async () => {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    const payload = {
      displayName: form.displayName,
      role: effectiveRole,
      shopAccess: effectiveAccess,
    }
    if (!isEdit) payload.username = form.username.trim()
    if (form.password) payload.password = form.password
    if (form.pin) payload.pin = form.pin
    if (isEdit && form.clearPin) payload.clearPin = true

    const result = await onSave(payload)
    setSaving(false)
    if (result?.error) setErrors({ _global: result.error })
    else onClose()
  }

  const availableRoles = roles.filter((r) => canManageRole(currentUser?.role, r.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้ใหม่'}
          </h2>
          <button onClick={onClose} className="btn btn-ghost w-8 h-8 p-0 text-gray-400">✕</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {errors._global && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-2">
              ⚠️ {errors._global}
            </div>
          )}

          {/* Basic info */}
          <div className="space-y-3">
            <div>
              <label className="label">ชื่อที่แสดง <span className="text-red-500">*</span></label>
              <input className="input" value={form.displayName} onChange={(e) => setField('displayName', e.target.value)} placeholder="เช่น สมชาย ใจดี" />
              {errors.displayName && <p className="text-red-500 text-xs mt-1">{errors.displayName}</p>}
            </div>
            {!isEdit && (
              <div>
                <label className="label">ชื่อผู้ใช้ <span className="text-red-500">*</span></label>
                <input className="input" value={form.username} onChange={(e) => setField('username', e.target.value.replace(/\s/g, ''))} placeholder="ไม่มีเว้นวรรค เช่น somchai" />
                {errors.username && <p className="text-red-500 text-xs mt-1">{errors.username}</p>}
              </div>
            )}
          </div>

          {/* Password */}
          <div className="border-t pt-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">
              🔑 {isEdit ? 'เปลี่ยนรหัสผ่าน (เว้นว่างหากไม่เปลี่ยน)' : 'รหัสผ่าน'}
            </p>
            {isEdit && canViewSecrets && (
              <div className="mb-3">
                <SecretField label="รหัสผ่านปัจจุบัน" value={user?.passwordPlain} />
              </div>
            )}
            <div className="space-y-3">
              <div>
                <label className="label">{isEdit ? 'รหัสผ่านใหม่' : 'รหัสผ่าน'} {!isEdit && <span className="text-red-500">*</span>}</label>
                <div className="flex gap-2">
                  <input className="input flex-1" type={showPasswordInput ? 'text' : 'password'} value={form.password} onChange={(e) => setField('password', e.target.value)} placeholder={isEdit ? 'เว้นว่างหากไม่เปลี่ยน' : 'กรอกรหัสผ่าน'} />
                  <button type="button" className="btn btn-secondary px-3" onClick={() => setShowPasswordInput((v) => !v)}>
                    {showPasswordInput ? 'ซ่อน' : 'ดู'}
                  </button>
                </div>
                {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
              </div>
              {form.password && (
                <div>
                  <label className="label">ยืนยันรหัสผ่าน</label>
                  <input className="input" type={showPasswordInput ? 'text' : 'password'} value={form.confirmPassword} onChange={(e) => setField('confirmPassword', e.target.value)} placeholder="กรอกซ้ำอีกครั้ง" />
                  {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>}
                </div>
              )}
            </div>
          </div>

          {/* PIN */}
          <div className="border-t pt-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">🔢 รหัส PIN 6 หลัก (ไม่บังคับ)</p>
            {isEdit && canViewSecrets && (
              <div className="mb-3">
                <SecretField label="PIN ปัจจุบัน" value={user?.pinPlain} emptyText={user?.pinHash ? 'ไม่มีข้อมูล PIN เดิม' : 'ยังไม่ได้ตั้ง PIN'} />
              </div>
            )}
            {isEdit && (
              <label className="flex items-center gap-2 mb-3 cursor-pointer">
                <input type="checkbox" checked={form.clearPin} onChange={(e) => setField('clearPin', e.target.checked)} className="rounded" />
                <span className="text-sm text-gray-600">ลบ PIN ออก</span>
              </label>
            )}
            {!form.clearPin && (
              <div className="space-y-3">
                <div>
                  <label className="label">{isEdit ? 'PIN ใหม่' : 'รหัส PIN'}</label>
                  <div className="flex gap-2">
                    <input className="input flex-1" type={showPinInput ? 'text' : 'password'} inputMode="numeric" maxLength={6} value={form.pin} onChange={(e) => setField('pin', e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6 หลัก" />
                    <button type="button" className="btn btn-secondary px-3" onClick={() => setShowPinInput((v) => !v)}>
                      {showPinInput ? 'ซ่อน' : 'ดู'}
                    </button>
                  </div>
                  {errors.pin && <p className="text-red-500 text-xs mt-1">{errors.pin}</p>}
                </div>
                {form.pin && (
                  <div>
                    <label className="label">ยืนยัน PIN</label>
                    <input className="input" type={showPinInput ? 'text' : 'password'} inputMode="numeric" maxLength={6} value={form.confirmPin} onChange={(e) => setField('confirmPin', e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="กรอกซ้ำ" />
                    {errors.confirmPin && <p className="text-red-500 text-xs mt-1">{errors.confirmPin}</p>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Role */}
          <div className="border-t pt-4">
            <label className="label mb-2">บทบาท (Role)</label>
            {isBuiltinAdmin && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-3">
                บัญชี admin หลักถูกล็อกเป็นผู้ดูแลระบบสูงสุดเสมอ ไม่สามารถเปลี่ยน Role ได้
              </div>
            )}
            <div className="space-y-2">
              {availableRoles.map((r) => (
                <label key={r.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  effectiveRole === r.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input
                    type="radio"
                    name="role"
                    value={r.id}
                    checked={effectiveRole === r.id}
                    disabled={isBuiltinAdmin}
                    onChange={() => setField('role', r.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.badgeClass}`}>
                        {r.icon} {r.label}
                      </span>
                    </div>
                    {r.desc && <p className="text-xs text-gray-400 mt-0.5">{r.desc}</p>}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Shop access */}
          <div className="border-t pt-4">
            <label className="label mb-2">สิทธิ์เข้าถึงร้านค้า</label>
            {isAdminRole(effectiveRole) ? (
              <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
                🌐 Role นี้เข้าถึงทุกร้านโดยอัตโนมัติ
              </div>
            ) : (
              <ShopAccessField
                value={form.shopAccess}
                onChange={(v) => setField('shopAccess', v)}
                shops={shops}
              />
            )}
          </div>
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="btn btn-secondary flex-1 justify-center">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary flex-1 justify-center disabled:opacity-50">
            {saving ? 'กำลังบันทึก...' : isEdit ? 'บันทึก' : 'สร้างผู้ใช้'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete Confirm ───────────────────────────────────────────

function DeleteConfirm({ user, onClose, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
        <div className="text-5xl mb-4">🗑️</div>
        <h3 className="text-lg font-bold text-gray-900">ลบผู้ใช้นี้?</h3>
        <p className="text-gray-500 text-sm mt-2">
          คุณต้องการลบ <span className="font-semibold text-gray-800">{user.displayName}</span> (@{user.username}) ออกจากระบบใช่ไหม?
        </p>
        <p className="text-red-500 text-xs mt-2">ไม่สามารถยกเลิกการกระทำนี้ได้</p>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn btn-secondary flex-1 justify-center">ยกเลิก</button>
          <button onClick={onConfirm} className="btn btn-danger flex-1 justify-center">ลบผู้ใช้</button>
        </div>
      </div>
    </div>
  )
}

function BlockConfirm({ user, blocked, onClose, onConfirm }) {
  const [reason, setReason] = useState(user?.blockedReason || 'ผู้ดูแลระบบบล็อกด้วยตนเอง')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
        <div className="text-5xl mb-4">{blocked ? '✅' : '⛔'}</div>
        <h3 className="text-lg font-bold text-gray-900">
          {blocked ? 'ปลดบล็อกผู้ใช้นี้?' : 'บล็อกผู้ใช้นี้?'}
        </h3>
        <p className="text-gray-500 text-sm mt-2">
          {blocked ? 'ผู้ใช้นี้จะกลับมาเข้าใช้งานระบบได้อีกครั้ง' : 'ผู้ใช้นี้จะไม่สามารถเข้าสู่ระบบด้วยรหัสผ่านหรือ PIN ได้'}
        </p>
        <p className="text-sm mt-2">
          <span className="font-semibold text-gray-800">{user.displayName}</span> (@{user.username})
        </p>
        {!blocked && (
          <div className="text-left mt-4">
            <label className="label">สาเหตุการบล็อก</label>
            <textarea
              className="input min-h-[84px] resize-none"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เช่น ใส่รหัสผิดหลายครั้ง / ระงับชั่วคราว"
            />
          </div>
        )}
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn btn-secondary flex-1 justify-center">ยกเลิก</button>
          <button
            onClick={() => onConfirm(reason)}
            className={`btn flex-1 justify-center ${blocked ? 'btn-primary' : 'btn-danger'}`}
          >
            {blocked ? 'ปลดบล็อก' : 'บล็อกผู้ใช้'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── User Card ────────────────────────────────────────────────

function UserCard({ user, isSelf, currentUser, roles, shops, onEdit, onDelete, onToggleBlock, canBlockUsers }) {
  const roleInfo = getRoleInfo(roles, user.role)
  const shopNames = useMemo_shops(user.shopAccess, shops)
  const canEdit = canManageRole(currentUser?.role, user.role)
  const canBlock = canBlockUsers && canEdit && !isSelf && user.id !== 'admin'

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-5 ${user.isBlocked ? 'border-red-200 bg-red-50/40' : 'border-gray-200'}`}>
      <div className="flex items-start gap-4">
        <div className={`w-11 h-11 rounded-full ${user.isBlocked ? 'bg-gray-400' : avatarColor(user.id)} flex items-center justify-center text-white font-bold text-base flex-shrink-0`}>
          {initials(user.displayName)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-gray-900">{user.displayName}</p>
            {isSelf && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">ฉัน</span>
            )}
            {user.isBlocked && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">ถูกบล็อก</span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleInfo.badgeClass}`}>
              {roleInfo.icon} {roleInfo.label}
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-0.5">@{user.username}</p>

          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500">
            <span>{user.pinHash ? '✓ มี PIN' : '— ไม่มี PIN'}</span>
            <span className="text-gray-300">·</span>
            <span>
              🏪 {user.shopAccess === null || isAdminRole(user.role)
                ? 'ทุกร้าน'
                : Array.isArray(user.shopAccess) && user.shopAccess.length > 0
                  ? `${user.shopAccess.length} ร้าน (${shopNames})`
                  : 'ยังไม่ได้มอบหมาย'}
            </span>
            {user.isBlocked && user.blockedAt && (
              <>
                <span className="text-gray-300">·</span>
                <span>⛔ บล็อกเมื่อ {new Date(user.blockedAt).toLocaleString('th-TH')}</span>
              </>
            )}
          </div>
          {user.isBlocked && user.blockedReason && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-3">
              สาเหตุ: {user.blockedReason}
            </p>
          )}
        </div>

        <div className="flex gap-2 flex-shrink-0">
          {canBlock && (
            <button
              onClick={() => onToggleBlock(user)}
              className={`btn text-xs px-3 ${user.isBlocked ? 'btn-primary' : 'btn-ghost text-red-500 border border-red-200 hover:bg-red-50'}`}
            >
              {user.isBlocked ? 'ปลดบล็อก' : 'บล็อก'}
            </button>
          )}
          {canEdit && (
            <button onClick={() => onEdit(user)} className="btn btn-secondary text-xs px-3">✏️</button>
          )}
          {canEdit && !isSelf && (
            <button onClick={() => onDelete(user)} className="btn btn-danger text-xs px-3">🗑️</button>
          )}
        </div>
      </div>
    </div>
  )
}

function useMemo_shops(shopAccess, shops) {
  if (!shopAccess || !Array.isArray(shopAccess)) return ''
  return shopAccess
    .map((id) => shops.find((s) => s.id === id)?.name ?? id.slice(0, 6))
    .join(', ')
}

// ─── Store Employee Group (collapsible) ───────────────────────

function StoreEmployeeGroup({ shop, users, homeManagers, collapsed, onToggle, currentUser, roles, shops, onEdit, onDelete, onToggleBlock, canBlockUsers }) {
  const blockedCount = users.filter((u) => u.isBlocked).length
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base">🏪</span>
          <span className="font-semibold text-gray-800 text-sm">{shop.name}</span>
          <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-medium">
            {users.length} พนักงาน
          </span>
          {blockedCount > 0 && (
            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">
              ⛔ บล็อก {blockedCount} คน
            </span>
          )}
        </div>
        <span className="text-gray-400 text-xs flex-shrink-0 ml-2">
          {collapsed ? '▶ ขยาย' : '▼ ย่อ'}
        </span>
      </button>

      {!collapsed && (
        <div className="bg-white">
          {/* Home managers info bar */}
          {homeManagers.length > 0 && (
            <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 flex items-start gap-2">
              <span className="text-xs text-amber-600 mt-0.5 flex-shrink-0">👑 ผู้ดูแลระบบหลักที่เข้าถึงร้านนี้:</span>
              <div className="flex flex-wrap gap-1.5">
                {homeManagers.map((u) => {
                  const ri = getRoleInfo(roles, u.role)
                  return (
                    <span key={u.id} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${ri.badgeClass}`}>
                      {ri.icon} {u.displayName}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {/* Employee cards */}
          <div className="p-3 space-y-2">
            {users.map((user) => (
              <UserCard
                key={user.id}
                user={user}
                isSelf={user.id === currentUser?.id}
                currentUser={currentUser}
                roles={roles}
                shops={shops}
                onEdit={onEdit}
                onDelete={onDelete}
                onToggleBlock={onToggleBlock}
                canBlockUsers={canBlockUsers}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────

const HOME_TABS = [
  { id: 'users', label: 'จัดการผู้ใช้งาน', icon: '👥' },
  { id: 'roles', label: 'จัดการ Role', icon: '🎭' },
]

export default function UserManagementPage() {
  const { users, currentUser, createUser, updateUser, deleteUser, setUserBlocked } = useAuthStore()
  const shops = useShopStore((s) => s.shops)
  const roles = useRoleStore((s) => s.roles)
  const [tab, setTab] = useState('users')
  const [modal, setModal] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [toBlock, setToBlock] = useState(null)
  const [alert, setAlert] = useState('')
  const [collapsedStores, setCollapsedStores] = useState(new Set())
  const canBlockUsers = checkPermission(roles, currentUser?.role, P.MANAGE_USER_BLOCK)
  const canViewSecrets = checkPermission(roles, currentUser?.role, P.VIEW_USER_SECRET)

  const toggleStore = (shopId) => setCollapsedStores((prev) => {
    const next = new Set(prev)
    next.has(shopId) ? next.delete(shopId) : next.add(shopId)
    return next
  })

  // Categorize users
  // Store employees: non-admin users whose role has a shopId (created via store system)
  // Home users: everyone else (admin roles or home custom roles without shopId)
  const getRoleObj = (roleId) => roles.find((r) => r.id === roleId)
  const homeUsers = users.filter((u) => isAdminRole(u.role) || !getRoleObj(u.role)?.shopId)
  const storeEmployees = users.filter((u) => !isAdminRole(u.role) && Boolean(getRoleObj(u.role)?.shopId))

  const storeGroups = shops
    .map((shop) => ({
      shop,
      members: storeEmployees.filter((u) => getRoleObj(u.role)?.shopId === shop.id),
      // Home users who have access to this store (for informational display)
      homeManagers: homeUsers.filter(
        (u) => u.shopAccess === null || (Array.isArray(u.shopAccess) && u.shopAccess.includes(shop.id))
      ),
    }))
    .filter((g) => g.members.length > 0)

  const assignedEmployeeIds = new Set(storeGroups.flatMap((g) => g.members.map((u) => u.id)))
  const unassignedEmployees = storeEmployees.filter((u) => !assignedEmployeeIds.has(u.id))

  if (!isAdminRole(currentUser?.role)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center text-gray-400">
        <p className="text-5xl mb-4">🔒</p>
        <p className="font-semibold text-gray-600">สิทธิ์ไม่เพียงพอ</p>
        <p className="text-sm mt-1">เฉพาะผู้ดูแลระบบเท่านั้นที่เข้าถึงหน้านี้ได้</p>
      </div>
    )
  }

  const showAlert = (msg) => { setAlert(msg); setTimeout(() => setAlert(''), 3500) }

  const addLog = useGlobalLogStore.getState().addLog

  const handleCreate = async (payload) => {
    const result = await createUser(payload)
    if (result.success) {
      showAlert('✅ สร้างผู้ใช้สำเร็จ')
      addLog(buildLogEntry({
        activityType: 'SYS_USER_CREATE',
        description: `สร้างผู้ใช้งาน "${payload.displayName}" (@${payload.username}) Role: ${payload.role}`,
        newValue: { username: payload.username, displayName: payload.displayName, role: payload.role },
      }))
      return {}
    }
    return result
  }

  const handleUpdate = async (payload) => {
    const target = users.find((u) => u.id === modal.id)
    const result = await updateUser(modal.id, payload)
    if (result.success) {
      showAlert('✅ บันทึกการเปลี่ยนแปลงสำเร็จ')
      addLog(buildLogEntry({
        activityType: 'SYS_USER_UPDATE',
        description: `แก้ไขผู้ใช้งาน "${target?.displayName}" (@${target?.username})`,
        oldValue: target ? { displayName: target.displayName, role: target.role } : null,
        newValue: { displayName: payload.displayName, role: payload.role },
      }))
      return {}
    }
    return result
  }

  const handleDelete = () => {
    const result = deleteUser(toDelete.id)
    if (result.success) {
      showAlert('✅ ลบผู้ใช้สำเร็จ')
      addLog(buildLogEntry({
        activityType: 'SYS_USER_DELETE',
        description: `ลบผู้ใช้งาน "${toDelete.displayName}" (@${toDelete.username})`,
        oldValue: { username: toDelete.username, displayName: toDelete.displayName, role: toDelete.role },
      }))
      setToDelete(null)
    } else { showAlert(`⚠️ ${result.error}`); setToDelete(null) }
  }

  const handleToggleBlock = (reason) => {
    const isUnblock = toBlock.isBlocked
    const result = setUserBlocked(toBlock.id, !isUnblock, currentUser?.id ?? null, reason)
    if (result.success) {
      showAlert(isUnblock ? '✅ ปลดบล็อกผู้ใช้สำเร็จ' : '✅ บล็อกผู้ใช้สำเร็จ')
      addLog(buildLogEntry({
        activityType: isUnblock ? 'SYS_USER_UNBLOCK' : 'SYS_USER_BLOCK',
        description: `${isUnblock ? 'ปลดบล็อก' : 'บล็อก'}ผู้ใช้งาน "${toBlock.displayName}" (@${toBlock.username})${!isUnblock && reason ? ` — ${reason}` : ''}`,
        newValue: { username: toBlock.username, reason: isUnblock ? null : reason },
      }))
      setToBlock(null)
    } else {
      showAlert(`⚠️ ${result.error}`)
      setToBlock(null)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">👥 จัดการผู้ใช้งานระบบหลัก</h1>
        <p className="text-sm text-gray-500 mt-0.5">จัดการผู้ใช้และสิทธิ์สำหรับระบบหลัก</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {HOME_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab: Roles */}
      {tab === 'roles' && <RoleManagementPage />}

      {/* Tab: Users */}
      {tab === 'users' && (
        <div className="space-y-5">
          {/* Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-gray-500">
              ผู้ใช้ระบบหลัก {homeUsers.length} บัญชี · พนักงานร้านค้า {storeEmployees.length} บัญชี
            </p>
            <button onClick={() => setModal('create')} className="btn btn-primary px-5">
              + เพิ่มผู้ใช้ใหม่
            </button>
          </div>

          {/* Alert */}
          {alert && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl px-4 py-3 animate-fade-in">
              {alert}
            </div>
          )}

          {/* Note */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
            <p className="font-semibold mb-1">📋 หมายเหตุ — ผู้ใช้งานในส่วนนี้คืออะไร?</p>
            <ul className="list-disc list-inside space-y-1 text-xs text-blue-700">
              <li>ผู้ใช้ที่สร้างในหน้านี้คือ <strong>Admin ระบบหลัก</strong> ซึ่งจะได้รับสิทธิ์เข้าถึงร้านค้าได้ทั้งหมด ส่วนสิทธิ์ในหน้าระบบหลักสามารถกำหนดได้ตามต้องการ</li>
              <li>หากต้องการสร้าง <strong>ผู้ใช้ที่เป็นพนักงาน</strong> ให้ไปสร้างในหน้า <strong>ระบบร้านค้า → จัดการผู้ใช้งาน</strong> แทน</li>
              <li>รูปแบบการจัดการเหมือนกัน — ทั้งสองส่วนรองรับการบล็อก/ปลดบล็อกผู้ใช้เหมือนกัน</li>
            </ul>
          </div>

          {/* Credentials info */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            <p className="font-semibold mb-1">ℹ️ ข้อมูลเริ่มต้น (เปลี่ยนทันทีหลังเข้าใช้งาน)</p>
            <div className="flex flex-wrap gap-4 text-xs text-amber-700">
              <span>Username: <code className="font-mono bg-amber-100 px-1 rounded">admin</code></span>
              <span>Password: <code className="font-mono bg-amber-100 px-1 rounded">admin</code></span>
              <span>PIN: <code className="font-mono bg-amber-100 px-1 rounded">000000</code></span>
            </div>
          </div>

          {/* User list */}
          <div className="space-y-6">

            {/* Home system users */}
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                👑 ผู้ใช้งานระบบหลัก ({homeUsers.length} บัญชี)
              </h2>
              <div className="space-y-3">
                {homeUsers.map((user) => (
                  <UserCard
                    key={user.id}
                    user={user}
                    isSelf={user.id === currentUser?.id}
                    currentUser={currentUser}
                    roles={roles}
                    shops={shops}
                    onEdit={(u) => setModal(u)}
                    onDelete={(u) => setToDelete(u)}
                    onToggleBlock={(u) => setToBlock(u)}
                    canBlockUsers={canBlockUsers}
                  />
                ))}
              </div>
            </section>

            {/* Store employees grouped by store */}
            {(storeGroups.length > 0 || unassignedEmployees.length > 0) && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    🏪 พนักงานร้านค้า ({storeEmployees.length} บัญชี)
                  </h2>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCollapsedStores(new Set())}
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                      ขยายทั้งหมด
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      type="button"
                      onClick={() => setCollapsedStores(new Set(shops.map((s) => s.id)))}
                      className="text-xs text-gray-500 hover:text-gray-700 underline"
                    >
                      ย่อทั้งหมด
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  {storeGroups.map(({ shop, members, homeManagers }) => (
                    <StoreEmployeeGroup
                      key={shop.id}
                      shop={shop}
                      users={members}
                      homeManagers={homeManagers}
                      collapsed={collapsedStores.has(shop.id)}
                      onToggle={() => toggleStore(shop.id)}
                      currentUser={currentUser}
                      roles={roles}
                      shops={shops}
                      onEdit={(u) => setModal(u)}
                      onDelete={(u) => setToDelete(u)}
                      onToggleBlock={(u) => setToBlock(u)}
                      canBlockUsers={canBlockUsers}
                    />
                  ))}
                  {unassignedEmployees.length > 0 && (
                    <div className="rounded-xl border border-dashed border-gray-200 p-4">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                        ไม่ได้มอบหมายร้าน ({unassignedEmployees.length} คน)
                      </p>
                      <div className="space-y-2">
                        {unassignedEmployees.map((user) => (
                          <UserCard
                            key={user.id}
                            user={user}
                            isSelf={user.id === currentUser?.id}
                            currentUser={currentUser}
                            roles={roles}
                            shops={shops}
                            onEdit={(u) => setModal(u)}
                            onDelete={(u) => setToDelete(u)}
                            onToggleBlock={(u) => setToBlock(u)}
                            canBlockUsers={canBlockUsers}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>

          {/* Modals */}
          {modal === 'create' && (
            <UserModal currentUser={currentUser} roles={roles} shops={shops} canViewSecrets={canViewSecrets} onClose={() => setModal(null)} onSave={handleCreate} />
          )}
          {modal && modal !== 'create' && (
            <UserModal user={modal} currentUser={currentUser} roles={roles} shops={shops} canViewSecrets={canViewSecrets} onClose={() => setModal(null)} onSave={handleUpdate} />
          )}
          {toDelete && (
            <DeleteConfirm user={toDelete} onClose={() => setToDelete(null)} onConfirm={handleDelete} />
          )}
          {toBlock && (
            <BlockConfirm
              user={toBlock}
              blocked={toBlock.isBlocked}
              onClose={() => setToBlock(null)}
              onConfirm={handleToggleBlock}
            />
          )}
          <style>{`
            @keyframes fade-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
            .animate-fade-in{animation:fade-in .2s ease-out}
          `}</style>
        </div>
      )}
    </div>
  )
}
