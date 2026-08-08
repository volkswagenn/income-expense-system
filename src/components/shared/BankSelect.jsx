import { useEffect, useRef, useState } from 'react'
import { BANKS } from '../../lib/banks'
import BankLogo from './BankLogo'

/**
 * dropdown เลือกธนาคารที่แสดงโลโก้ได้
 * ต้องเขียนเองเพราะ <option> ของ HTML แสดงรูปภาพไม่ได้
 *
 * props: value (ชื่อธนาคาร), onChange(name), placeholder
 */
export default function BankSelect({ value, onChange, placeholder = 'เลือกธนาคาร...' }) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const boxRef = useRef(null)
  const listRef = useRef(null)

  const selected = BANKS.find((b) => b.name === value) ?? null

  useEffect(() => {
    if (!open) return
    const onDocDown = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open])

  // เลื่อนให้เห็นตัวเลือกที่กำลังโฟกัสด้วยคีย์บอร์ด
  useEffect(() => {
    if (!open || activeIndex < 0) return
    listRef.current?.querySelectorAll('[role="option"]')[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  const pick = (bank) => {
    onChange(bank.name)
    setOpen(false)
  }

  const onKeyDown = (e) => {
    if (!open) {
      if (['Enter', ' ', 'ArrowDown'].includes(e.key)) {
        e.preventDefault()
        setOpen(true)
        setActiveIndex(Math.max(0, BANKS.findIndex((b) => b.name === value)))
      }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(BANKS.length - 1, i + 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(0, i - 1)); return }
    if (e.key === 'Enter' && activeIndex >= 0) { e.preventDefault(); pick(BANKS[activeIndex]) }
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        className="input w-full flex items-center gap-2.5 text-left"
        onClick={() => {
          setOpen((o) => !o)
          setActiveIndex(Math.max(0, BANKS.findIndex((b) => b.name === value)))
        }}
        onKeyDown={onKeyDown}
      >
        {selected ? (
          <>
            <BankLogo bankName={selected.name} size="sm" />
            <span className="flex-1 truncate">{selected.name}</span>
          </>
        ) : (
          <span className="flex-1 text-gray-400">{placeholder}</span>
        )}
        <span className={`text-gray-400 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          className="absolute z-[70] mt-1 w-full max-h-64 overflow-y-auto bg-white rounded-xl border border-gray-200 shadow-xl py-1"
        >
          {BANKS.map((bank, i) => {
            const isSelected = bank.name === value
            return (
              <button
                key={bank.code}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                  i === activeIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                } ${isSelected ? 'font-medium text-blue-700' : 'text-gray-700'}`}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => pick(bank)}
              >
                <BankLogo bankName={bank.name} size="sm" />
                <span className="flex-1 truncate">{bank.name}</span>
                {isSelected && <span className="text-blue-500 text-xs">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
