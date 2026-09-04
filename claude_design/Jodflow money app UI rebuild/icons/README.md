# ไอคอนของ JodFlow

ชุดไอคอนของระบบ ใช้แทน emoji ทุกจุดในดีไซน์ แก้ไข/เพิ่มไอคอนได้ที่โฟลเดอร์นี้

## กติกาการวาด
- ไฟล์ SVG `width="24" height="24" viewBox="0 0 24 24"` ชื่อไฟล์ kebab-case
- ไฟล์ต้นฉบับใช้ `fill="#16181D"` (สีข้อความหลักของแอป) สีขาวใช้เจาะช่องว่างภายในตัวไอคอนได้
- เส้นหนาอย่างน้อย 1.8px ที่ขนาด 24px เพื่อให้ย่อเหลือ 13–17px ยังอ่านออก

## ไฟล์สีสำรอง (color variants)
ทุกไอคอนมีไฟล์สีพร้อมใช้ ต่อท้ายชื่อไฟล์:

| ต่อท้าย | สี | ใช้เมื่อ |
| --- | --- | --- |
| (ไม่มี) | `#16181D` | บนพื้นขาว/ครีม |
| `-w` | `#FFFFFF` | บนพื้นเข้ม เช่นปุ่มดำ หัวป๊อปอัป |
| `-amber` | `#8A6A15` | ในกล่องเตือนสีเหลือง |
| `-green` | `#0F6A50` | ในกล่องสีเขียว/ยอดรับ |
| `-blue` | `#2E44A6` | ในกล่องสีน้ำเงิน เช่นหักบัญชีอัตโนมัติ |
| `-gray` | `#7A7F87` | ข้อความรองสีเทา |

เพิ่มไอคอนใหม่: วาดไฟล์ต้นฉบับ (`fill="#16181D"`) แล้วก๊อปเป็นไฟล์สีตามตารางข้างบน

## วิธีเรียกใช้ในดีไซน์
ใช้ `<img>` เท่านั้น **ห้ามใช้ CSS mask** — โปรแกรมเรนเดอร์ของ preview ไม่รองรับ `mask-image` กับ SVG ที่ไม่มีขนาดในตัว ไอคอนจะกลายเป็นสี่เหลี่ยมทึบ

```html
<img src="./icons/cash.svg" width="15" height="15" alt="" style="flex:none;display:inline-block;vertical-align:-2px">
```

ถ้าต้องผูกไอคอนกับข้อมูล (เช่นไอคอนของสัญญาหนี้แต่ละใบ) ให้ส่ง path ทาง style hole แล้วใช้ `background-image` แทน — ห้ามใส่ hole ใน `src` เพราะเบราว์เซอร์จะยิงโหลด URL ดิบตอนหน้ายังไม่มีค่า

```html
<span style="width:18px;height:18px;background-image:{{ d.iconUrl }};background-size:contain;background-position:center;background-repeat:no-repeat"></span>
```

## ไอคอนที่มี (28 ตัว × 6 สี)
- `atm`
- `attach`
- `backspace`
- `bank`
- `bell`
- `calendar`
- `camera`
- `car`
- `card`
- `cash`
- `chart`
- `clipboard`
- `edit`
- `folder`
- `fridge`
- `gallery`
- `handshake`
- `heart`
- `hourglass`
- `ledger`
- `note`
- `numpad`
- `pin`
- `plus`
- `receipt`
- `store`
- `trash`
- `warning`

## ไอคอน UI ทั่วไป
ลูกศร ปฏิทิน ค้นหา ตั้งค่า ยังใช้ฟอนต์ Material Symbols Rounded ผ่าน `<span class="mi">` ตามเดิม
โฟลเดอร์นี้มีไว้สำหรับไอคอนเฉพาะของธุรกิจ (เงินสด เงินโอน บัตร หนี้สิน ผ่อน ใบกำกับภาษี ฯลฯ) ที่ต้องออกแบบเองให้เข้ากับแบรนด์
