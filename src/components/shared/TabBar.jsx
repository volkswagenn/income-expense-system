import Icon from './Icon'

/**
 * แท็บแบบเม็ดยาบนพื้นเทา — ใช้ทุกที่ที่สลับมุมมองภายในหน้าเดียว
 * (บัตร/หนี้สิน, รายจ่าย-รายรับ, ค้างจ่าย-รอรับ)
 *
 * tabs: [{ key, label, icon?, count?, sub? }]
 */
export default function TabBar({ tabs, value, onChange, className = '' }) {
  return (
    <div className={`inline-flex bg-paper rounded-[11px] p-[3px] max-w-full overflow-x-auto ${className}`}>
      {tabs.map((t) => {
        const active = t.key === value
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`h-8 px-3.5 sm:px-[18px] rounded-[9px] text-[13px] flex items-center gap-1.5 whitespace-nowrap transition ${
              active ? 'bg-white shadow-[0_1px_2px_rgba(22,24,29,.08)] text-ink font-semibold' : 'text-muted hover:text-ink'
            }`}
          >
            {t.icon && <Icon name={t.icon} size={17} />}
            {t.label}
            {t.sub != null && <span className="text-[11px] text-faint tabular-nums">{t.sub}</span>}
            {t.count > 0 && (
              <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-bold flex items-center justify-center tabular-nums ${
                active ? 'bg-ink text-white' : 'bg-hairline text-muted'
              }`}>
                {t.count > 99 ? '99+' : t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
