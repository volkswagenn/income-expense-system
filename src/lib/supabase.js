import { createClient } from '@supabase/supabase-js'

// ค่าทั้งสองตัวถูกฝังลงไฟล์ที่เบราว์เซอร์โหลด = เป็นข้อมูลสาธารณะ ไม่ใช่ความลับ
// ความปลอดภัยจริงอยู่ที่ RLS ใน supabase/policies.sql
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// ล้มตั้งแต่ตอนโหลดไฟล์ พร้อมข้อความที่บอกว่าต้องทำอะไร ดีกว่าปล่อยให้ไป error
// ตอนยิง request แล้วอ่านไม่ออกว่าเกิดจากอะไร
// ค่าที่ยังเป็นตัวอย่างจาก .env.example ให้ถือว่ายังไม่ได้ตั้งค่า ไม่งั้นจะไป error
// ตอนยิง request แล้วขึ้นว่า "ต่อเน็ตไม่ได้" ซึ่งทำให้หลงทาง
const isPlaceholder = (v) => !v || v.includes('xxxxxxxxxxxx') || v === 'eyJhbGciOi...'

/**
 * ตั้งค่ายังไม่ครบหรือเปล่า — ถ้าใช่จะเป็นข้อความบอกวิธีแก้
 *
 * ตั้งใจไม่ throw ตรงนี้ เพราะไฟล์นี้ถูก import ตั้งแต่ตอนแอปเริ่มโหลด
 * ถ้า throw หน้าเว็บจะขาวเปล่าโดยไม่มีอะไรบอก → ให้ AuthGate เอาค่านี้ไปแสดงเป็นหน้าจอแทน
 */
export const configError = (isPlaceholder(url) || isPlaceholder(anonKey))
  ? 'ยังไม่ได้ใส่ค่า Supabase ในไฟล์ .env.local'
  : null

export const supabase = createClient(url || 'https://unset.supabase.co', anonKey || 'unset', {
  auth: {
    persistSession: true,      // ปิดแท็บแล้วเปิดใหม่ยังล็อกอินค้างอยู่
    autoRefreshToken: true,
    // แอปใช้ createHashRouter (URL เป็น /#/dashboard) และเราไม่ได้ใช้ลิงก์จากอีเมล
    // ถ้าเปิดไว้ supabase จะพยายามอ่าน token จาก hash แล้วชนกับ router
    detectSessionInUrl: false,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
})

/**
 * แปลง error จาก Supabase เป็นข้อความไทยที่ผู้ใช้อ่านรู้เรื่อง
 * ใช้ที่ชั้น api/ ทุกที่ เพื่อให้ทั้งแอปแสดงข้อความแนวเดียวกัน
 */
export function toThaiError(error) {
  if (!error) return null
  const msg = error.message ?? String(error)

  if (error.code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return 'ไม่มีสิทธิ์ทำรายการนี้'
  }
  // PGRST204 = ส่งคอลัมน์ที่ตารางยังไม่มี แปลว่าโค้ดใหม่ถูก deploy ไปแล้วแต่ยังไม่ได้
  // อัปเดตโครงสร้างฐานข้อมูล — ข้อความดิบเป็นภาษาอังกฤษที่ผู้ใช้เดาทางแก้ไม่ออกเลย
  if (error.code === 'PGRST204' || /Could not find the .* column|schema cache/i.test(msg)) {
    return 'ฐานข้อมูลยังไม่ได้อัปเดตโครงสร้าง — เปิด Supabase → SQL Editor แล้วรันไฟล์ supabase/update.sql ในแท็บเดิม (เติมของที่ขาดทั้งหมด รันซ้ำได้ ข้อมูลเดิมไม่หาย)'
  }
  if (/Invalid login credentials/i.test(msg)) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
  if (/Email not confirmed/i.test(msg)) return 'บัญชีนี้ยังไม่ได้ยืนยัน ติดต่อเจ้าของร้าน'
  if (/Failed to fetch|NetworkError|fetch failed/i.test(msg)) {
    return 'ต่ออินเทอร์เน็ตไม่ได้ — ระบบนี้ต้องออนไลน์ตลอดเวลา'
  }
  if (/JWT expired|refresh_token_not_found/i.test(msg)) return 'เซสชันหมดอายุ กรุณาล็อกอินใหม่'
  return msg
}

/** ครอบ query ของ supabase ให้ throw เป็นข้อความไทย แทนการคืน { data, error } */
export async function unwrap(promise) {
  const { data, error } = await promise
  if (error) throw new Error(toThaiError(error))
  return data
}
