/**
 * รอบบิลบัตรเครดิต — วันสรุปยอดและวันครบกำหนดชำระ
 *
 * กฎที่ใช้ทั้งไฟล์
 *   • วันสรุปยอด (closingDay) คือวันสุดท้ายของรอบ รายการที่ทำ "ถึงวันนั้น" ยังนับอยู่ในรอบนั้น
 *   • วันครบกำหนด (dueDay) คือวันที่ dueDay ครั้งแรกที่มา "หลัง" วันสรุปยอด
 *     สูตรเดียวนี้ครอบคลุมทั้งสองแบบที่เจอจริง โดยไม่ต้องให้ผู้ใช้เลือกว่าเดือนไหน
 *       สรุปยอด 25 ครบกำหนด 15 → ได้วันที่ 15 ของเดือนถัดไป
 *       สรุปยอด 5  ครบกำหนด 25 → ได้วันที่ 25 ของเดือนเดียวกัน
 *   • วันที่ 31 ในเดือนที่ไม่มีวันที่ 31 จะถูกหนีบเป็นวันสุดท้ายของเดือนนั้น
 *     (วิธีเดียวกับ computeDueDate ของรายการประจำ)
 */

const THAI_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

/** เที่ยงคืนของวันนั้นตามเวลาเครื่อง — ตัดเวลาออกให้เทียบวันกันได้ตรงๆ */
function atMidnight(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function lastDayOfMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

/** วันที่ day ของเดือนนั้น หนีบไม่ให้ล้นเดือน (31 ก.พ. → 28 หรือ 29) */
export function clampedDate(year, month, day) {
  return new Date(year, month, Math.min(day, lastDayOfMonth(year, month)))
}

/**
 * วันสรุปยอดครั้งถัดไปที่ยังไม่ผ่าน (นับวันนี้ด้วย)
 * รูดวันนี้จะไปอยู่ในบิลที่ปิดวันนี้
 */
export function nextClosingDate(closingDay, from = new Date()) {
  const today = atMidnight(from)
  const thisMonth = clampedDate(today.getFullYear(), today.getMonth(), closingDay)
  if (thisMonth >= today) return thisMonth
  return clampedDate(today.getFullYear(), today.getMonth() + 1, closingDay)
}

/** วันครบกำหนดของบิลที่ปิดในวันที่ closingDate — วันที่ dueDay ครั้งแรกหลังจากนั้น */
export function dueDateFor(closingDate, dueDay) {
  const sameMonth = clampedDate(closingDate.getFullYear(), closingDate.getMonth(), dueDay)
  if (sameMonth > closingDate) return sameMonth
  return clampedDate(closingDate.getFullYear(), closingDate.getMonth() + 1, dueDay)
}

/** วันครบกำหนดของบิลที่รายการวันนี้จะไปตกอยู่ */
export function nextDueDate(closingDay, dueDay, from = new Date()) {
  return dueDateFor(nextClosingDate(closingDay, from), dueDay)
}

/** รหัสรอบ 'YYYY-MM' ของเดือนที่ปิดรอบ */
export function cycleKey(closingDate) {
  return `${closingDate.getFullYear()}-${String(closingDate.getMonth() + 1).padStart(2, '0')}`
}

/** วันแรกของรอบที่ปิดในวันที่ closingDate — คือวันถัดจากวันสรุปยอดของรอบก่อน */
function startForClosing(closingDate, closingDay) {
  const prev = clampedDate(closingDate.getFullYear(), closingDate.getMonth() - 1, closingDay)
  return new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1)
}

/**
 * ขอบเขตของรอบบิลที่ครอบวันที่ที่ระบุ
 * คืน { start, end, due, cycle } โดย cycle เป็น 'YYYY-MM' ของเดือนที่ปิดรอบ
 * ใช้ตอบว่า "รายการนี้อยู่บิลไหน" และใช้หายอดสะสมของรอบที่กำลังเดินอยู่
 */
