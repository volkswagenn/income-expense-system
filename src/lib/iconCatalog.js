/**
 * รายการไอคอนทั้งหมดที่เลือกใช้ได้ในระบบ
 *
 * ★ ไฟล์นี้ถูกสร้างอัตโนมัติ อย่าแก้มือ ★
 * แก้ที่ scripts/icon-source.mjs แล้วรัน `npm run icons`
 *
 * ค่าที่เก็บลงฐานข้อมูลเป็นสตริงมี prefix เสมอ เช่น "ms:bolt" "brand:line" "bank:kbank"
 * มี prefix เพื่อให้ย้ายไอคอนข้ามกลุ่มได้โดยค่าที่บันทึกไว้เดิมยังใช้ได้อยู่
 * และเพื่อไม่ให้ชื่อชนกันเองระหว่างชุด (เช่น shell ที่เป็นทั้งไอคอนและแบรนด์)
 */

/** ไอคอนทั่วไป แบ่งตามกลุ่ม — [ชื่อไฟล์, ชื่อไทย] */
export const ICON_GROUPS = [
  {
    key: "finance", label: "การเงิน", cover: "payments",
    items: [
    ["payments", "ชำระเงิน"],
    ["wallet", "กระเป๋าเงิน"],
    ["savings", "เงินออม"],
    ["account_balance", "ธนาคาร"],
    ["credit_card", "บัตรเครดิต"],
    ["currency_exchange", "แลกเปลี่ยนเงิน"],
    ["request_quote", "ใบเสนอราคา"],
    ["receipt_long", "ใบเสร็จ"],
    ["attach_money", "เงิน"],
    ["price_change", "ราคาเปลี่ยน"],
    ["trending_up", "กำไร"],
    ["trending_down", "ขาดทุน"],
    ["account_balance_wallet", "บัญชีเงิน"],
    ["paid", "จ่ายแล้ว"],
    ["sell", "ขายของ"],
    ["redeem", "แต้มสะสม"],
    ["universal_currency", "ธนบัตร"],
    ["point_of_sale", "เครื่องคิดเงิน"],
    ["calculate", "คำนวณ"],
    ["percent", "ดอกเบี้ย"],
    ["universal_currency_alt", "สกุลเงิน"],
    ["handshake", "ดีลธุรกิจ"],
    ],
  },
  {
    key: "food", label: "อาหารและเครื่องดื่ม", cover: "restaurant",
    items: [
    ["restaurant", "ร้านอาหาร"],
    ["lunch_dining", "เบอร์เกอร์"],
    ["ramen_dining", "ก๋วยเตี๋ยว"],
    ["rice_bowl", "ข้าว"],
    ["local_cafe", "กาแฟ"],
    ["local_bar", "เครื่องดื่มแอลกอฮอล์"],
    ["local_pizza", "พิซซ่า"],
    ["bakery_dining", "เบเกอรี่"],
    ["icecream", "ไอศกรีม"],
    ["egg", "ไข่"],
    ["set_meal", "อาหารชุด"],
    ["kebab_dining", "ปิ้งย่าง"],
    ["brunch_dining", "มื้อสาย"],
    ["liquor", "เหล้า"],
    ["local_dining", "ช้อนส้อม"],
    ["fastfood", "ฟาสต์ฟู้ด"],
    ["cake", "เค้ก"],
    ["coffee", "กาแฟแก้ว"],
    ["takeout_dining", "อาหารกล่อง"],
    ["local_drink", "น้ำดื่ม"],
    ["nutrition", "โภชนาการ"],
    ["grocery", "ของสด"],
    ],
  },
  {
    key: "shopping", label: "ช้อปปิ้ง", cover: "shopping_cart",
    items: [
    ["shopping_cart", "ตะกร้าสินค้า"],
    ["shopping_bag", "ถุงช้อปปิ้ง"],
    ["storefront", "หน้าร้าน"],
    ["local_convenience_store", "ร้านสะดวกซื้อ"],
    ["local_mall", "ห้างสรรพสินค้า"],
    ["label_important", "ป้ายโปรโมชัน"],
    ["inventory_2", "สต๊อกสินค้า"],
    ["package_2", "พัสดุ"],
    ["local_shipping", "ขนส่ง"],
    ["qr_code_scanner", "สแกนจ่าย"],
    ["loyalty", "บัตรสมาชิก"],
    ["percent_discount", "ส่วนลด"],
    ["shopping_basket", "ตะกร้า"],
    ["category", "หมวดสินค้า"],
    ["barcode", "บาร์โค้ด"],
    ["store", "ร้านค้า"],
    ["add_shopping_cart", "เพิ่มลงตะกร้า"],
    ["receipt", "ใบเสร็จรับเงิน"],
    ],
  },
  {
    key: "home", label: "บ้านและที่พัก", cover: "home",
    items: [
    ["home", "บ้าน"],
    ["apartment", "คอนโด"],
    ["house", "บ้านเดี่ยว"],
    ["villa", "บ้านพัก"],
    ["bed", "ห้องนอน"],
    ["chair", "เฟอร์นิเจอร์"],
    ["weekend", "โซฟา"],
    ["kitchen", "ห้องครัว"],
    ["bathtub", "ห้องน้ำ"],
    ["local_laundry_service", "ซักผ้า"],
    ["cleaning_services", "ทำความสะอาด"],
    ["yard", "สนามหญ้า"],
    ["door_front", "ประตูบ้าน"],
    ["key", "ค่าเช่า"],
    ["meeting_room", "ห้องเช่า"],
    ["garage", "โรงรถ"],
    ["roofing", "หลังคา"],
    ["table_restaurant", "โต๊ะ"],
    ["light", "โคมไฟ"],
    ["countertops", "เคาน์เตอร์"],
    ],
  },
  {
    key: "build", label: "ก่อสร้างและซ่อมแซม", cover: "construction",
    items: [
    ["construction", "ก่อสร้าง"],
    ["handyman", "ช่างซ่อม"],
    ["engineering", "วิศวกรรม"],
    ["hardware", "เครื่องมือช่าง"],
    ["carpenter", "งานไม้"],
    ["plumbing", "งานประปา"],
    ["electrical_services", "งานไฟฟ้า"],
    ["format_paint", "สีทาบ้าน"],
    ["foundation", "งานฐานราก"],
    ["architecture", "ออกแบบอาคาร"],
    ["home_repair_service", "กล่องเครื่องมือ"],
    ["forklift", "รถยก"],
    ["fire_extinguisher", "ถังดับเพลิง"],
    ["layers", "ชั้นวัสดุ"],
    ["square_foot", "วัดพื้นที่"],
    ["warehouse", "โกดัง"],
    ["factory", "โรงงาน"],
    ["precision_manufacturing", "เครื่องจักร"],
    ["build", "ประแจ"],
    ["sensors", "งานระบบ"],
    ],
  },
  {
    key: "transport", label: "เดินทางและยานพาหนะ", cover: "directions_car",
    items: [
    ["directions_car", "รถยนต์"],
    ["two_wheeler", "มอเตอร์ไซค์"],
    ["local_gas_station", "ปั๊มน้ำมัน"],
    ["ev_station", "ชาร์จรถไฟฟ้า"],
    ["local_taxi", "แท็กซี่"],
    ["directions_bus", "รถเมล์"],
    ["train", "รถไฟ"],
    ["subway", "รถไฟฟ้า"],
    ["flight", "เครื่องบิน"],
    ["directions_boat", "เรือ"],
    ["pedal_bike", "จักรยาน"],
    ["local_parking", "ที่จอดรถ"],
    ["car_repair", "ซ่อมรถ"],
    ["car_rental", "เช่ารถ"],
    ["toll", "ทางด่วน"],
    ["traffic", "การจราจร"],
    ["moped", "ส่งของ"],
    ["airport_shuttle", "รถตู้"],
    ["route", "เส้นทาง"],
    ["speed", "ความเร็ว"],
    ],
  },
  {
    key: "bills", label: "ค่าบ้านค่าบิล", cover: "bolt",
    items: [
    ["bolt", "ค่าไฟ"],
    ["water_drop", "ค่าน้ำ"],
    ["wifi", "ค่าอินเทอร์เน็ต"],
    ["router", "เราเตอร์"],
    ["mobile", "ค่าโทรศัพท์"],
    ["tv", "ค่าทีวี"],
    ["local_fire_department", "ค่าแก๊ส"],
    ["propane_tank", "ถังแก๊ส"],
    ["description", "ใบแจ้งหนี้"],
    ["gavel", "ค่าปรับ"],
    ["assured_workload", "ภาษี"],
    ["subscriptions", "ค่าสมาชิกรายเดือน"],
    ["sim_card", "แพ็กเกจซิม"],
    ["lightbulb", "หลอดไฟ"],
    ["ac_unit", "ค่าแอร์"],
    ["delete", "ค่าขยะ"],
    ["shield", "ค่าประกัน"],
    ["health_and_safety", "ประกันสังคม"],
    ["event_repeat", "รายการรายเดือน"],
    ["schedule", "ครบกำหนด"],
    ],
  },
  {
    key: "health", label: "สุขภาพ", cover: "local_hospital",
    items: [
    ["local_hospital", "โรงพยาบาล"],
    ["medical_services", "ค่ารักษา"],
    ["medication", "ค่ายา"],
    ["vaccines", "วัคซีน"],
    ["monitor_heart", "ตรวจสุขภาพ"],
    ["favorite", "หัวใจ"],
    ["fitness_center", "ฟิตเนส"],
    ["self_improvement", "โยคะ"],
    ["directions_run", "วิ่ง"],
    ["sports_soccer", "กีฬา"],
    ["spa", "สปา"],
    ["dentistry", "ทำฟัน"],
    ["visibility", "ตรวจสายตา"],
    ["psychology", "สุขภาพจิต"],
    ["healing", "รักษาแผล"],
    ["emergency", "ฉุกเฉิน"],
    ["bloodtype", "ตรวจเลือด"],
    ["ecg_heart", "คลื่นหัวใจ"],
    ],
  },
  {
    key: "education", label: "การศึกษา", cover: "school",
    items: [
    ["school", "โรงเรียน"],
    ["menu_book", "หนังสือเรียน"],
    ["book", "หนังสือ"],
    ["auto_stories", "อ่านหนังสือ"],
    ["backpack", "กระเป๋านักเรียน"],
    ["science", "วิทยาศาสตร์"],
    ["translate", "ภาษา"],
    ["workspace_premium", "ประกาศนียบัตร"],
    ["quiz", "แบบทดสอบ"],
    ["draw", "วาดรูป"],
    ["history_edu", "ประวัติศาสตร์"],
    ["biotech", "ห้องแล็บ"],
    ["cast_for_education", "เรียนออนไลน์"],
    ["edit", "เครื่องเขียน"],
    ["library_books", "ห้องสมุด"],
    ],
  },
  {
    key: "work", label: "ธุรกิจและงาน", cover: "work",
    items: [
    ["work", "งาน"],
    ["badge", "บัตรพนักงาน"],
    ["groups", "ทีมงาน"],
    ["person", "บุคคล"],
    ["business_center", "ธุรกิจ"],
    ["corporate_fare", "บริษัท"],
    ["assignment", "งานที่ได้รับ"],
    ["task_alt", "งานเสร็จ"],
    ["event_note", "นัดหมาย"],
    ["campaign", "ประชาสัมพันธ์"],
    ["ads_click", "ค่าโฆษณา"],
    ["support_agent", "ฝ่ายบริการ"],
    ["call", "โทรติดต่อ"],
    ["mail", "อีเมล"],
    ["print", "ค่าปริ้น"],
    ["folder", "แฟ้มงาน"],
    ["query_stats", "วิเคราะห์ข้อมูล"],
    ["bar_chart", "กราฟ"],
    ["inventory", "เช็กสต๊อก"],
    ["fact_check", "ตรวจเอกสาร"],
    ],
  },
  {
    key: "fun", label: "บันเทิงและไลฟ์สไตล์", cover: "sports_esports",
    items: [
    ["sports_esports", "เกม"],
    ["movie", "ภาพยนตร์"],
    ["theaters", "โรงหนัง"],
    ["music_note", "ดนตรี"],
    ["headphones", "หูฟัง"],
    ["mic", "ร้องเพลง"],
    ["celebration", "งานฉลอง"],
    ["sports_bar", "ปาร์ตี้"],
    ["photo_camera", "ถ่ายรูป"],
    ["palette", "งานศิลปะ"],
    ["park", "สวนสาธารณะ"],
    ["festival", "เทศกาล"],
    ["confirmation_number", "ตั๋ว"],
    ["stadium", "สนามกีฬา"],
    ["nightlife", "กลางคืน"],
    ["videogame_asset", "อุปกรณ์เกม"],
    ["live_tv", "ดูสด"],
    ["smart_display", "สตรีมมิ่ง"],
    ["content_cut", "ตัดผม"],
    ["checkroom", "เสื้อผ้า"],
    ],
  },
  {
    key: "family", label: "ครอบครัวและสัตว์เลี้ยง", cover: "pets",
    items: [
    ["pets", "สัตว์เลี้ยง"],
    ["family_restroom", "ครอบครัว"],
    ["child_care", "เด็กเล็ก"],
    ["stroller", "รถเข็นเด็ก"],
    ["volunteer_activism", "บริจาค"],
    ["diversity_3", "ชุมชน"],
    ["elderly", "ผู้สูงอายุ"],
    ["pregnant_woman", "ตั้งครรภ์"],
    ["toys", "ของเล่น"],
    ["woman", "ผู้หญิง"],
    ["man", "ผู้ชาย"],
    ["face", "ใบหน้า"],
    ["crib", "เตียงเด็ก"],
    ["sound_detection_dog_barking", "สุนัข"],
    ],
  },
  {
    key: "tech", label: "เทคโนโลยี", cover: "computer",
    items: [
    ["computer", "คอมพิวเตอร์"],
    ["laptop_mac", "โน้ตบุ๊ก"],
    ["devices", "อุปกรณ์"],
    ["keyboard", "คีย์บอร์ด"],
    ["mouse", "เมาส์"],
    ["memory", "ชิป"],
    ["storage", "พื้นที่เก็บข้อมูล"],
    ["cloud", "คลาวด์"],
    ["cloud_upload", "สำรองข้อมูล"],
    ["code", "เขียนโปรแกรม"],
    ["terminal", "เทอร์มินัล"],
    ["dns", "เซิร์ฟเวอร์"],
    ["security", "ความปลอดภัย"],
    ["vpn_key", "ไลเซนส์"],
    ["headset_mic", "เฮดเซ็ต"],
    ["cable", "สายอุปกรณ์"],
    ["battery_charging_full", "แบตเตอรี่"],
    ["usb", "ยูเอสบี"],
    ["smart_toy", "เอไอ"],
    ["print_connect", "เครื่องพิมพ์"],
    ],
  },
  {
    key: "travel", label: "ท่องเที่ยว", cover: "luggage",
    items: [
    ["luggage", "กระเป๋าเดินทาง"],
    ["flight_takeoff", "ขึ้นเครื่อง"],
    ["hotel", "โรงแรม"],
    ["beach_access", "ทะเล"],
    ["hiking", "เดินป่า"],
    ["map", "แผนที่"],
    ["location_on", "สถานที่"],
    ["explore", "สำรวจ"],
    ["cabin", "บ้านพักตากอากาศ"],
    ["public", "ต่างประเทศ"],
    ["tour", "ทัวร์"],
    ["landscape", "ธรรมชาติ"],
    ["surfing", "กิจกรรมทางน้ำ"],
    ["downhill_skiing", "เล่นสกี"],
    ["temple_buddhist", "วัด"],
    ["mosque", "มัสยิด"],
    ["church", "โบสถ์"],
    ["castle", "ปราสาท"],
    ],
  },
  {
    key: "misc", label: "ทั่วไป", cover: "label",
    items: [
    ["label", "ป้ายกำกับ"],
    ["star", "ดาว"],
    ["bookmark", "คั่นหน้า"],
    ["flag", "ธง"],
    ["keep", "ปักหมุด"],
    ["more_horiz", "อื่นๆ"],
    ["help", "ไม่ระบุ"],
    ["info", "ข้อมูล"],
    ["warning", "เตือน"],
    ["check_circle", "เสร็จแล้ว"],
    ["cancel", "ยกเลิก"],
    ["calendar_month", "ปฏิทิน"],
    ["autorenew", "วนซ้ำ"],
    ["sync", "ซิงก์"],
    ["swap_horiz", "โอนย้าย"],
    ["north_east", "เงินออก"],
    ["south_west", "เงินเข้า"],
    ["lock", "ล็อก"],
    ["settings", "ตั้งค่า"],
    ["folder_open", "เปิดแฟ้ม"],
    ["sticky_note_2", "โน้ต"],
    ["group_work", "กลุ่มรวม"],
    ],
  },
]

