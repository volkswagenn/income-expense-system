import { iconUrl, iconBrandColor, iconGroupColor, iconIsColor, iconLabel } from '../../lib/iconCatalog'
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
 * ไอคอนสี ("emoji:") เป็นอีกข้อยกเว้น — ระบายหลายสีมาในไฟล์แล้ว mask จะทำให้เหลือ
 * เงาสีเดียวซึ่งทิ้งเหตุผลของชุดนี้ไปหมด จึงวาดด้วย <img> และ prop color ไม่มีผล
 *
 * props
 *   value    – ค่าที่เก็บไว้ เช่น "ms:bolt" "emoji:money-bag" "brand:line" "bank:kbank"
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
  // ค่าที่จะแสดงจริง — ถ้าค่าที่เก็บไว้ใช้ไม่ได้ ให้ถือว่ากำลังแสดงไอคอนสำรอง
  // สีก็ต้องคิดจากตัวสำรองด้วย ไม่งั้นไอคอนตั้งต้นของบัญชี/บัตรจะได้สีตัวอักษรแทนสีกลุ่ม
  const shown = iconUrl(value) ? value : `ms:${fallback}`
  const url = iconUrl(shown)
  if (!url) return <Icon name={fallback} size={size} fill className={className} {...rest} />

  // ไอคอนสีระบายมาในไฟล์แล้ว ย้อมทับไม่ได้ ต้องวาดเป็นรูปจริง
  // โหลดแบบ lazy เพราะบางหน้าวางไว้เป็นร้อยตัวพร้อมกัน (คลังไอคอน ตัวเลือกไอคอน)
  if (iconIsColor(shown)) {
    return (
      <img
        src={url}
        alt={iconLabel(shown)}
        width={size}
        height={size}
        loading="lazy"
        draggable={false}
        className={`inline-block flex-none object-contain ${className}`}
        style={{ width: size, height: size }}
        {...rest}
      />
    )
  }

  // ลำดับสี: ที่บังคับมา > สีแบรนด์/ธนาคาร > สีประจำกลุ่มของไอคอนทั่วไป > สีตัวอักษรรอบๆ
  // สีประจำกลุ่มทำให้ไอคอนที่ผู้ใช้เลือกมีสีของตัวเองโดยไม่ต้องตั้งค่าเพิ่ม (อาหารส้ม เดินทางฟ้า)
  // ที่ไหนต้องการสีเดียว (เช่นบนพื้นเข้ม) ยังส่ง color มาบังคับได้เหมือนเดิม
  const tint = color ?? iconBrandColor(shown) ?? iconGroupColor(shown) ?? 'currentColor'

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