export function cyclePeriod(closingDay, dueDay, on = new Date()) {
  const end = nextClosingDate(closingDay, on)
  return { start: startForClosing(end, closingDay), end, due: dueDateFor(end, dueDay), cycle: cycleKey(end) }
}

/**
 * รอบที่ผ่านวันสรุปยอดไปแล้วแต่ยังไม่มีใบแจ้งยอด — เรียงจากเก่าไปใหม่
 *
 * เรียงเก่าก่อนสำคัญมาก เพราะยอดค้างของรอบก่อนถูกยกไปเป็นยอดยกมาของรอบถัดไป
 * ถ้าปิดสลับลำดับ ยอดยกมาจะผูกผิดใบ
 *
 * ผู้ใช้ที่ไม่ได้เปิดแอปหลายเดือนจะได้ใบย้อนหลังครบตอนกลับมาเปิด
 * แต่ไม่สร้างใบของช่วงก่อนที่บัตรจะถูกเพิ่มเข้าระบบ เพราะไม่มีข้อมูลรายการอยู่แล้ว
 */
export function pendingCycles(card, existingCycles, { from = new Date(), maxMonths = 24 } = {}) {
  const today = atMidnight(from)
  const createdAt = card.createdAt ? atMidnight(new Date(card.createdAt)) : null
  const out = []

  for (let i = 0; i <= maxMonths; i++) {
    const ref = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const end = clampedDate(ref.getFullYear(), ref.getMonth(), card.closingDay)
    // ยังไม่พ้นวันสรุปยอด — รายการของวันนั้นยังนับอยู่ในรอบนี้ ปิดไม่ได้
    if (end >= today) continue
    if (createdAt && end < createdAt) continue
    const cycle = cycleKey(end)
    if (existingCycles.has(cycle)) continue
    out.push({
      cycle,
      start: startForClosing(end, card.closingDay),
      end,
      due: dueDateFor(end, card.dueDay),
    })
  }
  return out.reverse()
}

/**
 * ยอดผ่อนรวมเมื่อคิดดอกเบี้ยแบบคงที่จากเงินต้น (flat rate)
 *
 * เป็นวิธีที่โปรผ่อนสินค้าในไทยใช้กัน ไม่ใช่แบบลดต้นลดดอก
 *   ดอกเบี้ยรวม = เงินต้น × อัตราต่อเดือน% × จำนวนงวด
 *   ยอดผ่อนรวม  = เงินต้น + ดอกเบี้ยรวม
 *
 * ตัวอย่าง เงินต้น 100 ผ่อน 10 งวด 3% ต่อเดือน → ดอกเบี้ย 30 ยอดรวม 130 งวดละ 13
 * อัตรา 0 คือผ่อน 0% ยอดรวมเท่าเงินต้นพอดี
 */
export function installmentTotal(principal, months, monthlyRatePct = 0) {
  const p = Number(principal) || 0
  const n = Math.max(0, Math.round(Number(months) || 0))
  const r = Number(monthlyRatePct) || 0
  const interest = Math.round(p * (r / 100) * n * 100) / 100
  const total = Math.round((p + interest) * 100) / 100
  return { principal: p, months: n, ratePerMonth: r, interest, total }
}

/**
 * ตารางงวดผ่อน — งวดแรกตกในรอบเดียวกับที่รูด แล้วไล่ไปเดือนละงวด
 *
 * totalAmount ที่ส่งเข้ามาคือ **ยอดที่ต้องผ่อนจริงรวมดอกเบี้ยแล้ว**
 * ไม่ใช่ราคาสินค้า ผู้เรียกคำนวณด้วย installmentTotal() ก่อน
 *
 * เศษที่หารไม่ลงตัวไปรวมที่งวดสุดท้าย ซึ่งเป็นวิธีที่ธนาคารส่วนใหญ่ใช้
 * และทำให้ผลรวมทุกงวดเท่ากับยอดเต็มพอดีเสมอ ไม่มีเศษหลงเหลือ
 */