/** โลโก้แบรนด์ — [ชื่อไฟล์, ชื่อแสดง, สีประจำแบรนด์] */
export const BRAND_ICONS = [
  ["line", "LINE", "#00C300"],
  ["facebook", "Facebook", "#0866FF"],
  ["messenger", "Messenger", "#0866FF"],
  ["instagram", "Instagram", "#FF0069"],
  ["x", "X (Twitter)", "#000000"],
  ["tiktok", "TikTok", "#000000"],
  ["youtube", "YouTube", "#FF0000"],
  ["whatsapp", "WhatsApp", "#25D366"],
  ["telegram", "Telegram", "#26A5E4"],
  ["discord", "Discord", "#5865F2"],
  ["reddit", "Reddit", "#FF4500"],
  ["pinterest", "Pinterest", "#BD081C"],
  ["snapchat", "Snapchat", "#FFFC00"],
  ["twitch", "Twitch", "#9146FF"],
  ["shopee", "Shopee", "#EE4D2D"],
  ["grab", "Grab", "#00B14F"],
  ["aliexpress", "AliExpress", "#FF4747"],
  ["ebay", "eBay", "#E53238"],
  ["airbnb", "Airbnb", "#FF5A5F"],
  ["uber", "Uber", "#000000"],
  ["google", "Google", "#4285F4"],
  ["gmail", "Gmail", "#EA4335"],
  ["googlemaps", "Google Maps", "#4285F4"],
  ["googledrive", "Google Drive", "#4285F4"],
  ["googleplay", "Google Play", "#414141"],
  ["apple", "Apple", "#000000"],
  ["netflix", "Netflix", "#E50914"],
  ["spotify", "Spotify", "#1ED760"],
  ["figma", "Figma", "#F24E1E"],
  ["github", "GitHub", "#181717"],
  ["notion", "Notion", "#000000"],
  ["dropbox", "Dropbox", "#0061FF"],
  ["zoom", "Zoom", "#0B5CFF"],
  ["paypal", "PayPal", "#002991"],
  ["visa", "Visa", "#1A1F71"],
  ["mastercard", "Mastercard", "#EB001B"],
  ["claude", "Claude", "#D97757"],
  ["steam", "Steam", "#000000"],
  ["playstation", "PlayStation", "#0070D1"],
  ["shell", "Shell", "#FFD500"],
  ["toyota", "Toyota", "#EB0A1E"],
  ["honda", "Honda", "#E40521"],
  ["tesla", "Tesla", "#CC0000"],
  ["ikea", "IKEA", "#0058A3"],
  ["starbucks", "Starbucks", "#006241"],
  ["mcdonalds", "McDonalds", "#FBC817"],
]

