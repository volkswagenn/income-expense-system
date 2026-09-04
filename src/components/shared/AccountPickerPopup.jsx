import { Link } from 'react-router-dom'
import Popup from './Popup'
import Icon from './Icon'
import BankLogo from './BankLogo'
import useWalletStore from '../../store/useWalletStore'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

/**
 * ป๊อปอัปเลือกบัญชีเงินโอน — ชุดเดียวกับที่ใช้ในฝั่งรายจ่าย ("จ่ายจาก")
 *
 * ฝั่งรายรับเดิมกางตัวเลือกลงมาในฟอร์มเลย ซึ่งดันเนื้อหาที่อยู่ข้างล่างให้ขยับทุกครั้ง
 * ที่กด และหน้าตาไม่ตรงกับฝั่งรายจ่ายทั้งที่เป็นการตัดสินใจแบบเดียวกัน
 *
 * @param title    หัวป๊อปอัป (เช่น "เข้าบัญชีไหน")
 * @param value    id บัญชีที่เลือกอยู่
 * @param onPick   เลือกแล้วเรียกด้วย id — ป๊อปอัปปิดให้เอง
 * @param onClose  ปิดโดยไม่เลือก
 */
export default function AccountPickerPopup({ title = 'เลือกบัญชี', sub, value, onPick, onClose }) {
  const accounts = useWalletStore((s) => s.transferAccounts)

  return (
    <Popup title={title} sub={sub} icon="account_balance" width={420} onClose={onClose}>
      {accounts.length === 0 ? (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
          ยังไม่มีบัญชีเงินโอน — เพิ่มได้ที่{' '}
          <Link to="/manage/accounts" onClick={onClose} className="underline font-medium">
            จัดการข้อมูล → บัญชีธนาคาร
          </Link>
        </p>
      ) : (
        <div className="space-y-1">
          {accounts.map((a) => {
            const on = a.id === value
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onPick(a.id)}
                className={`w-full flex items-center gap-[11px] text-left rounded-ctl border px-3 py-2.5 transition ${
                  on ? 'border-ink shadow-[0_0_0_1px_#16181D] bg-[#F2FAD9]' : 'border-hairline bg-white hover:border-ink'
                }`}
              >
                <span className="flex-none"><BankLogo bankName={a.bankName} size="lg" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold truncate">
                    {a.bankName ? `${a.bankName} — ${a.name}` : a.name}
                  </span>
                  <span className="block text-[11px] text-faint truncate">
                    {a.accountNo ? `บัญชี · ${a.accountNo}` : 'บัญชีเงินโอน'}
                  </span>
                </span>
                <span className="flex-none text-right">
                  <span className="block text-[10.5px] text-faint">คงเหลือ</span>
                  <span className={`tabular-nums block text-[13px] font-bold ${
                    Number(a.balance) < 0 ? 'text-expense' : 'text-ink'
                  }`}>
                    {fmt(a.balance)}
                  </span>
                </span>
                <span className={`flex-none w-[22px] h-[22px] rounded-full flex items-center justify-center ${
                  on ? 'bg-ink' : 'border border-[#D8D4C9]'
                }`}>
                  {on && <Icon name="check" size={15} className="text-lime" />}
                </span>
              </button>
            )
          })}

          {/* ทางออกไปเพิ่มบัญชี — ชุดเดียวกับที่ฝั่งรายจ่ายมี */}
          <div className="flex items-center gap-2 border-t border-[#F2F0EA] pt-[11px] mt-1">
            <span className="flex-1 min-w-0 text-[11px] text-faint leading-relaxed">
              เพิ่ม แก้ไข หรือลบบัญชีได้ที่ จัดการข้อมูล
            </span>
            <Link
              to="/manage/accounts"
              onClick={onClose}
              className="flex-none h-8 px-3 rounded-[9px] border border-hairline bg-white text-[12px] font-semibold flex items-center gap-1.5 hover:bg-paper"
            >
              <Icon name="add" size={15} />
              เพิ่มใหม่
            </Link>
          </div>
        </div>
      )}
    </Popup>
  )
}
