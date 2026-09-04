import { useCallback, useState } from 'react'
import { NavLink, Navigate, useParams } from 'react-router-dom'
import CategoriesPage from '../Categories'
import AccountManage from './AccountManage'
import CardManage from './CardManage'
import DebtManage from './DebtManage'
import IconGallery from './IconGallery'
import useCategoryStore from '../../store/useCategoryStore'
import useWalletStore from '../../store/useWalletStore'
import useCreditCardStore from '../../store/useCreditCardStore'
import useDebtStore from '../../store/useDebtStore'
import Icon from '../../components/shared/Icon'
import { ICON_TOTAL } from '../../lib/iconCatalog'
import { ManageAddContext } from './manageHeader'

/**
 * จัดการข้อมูล — ศูนย์รวมการตั้งค่าข้อมูลพื้นฐานที่ใช้ทั้งแอป (แบบเมนู "ข้อมูล" ของ Wallet Story)
 *
 * หน้าอื่นเอาไว้ "ใช้" ข้อมูล: กระเป๋าเงินดูยอดและย้ายเงิน จ่ายบิลบัตร จ่ายค่างวดหนี้
 * ส่วนการ "เพิ่ม / แก้ไข / ลบ" ตัวข้อมูลเอง (หมวดหมู่ บัญชี บัตร สัญญาหนี้) มารวมไว้ที่นี่ที่เดียว
 * ผู้ใช้จะได้ไม่ต้องจำว่าปุ่มแก้ไขซ่อนอยู่ในการ์ดไหนของหน้าไหน
 *
 * เมนูย่อยอยู่ใน URL (/manage/:tab) เพื่อให้กด back ได้และแชร์ลิงก์ตรงไปแท็บได้
 */
const TABS = [
  { key: 'categories', icon: 'database',        label: 'หมวดหมู่',     desc: 'หมวดรายรับ-รายจ่าย' },
  { key: 'accounts',   icon: 'account_balance', label: 'บัญชีธนาคาร',  desc: 'เพิ่ม แก้ไข ลบบัญชี' },
  { key: 'cards',      icon: 'credit_card',     label: 'บัตรเครดิต',   desc: 'วงเงิน วันสรุปยอด' },
  { key: 'debts',      icon: 'receipt_long',    label: 'หนี้สิน',       desc: 'สัญญาผ่อน เงินกู้' },
  { key: 'icons',      icon: 'palette',         label: 'ไอคอน',        desc: 'ดูไอคอนทั้งหมดตามหมวด' },
]

/** หัวการ์ดฝั่งขวา — ชื่อ คำอธิบาย และป้ายบนปุ่มเพิ่ม (แท็บไอคอนอ่านอย่างเดียว จึงไม่มีปุ่ม) */
const HEAD = {
  categories: ['หมวดหมู่', 'ลากเพื่อจัดลำดับ · กดชื่อเพื่อแก้ในที่เดิม · มีหมวดย่อยได้ 2 ชั้น', 'เพิ่มหมวดหมู่'],
  accounts: ['บัญชีธนาคาร', 'ยอดรวมทุกบัญชีคือกระเป๋าเงินโอน · ดูยอดและย้ายเงินที่หน้ากระเป๋าเงิน', 'เพิ่มบัญชี'],
  cards: ['บัตรเครดิต', 'ตั้งค่าบัตรที่นี่ · จ่ายบิล กดเงินสด บันทึกเงินคืน ทำที่หน้ากระเป๋าเงิน', 'เพิ่มบัตร'],
  debts: ['หนี้สินและสัญญาผ่อน', 'สร้างและแก้สัญญาที่นี่ · จ่ายค่างวดทำที่หน้าบัตรและหนี้สิน', 'เพิ่มหนี้สิน'],
  icons: ['คลังไอคอน', 'ชุดไอคอนที่มากับแอป แบ่งตามหมวด · เป็นหน้าอ่านอย่างเดียว', ''],
}

