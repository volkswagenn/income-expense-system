/**
 * สร้างชุดไอคอนของแอปจากแพ็กเกจต้นทาง — รันด้วย `npm run icons`
 *
 * อ่านรายชื่อที่คัดไว้จาก scripts/icon-source.mjs แล้ว
 *   1. คัดลอกไฟล์ SVG ไปไว้ที่ public/icons/<กลุ่ม>/<ชื่อ>.svg
 *   2. เขียน src/lib/iconCatalog.js ให้หน้าจอเอาไปทำตัวเลือกไอคอน
 *
 * ทำไมต้องคัดลอกไฟล์ออกมา ไม่ import จาก node_modules ตรงๆ
 *   แพ็กเกจต้นทางรวมกัน 81MB ถ้า bundler ต้องมองทั้งชุดจะช้าและอาจติดไปในไฟล์ build
 *   คัดออกมาเฉพาะที่ใช้ (~350 ไฟล์ ~200KB) แล้วเสิร์ฟเป็นไฟล์นิ่งจาก public/ เบากว่ามาก
 *
 * ทำไมต้องรันซ้ำได้
 *   ลบโฟลเดอร์ปลายทางทิ้งก่อนทุกครั้ง ไอคอนที่ถอดออกจากรายการจะไม่ค้างอยู่เป็นไฟล์กำพร้า
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GROUPS, BRANDS } from './icon-source.mjs'
import { BANKS } from '../src/lib/banks.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC_MS = path.join(ROOT, 'node_modules/@material-symbols/svg-400/rounded')
const SRC_SI = path.join(ROOT, 'node_modules/simple-icons/icons')
const SRC_SI_DATA = path.join(ROOT, 'node_modules/simple-icons/data/simple-icons.json')
const OUT_DIR = path.join(ROOT, 'public/icons')
const OUT_CATALOG = path.join(ROOT, 'src/lib/iconCatalog.js')

if (!fs.existsSync(SRC_MS) || !fs.existsSync(SRC_SI)) {
  console.error('ไม่พบแพ็กเกจต้นทาง — ติดตั้งก่อนด้วย:')
  console.error('  npm i -D @material-symbols/svg-400 simple-icons')
  process.exit(1)
}

const missing = []

// ── 1. ไอคอนทั่วไป ────────────────────────────────────────────────────────
//
// เลือกแบบทึบ (-fill) เป็นหลัก เพราะไอคอนพวกนี้แสดงในกรอบเล็ก 16–24px
// แบบเส้นบางจะอ่านไม่ออกที่ขนาดนั้น ตัวไหนไม่มีแบบทึบค่อยใช้แบบเส้น

fs.rmSync(OUT_DIR, { recursive: true, force: true })

const groupOf = {}      // ชื่อไอคอน → กลุ่ม (ใช้ประกอบ path ตอนแสดงผล)
const labelOf = {}      // ชื่อไอคอน → ชื่อไทย (ใช้ค้นหา)
let copied = 0

for (const group of GROUPS) {
  const dir = path.join(OUT_DIR, group.key)
  fs.mkdirSync(dir, { recursive: true })

  for (const [name, label] of group.items) {
    const fill = path.join(SRC_MS, `${name}-fill.svg`)
    const line = path.join(SRC_MS, `${name}.svg`)
    const src = fs.existsSync(fill) ? fill : fs.existsSync(line) ? line : null
    if (!src) { missing.push(`${group.key}/${name}`); continue }

    if (groupOf[name]) { missing.push(`ซ้ำ: ${name} (${groupOf[name]} กับ ${group.key})`); continue }

    fs.copyFileSync(src, path.join(dir, `${name}.svg`))
    groupOf[name] = group.key
    labelOf[name] = label
    copied++
  }
}

// ── 2. โลโก้แบรนด์ ────────────────────────────────────────────────────────
//
// เก็บสีประจำแบรนด์ไว้ด้วย เพราะโลโก้พวกนี้คนจำจากสี (LINE เขียว Facebook น้ำเงิน)
// ถ้าแสดงเป็นสีเทาเหมือนไอคอนทั่วไปจะดูไม่ออกว่าเป็นแบรนด์ไหน

const siData = JSON.parse(fs.readFileSync(SRC_SI_DATA, 'utf8'))
const siList = Array.isArray(siData) ? siData : siData.icons
const hexOfSlug = {}
for (const it of siList) {
  const slug = it.slug || it.title.toLowerCase().replace(/[^a-z0-9]/g, '')
  hexOfSlug[slug] = `#${it.hex}`
}

const brandDir = path.join(OUT_DIR, 'brand')
fs.mkdirSync(brandDir, { recursive: true })

const brands = []
for (const [slug, label] of BRANDS) {
  const src = path.join(SRC_SI, `${slug}.svg`)
  if (!fs.existsSync(src)) { missing.push(`brand/${slug}`); continue }
  fs.copyFileSync(src, path.join(brandDir, `${slug}.svg`))
  brands.push({ name: slug, label, color: hexOfSlug[slug] || '#16181D' })
  copied++
}

// ── 3. รายงานตัวที่หาไม่เจอ ───────────────────────────────────────────────
//
// ต้องดังพอให้เห็น ไม่ใช่ข้ามเงียบๆ ไม่งั้นตัวเลือกไอคอนจะมีช่องว่างโดยไม่มีใครรู้

if (missing.length) {
  console.warn(`\nไม่พบไฟล์ ${missing.length} รายการ (ข้ามไป):`)
  missing.forEach((m) => console.warn('  -', m))
  console.warn('')
}

// ── 4. เขียนไฟล์รายการไอคอนให้แอปใช้ ──────────────────────────────────────

const q = (s) => JSON.stringify(s)
const groupBlocks = GROUPS.map((g) => {
  const items = g.items
    .filter(([name]) => groupOf[name] === g.key)
    .map(([name, label]) => `    [${q(name)}, ${q(label)}],`)
    .join('\n')
  return `  {\n    key: ${q(g.key)}, label: ${q(g.label)}, cover: ${q(g.cover)},\n    items: [\n${items}\n    ],\n  },`
}).join('\n')

const brandBlock = brands
  .map((b) => `  [${q(b.name)}, ${q(b.label)}, ${q(b.color)}],`)
  .join('\n')

const bankBlock = BANKS
  .filter((b) => !b.noLogo && fs.existsSync(path.join(ROOT, 'public/bank-logos', `${b.code}.svg`)))
  .map((b) => `  [${q(b.code)}, ${q(b.name)}, ${q(b.color)}],`)
  .join('\n')

const catalog = `/**
 * รายการไอคอนทั้งหมดที่เลือกใช้ได้ในระบบ
 *
 * ★ ไฟล์นี้ถูกสร้างอัตโนมัติ อย่าแก้มือ ★
 * แก้ที่ scripts/icon-source.mjs แล้วรัน \`npm run icons\`
 *
 * ค่าที่เก็บลงฐานข้อมูลเป็นสตริงมี prefix เสมอ เช่น "ms:bolt" "brand:line" "bank:kbank"
 * มี prefix เพื่อให้ย้ายไอคอนข้ามกลุ่มได้โดยค่าที่บันทึกไว้เดิมยังใช้ได้อยู่
 * และเพื่อไม่ให้ชื่อชนกันเองระหว่างชุด (เช่น shell ที่เป็นทั้งไอคอนและแบรนด์)
 */

