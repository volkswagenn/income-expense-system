import { format } from 'date-fns'
import { th } from 'date-fns/locale'

function timeAgo(value) {
  if (!value) return '-'
  const diff = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(diff)) return '-'
  const minutes = Math.max(0, Math.floor(diff / 60000))
  if (minutes < 1) return 'เมื่อสักครู่'
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`
  return `${Math.floor(minutes / 60)} ชม.ที่แล้ว`
}

/**
 * ReadOnlyConfirmPopup
 *
 * แสดงเมื่อผู้ใช้พยายามเข้าร้านที่มีผู้แก้ไขครบ limit แล้ว
 * และระบบจะเปลี่ยนโหมดเป็นอ่านอย่างเดียวอัตโนมัติ
 * ขอ confirmation ก่อนเข้า
 */
export default function ReadOnlyConfirmPopup({
  shopName,
  editors = [],
  maxEditors = 1,
  onConfirm,
  onCancel,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
            <span className="text-3xl">👁️</span>
          </div>
          <h2 className="text-lg font-bold text-gray-900">เข้าสู่โหมดอ่านอย่างเดียว</h2>
          <p className="text-sm text-gray-500 mt-1">
            ร้าน <span className="font-semibold text-gray-700">{shopName}</span> มีผู้แก้ไขครบ {maxEditors} คนแล้ว
          </p>
        </div>

        {/* Divider */}
        <div className="mx-6 border-t border-gray-100" />

        {/* Editor list */}
        <div className="px-6 py-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            กำลังแก้ไขอยู่ ({editors.length} คน)
          </p>
          {editors.length === 0 ? (
            <p className="text-sm text-gray-400 italic">ไม่พบข้อมูลผู้ใช้งาน</p>
          ) : (
            <ul className="space-y-2">
              {editors.map((session) => (
                <li
                  key={session.id}
                  className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5"
                >
                  <div className="w-8 h-8 rounded-full bg-amber-200 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-amber-700">
                      {(session.displayName || session.username || '?')[0]?.toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {session.displayName || session.username || 'ไม่ทราบชื่อ'}
                    </p>
                    <p className="text-xs text-gray-400">
                      เข้าใช้งาน {timeAgo(session.lastSeenAt || session.startedAt)}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 font-medium">
                    แก้ไข
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Notice */}
        <div className="mx-6 mb-4 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-700">
          <p className="font-medium mb-0.5">📋 โหมดอ่านอย่างเดียว</p>
          <p className="text-xs text-blue-600 leading-relaxed">
            คุณจะเห็นข้อมูลและรายงานได้ แต่ไม่สามารถเพิ่ม แก้ไข หรือลบข้อมูลได้
            จนกว่าผู้แก้ไขจะออกจากร้าน
          </p>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            onClick={onCancel}
          >
            ยกเลิก
          </button>
          <button
            className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors shadow-sm"
            onClick={onConfirm}
          >
            เข้าสู่โหมดอ่าน
          </button>
        </div>

      </div>
    </div>
  )
}
