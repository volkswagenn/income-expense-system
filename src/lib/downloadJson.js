/**
 * ดาวน์โหลดข้อมูลเป็นไฟล์ .json ผ่านเบราว์เซอร์
 *
 * แยกมาจาก appDataKeys.js เดิม ซึ่งที่เหลือในไฟล์นั้นเป็นรายชื่อคีย์ localStorage
 * สมัยยังทำงานออฟไลน์ — เลิกใช้ไปแล้วตั้งแต่ย้ายข้อมูลขึ้น Postgres
 */
export function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
