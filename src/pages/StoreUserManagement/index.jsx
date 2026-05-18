import { useState } from 'react'
import useAuthStore from '../../store/useAuthStore'
import useShopStore from '../../store/useShopStore'
import useRoleStore from '../../store/useRoleStore'
import {
  getRoleInfo, isAdminRole, checkPermission, canManageRole,
  P, PERMISSION_LABELS,
} from '../../lib/permissions'
import RoleManagementPage from '../RoleManagement'
import useLogStore from '../../store/useLogStore'
import { buildLogEntry } from '../../lib/logBuilder'

// ─── Helpers ─────────────────────────────────────────────────

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

// ─── Secret field ─────────────────────────────────────────────

function SecretField({ label, value, emptyText = 'ไม่มีข้อมูลรหัสเดิม' }) {
  const [visible, setVisible] = useState(false)
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex gap-2">
        <input
          className={`input flex-1 ${value ? 'font-mono' : 'text-gray-400'}`}
          type={visible ? 'text' : 'password'}
          value={value || emptyText}
          readOnly
        />
        <button type="button" className="btn btn-secondary px-3" onClick={() => setVisible((v) => !v)}>
          {visible ? 'ซ่อน' : 'ดู'}
        </button>
      </div>
    </div>
  )
}

// ─── Store User Modal ─────────────────────────────────────────

