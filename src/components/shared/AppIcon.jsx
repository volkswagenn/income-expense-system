import { iconUrl, iconBrandColor } from '../../lib/iconCatalog'
import Icon from './Icon'

/**
 * แสดงไอคอนที่ผู้ใช้เลือกไว้ (หมวดหมู่ กระเป๋าย่อย รายการประจำ ผู้ขาย)
 *
 * ทำไมใช้ mask ไม่ใช่ <img>
 *   ไฟล์ SVG ในชุดเป็นกราฟิกสีเดียว ถ้าใส่เป็น <img> จะเปลี่ยนสีไม่ได้เลย
 *   ไอคอนหมวดรายรับต้องเป็นเขียว หมวดรายจ่ายต้องเป็นแดง และตอนอยู่บนแถบสีเข้ม
 *   ต้องกลายเป็นสีขาว การใช้ mask ทำให้สีมาจาก currentColor ของตัวที่ครอบอยู่
 *   ซึ่งเปลี่ยนตามบริบทได้เองโดยไม่ต้องเตรียมไฟล์หลายสี
 *
 * โลโก้แบรนด์กับธนาคารเป็นข้อยกเว้น — บังคับใช้สีประจำแบรนด์
 * เพราะคนจำ LINE จากสีเขียวและ Facebook จากสีน้ำเงิน ถ้าเป็นสีเทาหมดจะแยกไม่ออก
 *
 * props
 *   value    – ค่าที่เก็บไว้ เช่น "ms:bolt" "brand:line" "bank:kbank"
 *   size     – ความกว้าง/สูงเป็น px
 *   color    – บังคับสี (ทับสีแบรนด์); ไม่ส่ง = ใช้สีแบรนด์ ถ้าไม่มีก็ใช้ currentColor
 *   fallback – ชื่อไอคอนฟอนต์ที่ใช้เมื่อ value ว่างหรือชี้ไปยังไอคอนที่ถูกถอดออกแล้ว
 */
export default function AppIcon({
  value,
  size = 18,
  color,
  fallback = 'label',
  className = '',
  ...rest
}) {
  // ข้อมูลเก่าอาจอ้างไอคอนที่ถูกถอดออกจากชุดไปแล้ว ต้องไม่ปล่อยให้เป็นช่องว่าง
  // เพราะแถวในตารางจะเหลื่อมกันทันทีเมื่อบางแถวไม่มีไอคอน
  //
  // ตัวสำรองใช้ไฟล์ SVG ในชุดก่อนเสมอ ไม่ใช่ฟอนต์ไอคอน
  // เพราะฟอนต์โหลดมาเฉพาะชื่อที่ระบุไว้ใน index.html ถ้าชื่อไม่อยู่ในนั้น
  // เบราว์เซอร์จะพ่นชื่อไอคอนออกมาเป็นตัวหนังสือแทนรูป (เช่นขึ้นคำว่า "folder")
  const url = iconUrl(value) ?? iconUrl(`ms:${fallback}`)
  if (!url) return <Icon name={fallback} size={size} fill className={className} {...rest} />

  const tint = color ?? iconBrandColor(value) ?? 'currentColor'

  return (
    <span
      role="img"
      className={`inline-block flex-none ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: tint,
        WebkitMaskImage: `url("${url}")`,
        maskImage: `url("${url}")`,
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
      }}
      {...rest}
    />
  )
}
