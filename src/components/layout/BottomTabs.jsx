import { NavLink, useNavigate } from 'react-router-dom'
import usePendingStore from '../../store/usePendingStore'
import Icon from '../shared/Icon'
import { MOBILE_TABS } from './navConfig'

/**
 * แถบล่างบนมือถือ — ทางลัด 4 หน้าที่ใช้บ่อย + ปุ่มบันทึกรายการตรงกลาง
 *
 * บนจอเล็กเมนูข้างเป็นลิ้นชักที่ต้องกดเปิดก่อน ซึ่งช้าเกินไปสำหรับงานที่ทำวันละหลายรอบ
 * ทุกปุ่มสูงอย่างน้อย 48px ตามระยะที่นิ้วกดพลาดยาก
 */
export default function BottomTabs() {
  const navigate = useNavigate()
  const pendingCount = usePendingStore((s) =>
    s.pendingPayments.filter((p) => p.status === 'pending').length +
    s.pendingIncomes.filter((p) => p.status === 'pending').length
  )
  const counts = { pending: pendingCount, income: 0 }

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-20 h-[68px] bg-white border-t border-hairline grid grid-cols-5 items-center pb-[env(safe-area-inset-bottom)]">
      {MOBILE_TABS.map((tab) => {
        if (tab.fab) {
          return (
            <button
              key="fab"
              onClick={() => navigate(tab.to)}
              title={tab.label}
              className="flex items-center justify-center"
            >
              <span className="w-[54px] h-[54px] rounded-[18px] bg-lime text-ink flex items-center justify-center shadow-[0_4px_14px_rgba(143,168,46,.4)]">
                <Icon name="add" size={28} />
              </span>
            </button>
          )
        }
        const badge = (tab.badges ?? []).reduce((a, k) => a + (counts[k] ?? 0), 0)
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            className="h-[56px] flex flex-col items-center justify-center gap-[3px] relative"
          >
            {({ isActive }) => (
              <>
                <Icon
                  name={tab.icon}
                  size={23}
                  fill={isActive}
                  className={isActive ? 'text-ink' : 'text-faint'}
                />
                <span className={`text-[10px] ${isActive ? 'text-ink font-semibold' : 'text-faint'}`}>
                  {tab.label}
                </span>
                {badge > 0 && (
                  <span className="absolute top-1.5 right-4 min-w-4 h-4 px-1 rounded-full bg-expense text-white text-[9.5px] font-bold flex items-center justify-center tabular-nums">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}
