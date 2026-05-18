import { useState } from 'react'

/**
 * Persists form state to sessionStorage so data survives tab navigation.
 * Returns [form, setForm, clearDraft, hasDraft].
 * - hasDraft: true if data was restored from a previous session (not yet saved)
 * - clearDraft(): resets form to initial state and removes from storage
 */
export function useFormDraft(key, initial) {
  const storageKey = `draft:${key}`

  const [hasDraft] = useState(() => {
    try { return !!sessionStorage.getItem(storageKey) } catch { return false }
  })

  const [form, setFormInternal] = useState(() => {
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (raw) return { ...initial, ...JSON.parse(raw) }
    } catch {}
    return initial
  })

  const setForm = (updater) => {
    setFormInternal((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      try { sessionStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
      return next
    })
  }

  const clearDraft = () => {
    try { sessionStorage.removeItem(storageKey) } catch {}
    setFormInternal(initial)
  }

  return [form, setForm, clearDraft, hasDraft]
}

/**
 * Banner shown at the top of a form when draft data was restored.
 * Usage: <DraftBanner hasDraft={hasDraft} onClear={clearDraft} />
 */
export function DraftBanner({ hasDraft, onClear }) {
  if (!hasDraft) return null
  return (
    <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-sm">
      <div className="flex items-center gap-2 text-blue-700">
        <span className="text-base">💾</span>
        <span>กู้คืนข้อมูลที่กรอกค้างไว้แล้ว — กดบันทึกเมื่อพร้อม</span>
      </div>
      <button
        type="button"
        className="text-blue-400 hover:text-blue-600 text-xs whitespace-nowrap transition-colors"
        onClick={onClear}
      >
        ล้างข้อมูล ✕
      </button>
    </div>
  )
}
