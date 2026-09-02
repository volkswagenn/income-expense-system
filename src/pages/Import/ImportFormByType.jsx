import { useState, useRef } from 'react'
import AmountInput from '../../components/shared/AmountInput'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import useLogStore from '../../store/useLogStore'
import { buildLogEntry } from '../../lib/logBuilder'
import { importEntry, runImport } from '../../lib/importRunner'
import TransferAccountPicker from '../../components/shared/TransferAccountPicker'
import useWalletStore from '../../store/useWalletStore'
import { saveAppFile } from '../../lib/fileHelper'
import { parseImportFile } from '../../lib/importParser'
import ConfirmPopup from '../../components/shared/ConfirmPopup'

const HEADERS = ['วันที่', 'เงินสด (บาท)', 'เงินโอน (บาท)', 'อื่นๆ (บาท)', 'หมายเหตุ']
const COL_MAP = { 'วันที่': 'date', 'เงินสด (บาท)': 'cash', 'เงินโอน (บาท)': 'transfer', 'อื่นๆ (บาท)': 'other', 'หมายเหตุ': 'note' }

function buildCsv(rows) {
  const lines = [
    HEADERS.join(','),
    ...rows.map((r) => `${r.date},${r.cash ?? ''},${r.transfer ?? ''},${r.other ?? ''},${r.note ?? ''}`),
  ]
  return '﻿' + lines.join('\r\n')
}

