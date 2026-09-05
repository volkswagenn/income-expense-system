import { useState } from 'react'
import Popup from '../../components/shared/Popup'
import Icon from '../../components/shared/Icon'
import { clearShopData, resetShopLedger } from '../../lib/api/settings'
import { hydrateStores } from '../../store/hydrate'
import useLogStore from '../../store/useLogStore'
import { buildLogEntry } from '../../lib/logBuilder'

/**
 * รีเซ็ตข้อมูลของร้าน — สองระดับ
 *
 * ทั้งสองอย่างลบแล้วกู้คืนไม่ได้ จึงบอกให้ครบก่อนว่าอะไรหายอะไรอยู่ แล้วบังคับให้
 * พิมพ์คำยืนยันเอง ไม่ใช้แค่ปุ่ม "ยืนยัน" เพราะปุ่มเดียวกดพลาดได้ แต่การพิมพ์คำ
 * ทำให้ต้องอ่านก่อนว่ากำลังจะล้างระดับไหน
 */
const MODES = {
  ledger: {
    word: 'ล้างรายการ',
    title: 'ล้างรายการเดินบัญชีทั้งหมด',
    lead: 'ลบเงินที่เคลื่อนไหวทั้งหมด แล้วตั้งยอดทุกก้อนเป็น 0 เพื่อเริ่มใส่ใหม่',
    removes: [
      'รายรับ-รายจ่ายทุกรายการ',
      'ค้างชำระ · รอรับเงิน · ใบกำกับภาษี',
      'หนี้สินและงวดผ่อนทั้งหมด',
      'บิลบัตร งวดผ่อนบัตร และการกดเงินสด',
      'งวดของรายการประจำที่ระบบสร้างไว้',
      'การยืมเงินจากกระเป๋าย่อย',
      'ประวัติการใช้งาน',
    ],
    keeps: [
      'หมวดหมู่รายรับ-รายจ่าย',
      'บัญชีธนาคาร (ยอดกลับเป็น 0)',
      'บัตรเครดิต (ยอดหนี้กลับเป็น 0)',
      'กระเป๋าตังค์ย่อย (ยอดกลับเป็น 0)',
      'แม่แบบรายการประจำ · ผู้ขาย · รายการที่บันทึกไว้ · โน้ตปฏิทิน',
    ],
    run: resetShopLedger,
    logType: 'RESET_LEDGER',
    logText: 'ล้างรายการเดินบัญชีทั้งหมด (เก็บหมวดหมู่ บัญชี บัตร)',
    done: 'ล้างรายการเดินบัญชีแล้ว — ยอดทุกก้อนเป็น 0 พร้อมเริ่มใส่ใหม่',
  },
  all: {
    word: 'ล้างทั้งหมด',
    title: 'ล้างข้อมูลทั้งหมด',
    lead: 'กลับไปเป็นร้านที่เพิ่งสร้างใหม่ เหลือแค่บัญชีผู้ใช้กับตัวร้าน',
    removes: [
      'ทุกอย่างในข้อ "ล้างรายการเดินบัญชี"',
      'หมวดหมู่ทั้งหมด',
      'บัญชีธนาคารและบัตรเครดิต',
      'กระเป๋าตังค์ย่อย',
      'แม่แบบรายการประจำ · ผู้ขาย · รายการที่บันทึกไว้ · โน้ตปฏิทิน',
    ],
    keeps: [
      'บัญชีผู้ใช้และรหัสผ่าน (ล็อกอินเข้าร้านเดิมได้)',
      'ตัวร้านและสมาชิกร้าน',
      'หมวดหมู่ "อื่นๆ" รายรับ/รายจ่าย ที่ระบบใส่กลับให้เหมือนร้านเปิดใหม่',
    ],
    run: clearShopData,
    logType: 'RESET_ALL',
    logText: 'ล้างข้อมูลของร้านทั้งหมด',
    done: 'ล้างข้อมูลทั้งหมดแล้ว — ร้านกลับเป็นสถานะเริ่มต้น',
  },
}

function ModeCard({ mode, onPick, disabled }) {
  const m = MODES[mode]
  const danger = mode === 'all'
  return (
    <button
      type="button"
      onClick={() => onPick(mode)}
      disabled={disabled}
      className={`w-full text-left rounded-ctl border px-3.5 py-3 transition disabled:opacity-50 ${
        danger ? 'border-[#F0C4BE] bg-expense-soft/40 hover:border-expense' : 'border-hairline bg-white hover:border-ink'
      }`}
    >
      <span className="flex items-center gap-2">
        {/* ใช้ delete_sweep ทั้งคู่ — ชุดไอคอนที่โหลดมามีเท่าที่อยู่ใน icon_names ของ index.html
            ตัวที่ไม่อยู่ในรายการจะขึ้นเป็นตัวอักษรดิบ ความต่างของสองระดับใช้สีบอกแทน */}
        <Icon name="delete_sweep" size={18} className={danger ? 'text-expense' : 'text-ink'} />
        <span className="text-[13px] font-semibold">{m.title}</span>
        <Icon name="chevron_right" size={18} className="ml-auto text-faint" />
      </span>
      <span className="block text-[11.5px] text-muted leading-relaxed mt-1">{m.lead}</span>
    </button>
  )
}