export function installmentSchedule(card, purchaseDate, months, totalAmount) {
  const first = nextClosingDate(card.closingDay, purchaseDate)
  const per = Math.floor((totalAmount / months) * 100) / 100
  const entries = []
  let allocated = 0

  for (let i = 0; i < months; i++) {
    const end = clampedDate(first.getFullYear(), first.getMonth() + i, card.closingDay)
    const isLast = i === months - 1
    const amount = isLast ? Math.round((totalAmount - allocated) * 100) / 100 : per
    allocated = Math.round((allocated + amount) * 100) / 100
    entries.push({
      seq: i + 1,
      cycle: cycleKey(end),
      closingDate: end,
      dueDate: dueDateFor(end, card.dueDay),
      amount,
    })
  }
  return entries
}

/**
 * ตารางงวดผ่อนแบบขั้นบันได — ค่างวดไม่เท่ากันตามช่วงที่กำหนด
 *
 * tiers เป็น array ของ { from, to, amount } เรียงต่อกันสนิท เช่น
 *   [{ from: 1, to: 6, amount: 390 }, { from: 7, to: 84, amount: 820 }]
 * แปลว่างวด 1–6 จ่ายงวดละ 390 ที่เหลือ 820 ตรงกับที่โบรชัวร์เขียน
 *
 * ต่างจาก installmentSchedule ตรงที่ยอดรวมถูกกำหนดโดยค่างวด ไม่ใช่หารจากยอดรวม
 * จึงไม่มีเศษให้ปัด ผลรวมคือผลบวกของทุกงวดตรงๆ
 */
export function tieredSchedule(card, purchaseDate, months, tiers) {
  const first = nextClosingDate(card.closingDay, purchaseDate)
  const amountOf = (seq) => {
    const t = tiers.find((x) => seq >= Number(x.from) && seq <= Number(x.to))
    return t ? Number(t.amount) || 0 : 0
  }
  const rows = []
  for (let i = 0; i < months; i++) {
    const end = clampedDate(first.getFullYear(), first.getMonth() + i, card.closingDay)
    rows.push({
      seq: i + 1,
      cycle: cycleKey(end),
      closingDate: end,
      dueDate: dueDateFor(end, card.dueDay),
      amount: amountOf(i + 1),
    })
  }
  return rows
}

/** ยอดรวมของตารางงวด */
export function scheduleTotal(rows) {
  return Math.round(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0) * 100) / 100
}

/**
 * ยอดรวมของค่างวดขั้นบันได — ค่างวด × จำนวนงวดในช่วง รวมทุกช่วง
 *
 * คิดจากช่วงราคาตรงๆ ไม่ต้องรู้จักบัตรหรือวันเปิดบิลเหมือน tieredSchedule
 * เพราะฟอร์มต้องรู้ยอดรวมตั้งแต่ยังไม่ได้เลือกบัตร (ช่องยอดเงินอยู่ก่อนช่องบัตร)
 */
export function tiersTotal(tiers, months) {
  const rows = normalizedTiers(tiers, months)
  const sum = rows.reduce((s, t) => s + (Number(t.amount) || 0) * (t.to - t.from + 1), 0)
  return Math.round(sum * 100) / 100
}

/**
 * ค่างวดรายตัว → ช่วงราคา
 *
 * ฐานข้อมูลเก็บค่างวดเป็น "ช่วง" (งวด 1–6 ละเท่านี้) ไม่ได้เก็บทีละงวด แต่คน
 * อ่านโปรฯ ผ่อนมาเป็นทีละงวด การให้กรอกทีละงวดแล้วยุบเป็นช่วงให้เอง จึงตรงกับ
 * ทั้งสองฝั่งโดยไม่ต้องเปลี่ยนโครงข้อมูลที่ตารางงวดใช้อยู่
 */
export function tiersFromAmounts(amounts) {
  const key = (a) => (a === '' || a == null ? '' : String(Number(a) || 0))
  const out = []
  amounts.forEach((a, i) => {
    const last = out[out.length - 1]
    if (last && key(last.amount) === key(a)) last.to = i + 1
    else out.push({ from: i + 1, to: i + 1, amount: key(a) })
  })
  return out
}

