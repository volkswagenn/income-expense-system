/**
 * รายชื่อธนาคารพร้อมสีประจำแบรนด์และไฟล์โลโก้
 *
 * ไฟล์โลโก้ SVG อยู่ที่ public/bank-logos/<code>.svg
 * ที่มา: https://github.com/omise/banks-logo (MIT License)
 * รหัสธนาคารและสีอ้างอิงจาก banks.json ของ repo เดียวกัน
 *
 * ถ้าโลโก้โหลดไม่ขึ้น ระบบจะแสดงตราสีประจำธนาคารพร้อมรหัสย่อแทนอัตโนมัติ
 */
export const BANKS = [
  { code: 'kbank', name: 'กสิกรไทย',            short: 'K',    color: '#138f2d', text: '#ffffff' },
  { code: 'scb',   name: 'ไทยพาณิชย์',          short: 'SCB',  color: '#4e2e7f', text: '#ffffff' },
  { code: 'bbl',   name: 'กรุงเทพ',              short: 'BBL',  color: '#1e4598', text: '#ffffff' },
  { code: 'ktb',   name: 'กรุงไทย',              short: 'KTB',  color: '#1ba5e1', text: '#ffffff' },
  { code: 'bay',   name: 'กรุงศรีอยุธยา',        short: 'BAY',  color: '#fec43b', text: '#5b4600' },
  // banks.json ให้สี ttb เป็น #ecf0f1 (เกือบขาว) ใช้เป็นพื้นหลังไม่ได้เพราะโลโก้เป็นสีขาว
  // จึงใช้สีน้ำเงินของแบรนด์แทน
  { code: 'ttb',   name: 'ทหารไทยธนชาต',         short: 'ttb',  color: '#1279be', text: '#ffffff' },
  { code: 'gsb',   name: 'ออมสิน',               short: 'GSB',  color: '#eb198d', text: '#ffffff' },
  { code: 'baac',  name: 'ธ.ก.ส.',               short: 'BAAC', color: '#4b9b1d', text: '#ffffff' },
  { code: 'ghb',   name: 'อาคารสงเคราะห์',       short: 'GHB',  color: '#f57d23', text: '#ffffff' },
  { code: 'kk',    name: 'เกียรตินาคินภัทร',     short: 'KKP',  color: '#199cc5', text: '#ffffff' },
  { code: 'tisco', name: 'ทิสโก้',               short: 'TSCO', color: '#12549f', text: '#ffffff' },
  { code: 'cimb',  name: 'ซีไอเอ็มบี ไทย',       short: 'CIMB', color: '#7e2f36', text: '#ffffff' },
  { code: 'uob',   name: 'ยูโอบี',               short: 'UOB',  color: '#0b3979', text: '#ffffff' },
  { code: 'lhb',   name: 'แลนด์ แอนด์ เฮ้าส์',   short: 'LHB',  color: '#6d6e71', text: '#ffffff' },
  { code: 'tcrb',  name: 'ไทยเครดิต',            short: 'TCRB', color: '#0a4ab3', text: '#ffffff' },
  { code: 'ibank', name: 'อิสลามแห่งประเทศไทย',  short: 'IBNK', color: '#184615', text: '#ffffff' },
  { code: 'icbc',  name: 'ไอซีบีซี (ไทย)',       short: 'ICBC', color: '#c50f1c', text: '#ffffff' },
  { code: 'citi',  name: 'ซิตี้แบงก์',           short: 'CITI', color: '#1583c7', text: '#ffffff' },
  { code: 'sc',    name: 'สแตนดาร์ดชาร์เตอร์ด',  short: 'SCBT', color: '#0f6ea1', text: '#ffffff' },
  // ไม่ใช่ธนาคาร จึงไม่มีไฟล์โลโก้ — ใช้ตราสีอย่างเดียว
  { code: 'promptpay', name: 'พร้อมเพย์ / e-Wallet', short: 'PP', color: '#0e3e6d', text: '#ffffff', noLogo: true },
]

const BY_NAME = new Map(BANKS.map((b) => [b.name, b]))

/** หาข้อมูลธนาคารจากชื่อ — ธนาคารที่ผู้ใช้พิมพ์เองจะได้ตราสีเทากลางๆ */
export function findBank(bankName) {
  if (!bankName) return null
  return BY_NAME.get(bankName) ?? {
    code: null,
    name: bankName,
    short: bankName.trim().slice(0, 2),
    color: '#64748b',
    text: '#ffffff',
    noLogo: true,
  }
}

export function bankLogoUrl(bank) {
  if (!bank?.code || bank.noLogo) return null
  return `bank-logos/${bank.code}.svg`
}
