/**
 * ป้ายบอกที่มาของภาระหนี้ — ใช้ในแท็บ "ผ่อนชำระ/หนี้สิน" ที่รวมทุกแหล่งไว้ด้วยกัน
 *
 * พอเอาของสามแหล่งมาเรียงในหน้าเดียว ผู้ใช้ต้องดูออกทันทีว่าแถวนี้มาจากไหน
 * เพราะแต่ละแหล่งจ่ายคนละทาง: ผ่อนบัตรถูกเรียกเก็บผ่านบิล หนี้สินจ่ายทีละงวดเอง
 * ส่วนค้างชำระไปจ่ายที่หน้ารายการรอดำเนินการ
 */
export const SOURCES = {
  installment: { icon: '💳', label: 'บัตรเครดิต', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  debt:        { icon: '📒', label: 'หนี้สิน',    cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  receivable:  { icon: '🤝', label: 'ลูกหนี้',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pending:     { icon: '⏳', label: 'ค้างชำระ',   cls: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
}

export default function SourceTag({ source, detail, className = '' }) {
  const s = SOURCES[source]
  if (!s) return null
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] leading-tight whitespace-nowrap ${s.cls} ${className}`}
      title={detail ? `${s.label} · ${detail}` : s.label}
    >
      <span>{s.icon}</span>
      <span className="font-medium">{s.label}</span>
      {detail && <span className="opacity-80 truncate max-w-[160px]">· {detail}</span>}
    </span>
  )
}
