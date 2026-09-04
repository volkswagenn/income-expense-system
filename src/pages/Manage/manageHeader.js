import { createContext, useContext, useEffect } from 'react'

/**
 * ปุ่ม "เพิ่ม" ของหน้าจัดการข้อมูลอยู่บนหัวการ์ดใบเดียว ไม่ได้อยู่ในเนื้อของแต่ละแท็บ
 *
 * หัวการ์ดเป็นของหน้าแม่ (ชื่อ + คำอธิบาย + ปุ่มเพิ่มสีมะนาว) แต่สิ่งที่ปุ่มต้องทำ
 * รู้กันแค่ในแท็บนั้นๆ (เปิดฟอร์มบัญชี/บัตร/หนี้/หมวดหมู่) แท็บจึงฝากฟังก์ชันไว้กับหน้าแม่
 * แทนที่แต่ละแท็บจะมีหัวข้อกับปุ่มเพิ่มเป็นของตัวเอง ซึ่งทำให้มีหัวข้อซ้อนกันสองชั้น
 */
export const ManageAddContext = createContext(() => {})

/** แท็บเรียกอันนี้เพื่อบอกว่าปุ่มเพิ่มบนหัวการ์ดต้องทำอะไร */
export function useRegisterManageAdd(handler, deps = []) {
  const register = useContext(ManageAddContext)
  useEffect(() => {
    register(handler)
    return () => register(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
