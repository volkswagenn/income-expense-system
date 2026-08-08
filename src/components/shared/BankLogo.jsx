import { useState } from 'react'
import { findBank, bankLogoUrl } from '../../lib/banks'

const SIZES = {
  sm: { box: 'w-6 h-6 rounded-md', text: 'text-[9px]', pad: 'p-[3px]' },
  md: { box: 'w-8 h-8 rounded-lg', text: 'text-[10px]', pad: 'p-[4px]' },
  lg: { box: 'w-10 h-10 rounded-lg', text: 'text-xs', pad: 'p-[5px]' },
}

/**
 * ตราสัญลักษณ์ธนาคาร
 *
 * ไฟล์โลโก้จาก omise/banks-logo เป็นกราฟิก "สีขาวล้วน" ที่ออกแบบมาให้วาง
 * บนพื้นสีประจำธนาคาร จึงต้องใส่พื้นหลังสีแบรนด์เสมอ ไม่งั้นจะกลายเป็นขาวบนขาว
 *
 * ถ้าไฟล์โลโก้โหลดไม่ขึ้น จะแสดงรหัสย่อบนพื้นสีเดียวกันแทน
 */
export default function BankLogo({ bankName, size = 'md', className = '' }) {
  const bank = findBank(bankName)
  const [imgFailed, setImgFailed] = useState(false)
  const s = SIZES[size] ?? SIZES.md
  const logo = bankLogoUrl(bank)

  if (!bank) {
    return (
      <span className={`${s.box} inline-flex items-center justify-center bg-gray-100 shrink-0 ${className}`}>
        🏦
      </span>
    )
  }

  return (
    <span
      title={bank.name}
      style={{ backgroundColor: bank.color, color: bank.text }}
      className={`${s.box} inline-flex items-center justify-center shrink-0 overflow-hidden select-none ${className}`}
    >
      {logo && !imgFailed ? (
        <img
          src={logo}
          alt={bank.name}
          onError={() => setImgFailed(true)}
          className={`w-full h-full object-contain ${s.pad}`}
        />
      ) : (
        <span className={`${s.text} font-bold leading-none`}>{bank.short}</span>
      )}
    </span>
  )
}
