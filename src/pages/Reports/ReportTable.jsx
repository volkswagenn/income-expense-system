import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import useCategoryStore from '../../store/useCategoryStore'

function dateStr(d) {
  try { return format(new Date(d), 'd MMM yyyy', { locale: th }) } catch { return d }
}

function monthStr(yyyymm) {
  try {
    const [y, m] = yyyymm.split('-').map(Number)
    return format(new Date(y, m - 1, 1), 'MMM yyyy', { locale: th })
  } catch { return yyyymm }
}

function methodLabel(m) {
  return m === 'cash' ? 'เงินสด' : m === 'transfer' ? 'เงินโอน' : m === 'pending' ? 'ค้างชำระ' : 'อื่นๆ'
}

function Th({ children, right }) {
  return <th className={`py-2 pr-3 font-medium text-gray-600 ${right ? 'text-right' : 'text-left'}`}>{children}</th>
}

function Td({ children, right, className = '', colSpan }) {
  return <td colSpan={colSpan} className={`py-2 pr-3 ${right ? 'text-right tabular-nums' : ''} ${className}`}>{children}</td>
}

export default function ReportTable({ type, transactions, groupBy = 'day' }) {
  const { getCategoryPath } = useCategoryStore()

  if (!transactions || transactions.length === 0) {
    return <p className="text-center text-gray-400 py-8">ไม่มีข้อมูลในช่วงที่เลือก</p>
  }

  const periodKey = (date) => groupBy === 'month' ? date.substring(0, 7) : date
  const displayPeriod = (key) => groupBy === 'month' ? monthStr(key) : dateStr(key)
  const periodLabel = groupBy === 'month' ? 'เดือน' : 'วันที่'

  // ── รายรับรวมตามรายวัน/เดือน ──
  if (type === 'daily_income') {
    const income = transactions.filter((t) => t.type === 'income')
    const byPeriod = {}
    income.forEach((t) => {
      const key = periodKey(t.date)
      byPeriod[key] = (byPeriod[key] ?? 0) + t.amount
    })
    const rows = Object.entries(byPeriod).sort(([a], [b]) => a.localeCompare(b))
    const grandTotal = rows.reduce((s, [, v]) => s + v, 0)

    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <Th>{periodLabel}</Th>
            <Th right>ยอดรวม (บาท)</Th>
          </tr>
        </thead>
        <tbody>
          <tr className="font-semibold border-b-2 border-gray-300 bg-emerald-50">
            <td className="py-2 pr-3">รวมทั้งหมด</td>
            <td className="py-2 text-right tabular-nums text-emerald-600">{grandTotal.toLocaleString()}</td>
          </tr>
          {rows.map(([key, total]) => (
            <tr key={key} className="border-b border-gray-100 hover:bg-gray-50">
              <Td>{displayPeriod(key)}</Td>
              <Td right className="text-emerald-600 font-medium">{total.toLocaleString()}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  // ── รายรับแยกประเภท ──
  if (type === 'income_by_type') {
    const isOther = (t) => !!t.otherIncomeType || t.method === 'other'
    const income = transactions.filter((t) => t.type === 'income')
    const byPeriod = {}
    income.forEach((t) => {
      const key = periodKey(t.date)
      if (!byPeriod[key]) byPeriod[key] = { total: 0, cash: 0, transfer: 0, other: 0 }
      byPeriod[key].total += t.amount
      if (isOther(t)) byPeriod[key].other += t.amount
      else if (t.method === 'cash') byPeriod[key].cash += t.amount
      else if (t.method === 'transfer') byPeriod[key].transfer += t.amount
    })
    const rows = Object.entries(byPeriod).sort(([a], [b]) => a.localeCompare(b))
    const totals = rows.reduce((acc, [, v]) => ({
      total: acc.total + v.total,
      cash: acc.cash + v.cash,
      transfer: acc.transfer + v.transfer,
      other: acc.other + v.other,
    }), { total: 0, cash: 0, transfer: 0, other: 0 })

    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <Th>{periodLabel}</Th>
            <Th right>ยอดรวม</Th>
            <Th right>เงินสด</Th>
            <Th right>เงินโอน</Th>
            <Th right>อื่นๆ</Th>
          </tr>
        </thead>
        <tbody>
          <tr className="font-semibold border-b-2 border-gray-300 bg-emerald-50">
            <td className="py-2 pr-3">รวมทั้งหมด</td>
            <td className="py-2 pr-3 text-right tabular-nums text-emerald-600">{totals.total.toLocaleString()}</td>
            <td className="py-2 pr-3 text-right tabular-nums text-emerald-600">{totals.cash.toLocaleString()}</td>
            <td className="py-2 pr-3 text-right tabular-nums text-emerald-600">{totals.transfer.toLocaleString()}</td>
            <td className="py-2 text-right tabular-nums text-emerald-600">{totals.other > 0 ? totals.other.toLocaleString() : '—'}</td>
          </tr>
          {rows.map(([key, v]) => (
            <tr key={key} className="border-b border-gray-100 hover:bg-gray-50">
              <Td>{displayPeriod(key)}</Td>
              <Td right className="text-emerald-600 font-semibold">{v.total.toLocaleString()}</Td>
              <Td right className="text-gray-700">{v.cash > 0 ? v.cash.toLocaleString() : '—'}</Td>
              <Td right className="text-gray-700">{v.transfer > 0 ? v.transfer.toLocaleString() : '—'}</Td>
              <Td right className="text-gray-500">{v.other > 0 ? v.other.toLocaleString() : '—'}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  // ── รายจ่าย / รายจ่ายแยกประเภท ──
  if (type === 'expense' || type === 'expense_by_cat') {
    const expense = transactions.filter((t) => t.type === 'expense')
    const totalExpense = expense.reduce((s, t) => s + t.amount, 0)

    if (groupBy === 'month') {
      const byPeriod = {}
      expense.forEach((t) => {
        const key = periodKey(t.date)
        byPeriod[key] = (byPeriod[key] ?? 0) + t.amount
      })
      const rows = Object.entries(byPeriod).sort(([a], [b]) => a.localeCompare(b))
      return (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <Th>เดือน</Th>
              <Th right>จำนวน (บาท)</Th>
            </tr>
          </thead>
          <tbody>
            <tr className="font-semibold border-b-2 border-gray-300 bg-red-50">
              <td className="py-2 pr-3">รวมทั้งหมด</td>
              <td className="py-2 text-right tabular-nums text-red-600">{totalExpense.toLocaleString()}</td>
            </tr>
            {rows.map(([key, total]) => (
              <tr key={key} className="border-b border-gray-100 hover:bg-gray-50">
                <Td>{monthStr(key)}</Td>
                <Td right className="text-red-600 font-medium">{total.toLocaleString()}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )
    }

    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <Th>วันที่</Th>
            {type === 'expense_by_cat' && <Th>หมวดหมู่</Th>}
            <Th>รายการ</Th>
            <Th right>จำนวน</Th>
            <Th>วิธีชำระ</Th>
          </tr>
        </thead>
        <tbody>
          <tr className="font-semibold border-b-2 border-gray-300 bg-red-50">
            <td colSpan={type === 'expense_by_cat' ? 3 : 2} className="py-2 pr-3">รวมทั้งหมด</td>
            <td className="py-2 pr-3 text-right tabular-nums text-red-600">{totalExpense.toLocaleString()}</td>
            <td />
          </tr>
          {expense.map((t) => (
            <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
              <Td className="whitespace-nowrap">{dateStr(t.date)}</Td>
              {type === 'expense_by_cat' && <Td className="text-gray-600">{getCategoryPath(t.category)}</Td>}
              <Td>{t.itemName ?? '—'}</Td>
              <Td right className="text-red-600 font-medium">{t.amount.toLocaleString()}</Td>
              <Td className="text-gray-500">{methodLabel(t.method)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  // ── รายรับ-รายจ่ายรวม ──
  if (type === 'summary') {
    const totalIncome = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const totalExpense = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const net = totalIncome - totalExpense

    if (groupBy === 'month') {
      const byPeriod = {}
      transactions.forEach((t) => {
        const key = periodKey(t.date)
        if (!byPeriod[key]) byPeriod[key] = { income: 0, expense: 0 }
        if (t.type === 'income') byPeriod[key].income += t.amount
        else byPeriod[key].expense += t.amount
      })
      const rows = Object.entries(byPeriod).sort(([a], [b]) => a.localeCompare(b))
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-emerald-50 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-500">รายรับรวม</p>
              <p className="text-xl font-bold text-emerald-600">{totalIncome.toLocaleString()}</p>
            </div>
            <div className="bg-red-50 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-500">รายจ่ายรวม</p>
              <p className="text-xl font-bold text-red-600">{totalExpense.toLocaleString()}</p>
            </div>
            <div className={`rounded-xl p-4 text-center ${net >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
              <p className="text-xs text-gray-500">กำไร/ขาดทุน</p>
              <p className={`text-xl font-bold ${net >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{net.toLocaleString()}</p>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <Th>เดือน</Th>
                <Th right>รายรับ</Th>
                <Th right>รายจ่าย</Th>
                <Th right>คงเหลือ</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([key, v]) => (
                <tr key={key} className="border-b border-gray-100 hover:bg-gray-50">
                  <Td>{monthStr(key)}</Td>
                  <Td right className="text-emerald-600">{v.income > 0 ? v.income.toLocaleString() : '—'}</Td>
                  <Td right className="text-red-600">{v.expense > 0 ? v.expense.toLocaleString() : '—'}</Td>
                  <Td right className={(v.income - v.expense) >= 0 ? 'text-blue-600 font-medium' : 'text-orange-600 font-medium'}>
                    {(v.income - v.expense).toLocaleString()}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-emerald-50 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500">รายรับรวม</p>
            <p className="text-xl font-bold text-emerald-600">{totalIncome.toLocaleString()}</p>
          </div>
          <div className="bg-red-50 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500">รายจ่ายรวม</p>
            <p className="text-xl font-bold text-red-600">{totalExpense.toLocaleString()}</p>
          </div>
          <div className={`rounded-xl p-4 text-center ${net >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
            <p className="text-xs text-gray-500">กำไร/ขาดทุน</p>
            <p className={`text-xl font-bold ${net >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{net.toLocaleString()}</p>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <Th>วันที่</Th>
              <Th>ประเภท</Th>
              <Th>รายการ</Th>
              <Th right>จำนวน</Th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                <Td className="whitespace-nowrap">{dateStr(t.date)}</Td>
                <Td>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    t.type === 'income' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {t.type === 'income' ? 'รายรับ' : 'รายจ่าย'}
                  </span>
                </Td>
                <Td>{t.itemName ?? '—'}</Td>
                <Td right className={t.type === 'income' ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
                  {t.type === 'income' ? '+' : '-'}{t.amount.toLocaleString()}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return null
}
