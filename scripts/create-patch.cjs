const fs = require('fs')
const path = require('path')

const ROOT        = path.join(__dirname, '..')
const UNPACKED    = path.join(ROOT, 'release', 'win-unpacked', 'resources')
const SETTING_SRC = path.join(ROOT, 'public', 'SettingApp.txt')
const PATCH_DIR   = path.join(ROOT, 'patch')

function readVersion() {
  try {
    const txt = fs.readFileSync(SETTING_SRC, 'utf8')
    const match = txt.match(/File Version\s*=\s*([\d.]+)/)
    return match ? match[1] : 'unknown'
  } catch { return 'unknown' }
}

function checkBuildExists() {
  if (!fs.existsSync(path.join(UNPACKED, 'app.asar'))) {
    console.error('❌  ไม่พบ release/win-unpacked/resources/app.asar')
    console.error('    กรุณารัน npm run electron:build ก่อน')
    process.exit(1)
  }
}

function createInstructions(version) {
  return `วิธีอัปเดตแอป บันทึกรายรับ-รายจ่าย (v${version})
==========================================

สิ่งที่อยู่ในโฟลเดอร์นี้
- app.asar         <- ไฟล์อัปเดตหลัก
- SettingApp.txt   <- ไฟล์ version
- วิธีอัปเดต.txt   <- ไฟล์นี้

ขั้นตอนการอัปเดต
-----------------
1. ปิดแอป "บันทึกรายรับ-รายจ่าย" ให้สนิท (สำคัญมาก!)
2. เปิด File Explorer ไปที่โฟลเดอร์ติดตั้งแอป เช่น
     C:\Program Files\บันทึกรายรับ-รายจ่าย\resources\
3. copy ไฟล์ app.asar ทับไฟล์เดิมใน resources\
4. copy ไฟล์ SettingApp.txt ทับที่
     C:\Program Files\บันทึกรายรับ-รายจ่าย\SettingApp.txt
5. เปิดแอปใหม่ -> ได้เวอร์ชัน ${version}

ตรวจสอบว่าอัปเดตสำเร็จ
------------------------
เปิดแอป -> ดูเลข version ต้องเป็น ${version}

หมายเหตุ: ข้อมูลทั้งหมดไม่หาย ถ้า Windows แจ้ง permission ให้กด Continue
`
}

function main() {
  checkBuildExists()
  const version = readVersion()
  console.log(`\n📦  สร้าง patch สำหรับ v${version}`)

  if (fs.existsSync(PATCH_DIR)) fs.rmSync(PATCH_DIR, { recursive: true })
  fs.mkdirSync(PATCH_DIR)

  const asarDst = path.join(PATCH_DIR, 'app.asar')
  fs.copyFileSync(path.join(UNPACKED, 'app.asar'), asarDst)
  const sizeMB = (fs.statSync(asarDst).size / 1024 / 1024).toFixed(1)
  console.log(`  ✓  app.asar  (${sizeMB} MB)`)

  fs.copyFileSync(SETTING_SRC, path.join(PATCH_DIR, 'SettingApp.txt'))
  console.log(`  ✓  SettingApp.txt`)

  fs.writeFileSync(path.join(PATCH_DIR, 'วิธีอัปเดต.txt'), createInstructions(version), 'utf8')
  console.log(`  ✓  วิธีอัปเดต.txt`)

  console.log(`\n✅  พร้อมส่งแล้ว -> โฟลเดอร์ patch/`)
  console.log(`    zip โฟลเดอร์นี้ส่งให้ user ได้เลย\n`)
}

main()
