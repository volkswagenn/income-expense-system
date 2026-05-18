import { useState } from 'react'
import { SHOP_COLORS } from '../../store/useShopStore'

export default function CreateShopPopup({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [colorId, setColorId] = useState('blue')
  const [err, setErr] = useState('')

  const handleCreate = () => {
    if (!name.trim()) return setErr('กรุณาใส่ชื่อร้าน')
    onCreate(name.trim(), colorId)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 py-5 border-b bg-gray-50 flex items-center justify-between">
          <h2 className="font-semibold text-base text-gray-900">+ สร้างร้านใหม่</h2>
          <button className="text-gray-400 hover:text-gray-600 text-xl" onClick={onClose}>×</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <label className="label">ชื่อร้าน / สาขา</label>
            <input
              className="input"
              placeholder="เช่น สาขาลาดพร้าว, ร้านหลัก..."
              value={name}
              onChange={(e) => { setName(e.target.value); setErr('') }}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
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
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          {name.trim() && (
            <div className={`rounded-xl border p-3 flex items-center gap-3 ${SHOP_COLORS.find(c => c.id === colorId)?.card}`}>
              <div className={`w-10 h-10 rounded-full ${SHOP_COLORS.find(c => c.id === colorId)?.bg} flex items-center justify-center text-white font-bold text-lg`}>
                {name.trim()[0].toUpperCase()}
              </div>
              <div>
                <p className={`font-semibold text-sm ${SHOP_COLORS.find(c => c.id === colorId)?.text}`}>{name.trim()}</p>
                <p className="text-xs text-gray-400">ร้านใหม่</p>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t bg-gray-50 flex gap-2 justify-end">
          <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" onClick={handleCreate}>✓ สร้างร้าน</button>
        </div>
      </div>
    </div>
  )
}
