import { useEffect, useMemo, useRef, useState } from 'react'
import useCategoryStore, { buildCategoryTree } from '../../store/useCategoryStore'
import useTransactionStore from '../../store/useTransactionStore'
import useLogStore from '../../store/useLogStore'
import { buildLogEntry } from '../../lib/logBuilder'
import SectionCard from '../../components/shared/SectionCard'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import ContextMenu from './ContextMenu'
import { CATEGORY_THEME, CATEGORY_TYPE_LIST } from './categoryTheme'

// ── แถวสำหรับพิมพ์ชื่อใหม่ / เปลี่ยนชื่อ ────────────────────────────────────────
function InlineInput({ defaultValue = '', placeholder, onSubmit, onCancel, depth = 0, theme }) {
  const [text, setText] = useState(defaultValue)
  const ref = useRef(null)

  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])

  const submit = () => {
    const name = text.trim()
    if (!name) return onCancel()
    onSubmit(name)
  }

  return (
    <div className="flex items-center gap-2 py-1.5" style={{ paddingLeft: depth * 26 }}>
      <span className="text-gray-300 select-none">{depth > 1 ? '└' : '•'}</span>
      <input
        ref={ref}
        className="input text-sm py-1 flex-1 max-w-xs"
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') onCancel()
        }}
      />
      <button className={`btn text-xs py-1 px-2.5 ${theme.button}`} onClick={submit}>บันทึก</button>
      <button className="btn btn-secondary text-xs py-1 px-2.5" onClick={onCancel}>ยกเลิก</button>
    </div>
  )
}

