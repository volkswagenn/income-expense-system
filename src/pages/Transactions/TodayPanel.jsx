import { useMemo } from 'react'
import useTransactionStore from '../../store/useTransactionStore'
import useCategoryStore from '../../store/useCategoryStore'
import useRecurringStore from '../../store/useRecurringStore'
import Icon from '../../components/shared/Icon'
import { localDateStr, localMonthStr } from '../../lib/dateUtils'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

/**
 * แผงข้างฟอร์มบันทึกรายการ — "วันนี้บันทึกอะไรไปแล้วบ้าง"
 *
 * มีไว้เพื่อกันบันทึกซ้ำ ซึ่งเป็นความผิดพลาดที่เกิดบ่อยที่สุดตอนกรอกหลายรายการติดกัน
 * ของเดิมต้องไปดูที่แท็บค้นหารายการ ซึ่งทำให้ค่าที่กรอกค้างในฟอร์มหาย
 */
export default function TodayPanel() {
  const today = localDateStr()
  const transactions = useTransactionStore((s) => s.transactions)
  const getCategoryName = useCategoryStore((s) => s.getCategoryName)
  const recEntries = useRecurringStore((s) => s.entries)
  const recItems = useRecurringStore((s) => s.items)

  const rows = useMemo(
    () => transactions.filter((t) => t.date === today).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    [transactions, today]
  )
  const income = rows.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount || 0), 0)
  const expense = rows.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount || 0), 0)

  // รายการประจำของเดือนนี้ที่ยังไม่จ่าย — เตือนไว้ตรงนี้เพราะมักถูกบันทึกซ้ำเป็นรายจ่ายธรรมดา
  const pendingRecurring = useMemo(() => {
    const month = localMonthStr()
    return recEntries
      .filter((e) => e.month === month && e.status === 'pending')
      .map((e) => ({ entry: e, item: recItems.find((x) => x.id === e.recurringId) }))
      .filter((x) => x.item)
      .slice(0, 3)
  }, [recEntries, recItems])

  return (
    <aside className="space-y-3">
      {pendingRecurring.length > 0 && (
        <div className="card px-4 py-3.5">
          <div className="flex items-center gap-2">
            <Icon name="history" size={17} className="text-recurring" />
            <span className="text-[13px] font-semibold">รายการประจำที่ยังไม่จ่ายเดือนนี้</span>
          </div>
          <p className="text-[11px] text-faint leading-relaxed mt-1">
            ถ้ารายการที่กำลังบันทึกคือหนึ่งในนี้ ให้กดจ่ายจากแท็บรายการประจำแทน จะได้ไม่นับซ้ำ
          </p>
          <div className="flex flex-col gap-1.5 mt-2">
            {pendingRecurring.map(({ entry, item }) => (
              <div key={entry.id} className="flex items-center gap-2 bg-recurring-soft/60 rounded-[9px] px-2.5 py-1.5">
                <span className="flex-1 min-w-0 text-[12px] font-medium truncate">{item.name}</span>
                <span className="tabular-nums text-[12px] font-semibold text-recurring">{fmt(entry.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card px-4 py-3.5 flex flex-col">
        <div className="flex items-baseline justify-between">
          <span className="text-[13.5px] font-semibold">บันทึกวันนี้แล้ว</span>
          <span className="tabular-nums text-[11.5px] text-faint">{rows.length} รายการ</span>
        </div>

        <div className="mt-1">
          {rows.length === 0 ? (
            <p className="text-[11.5px] text-[#A5A199] py-3">ยังไม่มีรายการของวันนี้</p>
          ) : rows.slice(0, 8).map((t) => {
            const inc = t.type === 'income'
            return (
              <div key={t.id} className="flex items-center gap-2.5 py-2 border-t border-[#F2F0EA]">
                <span className="flex-1 min-w-0">
                  <span className="block text-[12.5px] font-medium truncate">{t.itemName || '(ไม่ระบุชื่อ)'}</span>
                  <span className="block text-[11px] text-faint truncate">{getCategoryName(t.category)}</span>
                </span>
                <span className={`tabular-nums text-[12.5px] font-semibold ${inc ? 'text-income' : 'text-expense'}`}>
                  {inc ? '+' : '-'}{Number(t.amount).toLocaleString('th-TH')}
                </span>
              </div>
            )
          })}
        </div>

        <div className="border-t border-hairline mt-2 pt-2.5 flex justify-between items-baseline">
          <span className="text-[12px] text-muted">สุทธิวันนี้</span>
          <span className={`tabular-nums text-[15px] font-bold ${income - expense >= 0 ? 'text-income' : 'text-expense'}`}>
            {fmt(income - expense)}
          </span>
        </div>
      </div>
    </aside>
  )
}
