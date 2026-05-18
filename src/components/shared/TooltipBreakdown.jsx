import { useState } from 'react'

export default function TooltipBreakdown({ children, items }) {
  const [visible, setVisible] = useState(false)
  const filtered = items.filter((i) => i.value !== 0 && i.value != null)
  if (!filtered.length) return <>{children}</>

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <span className="cursor-help underline decoration-dotted">{children}</span>
      {visible && (
        <div className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-gray-900 text-white rounded-xl shadow-xl p-3 text-xs">
          <div className="space-y-1.5">
            {filtered.map((item, i) => (
              <div key={i} className="flex justify-between gap-2">
                <span className="text-gray-300">{item.label}</span>
                <span className="font-semibold tabular-nums">
                  {item.value.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-900" />
        </div>
      )}
    </div>
  )
}