function useCounts() {
  const categories = useCategoryStore((s) => s.categories.filter((c) => !c.deleted).length)
  const accounts = useWalletStore((s) => s.transferAccounts.length)
  const cards = useCreditCardStore((s) => s.cards.length)
  const debts = useDebtStore((s) => s.debts.filter((d) => d.status === 'active').length)
  // ไอคอนเป็นชุดที่มากับตัวแอป ไม่ใช่ข้อมูลของร้าน จำนวนจึงคงที่ ไม่ต้องอ่านจาก store
  return { categories, accounts, cards, debts, icons: ICON_TOTAL }
}

export default function ManagePage() {
  const { tab } = useParams()
  const counts = useCounts()
  // แท็บที่เปิดอยู่ฝากฟังก์ชัน "เพิ่ม" ไว้ตรงนี้ ปุ่มบนหัวการ์ดจึงทำงานของแท็บนั้นได้
  const [addFn, setAddFn] = useState(null)
  const registerAdd = useCallback((fn) => setAddFn(() => fn), [])

  if (!TABS.some((t) => t.key === tab)) return <Navigate to="/manage/categories" replace />

  const [title, sub, actionLabel] = HEAD[tab] ?? HEAD.categories

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[236px_minmax(0,1fr)] gap-3.5 items-start">
      <nav className="card p-3.5 flex flex-col gap-1 lg:sticky lg:top-[74px]">
        <div className="text-[11px] tracking-[0.1em] uppercase text-faint px-1 pb-1.5">ข้อมูลพื้นฐาน</div>
        {TABS.map((t) => (
          <NavLink
            key={t.key}
            to={`/manage/${t.key}`}
            className={({ isActive }) =>
              `min-h-[44px] px-2.5 py-2 rounded-[10px] flex items-center gap-2.5 transition-colors ${
                isActive ? 'bg-paper' : 'hover:bg-paper'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon name={t.icon} size={19} className={isActive ? 'text-ink' : 'text-faint'} />
                <span className="flex-1 min-w-0">
                  <span className={`block text-[13px] truncate ${isActive ? 'font-semibold text-ink' : 'text-muted'}`}>
                    {t.label}
                  </span>
                  <span className="block text-[11px] text-faint truncate">{t.desc}</span>
                </span>
                <span className="tabular-nums text-[11.5px] text-faint">{counts[t.key]}</span>
              </>
            )}
          </NavLink>
        ))}
        <p className="text-[11px] text-faint leading-relaxed px-1 pt-2 mt-1 border-t border-[#F2F0EA]">
          หน้าอื่นเอาไว้ใช้ข้อมูล ส่วนการเพิ่ม/แก้ไข/ลบ รวมไว้ที่นี่ที่เดียว
        </p>
      </nav>

      <div className="card p-4 sm:p-5 min-w-0">
        {/* จอแคบวางชื่อกับปุ่มไว้แถวบน แล้วคำอธิบายลงมาเต็มบรรทัดข้างล่าง
            ถ้าปล่อยให้อยู่แถวเดียวกันทั้งหมด คำอธิบายจะถูกบีบเหลือคอลัมน์แคบๆ อ่านยาก */}
        <div className="pb-3 mb-3.5 border-b border-[#F2F0EA]">
          <div className="flex items-center gap-3 lg:contents">
            <span className="flex-none text-[14.5px] font-semibold">{title}</span>
            <span className="hidden lg:inline flex-1 min-w-0 text-[11.5px] text-faint leading-[1.45]">{sub}</span>
            {actionLabel && (
              <button
                onClick={() => addFn?.()}
                disabled={!addFn}
                className="ml-auto lg:ml-0 flex-none h-9 px-3.5 rounded-ctl bg-lime text-ink text-[12.5px] font-semibold flex items-center gap-1.5 hover:brightness-[1.05] disabled:opacity-50"
              >
                <Icon name="add" size={17} />
                {actionLabel}
              </button>
            )}
          </div>
          <p className="lg:hidden text-[11.5px] text-faint leading-[1.45] mt-1.5">{sub}</p>
        </div>

        <ManageAddContext.Provider value={registerAdd}>
          {tab === 'categories' && <CategoriesPage embedded />}
          {tab === 'accounts' && <AccountManage />}
          {tab === 'cards' && <CardManage />}
          {tab === 'debts' && <DebtManage />}
          {tab === 'icons' && <IconGallery />}
        </ManageAddContext.Provider>
      </div>
    </div>
  )
}