/** ช่วงราคา → ค่างวดรายตัว (ทางกลับของ tiersFromAmounts) */
export function amountsFromTiers(tiers, months) {
  const rows = normalizedTiers(tiers, months)
  const out = new Array(months).fill('')
  rows.forEach((t) => {
    for (let s = t.from; s <= t.to; s++) out[s - 1] = t.amount === '' || t.amount == null ? '' : String(t.amount)
  })
  return out
}

/**
 * เกลี่ยยอดรวมที่กรอกไว้ลงในค่างวด (ทางกลับของ tiersTotal)
 *
 * ยอดลงที่ "ช่วงที่ยังว่าง" ก่อน เพราะนั่นคือช่องที่ผู้ใช้ตั้งใจให้ระบบเติม
 * ถ้ากรอกครบทุกช่วงแล้ว ส่วนต่างจะไปลงช่วงสุดท้ายช่วงเดียว — ช่วงที่ผู้ใช้
 * กรอกเองไว้แล้วต้องไม่ถูกขยับ ไม่งั้นค่างวดตามโปรฯ ที่จำมาจะเพี้ยนไปทั้งชุด
 *
 * เศษการปัดกองอยู่ที่ช่วงสุดท้ายของกลุ่มที่เติม ค่างวดต่องวดในช่วงเดียวกัน
 * ต้องเท่ากันเสมอ ผลรวมจึงอาจต่างจากยอดที่กรอกได้ไม่กี่สตางค์ — ผู้เรียกต้อง
 * ถือผลรวมจริงจากค่างวดเป็นยอดสุดท้าย ไม่ใช่ยอดที่กรอกมา
 *
 * คืน null เมื่อเกลี่ยไม่ได้ (ยอดน้อยกว่าช่วงที่กรอกไว้แล้ว)
 */
export function fitTiersToTotal(tiers, months, total) {
  const rows = normalizedTiers(tiers, months)
  if (rows.length === 0 || !(Number(total) > 0)) return null
  const span = (t) => t.to - t.from + 1
  const blanks = rows.filter((t) => !(Number(t.amount) > 0))
  const targets = blanks.length > 0 ? blanks : [rows[rows.length - 1]]
  const isTarget = (t) => targets.includes(t)
  const fixed = rows.reduce((s, t) => (isTarget(t) ? s : s + (Number(t.amount) || 0) * span(t)), 0)
  const remain = Math.round((Number(total) - fixed) * 100) / 100
  const slots = targets.reduce((s, t) => s + span(t), 0)
  if (!(remain > 0)) return null
  const per = Math.floor((remain / slots) * 100) / 100
  if (!(per > 0)) return null
  const tail = targets[targets.length - 1]
  const tailPer = Math.round(((remain - per * (slots - span(tail))) / span(tail)) * 100) / 100
  if (!(tailPer > 0)) return null
  return rows.map((t) => (isTarget(t) ? { ...t, amount: String(t === tail ? tailPer : per) } : { ...t }))
}

/**
 * ทำช่วงราคาให้ต่อกันสนิทเสมอ
 *
 * ต้นช่วงถัดไปถูกคำนวณจากปลายช่วงก่อนหน้า ผู้ใช้แก้เองไม่ได้ และช่วงสุดท้าย
 * ยืดไปจบที่งวดสุดท้ายให้อัตโนมัติ จึงไม่มีทางกรอกให้ขาดตอนหรือทับกันได้เลย
 *
 * อยู่ที่นี่เพราะทั้งฟอร์มบันทึกรายจ่ายและฟอร์มแก้ไขสัญญาผ่อนต้องคิดแบบเดียวกัน
 * ถ้าแยกกันเขียน วันหนึ่งจะได้ตารางงวดคนละชุดจากค่างวดชุดเดียวกัน
 */
