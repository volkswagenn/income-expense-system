import { useState } from 'react'
import useRoleStore from '../../store/useRoleStore'
import useAuthStore from '../../store/useAuthStore'
import {
  P, PERMISSION_LABELS, PERMISSION_GROUPS, BADGE_PRESETS,
  checkPermission,
} from '../../lib/permissions'
import useLogStore from '../../store/useLogStore'
import useGlobalLogStore from '../../store/useGlobalLogStore'
import { buildLogEntry } from '../../lib/logBuilder'

const ALL_PERMISSIONS = Object.values(P)

// Permissions visible in the store role picker (ภายในร้าน group only, excluding VIEW_SHOPS which is auto-granted)
const STORE_ONLY_PERMISSIONS = ALL_PERMISSIONS.filter(
  (p) => PERMISSION_LABELS[p]?.group === 'ภายในร้าน'
)

// ─── Permission picker ────────────────────────────────────────
// allowedPermissions: optional subset — defaults to ALL_PERMISSIONS

function PermissionPicker({ value, onChange, allowedPermissions }) {
  const perms = allowedPermissions ?? ALL_PERMISSIONS
  const groups = PERMISSION_GROUPS
    .map((group) => ({ group, items: perms.filter((p) => PERMISSION_LABELS[p]?.group === group) }))
    .filter(({ items }) => items.length > 0)

  const toggleAll = (items) => {
    const allOn = items.every((p) => value.includes(p))
    onChange(
      allOn
        ? value.filter((p) => !items.includes(p))
        : [...new Set([...value, ...items])]
    )
  }

  const getChildPerms = (parentPerm) =>
    perms.filter((p) => PERMISSION_LABELS[p]?.parent === parentPerm)

  const toggle = (perm) => {
    const meta = PERMISSION_LABELS[perm]
    const checked = value.includes(perm)

    if (checked) {
      const childPerms = getChildPerms(perm)
      let next = value.filter((p) => p !== perm && !childPerms.includes(p))

      if (meta?.parent) {
        const siblings = getChildPerms(meta.parent).filter((p) => p !== perm)
        const stillHasSibling = siblings.some((p) => next.includes(p))
        if (!stillHasSibling) next = next.filter((p) => p !== meta.parent)
      }

      onChange(next)
      return
    }

    const childPerms = getChildPerms(perm)
    const relatedPerms = meta?.parent
      ? [meta.parent, perm]
      : [perm, ...childPerms]
    onChange([...new Set([...value, ...relatedPerms])])
  }

  return (
    <div className="space-y-4">
      {groups.map(({ group, items }) => {
        const allOn = items.every((p) => value.includes(p))
        const someOn = items.some((p) => value.includes(p))
        return (
          <div key={group} className="rounded-xl border border-gray-200 overflow-hidden">
            {/* Group header */}
            <div className="flex items-center justify-between bg-gray-50 px-4 py-2.5 border-b border-gray-200">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{group}</p>
              <button
                type="button"
                onClick={() => toggleAll(items)}
                className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                  allOn ? 'bg-blue-100 text-blue-700' : someOn ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {allOn ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
              </button>
            </div>
            {/* Items */}
            <div className="divide-y divide-gray-100">
              {items.map((perm) => {
                const meta = PERMISSION_LABELS[perm]
                const parentMeta = meta?.parent ? PERMISSION_LABELS[meta.parent] : null
                const isChild = Boolean(meta?.parent)
                const isSubTab = meta?.kind === 'tab'
                const checked = value.includes(perm)
                return (
                  <label
                    key={perm}
                    className={`flex items-center gap-3 py-3 cursor-pointer transition-colors ${
                      isChild ? 'pl-10 pr-4' : 'px-4'
                    } ${
                      checked ? (isChild ? 'bg-sky-50' : 'bg-blue-50') : 'hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(perm)}
                      className="rounded accent-blue-600 w-4 h-4 flex-shrink-0"
                    />
                    <span className="text-base flex-shrink-0">{isChild ? '↳' : meta?.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-900">{meta?.label}</p>
                        {isChild && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 font-medium">
                            {isSubTab ? 'แท็บย่อยของ' : 'สิทธิ์ย่อยของ'} {parentMeta?.label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 font-mono">{perm}</p>
                    </div>
                    {checked && (
                      <span className="text-xs text-blue-600 font-medium flex-shrink-0">✓</span>
                    )}
                  </label>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Role Modal (create / edit) ───────────────────────────────

function RoleModal({ role, onClose, onSave, shopId }) {
  const isEdit = Boolean(role)
  const isLocked = role?.locked
  const isStoreContext = Boolean(shopId)

  // In store context, init permissions without VIEW_SHOPS (it's auto-granted, not shown in picker)
  const initPerms = isEdit
    ? (role?.permissions ?? []).filter((p) => !isStoreContext || p !== P.VIEW_SHOPS)
    : []

  const [label, setLabel] = useState(role?.label ?? '')
  const [icon, setIcon] = useState(role?.icon ?? '👤')
  const [badgeClass, setBadgeClass] = useState(role?.badgeClass ?? BADGE_PRESETS[4].value)
  const [desc, setDesc] = useState(role?.desc ?? '')
  const [permissions, setPermissions] = useState(initPerms)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  // Permissions shown in picker: store context = store-only, home = all
  const pickerPerms = isStoreContext ? STORE_ONLY_PERMISSIONS : undefined

  const handleSave = async () => {
    const errs = {}
    if (!label.trim()) errs.label = 'กรุณากรอกชื่อ Role'
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    // Store roles always include VIEW_SHOPS so the user can navigate into the store
    const finalPerms = isStoreContext
      ? [...new Set([P.VIEW_SHOPS, ...permissions])]
      : permissions
    await onSave({ label, icon, badgeClass, desc, permissions: finalPerms })
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl my-8">

        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {isEdit ? (isLocked ? '🔒 ดู Role' : 'แก้ไข Role') : 'สร้าง Role ใหม่'}
            </h2>
            {isLocked && (
              <p className="text-xs text-gray-400 mt-0.5">Role นี้ล็อคอยู่ ไม่สามารถแก้ไขได้</p>
            )}
          </div>
          <button onClick={onClose} className="btn btn-ghost w-8 h-8 p-0 text-gray-400">✕</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Preview */}
          <div className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 border border-gray-200">
            <span className="text-3xl">{icon || '👤'}</span>
            <div>
              <span className={`text-sm px-2.5 py-1 rounded-full font-semibold ${badgeClass}`}>
                {label || 'ชื่อ Role'}
              </span>
              <p className="text-xs text-gray-400 mt-1">{desc || 'คำอธิบาย Role'}</p>
            </div>
          </div>

          {!isLocked && (
            <>
              {/* Label + Icon */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="label">ชื่อ Role <span className="text-red-500">*</span></label>
                  <input
                    className="input"
                    value={label}
                    onChange={(e) => { setLabel(e.target.value); setErrors({}) }}
                    placeholder="เช่น ผู้ตรวจสอบ"
                  />
                  {errors.label && <p className="text-red-500 text-xs mt-1">{errors.label}</p>}
                </div>
                <div>
                  <label className="label">ไอคอน (Emoji)</label>
                  <input
                    className="input text-center text-xl"
                    value={icon}
                    onChange={(e) => setIcon(e.target.value)}
                    placeholder="👤"
                    maxLength={4}
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="label">คำอธิบาย</label>
                <input
                  className="input"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="อธิบายสิทธิ์ของ Role นี้..."
                />
              </div>

              {/* Badge color */}
              <div>
                <label className="label">สี Badge</label>
                <div className="flex flex-wrap gap-2">
                  {BADGE_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setBadgeClass(preset.value)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 text-xs font-medium transition-all ${preset.value} ${
                        badgeClass === preset.value
                          ? 'border-gray-800 shadow-sm scale-105'
                          : 'border-transparent hover:border-gray-300'
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full ${preset.preview} flex-shrink-0`} />
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Permissions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">สิทธิ์ (Permissions)</label>
              <span className="text-xs text-gray-400">
                {permissions.length} / {(pickerPerms ?? ALL_PERMISSIONS).length} สิทธิ์
                {isStoreContext && <span className="ml-1 text-blue-500">(+ ดูร้านค้าอัตโนมัติ)</span>}
              </span>
            </div>
            {isStoreContext && (
              <div className="mb-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 text-xs text-blue-700">
                🏪 สิทธิ์ <strong>ดูรายการร้านค้า</strong> จะถูกเพิ่มอัตโนมัติ เพื่อให้ผู้ใช้เข้าร้านได้
              </div>
            )}
            {isLocked ? (
              <div className="rounded-xl border border-gray-200 p-4 bg-gray-50 text-center text-sm text-gray-400">
                🔒 superadmin มีสิทธิ์ทั้งหมดเสมอ
              </div>
            ) : (
              <PermissionPicker value={permissions} onChange={setPermissions} allowedPermissions={pickerPerms} />
            )}
          </div>
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="btn btn-secondary flex-1 justify-center">
            {isLocked ? 'ปิด' : 'ยกเลิก'}
          </button>
          {!isLocked && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn btn-primary flex-1 justify-center disabled:opacity-50"
            >
              {saving ? 'กำลังบันทึก...' : isEdit ? 'บันทึก' : 'สร้าง Role'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Delete Confirm ───────────────────────────────────────────

function DeleteConfirm({ role, onClose, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
        <div className="text-5xl mb-4">🗑️</div>
        <h3 className="text-lg font-bold text-gray-900">ลบ Role นี้?</h3>
        <p className="text-gray-500 text-sm mt-2">
          Role <span className={`font-semibold px-2 py-0.5 rounded-full text-sm ${role.badgeClass}`}>
            {role.icon} {role.label}
          </span> จะถูกลบออกจากระบบ
        </p>
        <p className="text-amber-600 text-xs mt-2">ผู้ใช้ที่ใช้ Role นี้อยู่จะสูญเสียสิทธิ์ทั้งหมด</p>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn btn-secondary flex-1 justify-center">ยกเลิก</button>
          <button onClick={onConfirm} className="btn btn-danger flex-1 justify-center">ลบ Role</button>
        </div>
      </div>
    </div>
  )
}

// ─── Role Card ────────────────────────────────────────────────

function RoleCard({ role, onEdit, onDelete, isStoreContext }) {
  // In store context, VIEW_SHOPS is auto-granted — don't count or display it
  const displayPerms = isStoreContext
    ? (role.permissions ?? []).filter((p) => p !== P.VIEW_SHOPS)
    : (role.permissions ?? [])
  const permCount = role.locked ? 'ทั้งหมด' : `${displayPerms.length} สิทธิ์`
  const groups = PERMISSION_GROUPS.map((g) => ({
    group: g,
    items: displayPerms.filter((p) => PERMISSION_LABELS[p]?.group === g),
  }))

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-5 ${role.locked ? 'border-gray-200 opacity-75' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl flex-shrink-0">{role.icon}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-sm px-2.5 py-0.5 rounded-full font-semibold ${role.badgeClass}`}>
                {role.label}
              </span>
              {role.isSystem && (
                <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">ระบบ</span>
              )}
              {role.locked && (
                <span className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">🔒 ล็อค</span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1 truncate">{role.desc}</p>
          </div>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <button
            onClick={() => onEdit(role)}
            className="btn btn-secondary text-xs px-2.5 py-1.5"
          >
            {role.locked ? '👁️' : '✏️'}
          </button>
          {!role.isSystem && (
            <button
              onClick={() => onDelete(role)}
              className="btn btn-danger text-xs px-2.5 py-1.5"
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      {/* Permission summary */}
      <div className="space-y-2">
        {role.locked ? (
          <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-xs text-gray-500 text-center">
            มีสิทธิ์ทั้งหมด
          </div>
        ) : (
          groups.map(({ group, items }) =>
            items.length > 0 ? (
              <div key={group}>
                <p className="text-xs text-gray-400 mb-1">{group}</p>
                <div className="flex flex-wrap gap-1">
                  {items.map((p) => (
                    <span
                      key={p}
                      className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full"
                    >
                      {PERMISSION_LABELS[p]?.icon} {PERMISSION_LABELS[p]?.label}
                    </span>
                  ))}
                </div>
              </div>
            ) : null
          )
        )}
        {!role.locked && role.permissions.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-1">ยังไม่มีสิทธิ์</p>
        )}
        <p className="text-xs text-gray-400 text-right pt-1">{permCount}</p>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────

// shopId = undefined  →  home system (global roles, P.MANAGE_ROLES)
// shopId = "abc123"   →  store context (store-specific roles, P.MANAGE_STORE_ROLES)
export default function RoleManagementPage({ shopId } = {}) {
  const roles = useRoleStore((s) => s.roles)
  const { createRole, updateRole, deleteRole } = useRoleStore()
  const currentUser = useAuthStore((s) => s.currentUser)

  const [modal, setModal] = useState(null)     // null | 'create' | role object
  const [toDelete, setToDelete] = useState(null)
  const [alert, setAlert] = useState('')

  const requiredPerm = shopId ? P.MANAGE_STORE_ROLES : P.MANAGE_ROLES
  if (!checkPermission(roles, currentUser?.role, requiredPerm)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center text-gray-400">
        <p className="text-5xl mb-4">🔒</p>
        <p className="font-semibold text-gray-600">สิทธิ์ไม่เพียงพอ</p>
        <p className="text-sm mt-1">คุณไม่มีสิทธิ์จัดการ Role ในส่วนนี้</p>
      </div>
    )
  }

  const isStoreCtx = Boolean(shopId)
  const addLog = isStoreCtx
    ? useLogStore.getState().addLog
    : useGlobalLogStore.getState().addLog

  const showAlert = (msg) => {
    setAlert(msg)
    setTimeout(() => setAlert(''), 3000)
  }

  const handleCreate = (data) => {
    createRole({ ...data, ...(shopId ? { shopId } : {}) })
    showAlert('✅ สร้าง Role สำเร็จ')
    addLog(buildLogEntry({
      activityType: isStoreCtx ? 'STORE_ROLE_CREATE' : 'SYS_ROLE_CREATE',
      description: `สร้าง Role "${data.label}"${isStoreCtx ? '' : ' (ระบบหลัก)'}`,
      newValue: { label: data.label, permissions: data.permissions, ...(shopId ? { shopId } : {}) },
    }))
  }

  const handleUpdate = (data) => {
    const old = roles.find((r) => r.id === modal.id)
    updateRole(modal.id, data)
    showAlert('✅ บันทึกการเปลี่ยนแปลงสำเร็จ')
    addLog(buildLogEntry({
      activityType: isStoreCtx ? 'STORE_ROLE_UPDATE' : 'SYS_ROLE_UPDATE',
      description: `แก้ไข Role "${data.label}"${isStoreCtx ? '' : ' (ระบบหลัก)'}`,
      oldValue: old ? { label: old.label, permissions: old.permissions } : null,
      newValue: { label: data.label, permissions: data.permissions },
    }))
  }

  const handleDelete = () => {
    const result = deleteRole(toDelete.id)
    if (result.success) {
      showAlert('✅ ลบ Role สำเร็จ')
      addLog(buildLogEntry({
        activityType: isStoreCtx ? 'STORE_ROLE_DELETE' : 'SYS_ROLE_DELETE',
        description: `ลบ Role "${toDelete.label}"${isStoreCtx ? '' : ' (ระบบหลัก)'}`,
        oldValue: { label: toDelete.label, id: toDelete.id },
      }))
    } else showAlert(`⚠️ ${result.error}`)
    setToDelete(null)
  }

  const systemRoles = roles.filter((r) => r.isSystem)
  // global: custom roles without shopId; store: custom roles matching this shopId
  const customRoles = roles.filter((r) => {
    if (r.isSystem) return false
    return shopId ? r.shopId === shopId : !r.shopId
  })

  return (
    <div className="space-y-6">
      {/* Header row with create button */}
      <div className="flex justify-end">
        <button
          onClick={() => setModal('create')}
          className="btn btn-primary px-5"
        >
          + สร้าง Role ใหม่
        </button>
      </div>

      {alert && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl px-4 py-3">
          {alert}
        </div>
      )}

      {/* System roles */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Role ระบบ (ไม่สามารถลบได้)
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {systemRoles.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              onEdit={(r) => setModal(r)}
              onDelete={(r) => setToDelete(r)}
              isStoreContext={Boolean(shopId)}
            />
          ))}
        </div>
      </section>

      {/* Custom roles */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Role กำหนดเอง
        </h2>
        {customRoles.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white py-12 text-center">
            <p className="text-4xl mb-3">🎭</p>
            <p className="text-gray-500 text-sm">ยังไม่มี Role กำหนดเอง</p>
            <button
              onClick={() => setModal('create')}
              className="btn btn-primary mt-4 px-6"
            >
              + สร้าง Role แรก
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {customRoles.map((role) => (
              <RoleCard
                key={role.id}
                role={role}
                onEdit={(r) => setModal(r)}
                onDelete={(r) => setToDelete(r)}
                isStoreContext={Boolean(shopId)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Modals */}
      {modal === 'create' && (
        <RoleModal
          onClose={() => setModal(null)}
          onSave={handleCreate}
          shopId={shopId}
        />
      )}
      {modal && modal !== 'create' && (
        <RoleModal
          role={modal}
          onClose={() => setModal(null)}
          onSave={handleUpdate}
          shopId={shopId}
        />
      )}
      {toDelete && (
        <DeleteConfirm
          role={toDelete}
          onClose={() => setToDelete(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}
