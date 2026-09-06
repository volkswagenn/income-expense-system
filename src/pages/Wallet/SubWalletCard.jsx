import { useState } from 'react'
import AppIcon from '../../components/shared/AppIcon'
import Icon from '../../components/shared/Icon'
import { DEFAULT_ICONS } from '../../lib/defaultIcons'
import useWalletStore from '../../store/useWalletStore'
import WalletItemPopup from './WalletItemPopup'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

/**
 * กระเป๋าตังค์ย่อยหนึ่งแถวบนหน้ากระเป๋าเงิน — ชื่อ ยอด และปุ่ม ⋮
 *
 * ของเดิมเป็นการ์ดที่มีปุ่มฝาก/ถอน/โอน/ยืม + แก้ชื่อ + ลบ กระจายอยู่บนตัวการ์ด
 * ตอนนี้ทุกอย่างรวมอยู่ในป๊อปอัปเดียว (WalletItemPopup) เหมือนบัญชีธนาคารและเงินสด
 * แถวจึงเหลือแค่สิ่งที่ต้องกวาดตาดู: กันไว้เท่าไร และมียอดยืมค้างไหม
 */
export default function SubWalletCard({ wallet, onDelete, onRename, onSetIcon }) {
  const [open, setOpen] = useState(false)
  const loans = useWalletStore((s) => s.loans)
  const owed = loans.filter((l) => !l.returned && l.subWalletId === wallet.id).reduce((s, l) => s + (Number(l.amount) || 0), 0)

  return (
    <>
      <div className="flex items-center gap-[11px] py-2.5 border-t border-[#F2F0EA]">
        <span className="w-8 h-8 flex-none rounded-[10px] bg-[#FBF7EC] flex items-center justify-center">
          <AppIcon value={wallet.icon} size={17} fallback={DEFAULT_ICONS.subWallet} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[12.5px] font-semibold truncate">{wallet.name}</span>
          <span className={`block text-[11px] truncate ${owed > 0 ? 'text-[#8A6A15]' : 'text-faint'}`}>
            {owed > 0 ? `ยืมออกไป ${fmt(owed)} ยังไม่คืน` : 'กันไว้ · ยังไม่ได้ใช้'}
          </span>
        </span>
        <span className={`tabular-nums flex-none text-sm font-bold ${Number(wallet.balance) < 0 ? 'text-expense' : 'text-income'}`}>
          {fmt(wallet.balance)}
        </span>
        <button
          onClick={() => setOpen(true)}
          title="ฝาก ถอน โอน ยืม หรือดูความเคลื่อนไหวของกระเป๋านี้"
          className="flex-none w-8 h-8 rounded-ctl border border-hairline bg-white flex items-center justify-center text-muted hover:text-ink hover:bg-paper"
        >
          <Icon name="more_vert" size={17} />
        </button>
      </div>

      {open && (
        <WalletItemPopup
          kind="sub"
          item={wallet}
          onClose={() => setOpen(false)}
          onRename={onRename}
          onSetIcon={onSetIcon}
          onDelete={onDelete}
        />
      )}
    </>
  )
}
