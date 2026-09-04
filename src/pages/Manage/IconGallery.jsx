import { useMemo, useState } from 'react'
import Icon from '../../components/shared/Icon'
import AppIcon from '../../components/shared/AppIcon'
import { ICON_GROUPS, BRAND_ICONS, BANK_ICONS, ICON_TOTAL } from '../../lib/iconCatalog'

/**
 * คลังไอคอน — ดูว่าในระบบมีไอคอนอะไรให้เลือกใช้บ้าง
 *
 * ทำไมต้องมีหน้านี้ ทั้งที่ตัวเลือกไอคอนก็เปิดดูได้อยู่แล้ว
 *   ตัวเลือกไอคอนเปิดได้เฉพาะตอนกำลังตั้งค่าอะไรสักอย่างอยู่ ทำให้ไม่มีทางรู้ล่วงหน้า
 *   ว่ามีอะไรให้ใช้บ้าง คนจึงตั้งชื่อหมวดหมู่ไปก่อนแล้วค่อยมาพบว่าไม่มีไอคอนที่ตรง
 *
 * เป็นหน้าอ่านอย่างเดียว การตั้งไอคอนทำที่ตัวข้อมูลนั้นๆ ไม่ใช่ที่นี่
 * (บอกไว้ในกล่อง "ไอคอนถูกใช้ที่ไหน" ท้ายหน้า)
 */

const BRAND_GROUP = { key: '__brand', label: 'โลโก้แบรนด์', cover: 'public' }
const BANK_GROUP = { key: '__bank', label: 'ธนาคารไทย', cover: 'account_balance' }

const USED_AT = [
  { icon: 'folder', label: 'หมวดหมู่รายรับ-รายจ่าย', where: 'จัดการข้อมูล › หมวดหมู่' },
  { icon: 'wallet', label: 'กระเป๋าตังค์ย่อย', where: 'กระเป๋าเงิน › กระเป๋าตังค์ย่อย' },
  { icon: 'event_repeat', label: 'รายการประจำ', where: 'บันทึกรายการ › รายการประจำ' },
  { icon: 'storefront', label: 'ผู้ขาย/ร้านค้า', where: 'บันทึกรายจ่าย › รายละเอียดเพิ่มเติม' },
]

export default function IconGallery() {
  const [q, setQ] = useState('')
  const [group, setGroup] = useState('all')

  const groups = useMemo(() => [...ICON_GROUPS, BRAND_GROUP, BANK_GROUP], [])

  // รายการไอคอนทั้งหมดแบนเป็นชุดเดียว แล้วค่อยกรองด้วยกลุ่มกับคำค้น
  const all = useMemo(() => [
    ...ICON_GROUPS.flatMap((g) =>
      g.items.map(([name, label]) => ({ value: `ms:${name}`, label, group: g.key, groupLabel: g.label, color: null })),
    ),
    ...BRAND_ICONS.map(([name, label, color]) => ({
      value: `brand:${name}`, label, group: '__brand', groupLabel: 'โลโก้แบรนด์', color,
    })),
    ...BANK_ICONS.map(([code, label, color]) => ({
      value: `bank:${code}`, label, group: '__bank', groupLabel: 'ธนาคารไทย', color,
    })),
  ], [])

  const kw = q.trim().toLowerCase()
  const shown = useMemo(() => {
    let rows = group === 'all' ? all : all.filter((r) => r.group === group)
    if (kw) {
      // ค้นชื่อหมวดได้ด้วย — พิมพ์ "ธนาคาร" ต้องได้โลโก้ธนาคารทั้งชุด ทั้งที่ชื่อแต่ละตัว
      // เป็น "กสิกรไทย" "ไทยพาณิชย์" ซึ่งไม่มีคำว่าธนาคารอยู่เลย
      rows = all.filter(
        (r) =>
          r.label.toLowerCase().includes(kw) ||
          r.groupLabel.toLowerCase().includes(kw) ||
          r.value.split(':')[1].replace(/_/g, ' ').includes(kw),
      )
    }
    return rows
  }, [all, group, kw])

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex-none h-[38px] px-3 border border-hairline rounded-[11px] bg-white flex items-center gap-2 mt-3">
        <Icon name="search" size={18} className="text-faint flex-none" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหาไอคอนจากชื่อ เช่น กาแฟ ค่าไฟ รถ"
          className="flex-1 min-w-0 bg-transparent outline-none text-[12.5px]"
        />
        {q && (
          <button onClick={() => setQ('')} className="flex-none text-faint hover:text-ink" title="ล้างคำค้น">
            <Icon name="close" size={17} />
          </button>
        )}
      </div>

      {/* ชิปกลุ่ม — ซ่อนตอนค้นหาเพราะผลลัพธ์ข้ามกลุ่มอยู่แล้ว การคงไว้จะทำให้เข้าใจผิดว่ากรองอยู่ */}
      {!kw && (
        <div className="flex-none flex items-center gap-[7px] flex-wrap mt-2.5">
          <button
            onClick={() => setGroup('all')}
            className={`flex-none h-8 px-[11px] rounded-[10px] border text-[12px] flex items-center gap-1.5 transition ${
              group === 'all' ? 'border-ink bg-[#F2FAD9] font-semibold' : 'border-hairline bg-white hover:bg-paper'
            }`}
          >
            ทั้งหมด {ICON_TOTAL}
          </button>
          {groups.map((g) => {
            const on = group === g.key
            return (
              <button
                key={g.key}
                onClick={() => setGroup(g.key)}
                className={`flex-none h-8 px-[11px] rounded-[10px] border text-[12px] flex items-center gap-1.5 transition ${
                  on ? 'border-ink bg-[#F2FAD9] font-semibold' : 'border-hairline bg-white hover:bg-paper'
                }`}
              >
                <AppIcon value={`ms:${g.cover}`} size={16} color="#5C6068" />
                {g.label}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto mt-3">
        {shown.length === 0 ? (
          <p className="text-[12.5px] text-faint text-center py-10">ไม่พบไอคอนที่ตรงกับ “{q.trim()}”</p>
        ) : (
          <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(84px,1fr))' }}>
            {shown.map((r) => (
              <span
                key={r.value}
                title={`${r.label} · ${r.value}`}
                className="border border-transparent rounded-[10px] px-1 py-[7px] flex flex-col items-center gap-[3px] hover:bg-[#FAF9F6] hover:border-hairline"
              >
                <AppIcon value={r.value} size={22} color={r.color ?? '#16181D'} />
                <span className="text-[10px] text-faint text-center leading-[1.25] line-clamp-2">{r.label}</span>
              </span>
            ))}
          </div>
        )}

        {/* บอกว่าเอาไอคอนไปตั้งได้ที่ไหนบ้าง — หน้านี้ดูอย่างเดียว ตั้งค่าที่ตัวข้อมูลนั้นๆ */}
        <div className="border-t border-[#F2F0EA] mt-3 pt-2.5">
          <div className="text-[12px] font-semibold mb-[7px]">ไอคอนถูกใช้ที่ไหน</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-[7px]">
            {USED_AT.map((u) => (
              <div key={u.label} className="flex items-center gap-[9px] bg-[#FAF9F6] rounded-[10px] px-[11px] py-2">
                <AppIcon value={`ms:${u.icon}`} size={17} color="#5C6068" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[12px] font-medium truncate">{u.label}</span>
                  <span className="block text-[10.5px] text-faint truncate">{u.where}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
