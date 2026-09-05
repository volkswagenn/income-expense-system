import { useEffect, useMemo, useState } from 'react'
import Popup from './Popup'
import Icon from './Icon'
import AppIcon from './AppIcon'
import { ICON_GROUPS, EMOJI_GROUPS, BRAND_ICONS, BANK_ICONS, ICON_TOTAL, iconLabel } from '../../lib/iconCatalog'

/**
 * ตัวเลือกไอคอน ใช้ร่วมกันทุกที่ที่ให้ตั้งไอคอนได้
 *
 * ทำไมต้องมีช่องค้นหาที่ค้นภาษาไทยได้
 *   ชุดไอคอนมีเกือบ 900 ตัว ถ้าให้ไล่ดูทีละกลุ่มจะหาไม่เจอ และคนใช้คิดเป็นภาษาไทย
 *   ("ค่าไฟ") ไม่ได้คิดเป็นชื่อไฟล์ ("bolt") ทุกตัวจึงมีชื่อไทยกำกับไว้ให้ค้น
 *
 * ทำไมแบ่งเป็นสามแบบก่อน แล้วค่อยแบ่งกลุ่ม
 *   ไอคอนสาม "ภาษา" นี้วาดคนละแบบ ถ้าเรียงปนกันในตารางเดียวจะดูเหมือนหลุดธีม
 *     • ไอคอนสี   – ภาพหลายสี จำได้จากรูปตั้งแต่เหลือบตา เหมาะกับหมวดหมู่
 *     • ไอคอนเรียบ – กราฟิกสีเดียว เปลี่ยนสีตามบริบทได้ เหมาะกับที่ต้องกลืนไปกับพื้น
 *     • แบรนด์/ธนาคาร – โลโก้จริงที่มีสีประจำตัว ใช้ระบุว่าเป็นเจ้าไหน
 *   เริ่มที่ "ไอคอนสี" เพราะเป็นชุดที่อ่านง่ายที่สุดสำหรับคนที่ยังไม่รู้จะเลือกอะไร
 *
 * ตอนค้นหาจะข้ามทั้งการแบ่งแบบและการแบ่งกลุ่ม เพราะคนที่พิมพ์ "กาแฟ"
 * ไม่ได้สนใจว่ามันอยู่ชุดไหน ขอแค่เห็นทุกตัวที่เกี่ยวเพื่อเทียบกันในตาเดียว
 *
 * props
 *   value     – ค่าปัจจุบัน เช่น "ms:bolt" "emoji:money-bag"; null/'' = ยังไม่เลือก
 *   onPick    – (ค่าใหม่ | null) => void — ส่ง null เมื่อกด "ไม่ใช้ไอคอน"
 *   onClose   – ปิดโดยไม่เปลี่ยนอะไร
 *   tone      – สีที่ใช้แสดงตัวอย่างไอคอนทั่วไป (ให้ตรงกับที่จะไปแสดงจริง)
 */

const SPECIAL_TABS = [
  { key: '__brand', label: 'โลโก้แบรนด์', cover: 'public' },
  { key: '__bank', label: 'ธนาคาร', cover: 'account_balance' },
]

const STYLES = [
  { key: 'color', label: 'ไอคอนสี' },
  { key: 'plain', label: 'ไอคอนเรียบ' },
  { key: 'logo', label: 'แบรนด์/ธนาคาร' },
]

/** ค่าที่เก็บไว้อยู่ในชุดไหน ใช้เปิดตัวเลือกมาที่แบบเดิมของผู้ใช้ */
function styleOf(value) {
  const kind = typeof value === 'string' ? value.split(':')[0] : ''
  if (kind === 'emoji') return 'color'
  if (kind === 'brand' || kind === 'bank') return 'logo'
  if (kind === 'ms') return 'plain'
  return 'color'
}

function groupsOfStyle(style) {
  if (style === 'color') {
    return EMOJI_GROUPS.map((g) => ({ key: g.key, label: g.label, cover: `emoji:${g.cover}` }))
  }
  if (style === 'logo') {
    return SPECIAL_TABS.map((g) => ({ key: g.key, label: g.label, cover: `ms:${g.cover}` }))
  }
  return ICON_GROUPS.map((g) => ({ key: g.key, label: g.label, cover: `ms:${g.cover}` }))
}