export function normalizedTiers(tiers, months) {
  const out = []
  let from = 1
  tiers.forEach((t, i) => {
    if (from > months) return
    const isLast = i === tiers.length - 1
    const to = isLast ? months : Math.min(Math.max(Number(t.to) || from, from), months)
    out.push({ from, to, amount: t.amount })
    from = to + 1
  })
  if (out.length > 0) out[out.length - 1].to = months
  return out
}

/**
 * ช่วงราคาต่อกันสนิทและจบพอดีที่งวดสุดท้ายไหม
 * คืนข้อความบอกปัญหา หรือ null ถ้าผ่าน
 */
export function validateTiers(tiers, months) {
  if (!Array.isArray(tiers) || tiers.length === 0) return 'ต้องมีอย่างน้อยหนึ่งช่วงราคา'
  let expect = 1
  for (const t of tiers) {
    const from = Number(t.from)
    const to = Number(t.to)
    if (from !== expect) return `ช่วงราคาต้องต่อกันสนิท ช่วงถัดไปต้องเริ่มที่งวด ${expect}`
    if (!(to >= from)) return 'งวดปิดท้ายต้องไม่น้อยกว่างวดเริ่ม'
    if (!(Number(t.amount) >= 0)) return 'ยอดต่องวดต้องไม่ติดลบ'
    expect = to + 1
  }
  if (expect - 1 !== months) return `ช่วงสุดท้ายต้องจบที่งวด ${months} พอดี`
  return null
}

/**
 * จำนวนงวดที่ครบกำหนดไปแล้ว ถ้าเปิดบิลวันนั้น
 *
 * ใช้จำกัดช่อง "ผ่อนมาแล้วกี่งวด" — งวดที่บอกว่าจ่ายไปแล้วต้องเป็นงวดที่
 * ครบกำหนดไปแล้วจริง ไม่งั้นจะกลายเป็นจ่ายงวดที่ยังมาไม่ถึง ซึ่งเป็นไปไม่ได้
 */
export function maxPrepaidCount(card, purchaseDate, from = new Date()) {
  const today = atMidnight(from)
  const first = nextClosingDate(card.closingDay, purchaseDate)
  let n = 0
  // เพดาน 600 งวด กันลูปไม่รู้จบถ้าได้ค่าประหลาดมา
  for (let i = 0; i < 600; i++) {
    const end = clampedDate(first.getFullYear(), first.getMonth() + i, card.closingDay)
    if (dueDateFor(end, card.dueDay) > today) break
    n++
  }
  return n
}

/**
 * วันเปิดบิลล่าสุดที่ยังผ่อนมาแล้ว n งวดได้
 *
 * ผู้ใช้รู้ว่าจ่ายมาแล้วกี่งวด แต่คิดไม่ออกว่าต้องย้อนวันเปิดบิลไปวันไหน
 * เพราะต้องถอยหลังจากวันสรุปยอดและวันครบกำหนดของบัตรใบนั้น
 * ระบบรู้คำตอบอยู่แล้วจึงควรเสนอวันให้กดเลย ไม่ใช่แค่ขึ้นเตือน
 */
export function latestPurchaseDateFor(card, n, from = new Date()) {
  if (!(n > 0)) return null
  const today = atMidnight(from)
  for (let m = 0; m < 600; m++) {
    const c = clampedDate(today.getFullYear(), today.getMonth() - m, card.closingDay)
    const lastClosing = clampedDate(c.getFullYear(), c.getMonth() + (n - 1), card.closingDay)
    if (dueDateFor(lastClosing, card.dueDay) <= today) return c
  }
  return null
}

/**
 * ตารางงวดหนี้สิน — ง่ายกว่าบัตร เพราะไม่มีรอบบิลมาเกี่ยว
 * งวดแรกครบกำหนดวันที่ firstDue แล้วไล่เดือนละงวดที่วัน dueDay หนีบไม่ให้ล้นเดือน
 * amounts เป็นเลขเดียว (ทุกงวดเท่ากัน) หรือ array ช่วงราคาแบบเดียวกับ tieredSchedule
 */
