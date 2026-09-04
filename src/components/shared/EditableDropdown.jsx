import { useState, useRef, useEffect } from 'react'
import { IconPickerButton } from './IconPicker'

export default function EditableDropdown({
  value, onChange, items, onAdd, onUpdate, onDelete,
  placeholder = 'พิมพ์หรือเลือก...', label,
  // ส่ง onSetIcon มาเมื่อรายการชุดนั้นเก็บไอคอนได้ ไม่ส่ง = ไม่แสดงช่องไอคอนเลย
  onSetIcon, iconTone = '#16181D', emptyIcon = 'storefront',
}) {
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [newName, setNewName] = useState('')
  const [inputVal, setInputVal] = useState(value ?? '')
  const ref = useRef()

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (item) => {
    setInputVal(item.name)
    onChange(item.name)
    setOpen(false)
  }

  const handleInput = (e) => {
    setInputVal(e.target.value)
    onChange(e.target.value)
  }

  const handleAdd = () => {
    if (!newName.trim()) return
    onAdd(newName.trim())
    setNewName('')
  }

  const filtered = items.filter((i) => i.name.toLowerCase().includes(inputVal.toLowerCase()))

  return (
    <div ref={ref} className="relative">
      {label && <label className="label">{label}</label>}
      <input
        className="input pr-8"
        value={inputVal}
        onChange={handleInput}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 mt-0.5"
        onClick={() => setOpen((o) => !o)}
      >▾</button>

      {open && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-56 overflow-y-auto">
          {filtered.map((item) => (
            <div key={item.id} className="flex items-center group hover:bg-gray-50">
              {editId === item.id ? (
                <div className="flex gap-1 flex-1 p-1.5">
                  <input
                    className="input text-xs py-1 flex-1"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { onUpdate(item.id, editName); setEditId(null) } }}
                    autoFocus
                  />
                  <button className="btn btn-primary text-xs py-1 px-2" onClick={() => { onUpdate(item.id, editName); setEditId(null) }}>บันทึก</button>
                  <button className="btn btn-secondary text-xs py-1 px-2" onClick={() => setEditId(null)}>ยกเลิก</button>
                </div>
              ) : (
                <>
                  {/* ไอคอนแสดงเสมอเมื่อรายการนั้นตั้งไอคอนได้ — กดที่ไอคอนเพื่อเปลี่ยน
                      ไม่ไปปนกับปุ่ม "แก้ไข" ที่เป็นการเปลี่ยนชื่อ คนละเรื่องกัน */}
                  {onSetIcon && (
                    <span className="pl-1.5 flex-none">
                      <IconPickerButton
                        bare
                        size={26}
                        value={item.icon}
                        tone={iconTone}
                        emptyIcon={emptyIcon}
                        onChange={(v) => onSetIcon(item.id, v)}
                      />
                    </span>
                  )}
                  <button
                    className={`flex-1 text-left py-2 text-sm ${onSetIcon ? 'px-2' : 'px-3'}`}
                    onClick={() => handleSelect(item)}
                  >{item.name}</button>
                  <div className="hidden group-hover:flex gap-1 pr-2">
                    <button
                      className="text-xs text-blue-500 hover:text-blue-700 px-1"
                      onClick={(e) => { e.stopPropagation(); setEditId(item.id); setEditName(item.name) }}
                    >แก้ไข</button>
                    <button
                      className="text-xs text-red-500 hover:text-red-700 px-1"
                      onClick={(e) => { e.stopPropagation(); if (confirm(`ลบ "${item.name}"?`)) onDelete(item.id) }}
                    >ลบ</button>
                  </div>
                </>
              )}
            </div>
          ))}
          {onAdd && (
            <div className="border-t border-gray-100 p-2 flex gap-1">
              <input
                className="input text-xs py-1 flex-1"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="เพิ่มรายการใหม่..."
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              />
              <button className="btn btn-primary text-xs py-1 px-2" onClick={handleAdd}>+ เพิ่ม</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
