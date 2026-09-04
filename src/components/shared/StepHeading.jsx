import Icon from './Icon'

/**
 * หัวข้อของขั้นตอนในฟอร์ม — เลขในวงกลม + ชื่อหัวข้อ + คำอธิบายสั้น
 *
 * ฟอร์มบันทึกรายรับ/รายจ่ายมีหลายส่วนเรียงลงมา ถ้าเป็นหัวข้อตัวหนาเฉยๆ ทุกอันดูเท่ากันหมด
 * คนกรอกครั้งแรกจะไม่รู้ว่าต้องเริ่มตรงไหนและเหลืออะไรอีก เลขในวงกลมบอกลำดับ
 * และสีของวงกลมบอกสถานะ: กรอกแล้ว = เขียวมะนาวติดเครื่องหมายถูก · ที่ต้องทำต่อ = พื้นเข้ม ·
 * ยังไม่ถึง = วงขอบจางๆ จึงกวาดตาครั้งเดียวก็รู้ว่าค้างตรงไหน
 *
 * @param n        เลขลำดับ
 * @param title    ชื่อหัวข้อ
 * @param hint     คำอธิบายสั้นต่อท้าย (ไม่บังคับ)
 * @param done     ส่วนนี้กรอกแล้ว
 * @param current  ส่วนที่ควรทำต่อ (ใช้กับส่วนแรกที่ยังไม่ได้กรอก)
 * @param optional ไม่กรอกก็บันทึกได้ — ขึ้นป้ายกำกับไว้ กันเข้าใจผิดว่าต้องกรอกครบทุกข้อ
 */
export default function StepHeading({ n, title, hint, done = false, current = false, optional = false, className = '' }) {
  const circle = done
    ? 'bg-lime text-ink border-lime'
    : current
      ? 'bg-ink text-white border-ink'
      : 'bg-white text-faint border-hairline'

  return (
    <div className={`flex items-baseline gap-2 mb-2 ${className}`}>
      <span
        className={`w-[21px] h-[21px] flex-none rounded-full border flex items-center justify-center self-center tabular-nums text-[11.5px] font-bold ${circle}`}
      >
        {done ? <Icon name="check" size={14} /> : n}
      </span>
      <span className="text-[12.5px] font-semibold">{title}</span>
      {optional && (
        <span className="flex-none text-[10.5px] text-faint border border-hairline rounded-full px-1.5 py-px self-center">
          ไม่บังคับ
        </span>
      )}
      {hint && <span className="text-[11px] font-normal text-faint min-w-0 truncate">{hint}</span>}
    </div>
  )
}