// ── แถวหมวดหมู่หนึ่งบรรทัด ──────────────────────────────────────────────────────
function CategoryRow({ node, depth, usage, selected, onSelect, onContextMenu, theme }) {
  const isMain = depth === 0
  return (
    <div
      className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-default transition-colors ${
        selected ? theme.rowSelected : theme.rowHover
      }`}
      style={{ marginLeft: depth * 26 }}
      onClick={() => onSelect(node.id)}
      onContextMenu={(e) => onContextMenu(e, node, depth)}
    >
      <span className="select-none">{isMain ? '📁' : '📄'}</span>
      <span className={`flex-1 text-sm truncate ${isMain ? `font-medium ${theme.mainText}` : theme.subText}`}>
        {node.name}
      </span>
      {isMain && node.children.length > 0 && (
        <span className={`text-xs shrink-0 ${theme.countText}`}>{node.children.length} ย่อย</span>
      )}
      <span className="text-xs text-gray-400 tabular-nums shrink-0 w-20 text-right">
        {usage > 0 ? `${usage.toLocaleString()} รายการ` : '—'}
      </span>
    </div>
  )
}

// ── หน้าเพจ ────────────────────────────────────────────────────────────────────
export default function CategoriesPage() {
  const categories = useCategoryStore((s) => s.categories)
  const { addCategory, updateCategory, softDeleteCategory } = useCategoryStore()
  const transactions = useTransactionStore((s) => s.transactions)
  const { addLog } = useLogStore()

  const [catType, setCatType] = useState('expense')
  const [menu, setMenu] = useState(null)          // { x, y, node, depth } — node = null คือคลิกที่ราก
  const [creatingUnder, setCreatingUnder] = useState(undefined) // undefined = ไม่สร้าง, null = หลัก, id = ย่อยของ id
  const [renamingId, setRenamingId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [selectedId, setSelectedId] = useState(null)

  const theme = CATEGORY_THEME[catType]
  const tree = useMemo(() => buildCategoryTree(categories, catType), [categories, catType])

  // สลับประเภทแล้วล้างสถานะที่ค้างอยู่ของประเภทเดิม
  const switchType = (key) => {
    setCatType(key)
    setCreatingUnder(undefined)
    setRenamingId(null)
    setSelectedId(null)
    setMenu(null)
  }

  // จำนวนรายการที่ใช้แต่ละหมวดหมู่ (นับเฉพาะตัวมันเอง ไม่รวมย่อย)
  const usageById = useMemo(() => {
    const map = {}
    transactions.forEach((t) => {
      if (t.category) map[t.category] = (map[t.category] ?? 0) + 1
    })
    return map
  }, [transactions])

  const usageWithChildren = (node) =>
    (usageById[node.id] ?? 0) + (node.children ?? []).reduce((n, c) => n + (usageById[c.id] ?? 0), 0)

  const openMenu = (e, node, depth) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, node, depth })
    if (node) setSelectedId(node.id)
  }

  const handleCreate = (name, parentId) => {
    const item = addCategory(name, catType, parentId)
    const parent = parentId ? categories.find((c) => c.id === parentId) : null
    addLog(buildLogEntry({
      activityType: 'CATEGORY_CREATE',
      description: parent
        ? `สร้างหมวดหมู่ย่อย${theme.label} "${name}" ใต้ "${parent.name}"`
        : `สร้างหมวดหมู่หลัก${theme.label} "${name}"`,
      newValue: item,
    }))
    setCreatingUnder(undefined)
    setSelectedId(item.id)
  }

  const handleRename = (id, name) => {
    const old = categories.find((c) => c.id === id)
    updateCategory(id, name)
    addLog(buildLogEntry({
      activityType: 'CATEGORY_UPDATE',
      description: `แก้ไขหมวดหมู่${theme.label} "${old?.name ?? id}" → "${name}"`,
      oldValue: old,
      newValue: { id, name },
    }))
    setRenamingId(null)
  }

  const handleDelete = () => {
    const node = deleteTarget
    const subCount = node.children?.length ?? 0
    softDeleteCategory(node.id)
    addLog(buildLogEntry({
      activityType: 'CATEGORY_DELETE',
      description: subCount > 0
        ? `ลบหมวดหมู่${theme.label} "${node.name}" พร้อมหมวดหมู่ย่อย ${subCount} รายการ`
        : `ลบหมวดหมู่${theme.label} "${node.name}"`,
      oldValue: node,
    }))
    setDeleteTarget(null)
    if (selectedId === node.id) setSelectedId(null)
  }

  // ── รายการเมนูคลิกขวา ───────────────────────────────────────────────────────
  const menuItems = (() => {
    if (!menu) return []
    const { node, depth } = menu

    // คลิกขวาที่ราก "หมวดหมู่ทั้งหมด" → สร้างได้เฉพาะหมวดหมู่หลัก
    if (!node) {
      return [{
        key: 'new-main',
        label: `📁 สร้างหมวดหมู่หลัก${theme.label}`,
        onSelect: () => { setCreatingUnder(null); setRenamingId(null) },
      }]
    }

    // คลิกขวาที่หมวดหมู่ย่อย → สร้างต่อไม่ได้ (จำกัด 2 ชั้น)
    if (depth > 0) {
      return [
        { key: 'rename', label: '✏️ เปลี่ยนชื่อ', onSelect: () => { setRenamingId(node.id); setCreatingUnder(undefined) } },
        { key: 'sep1', label: '' },
        { key: 'delete', label: '🗑️ ลบหมวดหมู่ย่อย', danger: true, onSelect: () => setDeleteTarget(node) },
      ]
    }

    // คลิกขวาที่หมวดหมู่หลัก → สร้างหมวดหมู่ย่อยได้
    return [
      { key: 'new-sub', label: '📄 สร้างหมวดหมู่ย่อย', onSelect: () => { setCreatingUnder(node.id); setRenamingId(null) } },
      { key: 'sep1', label: '' },
      { key: 'rename', label: '✏️ เปลี่ยนชื่อ', onSelect: () => { setRenamingId(node.id); setCreatingUnder(undefined) } },
      { key: 'delete', label: '🗑️ ลบหมวดหมู่หลัก', danger: true, onSelect: () => setDeleteTarget(node) },
    ]
  })()

  const deleteMessage = (() => {
    if (!deleteTarget) return ''
    const subCount = deleteTarget.children?.length ?? 0
    const used = deleteTarget.parentId ? (usageById[deleteTarget.id] ?? 0) : usageWithChildren(deleteTarget)
    const lines = [`ลบหมวดหมู่${theme.label} "${deleteTarget.name}"?`, '']
    if (subCount > 0) lines.push(`• หมวดหมู่ย่อยข้างใน ${subCount} รายการ จะถูกลบด้วย`)
    if (used > 0) lines.push(`• มีรายการใช้อยู่ ${used.toLocaleString()} รายการ — รายการเดิมยังอยู่ครบ แต่จะแสดงว่า "[ลบแล้ว]"`)
    if (subCount === 0 && used === 0) lines.push('• ยังไม่มีรายการใดใช้หมวดหมู่นี้')
    return lines.join('\n')
  })()

  return (
    <div className="space-y-5" onContextMenu={(e) => e.preventDefault()}>
      <div>
        <h1 className="text-xl font-bold text-gray-900">จัดการหมวดหมู่</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          หมวดหมู่รายรับและรายจ่ายแยกกันคนละชุด — คลิกขวาเพื่อสร้าง แก้ไข หรือลบ
        </p>
      </div>

      {/* แท็บเลือกประเภท */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {CATEGORY_TYPE_LIST.map((t) => {
          const count = categories.filter((c) => !c.deleted && c.type === t.key).length
          return (
            <button
              key={t.key}
              className={`btn text-sm px-4 py-2 rounded-lg transition-all ${
                catType === t.key ? t.tabActive : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => switchType(t.key)}
            >
              {t.icon} หมวดหมู่{t.label}
              <span className={`ml-1.5 text-xs ${catType === t.key ? 'opacity-80' : 'text-gray-400'}`}>
                ({count})
              </span>
            </button>
          )
        })}
      </div>

      <div className={`flex items-start gap-2.5 p-3 border rounded-xl text-xs ${theme.hintBox}`}>
        <span className="text-base leading-none">💡</span>
        <div className="space-y-1">
          <p><strong>คลิกขวาที่ "หมวดหมู่ทั้งหมด"</strong> → สร้างหมวดหมู่หลัก</p>
          <p><strong>คลิกขวาที่หมวดหมู่หลัก</strong> → สร้างหมวดหมู่ย่อยข้างใน (สร้างได้ลึกสุด 2 ชั้น)</p>
          <p className={theme.hintSub}>
            เวลากรอง: เลือกหมวดหมู่หลักจะได้รายการของหมวดหมู่ย่อยทั้งหมดมาด้วย
            แต่ถ้าเลือกหมวดหมู่ย่อย จะได้เฉพาะของหมวดหมู่ย่อยนั้น
          </p>
        </div>
      </div>

      <SectionCard>
        <div className="space-y-1">
          {/* ราก */}
          <div
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 border cursor-default ${theme.rootBox}`}
            onContextMenu={(e) => openMenu(e, null, -1)}
          >
            <span className="select-none">{theme.icon}</span>
            <span className={`flex-1 text-sm font-semibold ${theme.rootText}`}>
              หมวดหมู่{theme.label}ทั้งหมด
            </span>
            <span className="text-xs text-gray-500">{tree.length} หมวดหมู่หลัก</span>
            <button
              className={`btn text-xs py-1 px-2.5 ${theme.button}`}
              onClick={() => { setCreatingUnder(null); setRenamingId(null) }}
            >
              + หมวดหมู่หลัก
            </button>
          </div>

          {/* ช่องสร้างหมวดหมู่หลัก */}
          {creatingUnder === null && (
            <InlineInput
              placeholder={`ชื่อหมวดหมู่หลัก${theme.label}ใหม่...`}
              depth={1}
              theme={theme}
              onSubmit={(name) => handleCreate(name, null)}
              onCancel={() => setCreatingUnder(undefined)}
            />
          )}

          {/* ต้นไม้หมวดหมู่ */}
          {tree.length === 0 && creatingUnder === undefined && (
            <p className="text-center text-sm text-gray-400 py-10">
              ยังไม่มีหมวดหมู่{theme.label} — คลิกขวาที่ "หมวดหมู่{theme.label}ทั้งหมด" เพื่อสร้างหมวดหมู่หลัก
            </p>
          )}

          {tree.map((main) => (
            <div key={main.id}>
              {renamingId === main.id ? (
                <InlineInput
                  defaultValue={main.name}
                  depth={1}
                  theme={theme}
                  onSubmit={(name) => handleRename(main.id, name)}
                  onCancel={() => setRenamingId(null)}
                />
              ) : (
                <CategoryRow
                  node={main}
                  depth={0}
                  usage={usageWithChildren(main)}
                  selected={selectedId === main.id}
                  onSelect={setSelectedId}
                  onContextMenu={openMenu}
                  theme={theme}
                />
              )}

              {main.children.map((sub) =>
                renamingId === sub.id ? (
                  <InlineInput
                    key={sub.id}
                    defaultValue={sub.name}
                    depth={2}
                    theme={theme}
                    onSubmit={(name) => handleRename(sub.id, name)}
                    onCancel={() => setRenamingId(null)}
                  />
                ) : (
                  <CategoryRow
                    key={sub.id}
                    node={{ ...sub, children: [] }}
                    depth={1}
                    usage={usageById[sub.id] ?? 0}
                    selected={selectedId === sub.id}
                    onSelect={setSelectedId}
                    onContextMenu={openMenu}
                    theme={theme}
                  />
                )
              )}

              {/* ช่องสร้างหมวดหมู่ย่อยใต้หมวดหมู่หลักนี้ */}
              {creatingUnder === main.id && (
                <InlineInput
                  placeholder={`ชื่อหมวดหมู่ย่อยใน "${main.name}"...`}
                  depth={2}
                  theme={theme}
                  onSubmit={(name) => handleCreate(name, main.id)}
                  onCancel={() => setCreatingUnder(undefined)}
                />
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      )}

      <ConfirmPopup
        open={!!deleteTarget}
        title="ลบหมวดหมู่"
        message={deleteMessage}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        confirmLabel="ลบ"
        danger
      />
    </div>
  )
}
