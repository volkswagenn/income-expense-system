/**
 * ไอคอนเฉพาะของธุรกิจ — เงินสด เงินโอน บัตร หนี้สิน ใบกำกับภาษี ฯลฯ
 *
 * ต่างจาก <Icon> (ฟอนต์ Material Symbols) และ <AppIcon> (ไอคอนที่ผู้ใช้เลือกเอง)
 * ชุดนี้เป็นภาพวาดของแบรนด์ที่มากับดีไซน์ อยู่ที่ public/ui-icons/ (ดู README ในโฟลเดอร์)
 *
 * ทำไมใช้ <img> ไม่ใช่ CSS mask เหมือน AppIcon
 *   ไอคอนชุดนี้เป็นภาพสองสี ใช้สีขาวเจาะช่องว่างข้างใน (เช่นวงกลมกลางธนบัตร)
 *   ถ้าเอาไปทำ mask ส่วนที่เจาะจะทึบไปด้วยเพราะ mask มองแค่ความโปร่งใส ไม่ได้มองสี
 *   ดีไซน์จึงเตรียมไฟล์แยกสีมาให้ 6 สี แล้วเลือกไฟล์ตามพื้นหลังที่วางแทน
 *
 * tone ที่มี (ตาม README ของชุดไอคอน)
 *   default #16181D บนพื้นขาว/ครีม   ·  w #FFFFFF บนพื้นเข้ม
 *   amber   #8A6A15 ในกล่องเหลือง    ·  green #0F6A50 ในกล่องเขียว
 *   blue    #2E44A6 ในกล่องน้ำเงิน   ·  gray  #7A7F87 ข้อความรอง
 */

const TONES = new Set(['w', 'amber', 'green', 'blue', 'gray'])

export default function UiIcon({ name, tone, size = 15, className = '', style, alt = '', ...rest }) {
  const file = tone && TONES.has(tone) ? `${name}-${tone}` : name
  return (
    <img
      src={`ui-icons/${file}.svg`}
      width={size}
      height={size}
      alt={alt}
      className={`flex-none inline-block ${className}`}
      style={{ width: size, height: size, ...style }}
      {...rest}
    />
  )
}
