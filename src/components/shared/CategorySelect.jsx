import { useMemo } from 'react'
import useCategoryStore, { buildCategoryTree } from '../../store/useCategoryStore'

/**
 * dropdown หมวดหมู่ที่แสดงลำดับชั้น หมวดหมู่หลัก → หมวดหมู่ย่อย
 * หมวดหมู่หลักเลือกได้เอง (ใช้กับรายการที่ไม่ต้องแยกย่อย)
 *
 * props:
 *   value, onChange(id)
 *   type          – ประเภทหมวดหมู่ (ค่าเริ่มต้น 'expense')
 *   placeholder   – ข้อความตัวเลือกว่าง
 *   allowEmpty    – แสดงตัวเลือกว่างหรือไม่ (ค่าเริ่มต้น true)
 */
// สีขอบให้ตรงกับประเภทหมวดหมู่ — รายรับเขียว รายจ่ายแดง
const TYPE_RING = {
  expense: 'border-red-200 focus:border-red-400',
  income: 'border-emerald-200 focus:border-emerald-400',
}

export default function CategorySelect({
  value,
  onChange,
  type = 'expense',
  placeholder = 'เลือกหมวดหมู่...',
  allowEmpty = true,
  className = 'input',
  ...rest
}) {
  const categories = useCategoryStore((s) => s.categories)
  const tree = useMemo(() => buildCategoryTree(categories, type), [categories, type])

  return (
    <select
      className={`${className} ${TYPE_RING[type] ?? ''}`}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    >
      {allowEmpty && <option value="">{placeholder}</option>}
      {tree.map((main) =>
        main.children.length > 0 ? (
          <optgroup key={main.id} label={main.name}>
            <option value={main.id}>{main.name} (ทั้งหมวด)</option>
            {main.children.map((sub) => (
              <option key={sub.id} value={sub.id}>{'  '}└ {sub.name}</option>
            ))}
          </optgroup>
        ) : (
          <option key={main.id} value={main.id}>{main.name}</option>
        )
      )}
    </select>
  )
}
