import { useState } from 'react'
import { SHOP_COLORS } from '../../store/useShopStore'

export default function EditShopPopup({ shop, onClose, onSave }) {
  const [name, setName] = useState(shop.name)
  const [colorId, setColorId] = useState(shop.colorId || 'blue')
  const [err, setErr] = useState('')
  const color = SHOP_COLORS.find((c) => c.id === colorId) ?? SHOP_COLORS[0]

  const handleSave = () => {
    if (!name.trim()) return setErr('กรุณาใส่ชื่อร้าน')
    onSave(shop.id, { name: name.trim(), colorId })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 py-5 border-b bg-gray-50 flex items-center justify-between">
          <h2 className="font-semibold text-base text-gray-900">แก้ไขร้าน</h2>
          <button className="text-gray-400 hover:text-gray-600 text-xl" onClick={onClose}>×</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <label className="label">ชื่อร้าน / สาขา</label>
            <input
              className="input"
              value={name}
              onChange={(e) => { setName(e.target.value); setErr('') }}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              autoFocus
            />
            {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
          </div>

          <div>
            <label className="label">สีประจำร้าน</label>
            <div className="flex gap-3 mt-1">
              {SHOP_COLORS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setColorId(c.id)}
                  className={`w-9 h-9 rounded-full ${c.bg} transition-transform ${
                    colorId === c.id ? 'scale-125 ring-2 ring-offset-2 ' + c.ring : 'opacity-70 hover:opacity-100'
                  }`}
                  aria-label={`เลือกสี ${c.id}`}
                />
              ))}
            </div>
          </div>

          <div className={`rounded-lg border p-3 flex items-center gap-3 ${color.card}`}>
            <div className={`w-10 h-10 rounded-lg ${color.bg} flex items-center justify-center text-white font-bold text-lg`}>
              {name.trim()[0]?.toUpperCase() || '?'}
            </div>
            <div className="min-w-0">
              <p className={`font-semibold text-sm truncate ${color.text}`}>{name.trim() || shop.name}</p>
              <p className="text-xs text-gray-400">ตัวอย่างการ์ดร้าน</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t bg-gray-50 flex gap-2 justify-end">
          <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" onClick={handleSave}>บันทึก</button>
        </div>
      </div>
    </div>
  )
}
