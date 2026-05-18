import { useState } from 'react'
import useLogStore from '../../store/useLogStore'
import useTransactionStore from '../../store/useTransactionStore'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { ACTIVITY_LABELS } from '../../lib/logBuilder'
import StatusBadge from '../../components/shared/StatusBadge'
import ConfirmPopup from '../../components/shared/ConfirmPopup'

export default function TransactionLog() {
  const { logs, updateLog, deleteLog } = useLogStore()
  const [search, setSearch] = useState('')
  const [editId, setEditId] = useState(null)
  const [editNote, setEditNote] = useState('')
  const [deleteId, setDeleteId] = useState(null)
  const [page, setPage] = useState(1)
  const PER_PAGE = 20

  const filtered = logs.filter((l) =>
    !search || l.description?.toLowerCase().includes(search.toLowerCase()) ||
    l.activityType?.toLowerCase().includes(search.toLowerCase())
  )

  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const totalPages = Math.ceil(filtered.length / PER_PAGE)

  const walletColor = (delta) => delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-500' : 'text-gray-400'

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <input
          className="input flex-1"
          placeholder="ค้นหา log..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
        <span className="text-sm text-gray-500 whitespace-nowrap">{filtered.length} รายการ</span>
      </div>

      <div className="space-y-2">
        {paged.length === 0 && (
          <p className="text-center text-gray-400 py-8 text-sm">ไม่มีข้อมูล log</p>
        )}
        {paged.map((log) => (
          <div key={log.id} className="border border-gray-100 rounded-xl p-4 bg-white hover:border-gray-200 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    {ACTIVITY_LABELS[log.activityType] ?? log.activityType}
                  </span>
                  <StatusBadge status={log.status} />
                  {log.walletEffect?.delta != null && (
                    <span className={`text-xs font-semibold tabular-nums ${walletColor(log.walletEffect.delta)}`}>
                      {log.walletEffect.delta > 0 ? '+' : ''}{log.walletEffect.delta.toLocaleString()} บาท
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-800 mt-1">{log.description}</p>
                {log.changeNote && (
                  <p className="text-xs text-amber-600 mt-0.5">เหตุผล: {log.changeNote}</p>
                )}
                {editId === log.id ? (
                  <div className="flex gap-2 mt-2">
                    <input
                      className="input text-xs py-1 flex-1"
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      placeholder="หมายเหตุการแก้ไข..."
                    />
                    <button className="btn btn-primary text-xs py-1" onClick={() => { updateLog(log.id, { changeNote: editNote }); setEditId(null) }}>บันทึก</button>
                    <button className="btn btn-secondary text-xs py-1" onClick={() => setEditId(null)}>ยกเลิก</button>
                  </div>
                ) : null}
                <p className="text-xs text-gray-400 mt-1">
                  {format(new Date(log.timestamp), 'dd MMM yyyy HH:mm:ss', { locale: th })}
                </p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button
                  className="btn btn-ghost text-xs py-1 px-2 text-blue-500"
                  onClick={() => { setEditId(log.id); setEditNote(log.changeNote ?? '') }}
                >แก้ไข</button>
                <button
                  className="btn btn-ghost text-xs py-1 px-2 text-red-400"
                  onClick={() => setDeleteId(log.id)}
                >ลบ</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <ConfirmPopup
        open={!!deleteId}
        title="ลบ log"
        message="ลบ log นี้?"
        onConfirm={() => { deleteLog(deleteId); setDeleteId(null) }}
        onCancel={() => setDeleteId(null)}
        confirmLabel="ลบ"
        danger
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button className="btn btn-secondary text-sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
          <span className="text-sm text-gray-600">{page} / {totalPages}</span>
          <button className="btn btn-secondary text-sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
        </div>
      )}
    </div>
  )
}
