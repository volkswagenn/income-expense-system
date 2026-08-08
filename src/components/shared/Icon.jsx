/**
 * ไอคอน Material Symbols Rounded — ใช้แทนอิโมจิทั้งระบบตาม mockup
 *
 * props:
 *   name   – ชื่อไอคอน เช่น 'space_dashboard'
 *   size   – ขนาด px (ค่าเริ่มต้น 20)
 *   fill   – true = แบบทึบ (ใช้กับสถานะ active และ check_circle)
 *   color  – สีตัวอักษร (ปกติใช้ className แทน)
 */
export default function Icon({ name, size = 20, fill = false, className = '', style, ...rest }) {
  return (
    <span
      className={`mi ${fill ? 'mif' : ''} ${className}`}
      style={{ fontSize: size, ...style }}
      aria-hidden="true"
      {...rest}
    >
      {name}
    </span>
  )
}
