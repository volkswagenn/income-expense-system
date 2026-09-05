/**
 * รายชื่อไอคอนที่คัดมาใช้ในแอป — ไฟล์ต้นทางของ scripts/build-icons.mjs
 *
 * ทำไมต้องคัด ไม่ยกมาทั้งชุด
 *   ชุดต้นทางมีเกือบ 4,000 ไอคอน ถ้าเอามาหมดคนเลือกจะหาไม่เจอ และซ้ำซ้อนกันเอง
 *   (ไอคอนบ้านมี 6 แบบ) จึงคัดเหลือกลุ่มละ ~20 ตัวที่ใช้จริงกับการบันทึกเงิน
 *
 * ทำไมทุกตัวต้องมีชื่อไทย
 *   คนใช้ค้นว่า "ค่าไฟ" ไม่ได้ค้นว่า "bolt" ชื่อไทยคือสิ่งที่ทำให้ช่องค้นหาใช้ได้จริง
 *
 * แก้ไฟล์นี้แล้วต้องรัน `npm run icons` เพื่อสร้าง SVG กับ src/lib/iconCatalog.js ใหม่
 */

/** ไอคอนทั่วไป — Material Symbols Rounded (Apache-2.0) แบบทึบ */
export const GROUPS = [
  {
    key: 'finance', label: 'การเงิน', cover: 'payments', color: '#12795B',
    items: [
      ['payments', 'ชำระเงิน'], ['wallet', 'กระเป๋าเงิน'], ['savings', 'เงินออม'],
      ['account_balance', 'ธนาคาร'], ['credit_card', 'บัตรเครดิต'], ['currency_exchange', 'แลกเปลี่ยนเงิน'],
      ['request_quote', 'ใบเสนอราคา'], ['receipt_long', 'ใบเสร็จ'], ['attach_money', 'เงิน'],
      ['price_change', 'ราคาเปลี่ยน'], ['trending_up', 'กำไร'], ['trending_down', 'ขาดทุน'],
      ['account_balance_wallet', 'บัญชีเงิน'], ['paid', 'จ่ายแล้ว'], ['sell', 'ขายของ'],
      ['redeem', 'แต้มสะสม'], ['universal_currency', 'ธนบัตร'], ['point_of_sale', 'เครื่องคิดเงิน'],
      ['calculate', 'คำนวณ'], ['percent', 'ดอกเบี้ย'], ['universal_currency_alt', 'สกุลเงิน'],
      ['handshake', 'ดีลธุรกิจ'],
    ],
  },
  {
    key: 'food', label: 'อาหารและเครื่องดื่ม', cover: 'restaurant', color: '#E06A1F',
    items: [
      ['restaurant', 'ร้านอาหาร'], ['lunch_dining', 'เบอร์เกอร์'], ['ramen_dining', 'ก๋วยเตี๋ยว'],
      ['rice_bowl', 'ข้าว'], ['local_cafe', 'กาแฟ'], ['local_bar', 'เครื่องดื่มแอลกอฮอล์'],
      ['local_pizza', 'พิซซ่า'], ['bakery_dining', 'เบเกอรี่'], ['icecream', 'ไอศกรีม'],
      ['egg', 'ไข่'], ['set_meal', 'อาหารชุด'], ['kebab_dining', 'ปิ้งย่าง'],
      ['brunch_dining', 'มื้อสาย'], ['liquor', 'เหล้า'], ['local_dining', 'ช้อนส้อม'],
      ['fastfood', 'ฟาสต์ฟู้ด'], ['cake', 'เค้ก'], ['coffee', 'กาแฟแก้ว'],
      ['takeout_dining', 'อาหารกล่อง'], ['local_drink', 'น้ำดื่ม'], ['nutrition', 'โภชนาการ'],
      ['grocery', 'ของสด'],
    ],
  },
  {
    key: 'shopping', label: 'ช้อปปิ้ง', cover: 'shopping_cart', color: '#D0483C',
    items: [
      ['shopping_cart', 'ตะกร้าสินค้า'], ['shopping_bag', 'ถุงช้อปปิ้ง'], ['storefront', 'หน้าร้าน'],
      ['local_convenience_store', 'ร้านสะดวกซื้อ'], ['local_mall', 'ห้างสรรพสินค้า'], ['label_important', 'ป้ายโปรโมชัน'],
      ['inventory_2', 'สต๊อกสินค้า'], ['package_2', 'พัสดุ'], ['local_shipping', 'ขนส่ง'],
      ['qr_code_scanner', 'สแกนจ่าย'], ['loyalty', 'บัตรสมาชิก'], ['percent_discount', 'ส่วนลด'],
      ['shopping_basket', 'ตะกร้า'], ['category', 'หมวดสินค้า'], ['barcode', 'บาร์โค้ด'],
      ['store', 'ร้านค้า'], ['add_shopping_cart', 'เพิ่มลงตะกร้า'], ['receipt', 'ใบเสร็จรับเงิน'],
    ],
  },
  {
    key: 'home', label: 'บ้านและที่พัก', cover: 'home', color: '#2F8F6B',
    items: [
      ['home', 'บ้าน'], ['apartment', 'คอนโด'], ['house', 'บ้านเดี่ยว'],
      ['villa', 'บ้านพัก'], ['bed', 'ห้องนอน'], ['chair', 'เฟอร์นิเจอร์'],
      ['weekend', 'โซฟา'], ['kitchen', 'ห้องครัว'], ['bathtub', 'ห้องน้ำ'],
      ['local_laundry_service', 'ซักผ้า'], ['cleaning_services', 'ทำความสะอาด'], ['yard', 'สนามหญ้า'],
      ['door_front', 'ประตูบ้าน'], ['key', 'ค่าเช่า'], ['meeting_room', 'ห้องเช่า'],
      ['garage', 'โรงรถ'], ['roofing', 'หลังคา'], ['table_restaurant', 'โต๊ะ'],
      ['light', 'โคมไฟ'], ['countertops', 'เคาน์เตอร์'],
    ],
  },
  {
    key: 'build', label: 'ก่อสร้างและซ่อมแซม', cover: 'construction', color: '#8A6A15',
    items: [
      ['construction', 'ก่อสร้าง'], ['handyman', 'ช่างซ่อม'], ['engineering', 'วิศวกรรม'],
      ['hardware', 'เครื่องมือช่าง'], ['carpenter', 'งานไม้'], ['plumbing', 'งานประปา'],
      ['electrical_services', 'งานไฟฟ้า'], ['format_paint', 'สีทาบ้าน'], ['foundation', 'งานฐานราก'],
      ['architecture', 'ออกแบบอาคาร'], ['home_repair_service', 'กล่องเครื่องมือ'], ['forklift', 'รถยก'],
      ['fire_extinguisher', 'ถังดับเพลิง'], ['layers', 'ชั้นวัสดุ'], ['square_foot', 'วัดพื้นที่'],
      ['warehouse', 'โกดัง'], ['factory', 'โรงงาน'], ['precision_manufacturing', 'เครื่องจักร'],
      ['build', 'ประแจ'], ['sensors', 'งานระบบ'],
    ],
  },
  {
    key: 'transport', label: 'เดินทางและยานพาหนะ', cover: 'directions_car', color: '#3A55C4',
    items: [
      ['directions_car', 'รถยนต์'], ['two_wheeler', 'มอเตอร์ไซค์'], ['local_gas_station', 'ปั๊มน้ำมัน'],
      ['ev_station', 'ชาร์จรถไฟฟ้า'], ['local_taxi', 'แท็กซี่'], ['directions_bus', 'รถเมล์'],
      ['train', 'รถไฟ'], ['subway', 'รถไฟฟ้า'], ['flight', 'เครื่องบิน'],
      ['directions_boat', 'เรือ'], ['pedal_bike', 'จักรยาน'], ['local_parking', 'ที่จอดรถ'],
      ['car_repair', 'ซ่อมรถ'], ['car_rental', 'เช่ารถ'], ['toll', 'ทางด่วน'],
      ['traffic', 'การจราจร'], ['moped', 'ส่งของ'], ['airport_shuttle', 'รถตู้'],
      ['route', 'เส้นทาง'], ['speed', 'ความเร็ว'],
    ],
  },
  {
    key: 'bills', label: 'ค่าบ้านค่าบิล', cover: 'bolt', color: '#A8760B',
    items: [
      ['bolt', 'ค่าไฟ'], ['water_drop', 'ค่าน้ำ'], ['wifi', 'ค่าอินเทอร์เน็ต'],
      ['router', 'เราเตอร์'], ['mobile', 'ค่าโทรศัพท์'], ['tv', 'ค่าทีวี'],
      ['local_fire_department', 'ค่าแก๊ส'], ['propane_tank', 'ถังแก๊ส'], ['description', 'ใบแจ้งหนี้'],
      ['gavel', 'ค่าปรับ'], ['assured_workload', 'ภาษี'], ['subscriptions', 'ค่าสมาชิกรายเดือน'],
      ['sim_card', 'แพ็กเกจซิม'], ['lightbulb', 'หลอดไฟ'], ['ac_unit', 'ค่าแอร์'],
      ['delete', 'ค่าขยะ'], ['shield', 'ค่าประกัน'], ['health_and_safety', 'ประกันสังคม'],
      ['event_repeat', 'รายการรายเดือน'], ['schedule', 'ครบกำหนด'],
    ],
  },
  {
    key: 'health', label: 'สุขภาพ', cover: 'local_hospital', color: '#D9436F',
    items: [
      ['local_hospital', 'โรงพยาบาล'], ['medical_services', 'ค่ารักษา'], ['medication', 'ค่ายา'],
      ['vaccines', 'วัคซีน'], ['monitor_heart', 'ตรวจสุขภาพ'], ['favorite', 'หัวใจ'],
      ['fitness_center', 'ฟิตเนส'], ['self_improvement', 'โยคะ'], ['directions_run', 'วิ่ง'],
      ['sports_soccer', 'กีฬา'], ['spa', 'สปา'], ['dentistry', 'ทำฟัน'],
      ['visibility', 'ตรวจสายตา'], ['psychology', 'สุขภาพจิต'], ['healing', 'รักษาแผล'],
      ['emergency', 'ฉุกเฉิน'], ['bloodtype', 'ตรวจเลือด'], ['ecg_heart', 'คลื่นหัวใจ'],
    ],
  },
  {
    key: 'education', label: 'การศึกษา', cover: 'school', color: '#5E44A0',
    items: [
      ['school', 'โรงเรียน'], ['menu_book', 'หนังสือเรียน'], ['book', 'หนังสือ'],
      ['auto_stories', 'อ่านหนังสือ'], ['backpack', 'กระเป๋านักเรียน'], ['science', 'วิทยาศาสตร์'],
      ['translate', 'ภาษา'], ['workspace_premium', 'ประกาศนียบัตร'], ['quiz', 'แบบทดสอบ'],
      ['draw', 'วาดรูป'], ['history_edu', 'ประวัติศาสตร์'], ['biotech', 'ห้องแล็บ'],
      ['cast_for_education', 'เรียนออนไลน์'], ['edit', 'เครื่องเขียน'], ['library_books', 'ห้องสมุด'],
    ],
  },
  {
    key: 'work', label: 'ธุรกิจและงาน', cover: 'work', color: '#2A6A8A',
    items: [
      ['work', 'งาน'], ['badge', 'บัตรพนักงาน'], ['groups', 'ทีมงาน'],
      ['person', 'บุคคล'], ['business_center', 'ธุรกิจ'], ['corporate_fare', 'บริษัท'],
      ['assignment', 'งานที่ได้รับ'], ['task_alt', 'งานเสร็จ'], ['event_note', 'นัดหมาย'],
      ['campaign', 'ประชาสัมพันธ์'], ['ads_click', 'ค่าโฆษณา'], ['support_agent', 'ฝ่ายบริการ'],
      ['call', 'โทรติดต่อ'], ['mail', 'อีเมล'], ['print', 'ค่าปริ้น'],
      ['folder', 'แฟ้มงาน'], ['query_stats', 'วิเคราะห์ข้อมูล'], ['bar_chart', 'กราฟ'],
      ['inventory', 'เช็กสต๊อก'], ['fact_check', 'ตรวจเอกสาร'],
    ],
  },
  {
    key: 'fun', label: 'บันเทิงและไลฟ์สไตล์', cover: 'sports_esports', color: '#B3335C',
    items: [
      ['sports_esports', 'เกม'], ['movie', 'ภาพยนตร์'], ['theaters', 'โรงหนัง'],
      ['music_note', 'ดนตรี'], ['headphones', 'หูฟัง'], ['mic', 'ร้องเพลง'],
      ['celebration', 'งานฉลอง'], ['sports_bar', 'ปาร์ตี้'], ['photo_camera', 'ถ่ายรูป'],
      ['palette', 'งานศิลปะ'], ['park', 'สวนสาธารณะ'], ['festival', 'เทศกาล'],
      ['confirmation_number', 'ตั๋ว'], ['stadium', 'สนามกีฬา'], ['nightlife', 'กลางคืน'],
      ['videogame_asset', 'อุปกรณ์เกม'], ['live_tv', 'ดูสด'], ['smart_display', 'สตรีมมิ่ง'],
      ['content_cut', 'ตัดผม'], ['checkroom', 'เสื้อผ้า'],
    ],
  },
  {
    key: 'family', label: 'ครอบครัวและสัตว์เลี้ยง', cover: 'pets', color: '#C2571F',
    items: [
      ['pets', 'สัตว์เลี้ยง'], ['family_restroom', 'ครอบครัว'], ['child_care', 'เด็กเล็ก'],
      ['stroller', 'รถเข็นเด็ก'], ['volunteer_activism', 'บริจาค'], ['diversity_3', 'ชุมชน'],
      ['elderly', 'ผู้สูงอายุ'], ['pregnant_woman', 'ตั้งครรภ์'], ['toys', 'ของเล่น'],
      ['woman', 'ผู้หญิง'], ['man', 'ผู้ชาย'], ['face', 'ใบหน้า'],
      ['crib', 'เตียงเด็ก'], ['sound_detection_dog_barking', 'สุนัข'],
    ],
  },
  {
    key: 'tech', label: 'เทคโนโลยี', cover: 'computer', color: '#4A5568',
    items: [
      ['computer', 'คอมพิวเตอร์'], ['laptop_mac', 'โน้ตบุ๊ก'], ['devices', 'อุปกรณ์'],
      ['keyboard', 'คีย์บอร์ด'], ['mouse', 'เมาส์'], ['memory', 'ชิป'],
      ['storage', 'พื้นที่เก็บข้อมูล'], ['cloud', 'คลาวด์'], ['cloud_upload', 'สำรองข้อมูล'],
      ['code', 'เขียนโปรแกรม'], ['terminal', 'เทอร์มินัล'], ['dns', 'เซิร์ฟเวอร์'],
      ['security', 'ความปลอดภัย'], ['vpn_key', 'ไลเซนส์'], ['headset_mic', 'เฮดเซ็ต'],
      ['cable', 'สายอุปกรณ์'], ['battery_charging_full', 'แบตเตอรี่'], ['usb', 'ยูเอสบี'],
      ['smart_toy', 'เอไอ'], ['print_connect', 'เครื่องพิมพ์'],
    ],
  },
  {
    key: 'travel', label: 'ท่องเที่ยว', cover: 'luggage', color: '#0E8AA8',
    items: [
      ['luggage', 'กระเป๋าเดินทาง'], ['flight_takeoff', 'ขึ้นเครื่อง'], ['hotel', 'โรงแรม'],
      ['beach_access', 'ทะเล'], ['hiking', 'เดินป่า'], ['map', 'แผนที่'],
      ['location_on', 'สถานที่'], ['explore', 'สำรวจ'], ['cabin', 'บ้านพักตากอากาศ'],
      ['public', 'ต่างประเทศ'], ['tour', 'ทัวร์'], ['landscape', 'ธรรมชาติ'],
      ['surfing', 'กิจกรรมทางน้ำ'], ['downhill_skiing', 'เล่นสกี'], ['temple_buddhist', 'วัด'],
      ['mosque', 'มัสยิด'], ['church', 'โบสถ์'], ['castle', 'ปราสาท'],
    ],
  },
  {
    key: 'misc', label: 'ทั่วไป', cover: 'label', color: '#7A7F87',
    items: [
      ['label', 'ป้ายกำกับ'], ['star', 'ดาว'], ['bookmark', 'คั่นหน้า'],
      ['flag', 'ธง'], ['keep', 'ปักหมุด'], ['more_horiz', 'อื่นๆ'],
      ['help', 'ไม่ระบุ'], ['info', 'ข้อมูล'], ['warning', 'เตือน'],
      ['check_circle', 'เสร็จแล้ว'], ['cancel', 'ยกเลิก'], ['calendar_month', 'ปฏิทิน'],
      ['autorenew', 'วนซ้ำ'], ['sync', 'ซิงก์'], ['swap_horiz', 'โอนย้าย'],
      ['north_east', 'เงินออก'], ['south_west', 'เงินเข้า'], ['lock', 'ล็อก'],
      ['settings', 'ตั้งค่า'], ['folder_open', 'เปิดแฟ้ม'], ['sticky_note_2', 'โน้ต'],
      ['group_work', 'กลุ่มรวม'],
    ],
  },
]