/** โลโก้ธนาคารไทย ใช้ไฟล์ชุดเดิมที่ public/bank-logos — [รหัส, ชื่อธนาคาร, สีประจำธนาคาร] */
export const BANK_ICONS = [
  ["kbank", "กสิกรไทย", "#138f2d"],
  ["scb", "ไทยพาณิชย์", "#4e2e7f"],
  ["bbl", "กรุงเทพ", "#1e4598"],
  ["ktb", "กรุงไทย", "#1ba5e1"],
  ["bay", "กรุงศรีอยุธยา", "#fec43b"],
  ["ttb", "ทหารไทยธนชาต", "#1279be"],
  ["gsb", "ออมสิน", "#eb198d"],
  ["baac", "ธ.ก.ส.", "#4b9b1d"],
  ["ghb", "อาคารสงเคราะห์", "#f57d23"],
  ["kk", "เกียรตินาคินภัทร", "#199cc5"],
  ["tisco", "ทิสโก้", "#12549f"],
  ["cimb", "ซีไอเอ็มบี ไทย", "#7e2f36"],
  ["uob", "ยูโอบี", "#0b3979"],
  ["lhb", "แลนด์ แอนด์ เฮ้าส์", "#6d6e71"],
  ["tcrb", "ไทยเครดิต", "#0a4ab3"],
  ["ibank", "อิสลามแห่งประเทศไทย", "#184615"],
  ["icbc", "ไอซีบีซี (ไทย)", "#c50f1c"],
  ["citi", "ซิตี้แบงก์", "#1583c7"],
  ["sc", "สแตนดาร์ดชาร์เตอร์ด", "#0f6ea1"],
]

