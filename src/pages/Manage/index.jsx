import { NavLink, Navigate, useParams } from 'react-router-dom'
import CategoriesPage from '../Categories'
import AccountManage from './AccountManage'
import CardManage from './CardManage'
import DebtManage from './DebtManage'
import useCategoryStore from '../../store/useCategoryStore'
import useWalletStore from '../../store/useWalletStore'
import useCreditCardStore from '../../store/useCreditCardStore'
import useDebtStore from '../../store/useDebtStore'

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
  { key: 'categories', icon: '🏷️', label: 'หมวดหมู่',     desc: 'หมวดรายรับ-รายจ่าย' },
  { key: 'accounts',   icon: '🏦', label: 'บัญชีธนาคาร',  desc: 'เพิ่ม แก้ไข ลบบัญชี' },
  { key: 'cards',      icon: '💳', label: 'บัตรเครดิต',   desc: 'วงเงิน วันสรุปยอด ค่าธรรมเนียม' },
  { key: 'debts',      icon: '📒', label: 'หนี้สิน',       desc: 'สัญญาผ่อน เงินกู้ ระยะสั้น-ยาว' },
]

function useCounts() {
  const categories = useCategoryStore((s) => s.categories.filter((c) => !c.deleted).length)
  const accounts = useWalletStore((s) => s.transferAccounts.length)
  const cards = useCreditCardStore((s) => s.cards.length)
  const debts = useDebtStore((s) => s.debts.filter((d) => d.status === 'active').length)
  return { categories, accounts, cards, debts }
}

export default function ManagePage() {
  const { tab } = useParams()
  const counts = useCounts()

  if (!TABS.some((t) => t.key === tab)) return <Navigate to="/manage/categories" replace />

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">จัดการข้อมูล</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          ข้อมูลพื้นฐานที่ใช้ทั้งแอป — เพิ่ม แก้ไข ลบ ได้ที่นี่ที่เดียว ส่วนหน้าอื่นเอาไว้ใช้งานจริง
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {TABS.map((t) => (
          <NavLink
            key={t.key}
            to={`/manage/${t.key}`}
            className={({ isActive }) =>
              `rounded-xl border px-3.5 py-3 text-left transition-colors ${
                isActive
                  ? 'border-gray-900 ring-1 ring-gray-900 bg-white'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`
            }
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-lg leading-none">{t.icon}</span>
              <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5 tabular-nums">
                {counts[t.key]}
              </span>
            </div>
            <p className="text-sm font-semibold text-gray-900 mt-2">{t.label}</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-snug">{t.desc}</p>
          </NavLink>
        ))}
      </div>

      <div className="card p-5">
        {tab === 'categories' && <CategoriesPage embedded />}
        {tab === 'accounts' && <AccountManage />}
        {tab === 'cards' && <CardManage />}
        {tab === 'debts' && <DebtManage />}
      </div>
    </div>
  )
}