/**
 * โลโก้แบรนด์ — Simple Icons (สัญญาอนุญาต CC0)
 * ตัวโลโก้ยังเป็นเครื่องหมายการค้าของเจ้าของ ใช้เพื่อบ่งชี้ว่าเป็นบริการไหนเท่านั้น
 */
export const BRANDS = [
  ['line', 'LINE'], ['facebook', 'Facebook'], ['messenger', 'Messenger'],
  ['instagram', 'Instagram'], ['x', 'X (Twitter)'], ['tiktok', 'TikTok'],
  ['youtube', 'YouTube'], ['whatsapp', 'WhatsApp'],
  ['telegram', 'Telegram'], ['discord', 'Discord'], ['reddit', 'Reddit'],
  ['pinterest', 'Pinterest'], ['snapchat', 'Snapchat'], ['twitch', 'Twitch'],
  ['shopee', 'Shopee'], ['grab', 'Grab'],
  ['aliexpress', 'AliExpress'], ['ebay', 'eBay'],
  ['airbnb', 'Airbnb'], ['uber', 'Uber'],
  ['google', 'Google'], ['gmail', 'Gmail'], ['googlemaps', 'Google Maps'],
  ['googledrive', 'Google Drive'], ['googleplay', 'Google Play'], ['apple', 'Apple'],
  ['netflix', 'Netflix'], ['spotify', 'Spotify'],
  ['figma', 'Figma'],
  ['github', 'GitHub'], ['notion', 'Notion'], ['dropbox', 'Dropbox'],
  ['zoom', 'Zoom'], ['paypal', 'PayPal'],
  ['visa', 'Visa'], ['mastercard', 'Mastercard'],
  // บัตรและช่องทางจ่ายเงิน — เพิ่มภายหลัง ใช้ติดหน้าบัตรเครดิตและกระเป๋าเงินอิเล็กทรอนิกส์
  ['jcb', 'JCB'], ['americanexpress', 'American Express'], ['discover', 'Discover'],
  ['googlepay', 'Google Pay'], ['applepay', 'Apple Pay'], ['samsungpay', 'Samsung Pay'],
  ['alipay', 'Alipay'], ['wechat', 'WeChat Pay'], ['wise', 'Wise'], ['klarna', 'Klarna'],
  // ร้านค้าและบริการที่ร้านใช้บ่อย
  ['foodpanda', 'foodpanda'], ['kfc', 'KFC'], ['burgerking', 'Burger King'],
  ['cocacola', 'Coca-Cola'], ['unilever', 'Unilever'],
  // ขนส่งและเครื่องมือทำร้าน
  ['dhl', 'DHL'], ['fedex', 'FedEx'], ['ups', 'UPS'],
  ['shopify', 'Shopify'], ['woocommerce', 'WooCommerce'], ['stripe', 'Stripe'],
  ['xero', 'Xero'], ['quickbooks', 'QuickBooks'], ['wordpress', 'WordPress'],
  ['trello', 'Trello'], ['asana', 'Asana'], ['airtable', 'Airtable'],
  ['claude', 'Claude'], ['steam', 'Steam'], ['playstation', 'PlayStation'],
  ['shell', 'Shell'], ['toyota', 'Toyota'],
  ['honda', 'Honda'], ['tesla', 'Tesla'], ['ikea', 'IKEA'],
  ['starbucks', 'Starbucks'], ['mcdonalds', 'McDonalds'],
]