function StoreUserModal({ user, currentUser, roles, activeShopId, canViewSecrets, onClose, onSave }) {
  const isEdit = Boolean(user)

  // Only non-admin, non-system roles that belong to this store
  const storeRoles = roles.filter((r) => !isAdminRole(r.id) && !r.isSystem && r.shopId === activeShopId)
  const defaultRole = isEdit ? user.role : (storeRoles[0]?.id ?? '')

  const [form, setForm] = useState({
    displayName: user?.displayName ?? '',
    username: user?.username ?? '',
    role: defaultRole,
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
      role: form.role,
      shopAccess: [activeShopId],
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? 'แก้ไขผู้ใช้' : 'เพิ่มพนักงานใหม่'}
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
            {storeRoles.length === 0 ? (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
                ⚠️ ยังไม่มี Role สำหรับพนักงาน — กรุณาสร้าง Role ในแท็บ "จัดการ Role" ก่อน
              </div>
            ) : (
              <div className="space-y-2">
                {storeRoles.map((r) => (
                  <label key={r.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    form.role === r.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                    <input type="radio" name="role" value={r.id} checked={form.role === r.id} onChange={() => setField('role', r.id)} />
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
            )}
          </div>

          {/* Shop access info */}
          <div className="border-t pt-4">
            <label className="label mb-2">สิทธิ์เข้าถึงร้านค้า</label>
            <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
              🏪 ผู้ใช้นี้จะถูกมอบหมายให้ร้านค้าปัจจุบันโดยอัตโนมัติ
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="btn btn-secondary flex-1 justify-center">ยกเลิก</button>
          <button
            onClick={handleSave}
            disabled={saving || storeRoles.length === 0}
            className="btn btn-primary flex-1 justify-center disabled:opacity-50"
          >
            {saving ? 'กำลังบันทึก...' : isEdit ? 'บันทึก' : 'สร้างผู้ใช้'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete / Block Confirms ──────────────────────────────────

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
          {blocked ? 'ผู้ใช้นี้จะกลับมาเข้าใช้งานระบบได้อีกครั้ง' : 'ผู้ใช้นี้จะไม่สามารถเข้าสู่ระบบได้'}
        </p>
        <p className="text-sm mt-2 font-semibold text-gray-800">{user.displayName} (@{user.username})</p>
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

function UserCard({ user, isSelf, currentUser, roles, onEdit, onDelete, onToggleBlock, canBlockUsers, canManageStoreUsers }) {
  const roleInfo = getRoleInfo(roles, user.role)
  // Home system admins OR users with MANAGE_STORE_USERS permission can edit store employees
  const canEdit = canManageRole(currentUser?.role, user.role) ||
    (canManageStoreUsers && !isAdminRole(user.role) && !isSelf)
  const canBlock = canBlockUsers && (canManageRole(currentUser?.role, user.role) || (canManageStoreUsers && !isAdminRole(user.role))) && !isSelf && user.id !== 'admin'

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-5 ${user.isBlocked ? 'border-red-200 bg-red-50/40' : 'border-gray-200'}`}>
      <div className="flex items-start gap-4">
        <div className={`w-11 h-11 rounded-full ${user.isBlocked ? 'bg-gray-400' : avatarColor(user.id)} flex items-center justify-center text-white font-bold text-base flex-shrink-0`}>
          {initials(user.displayName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-gray-900">{user.displayName}</p>
            {isSelf && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">ฉัน</span>}
            {user.isBlocked && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">ถูกบล็อก</span>}
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleInfo.badgeClass}`}>
              {roleInfo.icon} {roleInfo.label}
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-0.5">@{user.username}</p>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500">
            <span>{user.pinHash ? '✓ มี PIN' : '— ไม่มี PIN'}</span>
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

// ─── Tab: Users ───────────────────────────────────────────────

function UsersTab({ activeShopId }) {
  const { users, currentUser, createUser, updateUser, deleteUser, setUserBlocked } = useAuthStore()
  const roles = useRoleStore((s) => s.roles)
  const [modal, setModal] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [toBlock, setToBlock] = useState(null)
  const [alert, setAlert] = useState('')

  const canBlockUsers = checkPermission(roles, currentUser?.role, P.MANAGE_STORE_USER_BLOCK)
  const canViewSecrets = checkPermission(roles, currentUser?.role, P.VIEW_STORE_USER_SECRET)
  const canManageStoreUsers = checkPermission(roles, currentUser?.role, P.MANAGE_STORE_USERS)

  const showAlert = (msg) => { setAlert(msg); setTimeout(() => setAlert(''), 3500) }
  const addLog = useLogStore.getState().addLog

  const storeUsers = users.filter((u) => {
    if (isAdminRole(u.role)) return false
    if (u.shopAccess === null) return false
    return Array.isArray(u.shopAccess) && u.shopAccess.includes(activeShopId)
  })
  const adminUsers = users.filter((u) => isAdminRole(u.role))

  const handleCreate = async (payload) => {
    const result = await createUser(payload)
    if (result.success) {
      showAlert('✅ สร้างผู้ใช้สำเร็จ')
      addLog(buildLogEntry({
        activityType: 'STORE_USER_CREATE',
        description: `สร้างพนักงาน "${payload.displayName}" (@${payload.username}) Role: ${payload.role}`,
        newValue: { username: payload.username, displayName: payload.displayName, role: payload.role, shopId: activeShopId },
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
        activityType: 'STORE_USER_UPDATE',
        description: `แก้ไขพนักงาน "${target?.displayName}" (@${target?.username})`,
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
        activityType: 'STORE_USER_DELETE',
        description: `ลบพนักงาน "${toDelete.displayName}" (@${toDelete.username})`,
        oldValue: { username: toDelete.username, displayName: toDelete.displayName, role: toDelete.role },
      }))
    } else showAlert(`⚠️ ${result.error}`)
    setToDelete(null)
  }

  const handleToggleBlock = (reason) => {
    const isUnblock = toBlock.isBlocked
    const result = setUserBlocked(toBlock.id, !isUnblock, currentUser?.id ?? null, reason)
    if (result.success) {
      showAlert(isUnblock ? '✅ ปลดบล็อกสำเร็จ' : '✅ บล็อกผู้ใช้สำเร็จ')
      addLog(buildLogEntry({
        activityType: isUnblock ? 'STORE_USER_UNBLOCK' : 'STORE_USER_BLOCK',
        description: `${isUnblock ? 'ปลดบล็อก' : 'บล็อก'}พนักงาน "${toBlock.displayName}" (@${toBlock.username})${!isUnblock && reason ? ` — ${reason}` : ''}`,
        newValue: { username: toBlock.username, reason: isUnblock ? null : reason },
      }))
    } else showAlert(`⚠️ ${result.error}`)
    setToBlock(null)
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={() => setModal('create')} className="btn btn-primary px-5">
          + เพิ่มพนักงานใหม่
        </button>
      </div>

      {alert && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl px-4 py-3">
          {alert}
        </div>
      )}

      {/* Store employees */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          พนักงานร้านค้านี้ ({storeUsers.length} คน)
        </h2>
        {storeUsers.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white py-12 text-center">
            <p className="text-4xl mb-3">👥</p>
            <p className="text-gray-500 text-sm">ยังไม่มีพนักงานในร้านค้านี้</p>
            <button onClick={() => setModal('create')} className="btn btn-primary mt-4 px-6">
              + เพิ่มพนักงานคนแรก
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {storeUsers.map((user) => (
              <UserCard
                key={user.id}
                user={user}
                isSelf={user.id === currentUser?.id}
                currentUser={currentUser}
                roles={roles}
                onEdit={(u) => setModal(u)}
                onDelete={(u) => setToDelete(u)}
                onToggleBlock={(u) => setToBlock(u)}
                canBlockUsers={canBlockUsers}
                canManageStoreUsers={canManageStoreUsers}
              />
            ))}
          </div>
        )}
      </section>

      {/* System admins (read-only) */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          ผู้ดูแลระบบ (จัดการในหน้าระบบหลัก)
        </h2>
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700 mb-3">
          ℹ️ Admin และ Superadmin เข้าถึงทุกร้านได้ — แก้ไขได้ที่หน้าระบบหลัก → จัดการผู้ใช้งานระบบหลัก
        </div>
        <div className="space-y-2">
          {adminUsers.map((user) => {
            const roleInfo = getRoleInfo(roles, user.role)
            return (
              <div key={user.id} className="bg-white rounded-xl border border-gray-200 px-5 py-3 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full ${avatarColor(user.id)} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                  {initials(user.displayName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-gray-900 text-sm">{user.displayName}</p>
                    {user.id === currentUser?.id && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">ฉัน</span>}
                    {user.isBlocked && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">ถูกบล็อก</span>}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleInfo.badgeClass}`}>{roleInfo.icon} {roleInfo.label}</span>
                  </div>
                  <p className="text-xs text-gray-400">@{user.username}</p>
                </div>
                <span className="text-xs text-gray-300">🔒 อ่านอย่างเดียว</span>
              </div>
            )
          })}
        </div>
      </section>

      {modal === 'create' && (
        <StoreUserModal currentUser={currentUser} roles={roles} activeShopId={activeShopId} canViewSecrets={canViewSecrets} onClose={() => setModal(null)} onSave={handleCreate} />
      )}
      {modal && modal !== 'create' && (
        <StoreUserModal user={modal} currentUser={currentUser} roles={roles} activeShopId={activeShopId} canViewSecrets={canViewSecrets} onClose={() => setModal(null)} onSave={handleUpdate} />
      )}
      {toDelete && <DeleteConfirm user={toDelete} onClose={() => setToDelete(null)} onConfirm={handleDelete} />}
      {toBlock && (
        <BlockConfirm user={toBlock} blocked={toBlock.isBlocked} onClose={() => setToBlock(null)} onConfirm={handleToggleBlock} />
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────

const TABS = [
  { id: 'users', label: 'จัดการผู้ใช้งาน', icon: '👥' },
  { id: 'roles', label: 'จัดการ Role',      icon: '🎭' },
]

export default function StoreUserManagementPage() {
  const roles = useRoleStore((s) => s.roles)
  const currentUser = useAuthStore((s) => s.currentUser)
  const activeShopId = useShopStore((s) => s.activeShopId)
  const activeShop = useShopStore((s) => s.shops.find((sh) => sh.id === s.activeShopId))
  const [tab, setTab] = useState('users')

  const canManageUsers = checkPermission(roles, currentUser?.role, P.MANAGE_STORE_USERS)
  const canManageRoles = checkPermission(roles, currentUser?.role, P.MANAGE_STORE_ROLES)

  if (!canManageUsers && !canManageRoles) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center text-gray-400">
        <p className="text-5xl mb-4">🔒</p>
        <p className="font-semibold text-gray-600">สิทธิ์ไม่เพียงพอ</p>
        <p className="text-sm mt-1">คุณไม่มีสิทธิ์จัดการผู้ใช้งานหรือ Role ในร้านค้านี้</p>
      </div>
    )
  }

  const visibleTabs = TABS.filter((t) => {
    if (t.id === 'users') return canManageUsers
    if (t.id === 'roles') return canManageRoles
    return false
  })

  const activeTab = visibleTabs.find((t) => t.id === tab) ? tab : visibleTabs[0]?.id

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">👥 จัดการผู้ใช้งาน</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          จัดการพนักงานและสิทธิ์ภายในร้าน{activeShop ? ` · ${activeShop.name}` : ''}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t.id
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'roles' && canManageRoles && (
        <RoleManagementPage shopId={activeShopId} />
      )}
      {activeTab === 'users' && canManageUsers && (
        <UsersTab activeShopId={activeShopId} />
      )}
    </div>
  )
}