export default function IconPicker({ value, onPick, onClose, tone = '#16181D' }) {
  const [style, setStyle] = useState(() => styleOf(value))
  const [tab, setTab] = useState(() => {
    const kind = typeof value === 'string' ? value.split(':')[0] : ''
    if (kind === 'brand') return '__brand'
    if (kind === 'bank') return '__bank'
    return groupsOfStyle(styleOf(value))[0].key
  })
  const [q, setQ] = useState('')

  const tabs = useMemo(() => groupsOfStyle(style), [style])

  // เปลี่ยนแบบแล้วกลุ่มเดิมไม่มีอยู่ในแบบใหม่ ต้องเด้งไปกลุ่มแรกเสมอ
  // ไม่งั้นตารางจะว่างเปล่าโดยที่ไม่มีอะไรบอกว่าทำไม
  useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) setTab(tabs[0].key)
  }, [tabs, tab])

  // รายการที่จะแสดง — พิมพ์ค้นหาแล้วข้ามทั้งแบบและกลุ่มไปเลย
  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase()

    if (kw) {
      const emojis = EMOJI_GROUPS.flatMap((g) =>
        g.items.map(([name, label]) => ({ value: `emoji:${name}`, label, group: g.label })),
      )
      const general = ICON_GROUPS.flatMap((g) =>
        g.items.map(([name, label]) => ({ value: `ms:${name}`, label, group: g.label })),
      )
      const brands = BRAND_ICONS.map(([name, label]) => ({
        value: `brand:${name}`, label, group: 'โลโก้แบรนด์',
      }))
      const banks = BANK_ICONS.map(([code, label]) => ({
        value: `bank:${code}`, label, group: 'ธนาคาร',
      }))

      // ชื่อหมวดก็ค้นได้ — พิมพ์ "ธนาคาร" ต้องได้โลโก้ธนาคารทั้งชุด ทั้งที่ชื่อแต่ละตัว
      // เป็น "กสิกรไทย" "ไทยพาณิชย์" ซึ่งไม่มีคำว่าธนาคารอยู่เลย
      const hit = (r) =>
        r.label.toLowerCase().includes(kw) ||
        r.group.toLowerCase().includes(kw) ||
        r.value.split(':')[1].replace(/[_-]/g, ' ').includes(kw)
      return [...emojis, ...general, ...brands, ...banks].filter(hit).slice(0, 120)
    }

    if (tab === '__brand') {
      return BRAND_ICONS.map(([name, label]) => ({ value: `brand:${name}`, label, group: 'โลโก้แบรนด์' }))
    }
    if (tab === '__bank') {
      return BANK_ICONS.map(([code, label]) => ({ value: `bank:${code}`, label, group: 'ธนาคาร' }))
    }
    if (style === 'color') {
      const g = EMOJI_GROUPS.find((x) => x.key === tab)
      return (g?.items ?? []).map(([name, label]) => ({ value: `emoji:${name}`, label, group: g.label }))
    }
    const g = ICON_GROUPS.find((x) => x.key === tab)
    return (g?.items ?? []).map(([name, label]) => ({ value: `ms:${name}`, label, group: g.label }))
  }, [q, tab, style])

  const searching = q.trim().length > 0

  return (
    <Popup
      title="เลือกไอคอน"
      sub={value ? `ตอนนี้ใช้ “${iconLabel(value)}”` : `มีให้เลือก ${ICON_TOTAL} แบบ`}
      icon="category"
      width={620}
      onClose={onClose}
      footer={
        <div className="flex-none flex items-center gap-2 px-[17px] py-3 border-t border-[#EFEDE7] bg-[#FAF9F6]">
          <button
            onClick={() => onPick(null)}
            className="h-[38px] px-3.5 rounded-[11px] border border-hairline bg-white text-[13px] text-muted hover:bg-paper flex items-center gap-1.5"
          >
            <Icon name="close" size={17} />
            ไม่ใช้ไอคอน
          </button>
          <button
            onClick={onClose}
            className="ml-auto h-[38px] px-4 rounded-[11px] border border-hairline bg-white text-[13px] font-semibold hover:bg-paper"
          >
            ปิด
          </button>
        </div>
      }
    >
      <div className="relative">
        <Icon name="search" size={18} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหาไอคอนจากชื่อ เช่น กาแฟ ค่าไฟ รถ"
          className="w-full h-[38px] pl-9 pr-3 rounded-[11px] bg-paper border border-hairline text-[13px] outline-none focus:bg-white focus:border-ink/25"
        />
      </div>

      {/* สลับแบบของไอคอน — ซ่อนตอนค้นหาเพราะผลลัพธ์รวมทุกแบบอยู่แล้ว */}
      {!searching && (
        <div className="flex-none flex items-center gap-1 p-[3px] rounded-[11px] bg-paper border border-hairline">
          {STYLES.map((s) => (
            <button
              key={s.key}
              onClick={() => setStyle(s.key)}
              className={`flex-1 h-[30px] rounded-[9px] text-[12px] transition ${
                style === s.key ? 'bg-white border border-hairline font-semibold shadow-sm' : 'text-muted hover:text-ink'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-[136px_minmax(0,1fr)] gap-3 min-h-0">
        {/* รายชื่อกลุ่ม — ซ่อนตอนค้นหาเพราะผลลัพธ์ข้ามกลุ่มอยู่แล้ว การคงไว้จะทำให้เข้าใจผิดว่ากรองอยู่ */}
        {!searching && (
          <div className="flex sm:flex-col gap-1 overflow-x-auto sm:overflow-x-visible sm:max-h-[330px] sm:overflow-y-auto sm:pr-1 -mx-0.5 px-0.5">
            {tabs.map((g) => {
              const on = tab === g.key
              return (
                <button
                  key={g.key}
                  onClick={() => setTab(g.key)}
                  className={`flex-none h-[32px] px-2.5 rounded-[9px] text-[12px] flex items-center gap-1.5 whitespace-nowrap transition ${
                    on ? 'bg-ink text-white font-semibold' : 'text-muted hover:bg-paper'
                  }`}
                >
                  <AppIcon value={g.cover} size={16} color={on ? '#FFFFFF' : '#7A7F87'} />
                  <span className="truncate">{g.label}</span>
                </button>
              )
            })}
          </div>
        )}

        <div className={`min-w-0 ${searching ? 'sm:col-span-2' : ''}`}>
          {shown.length === 0 ? (
            <p className="text-[12.5px] text-faint text-center py-10">
              ไม่พบไอคอนที่ตรงกับ “{q.trim()}”
            </p>
          ) : (
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 sm:max-h-[330px] overflow-y-auto pr-0.5">
              {shown.map((r) => {
                const on = r.value === value
                return (
                  <button
                    key={r.value}
                    onClick={() => onPick(r.value)}
                    title={r.label}
                    className={`aspect-square rounded-[10px] flex items-center justify-center border transition ${
                      on
                        ? 'border-ink bg-ink/[0.06] ring-1 ring-ink'
                        : 'border-hairline bg-white hover:bg-paper hover:border-ink/25'
                    }`}
                  >
                    {/* ไม่บังคับสีในตาราง — แต่ละชุดต้องโชว์สีจริงที่จะออกมาตอนใช้งาน
                        จะได้เห็นตั้งแต่ตอนเลือกว่าไอคอนนั้นจะหน้าตาแบบไหน */}
                    <AppIcon value={r.value} size={22} />
                  </button>
                )
              })}
            </div>
          )}
          <p className="text-[11px] text-faint pt-2">คลังไอคอนทั้งหมดดูได้ที่ จัดการข้อมูล › ไอคอน</p>
          {searching && shown.length >= 120 && (
            <p className="text-[11px] text-faint pt-2">แสดง 120 ตัวแรก — พิมพ์เพิ่มเพื่อให้แคบลง</p>
          )}
        </div>
      </div>
    </Popup>
  )
}

/**
 * ปุ่มสี่เหลี่ยมที่กดแล้วเปิดตัวเลือกไอคอน — ใช้วางในฟอร์มข้างช่องกรอกชื่อ
 * แยกออกมาเพราะทั้งสี่หน้าที่ให้ตั้งไอคอนใช้รูปแบบเดียวกันหมด
 */
export function IconPickerButton({
  value,
  onChange,
  tone = '#16181D',
  size = 38,
  title = 'เลือกไอคอน',
  emptyIcon = 'label',
  bare = false,
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={value ? `ไอคอน: ${iconLabel(value)} — กดเพื่อเปลี่ยน` : title}
        style={{ width: size, height: size }}
        className={`flex-none rounded-[11px] flex items-center justify-center transition ${
          bare
            ? 'border border-transparent hover:bg-ink/[0.06] hover:border-hairline'
            : 'border border-hairline bg-white hover:bg-paper hover:border-ink/25'
        }`}
      >
        {value ? (
          <AppIcon value={value} size={Math.round(size * 0.55)} />
        ) : (
          <AppIcon value={`ms:${emptyIcon}`} size={Math.round(size * 0.55)} color="#8A8F97" />
        )}
      </button>
      {open && (
        <IconPicker
          value={value}
          tone={tone}
          onClose={() => setOpen(false)}
          onPick={(v) => { onChange(v); setOpen(false) }}
        />
      )}
    </>
  )
}
