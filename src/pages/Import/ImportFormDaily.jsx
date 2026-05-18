import { useState, useRef } from 'react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import useTransactionStore from '../../store/useTransactionStore'
import useLogStore from '../../store/useLogStore'
import { buildLogEntry } from '../../lib/logBuilder'
import { addToWallet } from '../../lib/walletEngine'
import { saveAppFile } from '../../lib/fileHelper'
import { parseImportFile } from '../../lib/importParser'
import ConfirmPopup from '../../components/shared/ConfirmPopup'

const HEADERS = ['วันที่', 'ยอดรวม (บาท)', 'หมายเหตุ']
const COL_MAP = { 'วันที่': 'date', 'ยอดรวม (บาท)': 'total', 'หมายเหตุ': 'note' }

function buildCsv(rows) {
  const lines = [
    HEADERS.join(','),
    ...rows.map((r) => `${r.date},${r.total ?? ''},${r.note ?? ''}`),
  ]
  return '﻿' + lines.join('\r\n')
}

export default function ImportFormDaily({ rows, setRows, startDate, endDate, showUploader, setShowUploader }) {
  const [confirm, setConfirm] = useState(false)
  const [done, setDone] = useState(false)
  const [dlStatus, setDlStatus] = useState(null)
  const [ulMsg, setUlMsg] = useState('')
  const fileRef = useRef(null)

  const { addTransaction } = useTransactionStore()
  const { addLog } = useLogStore()

  const update = (i, key, val) =>
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r))

  const validRows = rows.filter((r) => Number(r.total || 0) > 0)
  const grandTotal = rows.reduce((s, r) => s + (Number(r.total) || 0), 0)

  const handleDownload = async () => {
    setDlStatus({ kind: 'loading', msg: 'กำลังสร้าง...' })
    try {
      const csv = buildCsv(rows)
      const bytes = new TextEncoder().encode(csv)
      const filename = `แม่แบบ_รายรับรวมรายวัน_${startDate}_${endDate}.csv`
      const result = await saveAppFile(bytes, 'templates', filename)
      if (result?.cancelled) { setDlStatus(null); return }
      if (!result?.success) throw new Error(result?.error ?? 'บันทึกไม่สำเร็จ')
      setDlStatus({ kind: 'ok', msg: `✓ บันทึกแล้ว${result.savedPath ? ` — ${result.savedPath}` : ''}` })
      setTimeout(() => setDlStatus(null), 6000)
    } catch (err) {
      setDlStatus({ kind: 'error', msg: `⚠️ ${err.message}` })
    }
  }

  const handleUploadFile = async (f) => {
    setUlMsg('')
    try {
      const buf = await f.arrayBuffer()
      const parsed = parseImportFile(buf, COL_MAP)
      if (parsed.length === 0) { setUlMsg('⚠️ ไม่พบข้อมูลหรือรูปแบบคอลัมน์ไม่ถูกต้อง'); return }
      setRows((prev) =>
        prev.map((row) => {
          const match = parsed.find((p) => p.date === row.date)
          if (!match) return row
          return {
            ...row,
            total: match.total !== '' ? match.total : row.total,
            note: match.note !== '' ? match.note : row.note,
          }
        })
      )
      const matched = parsed.filter((p) => rows.some((r) => r.date === p.date)).length
      setUlMsg(`✓ โหลดข้อมูลจากไฟล์แล้ว ${matched} แถว`)
      setShowUploader(false)
    } catch (err) {
      setUlMsg(`⚠️ ${err.message}`)
    }
  }

  const execute = () => {
    validRows.forEach((r) => {
      const amt = Number(r.total)
      addTransaction({
        date: r.date, type: 'income', amount: amt, method: 'cash',
        itemName: 'รายรับรวม (นำเข้าข้อมูล)', note: r.note ?? '',
      })
      addToWallet('cash', amt, {
        activityType: 'IMPORT_DATA',
        description: `นำเข้ารายรับรวม ${amt.toLocaleString()} บาท (${r.date})`,
      })
    })
    addLog(buildLogEntry({
      activityType: 'IMPORT_DATA',
      description: `นำเข้าข้อมูลรายรับรวมตามรายวัน ${validRows.length} วัน รวม ${grandTotal.toLocaleString()} บาท`,
      newValue: { count: validRows.length, total: grandTotal },
    }))
    setConfirm(false)
    setDone(true)
  }

  return (
    <div className="space-y-4">
      {done && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700">
          ✓ นำเข้าข้อมูลสำเร็จ {validRows.length} วัน รวม {grandTotal.toLocaleString()} บาท
        </div>
      )}

      <p className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg p-2">
        ยอดรวม = เงินสด + เงินโอน — จะบันทึกเป็นเงินสดในระบบ
      </p>

      {/* Download / Upload bar */}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-secondary text-sm" onClick={handleDownload} disabled={dlStatus?.kind === 'loading'}>
          📥 ดาวน์โหลด CSV
        </button>
        <button
          className={`btn text-sm ${showUploader ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setShowUploader(!showUploader); setUlMsg('') }}
        >
          📤 อัปโหลดไฟล์
        </button>
        {dlStatus && (
          <span className={`text-xs ${dlStatus.kind === 'ok' ? 'text-emerald-600' : dlStatus.kind === 'error' ? 'text-red-600' : 'text-blue-600'}`}>
            {dlStatus.msg}
          </span>
        )}
        {ulMsg && <span className={`text-xs ${ulMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-600'}`}>{ulMsg}</span>}
      </div>

      {showUploader && (
        <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
          <p className="text-xs text-gray-500">เลือกไฟล์ CSV / Excel ที่มีคอลัมน์: {HEADERS.join(', ')}</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadFile(f); e.target.value = '' }}
          />
          <button className="btn btn-secondary text-sm" onClick={() => fileRef.current?.click()}>
            📂 เลือกไฟล์…
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-2 pr-3 text-left font-medium text-gray-600 min-w-32">วันที่</th>
              <th className="py-2 pr-3 text-right font-medium text-emerald-600 min-w-36">ยอดรวม (บาท)</th>
              <th className="py-2 font-medium text-gray-600 min-w-40">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.date} className="border-b border-gray-100">
                <td className="py-1.5 pr-3 text-gray-600 whitespace-nowrap">
                  {format(new Date(row.date), 'EEE d MMM', { locale: th })}
                </td>
                <td className="py-1.5 pr-3">
                  <input
                    className="input text-right py-1 text-sm"
                    type="number" min="0"
                    value={row.total ?? ''}
                    onChange={(e) => update(i, 'total', e.target.value)}
                    placeholder="0"
                  />
                </td>
                <td className="py-1.5">
                  <input
                    className="input py-1 text-sm"
                    value={row.note ?? ''}
                    onChange={(e) => update(i, 'note', e.target.value)}
                    placeholder="หมายเหตุ"
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
              <td className="py-2 pr-3">รวมทั้งหมด</td>
              <td className="py-2 pr-3 text-right text-emerald-600">{grandTotal.toLocaleString()}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <button
        className="btn btn-primary"
        disabled={validRows.length === 0}
        onClick={() => setConfirm(true)}
      >
        📥 นำเข้าข้อมูล ({validRows.length} วัน — รวม {grandTotal.toLocaleString()} บาท)
      </button>

      <ConfirmPopup
        open={confirm}
        title="ยืนยันการนำเข้าข้อมูล"
        message={`นำเข้ารายรับรวม ${validRows.length} วัน ยอดรวม ${grandTotal.toLocaleString()} บาท\nข้อมูลจะถูกบันทึกเป็นเงินสดในระบบ ยืนยันหรือไม่?`}
        onConfirm={execute}
        onCancel={() => setConfirm(false)}
        confirmLabel="ยืนยันนำเข้า"
      />
    </div>
  )
}
