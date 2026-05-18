import * as XLSX from 'xlsx'

function normalizeKey(key) {
  return String(key).replace(/^﻿/, '').trim()
}

// Excel serial number → 'yyyy-MM-dd' (UTC-based, no timezone shift)
function serialToYMD(serial) {
  if (typeof serial !== 'number' || isNaN(serial) || serial < 1) return ''
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000))
  if (isNaN(d.getTime())) return ''
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Parse a date string in multiple formats → 'yyyy-MM-dd' or ''
function parseDateString(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return ''

  // yyyy-MM-dd (ISO / our template format)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // D/M/YYYY or D/M/YY — Thai day-first format (e.g. 1/5/2026 = May 1)
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (dmy) {
    let d = +dmy[1], m = +dmy[2], y = +dmy[3]
    if (y > 2400) y -= 543   // Buddhist Era → AD
    if (y < 100) y += 2000
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31)
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  // D-M-YYYY or D.M.YYYY
  const alt = s.match(/^(\d{1,2})[-.](\d{1,2})[-.](\d{2,4})$/)
  if (alt) {
    let d = +alt[1], m = +alt[2], y = +alt[3]
    if (y > 2400) y -= 543
    if (y < 100) y += 2000
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31)
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  return ''
}

// Split a single CSV line respecting double-quoted fields
function splitCsvLine(line) {
  const cols = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
      else inQ = !inQ
    } else if (ch === ',' && !inQ) {
      cols.push(cur); cur = ''
    } else {
      cur += ch
    }
  }
  cols.push(cur)
  return cols
}

// Parse CSV text directly — avoids XLSX date auto-detection (M/D vs D/M confusion)
function parseCsvText(text, colMap) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const nonEmpty = lines.filter(l => l.trim())
  if (nonEmpty.length < 2) return []

  const headers = splitCsvLine(nonEmpty[0]).map(h => normalizeKey(h.replace(/^"|"$/g, '')))
  const colOrder = headers.map(h => colMap[h] ?? null)

  return nonEmpty.slice(1).map(line => {
    const vals = splitCsvLine(line)
    const row = {}
    for (const k of Object.values(colMap)) row[k] = ''

    vals.forEach((val, i) => {
      const key = colOrder[i]
      if (!key) return
      const v = val.trim().replace(/^"|"$/g, '')
      row[key] = key === 'date' ? parseDateString(v) : v
    })

    return row
  }).filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date))
}

// Parse Excel binary (XLSX/XLS) — uses serial→date conversion, no cellDates timezone issues
function parseExcelBuffer(buffer, colMap) {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws['!ref']) return []

  const range = XLSX.utils.decode_range(ws['!ref'])

  // Map column index → internal key from header row
  const colIndexMap = {}
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: range.s.r, c })]
    if (cell) {
      const thaiKey = normalizeKey(String(cell.v ?? ''))
      const key = colMap[thaiKey]
      if (key) colIndexMap[c] = key
    }
  }

  const results = []
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const row = {}
    for (const k of Object.values(colMap)) row[k] = ''

    for (const [cStr, key] of Object.entries(colIndexMap)) {
      const c = Number(cStr)
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      if (!cell) continue

      if (key === 'date') {
        if (cell.t === 'n') {
          // Numeric: Excel date serial. Try cell.w (original formatted string) first
          // for cases where XLSX may have preserved the user's input text.
          const fromW = parseDateString(cell.w ?? '')
          row.date = fromW || serialToYMD(cell.v)
        } else {
          row.date = parseDateString(String(cell.v ?? ''))
        }
      } else {
        row[key] = String(cell.w ?? cell.v ?? '').trim()
      }
    }

    results.push(row)
  }

  return results.filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date))
}

/**
 * Parse a CSV or Excel buffer into rows using Thai column header mapping.
 * colMap: { 'Thai header': 'internalKey', ... }
 */
export function parseImportFile(buffer, colMap) {
  const arr = new Uint8Array(buffer)
  const isXlsx = arr[0] === 0x50 && arr[1] === 0x4B  // ZIP magic bytes → XLSX
  const isXls  = arr[0] === 0xD0 && arr[1] === 0xCF  // OLE2 magic bytes → XLS

  if (isXlsx || isXls) {
    return parseExcelBuffer(buffer, colMap)
  }

  // CSV: decode as UTF-8 and parse directly (preserves D/M/YYYY strings as-is)
  const text = new TextDecoder('utf-8').decode(buffer)
  return parseCsvText(text, colMap)
}