/** ชื่อไอคอน → โฟลเดอร์ที่เก็บ ใช้ประกอบเป็น path ตอนแสดงผล */
const GROUP_OF = Object.fromEntries(
  ICON_GROUPS.flatMap((g) => g.items.map(([name]) => [name, g.key])),
)

/**
 * แปลงค่าที่เก็บในฐานข้อมูลเป็น URL ของไฟล์ SVG
 * คืน null ถ้าค่าว่างหรือชี้ไปยังไอคอนที่ถูกถอดออกจากชุดไปแล้ว
 * ตัวเรียกต้องรองรับ null เสมอ เพราะข้อมูลเก่าอาจอ้างไอคอนที่ไม่มีอยู่แล้ว
 */
export function iconUrl(value) {
  if (!value || typeof value !== 'string') return null
  const [kind, name] = value.split(':')
  if (!name) return null
  if (kind === 'bank') return `bank-logos/${name}.svg`
  if (kind === 'brand') return `icons/brand/${name}.svg`
  if (kind === 'ms') {
    const group = GROUP_OF[name]
    return group ? `icons/${group}/${name}.svg` : null
  }
  return null
}

/** สีประจำแบรนด์/ธนาคารของค่านั้น — ไอคอนทั่วไปคืน null (ใช้สีตามบริบทที่วาง) */
export function iconBrandColor(value) {
  if (!value || typeof value !== 'string') return null
  const [kind, name] = value.split(':')
  if (kind === 'brand') return BRAND_ICONS.find((b) => b[0] === name)?.[2] ?? null
  if (kind === 'bank') return BANK_ICONS.find((b) => b[0] === name)?.[2] ?? null
  return null
}

/** ชื่อไทยของไอคอน ใช้เป็น tooltip และข้อความบอกว่าเลือกอะไรอยู่ */
export function iconLabel(value) {
  if (!value || typeof value !== 'string') return ''
  const [kind, name] = value.split(':')
  if (kind === 'brand') return BRAND_ICONS.find((b) => b[0] === name)?.[1] ?? name
  if (kind === 'bank') return BANK_ICONS.find((b) => b[0] === name)?.[1] ?? name
  for (const g of ICON_GROUPS) {
    const hit = g.items.find(([n]) => n === name)
    if (hit) return hit[1]
  }
  return name ?? ''
}

/** จำนวนไอคอนทั้งหมดในชุด ใช้แสดงในหน้าตั้งค่า */
export const ICON_TOTAL =
  ICON_GROUPS.reduce((s, g) => s + g.items.length, 0) + BRAND_ICONS.length + BANK_ICONS.length