export default function ImportFormByType({ rows, setRows, startDate, endDate, showUploader, setShowUploader }) {
  const [confirm, setConfirm] = useState(false)
  const [done, setDone] = useState(false)
  const [dlStatus, setDlStatus] = useState(null)
  const [ulMsg, setUlMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const fileRef = useRef(null)

  const { addLog } = useLogStore()
  const [accountId, setAccountId] = useState('')
  const resolveAccount = useWalletStore((s) => s.resolveTransferAccountId)

  const update = (i, key, val) =>
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r))

  const validRows = rows.filter((r) => Number(r.cash || 0) > 0 || Number(r.transfer || 0) > 0 || Number(r.other || 0) > 0)
  const grandCash = rows.reduce((s, r) => s + (Number(r.cash) || 0), 0)
  const grandTransfer = rows.reduce((s, r) => s + (Number(r.transfer) || 0), 0)
  const grandOther = rows.reduce((s, r) => s + (Number(r.other) || 0), 0)
  const grandTotal = grandCash + grandTransfer + grandOther

  const handleDownload = async () => {
    setDlStatus({ kind: 'loading', msg: 'กำลังสร้าง...' })
    try {
      const csv = buildCsv(rows)
      const bytes = new TextEncoder().encode(csv)
      const filename = `แม่แบบ_รายรับแยกประเภท_${startDate}_${endDate}.csv`
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
            cash: match.cash !== '' ? match.cash : row.cash,
            transfer: match.transfer !== '' ? match.transfer : row.transfer,
            other: match.other !== '' ? match.other : row.other,
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

  // มีเงินโอนแต่ยังไม่ได้เลือกบัญชี — ห้ามนำเข้า ไม่งั้นยอดโอนถูกข้ามเงียบๆ
  // ทั้งที่ข้อความสรุปและ log บอกว่านำเข้าครบ
  const transferNeedsAccount = grandTransfer > 0 && !resolveAccount(accountId)

  const execute = async () => {
    if (saving) return
    if (transferNeedsAccount) {
      setConfirm(false)
      setSaveError('มียอดเงินโอน กรุณาเลือกบัญชีที่จะรับเงินโอนก่อนนำเข้า')
      return
    }
    // เงินโอนที่นำเข้าทั้งชุดจะลงบัญชีเดียวกันที่เลือกไว้ด้านบน
    const acct = resolveAccount(accountId)
    const entries = []
    validRows.forEach((r) => {
      const cash = Number(r.cash || 0)
      const transfer = Number(r.transfer || 0)
      const other = Number(r.other || 0)
      if (cash > 0) {
        entries.push(importEntry(
          { date: r.date, type: 'income', amount: cash, method: 'cash', itemName: 'รายรับเงินสด (นำเข้าข้อมูล)', note: r.note ?? '' },
          `นำเข้ารายรับเงินสด ${cash.toLocaleString()} บาท (${r.date})`))
      }
      if (transfer > 0 && acct) {
        entries.push(importEntry(
          { date: r.date, type: 'income', amount: transfer, method: 'transfer', transferAccountId: acct, itemName: 'รายรับเงินโอน (นำเข้าข้อมูล)', note: r.note ?? '' },
          `นำเข้ารายรับเงินโอน ${transfer.toLocaleString()} บาท (${r.date})`))
      }
      if (other > 0) {
        entries.push(importEntry(
          { date: r.date, type: 'income', amount: other, method: 'other', itemName: 'รายรับอื่นๆ (นำเข้าข้อมูล)', note: r.note ?? '' },
          `นำเข้ารายรับอื่นๆ ${other.toLocaleString()} บาท (${r.date})`))
      }
    })

    setConfirm(false)
    setSaving(true)
    setSaveError('')
    try {
      await runImport(entries)
    } catch (err) {
      setSaveError(err.message)
      setSaving(false)
      return
    }
    setSaving(false)
    addLog(buildLogEntry({
      activityType: 'IMPORT_DATA',
      description: `นำเข้าข้อมูลรายรับแยกประเภท ${validRows.length} วัน รวม ${grandTotal.toLocaleString()} บาท (สด ${grandCash.toLocaleString()} / โอน ${grandTransfer.toLocaleString()}${grandOther > 0 ? ` / อื่นๆ ${grandOther.toLocaleString()}` : ''})`,
      newValue: { count: validRows.length, cash: grandCash, transfer: grandTransfer, other: grandOther, total: grandTotal },
    }))
    setDone(true)
  }

  return (
    <div className="space-y-4">
      {saving && (
        <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
          กำลังบันทึกลงเซิร์ฟเวอร์… อย่าปิดหน้านี้
        </p>
      )}

      {saveError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
          {saveError}
        </p>
      )}

      {done && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700">
          ✓ นำเข้าข้อมูลสำเร็จ {validRows.length} วัน รวม {grandTotal.toLocaleString()} บาท (สด {grandCash.toLocaleString()} / โอน {grandTransfer.toLocaleString()}{grandOther > 0 ? ` / อื่นๆ ${grandOther.toLocaleString()}` : ''})
        </div>
      )}

      {/* บัญชีปลายทางของยอดเงินโอนทั้งชุด */}
      {grandTransfer > 0 && (
        <div className="max-w-sm space-y-1.5">
          <TransferAccountPicker value={accountId} onChange={setAccountId} label="เงินโอนเข้าบัญชี" />
          {transferNeedsAccount && (
            <p className="text-xs text-amber-700">ต้องเลือกบัญชีก่อน ไม่งั้นยอดเงินโอนจะไม่ถูกนำเข้า</p>
          )}
        </div>
      )}

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
              <th className="py-2 pr-3 text-right font-medium text-gray-700 min-w-28">เงินสด (บาท)</th>
              <th className="py-2 pr-3 text-right font-medium text-blue-600 min-w-28">เงินโอน (บาท)</th>
              <th className="py-2 pr-3 text-right font-medium text-gray-500 min-w-28">อื่นๆ (บาท)</th>
              <th className="py-2 pr-3 text-right font-medium text-emerald-600 min-w-28">ยอดรวม (บาท)</th>
              <th className="py-2 font-medium text-gray-600 min-w-40">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const rowTotal = (Number(row.cash) || 0) + (Number(row.transfer) || 0) + (Number(row.other) || 0)
              return (
                <tr key={row.date} className="border-b border-gray-100">
                  <td className="py-1.5 pr-3 text-gray-600 whitespace-nowrap">
                    {format(new Date(row.date), 'EEE d MMM', { locale: th })}
                  </td>
                  <td className="py-1.5 pr-3">
                    <AmountInput className="input text-right py-1 text-sm" value={row.cash ?? ''} onChange={(e) => update(i, 'cash', e.target.value)} placeholder="0" />
                  </td>
                  <td className="py-1.5 pr-3">
                    <AmountInput className="input text-right py-1 text-sm" value={row.transfer ?? ''} onChange={(e) => update(i, 'transfer', e.target.value)} placeholder="0" />
                  </td>
                  <td className="py-1.5 pr-3">
                    <AmountInput className="input text-right py-1 text-sm" value={row.other ?? ''} onChange={(e) => update(i, 'other', e.target.value)} placeholder="0" />
                  </td>
                  <td className="py-1.5 pr-3 text-right text-emerald-600 font-medium tabular-nums">
                    {rowTotal > 0 ? rowTotal.toLocaleString() : '—'}
                  </td>
                  <td className="py-1.5">
                    <input className="input py-1 text-sm" value={row.note ?? ''} onChange={(e) => update(i, 'note', e.target.value)} placeholder="หมายเหตุ" />
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
              <td className="py-2 pr-3">รวมทั้งหมด</td>
              <td className="py-2 pr-3 text-right text-gray-700">{grandCash.toLocaleString()}</td>
              <td className="py-2 pr-3 text-right text-blue-600">{grandTransfer.toLocaleString()}</td>
              <td className="py-2 pr-3 text-right text-gray-500">{grandOther > 0 ? grandOther.toLocaleString() : '—'}</td>
              <td className="py-2 pr-3 text-right text-emerald-600">{grandTotal.toLocaleString()}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <button
        className="btn btn-primary"
        disabled={validRows.length === 0 || saving}
        onClick={() => setConfirm(true)}
      >
        📥 นำเข้าข้อมูล ({validRows.length} วัน — รวม {grandTotal.toLocaleString()} บาท)
      </button>

      <ConfirmPopup
        open={confirm}
        title="ยืนยันการนำเข้าข้อมูล"
        message={`นำเข้ารายรับแยกประเภท ${validRows.length} วัน\nเงินสด ${grandCash.toLocaleString()} บาท / เงินโอน ${grandTransfer.toLocaleString()} บาท${grandOther > 0 ? ` / อื่นๆ ${grandOther.toLocaleString()} บาท` : ''}\nยอดรวม ${grandTotal.toLocaleString()} บาท`}
        onConfirm={execute}
        onCancel={() => setConfirm(false)}
        confirmLabel="ยืนยันนำเข้า"
      />
    </div>
  )
}