export default function ResetDataPopup({ isOwner, onClose }) {
  const [mode, setMode] = useState(null)     // null = หน้าเลือก
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const { addLog } = useLogStore()

  const m = mode ? MODES[mode] : null
  const ready = m && typed.trim() === m.word

  const handleRun = async () => {
    if (!ready || busy) return
    setBusy(true); setError(''); setOkMsg('')
    try {
      await m.run()
      // ฐานข้อมูลเพิ่งลบข้อมูลไป ต้องโหลดใหม่ทั้งชุด ไม่งั้นหน้าจอยังโชว์ของเก่าที่ไม่มีแล้ว
      await hydrateStores()
      setOkMsg(m.done)
      setMode(null)
      setTyped('')
      // เขียน log หลังล้าง เพื่อให้มีร่องรอยว่าใครล้างเมื่อไร (log เก่าถูกลบไปแล้ว)
      addLog(buildLogEntry({ activityType: m.logType, description: m.logText }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const back = () => { setMode(null); setTyped(''); setError('') }

  return (
    <Popup
      title={m ? m.title : 'รีเซ็ตข้อมูล'}
      sub={m ? 'อ่านให้ครบก่อนยืนยัน' : 'เลือกระดับที่ต้องการล้าง'}
      icon="delete_sweep"
      headTone="danger"
      width={460}
      onClose={onClose}
      footer={
        // แถบท้ายใช้ขอบในชุดเดียวกับแถบมาตรฐานของ Popup ไม่งั้นปุ่มจะชิดขอบกล่อง
        <div className="flex-none flex items-center gap-2 px-[17px] py-3 border-t border-[#EFEDE7] bg-[#FAF9F6]">
          {m && (
            <button onClick={back} disabled={busy} className="h-[38px] px-4 rounded-[11px] border border-hairline bg-white text-[13px] font-semibold flex items-center gap-1 hover:bg-paper disabled:opacity-50">
              <Icon name="chevron_left" size={17} />
              ย้อนกลับ
            </button>
          )}
          <button onClick={onClose} disabled={busy} className="ml-auto h-[38px] px-4 rounded-[11px] border border-hairline bg-white text-[13px] font-semibold hover:bg-paper disabled:opacity-50">
            ปิด
          </button>
          {m && (
            <button
              onClick={handleRun}
              disabled={!ready || busy}
              className="h-[38px] px-[18px] rounded-[11px] bg-expense text-white text-[13px] font-semibold hover:brightness-110 disabled:opacity-50"
            >
              {busy ? 'กำลังล้าง…' : 'ล้างข้อมูลเดี๋ยวนี้'}
            </button>
          )}
        </div>
      }
    >
      {!isOwner && (
        <p className="text-[12.5px] text-pending bg-pending-soft border border-pending-line rounded-ctl px-3.5 py-2.5">
          คุณไม่ใช่เจ้าของร้าน จึงล้างข้อมูลไม่ได้ — ให้เจ้าของร้านเป็นคนทำ
        </p>
      )}

      <p className="text-[12px] text-muted leading-relaxed">
        ล้างแล้ว<b className="text-ink">กู้คืนไม่ได้</b> ไม่มีถังขยะ ไม่มีปุ่มย้อนกลับ —
        ถ้ายังไม่แน่ใจ ให้ปิดหน้านี้แล้วไปที่ ส่งออกและสำรองข้อมูล → ดาวน์โหลด Backup JSON ก่อน
      </p>

      {!m ? (
        <div className="flex flex-col gap-2">
          <ModeCard mode="ledger" onPick={setMode} disabled={!isOwner} />
          <ModeCard mode="all" onPick={setMode} disabled={!isOwner} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="rounded-ctl border border-[#F0C4BE] bg-expense-soft/40 px-3 py-2.5">
              <div className="text-[12px] font-semibold text-expense mb-1.5">จะถูกลบ</div>
              <ul className="text-[11.5px] text-ink leading-relaxed list-disc pl-4 space-y-0.5">
                {m.removes.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </div>
            <div className="rounded-ctl border border-[#BFE0D2] bg-income-soft/50 px-3 py-2.5">
              <div className="text-[12px] font-semibold text-income mb-1.5">ยังอยู่เหมือนเดิม</div>
              <ul className="text-[11.5px] text-ink leading-relaxed list-disc pl-4 space-y-0.5">
                {m.keeps.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </div>
          </div>

          <div>
            <label className="block text-[12px] text-muted mb-1.5">
              พิมพ์ <b className="text-ink">{m.word}</b> เพื่อยืนยันว่าอ่านแล้ว
            </label>
            <input
              className="input"
              value={typed}
              onChange={(e) => { setTyped(e.target.value); setError('') }}
              placeholder={m.word}
              autoFocus
              disabled={busy || !isOwner}
            />
          </div>
        </>
      )}

      {okMsg && (
        <p className="text-[12.5px] text-income bg-income-soft border border-[#BFE0D2] rounded-ctl px-3.5 py-2.5">
          ✓ {okMsg}
        </p>
      )}
      {error && (
        <p className="text-[12.5px] text-expense bg-expense-soft border border-[#F0C4BE] rounded-ctl px-3.5 py-2.5">
          ล้างข้อมูลไม่สำเร็จ — {error}
        </p>
      )}
    </Popup>
  )
}
