export default function ConfirmPopup({ open, title, message, onConfirm, onCancel, confirmLabel = 'ยืนยัน', cancelLabel = 'ยกเลิก', danger = false }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className={`px-6 py-4 border-b ${danger ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
          <h3 className={`font-semibold text-base ${danger ? 'text-red-700' : 'text-amber-700'}`}>
            {title}
          </h3>
        </div>
        <div className="px-6 py-4 text-sm text-gray-700 leading-relaxed">{message}</div>
        <div className="px-6 pb-5 flex gap-3 justify-end">
          <button className="btn btn-secondary" onClick={onCancel}>{cancelLabel}</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-warning'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