/** ไอคอนทั่วไป แบ่งตามกลุ่ม — [ชื่อไฟล์, ชื่อไทย] */
export const ICON_GROUPS = [
${groupBlocks}
]

/** โลโก้แบรนด์ — [ชื่อไฟล์, ชื่อแสดง, สีประจำแบรนด์] */
export const BRAND_ICONS = [
${brandBlock}
]

/** โลโก้ธนาคารไทย ใช้ไฟล์ชุดเดิมที่ public/bank-logos — [รหัส, ชื่อธนาคาร, สีประจำธนาคาร] */
export const BANK_ICONS = [
${bankBlock}
]

/** ชื่อไอคอน → โฟลเดอร์ที่เก็บ ใช้ประกอบเป็น path ตอนแสดงผล */
const GROUP_OF = Object.fromEntries(
  ICON_GROUPS.flatMap((g) => g.items.map(([name]) => [name, g.key])),
)

/**
 * แปลงค่าที่เก็บในฐานข้อมูลเป็น URL ของไฟล์ SVG
 * คืน null ถ้าค่าว่างหรือชี้ไปยังไอคอนที่ถูกถอดออกจากชุดไปแล้ว
 * ตัวเรียกต้องรองรับ null เสมอ เพราะข้อมูลเก่าอาจอ้างไอคอนที่ไม่มีอยู่แล้ว
 */
export function iconUrl(value) {
  if (!value || typeof value !== 'string') return null
  const [kind, name] = value.split(':')
  if (!name) return null
  if (kind === 'bank') return \`bank-logos/\${name}.svg\`
  if (kind === 'brand') return \`icons/brand/\${name}.svg\`
  if (kind === 'ms') {
    const group = GROUP_OF[name]
    return group ? \`icons/\${group}/\${name}.svg\` : null
  }
  return null
}

/** สีประจำแบรนด์/ธนาคารของค่านั้น — ไอคอนทั่วไปคืน null (ใช้สีตามบริบทที่วาง) */
export function iconBrandColor(value) {
  if (!value || typeof value !== 'string') return null
  const [kind, name] = value.split(':')
  if (kind === 'brand') return BRAND_ICONS.find((b) => b[0] === name)?.[2] ?? null
  if (kind === 'bank') return BANK_ICONS.find((b) => b[0] === name)?.[2] ?? null
  return null
}

/** ชื่อไทยของไอคอน ใช้เป็น tooltip และข้อความบอกว่าเลือกอะไรอยู่ */
export function iconLabel(value) {
  if (!value || typeof value !== 'string') return ''
  const [kind, name] = value.split(':')
  if (kind === 'brand') return BRAND_ICONS.find((b) => b[0] === name)?.[1] ?? name
  if (kind === 'bank') return BANK_ICONS.find((b) => b[0] === name)?.[1] ?? name
  for (const g of ICON_GROUPS) {
    const hit = g.items.find(([n]) => n === name)
    if (hit) return hit[1]
  }
  return name ?? ''
}

/** จำนวนไอคอนทั้งหมดในชุด ใช้แสดงในหน้าตั้งค่า */
export const ICON_TOTAL =
  ICON_GROUPS.reduce((s, g) => s + g.items.length, 0) + BRAND_ICONS.length + BANK_ICONS.length
`

fs.writeFileSync(OUT_CATALOG, catalog, 'utf8')

const bankCount = bankBlock ? bankBlock.trim().split('\n').length : 0
console.log(`คัดลอกไอคอน ${copied} ไฟล์ไปที่ public/icons/`)
console.log(`  ทั่วไป ${Object.keys(groupOf).length} ตัว ใน ${GROUPS.length} กลุ่ม`)
console.log(`  แบรนด์ ${brands.length} ตัว`)
console.log(`  ธนาคาร ${bankCount} ตัว (ใช้ไฟล์เดิมที่ public/bank-logos)`)
console.log(`เขียน ${path.relative(ROOT, OUT_CATALOG)} แล้ว`)
if (missing.length) process.exitCode = 0
