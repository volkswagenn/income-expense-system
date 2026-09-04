/**
 * ส่งออกรายงานเป็น PDF โดยใช้ตัวพิมพ์ของเบราว์เซอร์
 *
 * ไม่ได้ใช้ไลบรารีสร้าง PDF เพราะไลบรารีพวกนั้นต้องฝังฟอนต์ไทยมาเองทั้งชุด
 * (ไฟล์ใหญ่ขึ้นหลายร้อย KB) และยังต้องมาจัดหน้ากระดาษเองอีก ในขณะที่เบราว์เซอร์
 * มีฟอนต์ไทยและตัวแบ่งหน้าอยู่แล้ว ผู้ใช้เลือก "บันทึกเป็น PDF" ในกล่องพิมพ์ได้เลย
 *
 * พิมพ์จาก iframe ที่ซ่อนไว้ ไม่ใช่ window.open เพราะตัวบล็อกป๊อปอัปจะปิดหน้าต่างใหม่ทิ้ง
 * และไม่ได้พิมพ์หน้าจอจริง เพราะหน้าจอมีเมนู ปุ่ม และการ์ดที่ไม่ควรติดไปในกระดาษ
 */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const money = (n) => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * @param title     ชื่อรายงาน
 * @param subtitle  ช่วงวันที่ / คำอธิบาย
 * @param headers   หัวคอลัมน์ [{ label, align }]
 * @param rows      แถว [[cell, ...]] — ตัวเลขส่งเป็น number จะจัดขวาและใส่ลูกน้ำให้
 * @param totals    แถวรวมท้ายตาราง (รูปแบบเดียวกับ rows) ไม่ใส่ก็ได้
 */
export function exportReportPdf({ title, subtitle, headers, rows, totals }) {
  return new Promise((resolve) => {
    const cell = (v, align) => {
      const isNum = typeof v === 'number'
      const a = align ?? (isNum ? 'right' : 'left')
      return `<td style="text-align:${a}${isNum ? ';font-variant-numeric:tabular-nums' : ''}">${esc(isNum ? money(v) : v)}</td>`
    }

    const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  body { font-family: 'Anuphan', 'Noto Sans Thai', 'Sarabun', system-ui, sans-serif; color: #16181D; margin: 0; }
  h1 { font-size: 17px; margin: 0 0 2px; }
  .sub { font-size: 11px; color: #7A7F87; margin: 0 0 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  th { text-align: left; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: #7A7F87;
       border-bottom: 1px solid #D6D3CA; padding: 0 6px 5px; }
  td { padding: 5px 6px; border-bottom: 1px solid #EFEDE7; }
  tfoot td { border-top: 1.5px solid #16181D; border-bottom: none; font-weight: 700; padding-top: 7px; }
  thead { display: table-header-group; }   /* หัวตารางซ้ำทุกหน้า */
  tr { break-inside: avoid; }
  .foot { margin-top: 12px; font-size: 10px; color: #8A8F97; }
</style></head><body>
<h1>${esc(title)}</h1>
<p class="sub">${esc(subtitle)}</p>
<table>
  <thead><tr>${headers.map((h) => `<th style="text-align:${h.align ?? 'left'}">${esc(h.label)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map((r) => `<tr>${r.map((v, i) => cell(v, headers[i]?.align)).join('')}</tr>`).join('')}</tbody>
  ${totals ? `<tfoot><tr>${totals.map((v, i) => cell(v, headers[i]?.align)).join('')}</tr></tfoot>` : ''}
</table>
<p class="foot">ออกจาก JodFlow · ${esc(new Date().toLocaleString('th-TH'))}</p>
</body></html>`

    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
    document.body.appendChild(frame)

    // เก็บ iframe ทิ้งหลังกล่องพิมพ์ปิด — เบราว์เซอร์บางตัวไม่ยิง afterprint จึงมีตัวตั้งเวลากันเหนียว
    let done = false
    const cleanup = () => {
      if (done) return
      done = true
      setTimeout(() => frame.remove(), 500)
      resolve({ success: true })
    }

    frame.onload = () => {
      const win = frame.contentWindow
      try {
        win.addEventListener('afterprint', cleanup)
        win.focus()
        win.print()
        // ถ้าเบราว์เซอร์บล็อกจนไม่มี afterprint ก็ยังต้องเก็บกวาด
        setTimeout(cleanup, 60000)
      } catch (err) {
        frame.remove()
        done = true
        resolve({ success: false, error: err.message })
      }
    }

    const doc = frame.contentDocument
    doc.open()
    doc.write(html)
    doc.close()
  })
}
