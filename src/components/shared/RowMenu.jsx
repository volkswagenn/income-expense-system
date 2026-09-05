import { useState } from 'react'
import Popup from './Popup'
import Icon from './Icon'

/**
 * ปุ่ม ⋮ ท้ายแถว — เก็บงานที่ทำนานๆ ครั้งไว้ข้างใน
 *
 * ทำไมไม่โชว์ปุ่มแก้ไข/ลบไว้ในแถวเลย
 *   ปุ่มลบที่อยู่ติดกับข้อมูลตลอดเวลาเป็นความเสี่ยงที่ไม่จำเป็น เพราะเป็นงานที่ทำ
 *   ไม่กี่ครั้งในชีวิตของบัญชีหนึ่งใบ แต่กดพลาดได้ทุกวัน พอย้ายเข้ามาในเมนู
 *   ต้องกดสองจังหวะจึงจะถึง และแถวก็สะอาดขึ้นให้ตัวเลขเด่นแทน
 *
 * ใช้เปลือก Popup ไม่ใช่เมนูลอย เพราะเมนูลอยจะถูกขอบกล่องที่เลื่อนได้ตัดหายไปครึ่งหนึ่ง
 * (การ์ดในหน้าจัดการข้อมูลและป๊อปอัปหลายตัวมี overflow ของตัวเอง)
 *
 * ห้ามครอบปุ่มนี้ด้วยกล่องที่มี transform (เช่น scale-*) — Popup ข้างในวางตัวแบบ
 * fixed ซึ่งจะยึดกับกล่องที่มี transform แทนที่จะยึดกับหน้าจอ ผลคือกล่องไปโผล่
 * ในกรอบเล็กๆ นั้นจนกดอะไรไม่ได้ ถ้าต้องการปุ่มเล็กลงให้ใช้ compact
 *
 * @param items [{ icon, label, desc, onClick, danger }]
 */
export default function RowMenu({
  title, sub, icon = 'more_vert', items = [], buttonTitle = 'เพิ่มเติม', compact = false,
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={buttonTitle}
        className={`flex-none rounded-ctl border border-hairline bg-white flex items-center justify-center text-muted hover:text-ink hover:bg-paper ${
          compact ? 'w-7 h-7' : 'w-9 h-9'
        }`}
      >
        <Icon name="more_vert" size={compact ? 16 : 18} />
      </button>

      {open && (
        <Popup title={title} sub={sub} icon={icon} width={380} onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-1.5">
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                onClick={() => { setOpen(false); it.onClick?.() }}
                className={`h-12 px-3.5 rounded-ctl border flex items-center gap-2.5 text-left transition ${
                  it.danger
                    ? 'border-[#F0C4BE] bg-expense-soft/40 hover:border-expense'
                    : 'border-hairline bg-white hover:bg-paper hover:border-ink'
                }`}
              >
                <Icon name={it.icon} size={19} className={it.danger ? 'text-expense' : 'text-ink'} />
                <span className="flex-1 min-w-0">
                  <span className={`block text-[13px] font-semibold ${it.danger ? 'text-expense' : ''}`}>{it.label}</span>
                  {it.desc && <span className="block text-[11px] text-faint truncate">{it.desc}</span>}
                </span>
                <Icon name="chevron_right" size={18} className="text-faint" />
              </button>
            ))}
          </div>
        </Popup>
      )}
    </>
  )
}