export function debtSchedule(firstDue, months, dueDay, amounts) {
  const tiers = Array.isArray(amounts) ? amounts : null
  const flat = tiers ? 0 : Number(amounts) || 0
  const amountOf = (seq) => {
    if (!tiers) return flat
    const t = tiers.find((x) => seq >= Number(x.from) && seq <= Number(x.to))
    return t ? Number(t.amount) || 0 : 0
  }
  const rows = []
  for (let i = 0; i < months; i++) {
    const due = clampedDate(firstDue.getFullYear(), firstDue.getMonth() + i, dueDay)
    rows.push({ seq: i + 1, dueDate: due, amount: amountOf(i + 1) })
  }
  return rows
}

/** งวดหนี้ที่ครบกำหนดไปแล้ว ถ้างวดแรกครบกำหนดวันนั้น */
export function maxPrepaidForDebt(firstDue, dueDay, from = new Date()) {
  const today = atMidnight(from)
  let n = 0
  for (let i = 0; i < 600; i++) {
    if (clampedDate(firstDue.getFullYear(), firstDue.getMonth() + i, dueDay) > today) break
    n++
  }
  return n
}

/** วันงวดแรกล่าสุดที่ยังผ่อนมาแล้ว n งวดได้ — เสนอให้ผู้ใช้กดแก้เลย */
export function latestFirstDueFor(dueDay, n, from = new Date()) {
  if (!(n > 0)) return null
  const today = atMidnight(from)
  // งวดที่ n ต้องครบกำหนดไม่เกินวันนี้ → งวดแรกอยู่ก่อนหน้านั้น n-1 เดือน
  for (let m = 0; m < 600; m++) {
    const first = clampedDate(today.getFullYear(), today.getMonth() - m, dueDay)
    const last = clampedDate(first.getFullYear(), first.getMonth() + (n - 1), dueDay)
    if (last <= today) return first
  }
  return null
}

/** จำนวนวันจากวันนี้ถึงวันที่ระบุ — ติดลบแปลว่าเลยมาแล้ว */
export function daysUntil(date, from = new Date()) {
  const MS_PER_DAY = 86_400_000
  return Math.round((atMidnight(date) - atMidnight(from)) / MS_PER_DAY)
}

/** '15 ต.ค. 2569' — ปี พ.ศ. ตามที่ใช้ทั้งแอป */
export function formatThaiDate(date) {
  if (!date) return '-'
  return `${date.getDate()} ${THAI_MONTHS[date.getMonth()]} ${date.getFullYear() + 543}`
}

/** วันที่แบบสั้นสำหรับป้ายงวด — "5 ต.ค. 69" ปีสองหลักพอ ป้ายจะได้ไม่ล้น */
export function formatThaiShort(date) {
  if (!date) return '-'
  return `${date.getDate()} ${THAI_MONTHS[date.getMonth()]} ${String((date.getFullYear() + 543) % 100).padStart(2, '0')}`
}

/** '2026-10-15' → '15 ต.ค. 2569' — ใช้กับวันที่ที่อ่านมาจากฐานข้อมูล */
export function formatIsoThai(iso) {
  if (!iso) return '-'
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return String(iso)
  return formatThaiDate(new Date(y, m - 1, d))
}

/**
 * '2026-10-15' → '15 ต.ค. 69' — รุ่น iso ของ formatThaiShort
 *
 * ปีเป็นสองหลักพอ สัญญาผ่อนยาวข้ามปีได้ ป้ายงวดจึงต้องบอกปีไว้ ไม่งั้นงวดเดือน
 * เดียวกันคนละปีจะอ่านเหมือนกันเป๊ะ (วันที่เต็มอยู่ใน title ของป้าย)
 */
export function formatIsoThaiShort(iso) {
  if (!iso) return '-'
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return String(iso)
  return formatThaiShort(new Date(y, m - 1, d))
}

/** 'yyyy-MM-dd' สำหรับส่งเข้าฐานข้อมูล — ห้ามใช้ toISOString เพราะจะเลื่อนตามโซนเวลา */
export function toDateString(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}
