import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AllCardsView from './AllCardsView'
import CardDetailView from './CardDetailView'
import DebtView from './DebtView'
import Icon from '../../components/shared/Icon'
import useCreditCardStore from '../../store/useCreditCardStore'
import useDebtStore from '../../store/useDebtStore'
import AppIcon from '../../components/shared/AppIcon'
import { DEFAULT_ICONS } from '../../lib/defaultIcons'

const fmt = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

/**
 * บัตรและหนี้สิน — สลับมุมมองด้วยแถบเดียวบนสุด
 *
 *   รวมทุกบัตร        ภาพรวมว่าบัตรไหนต้องจ่ายเท่าไรเมื่อไร
 *   <ชื่อบัตรแต่ละใบ>  รายละเอียดบัตรใบนั้นทั้งหมด (บิล รอบถัดไป วงเงิน รายการ ผ่อน)
 *   หนี้สินและงวดผ่อน  สัญญาหนี้ + งวดผ่อนผ่านบัตร
 *
 * แท็บบอกยอดหนี้ของบัตรใบนั้นไว้บนชิปเลย จะได้เลือกได้โดยไม่ต้องกดเข้าไปดูทีละใบ
 */
export default function CardsPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const cards = useCreditCardStore((s) => s.cards)
  const ensureStatements = useCreditCardStore((s) => s.ensureStatements)
  const activeDebts = useDebtStore((s) => s.debts.filter((d) => d.status === 'active').length)

  // ปิดรอบที่เลยวันสรุปยอดแล้วให้ครบก่อนคำนวณตัวเลขบนชิป
  useEffect(() => { ensureStatements() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // รองรับลิงก์เก่าที่ยังใช้ ?tab= (installments/debts → มุมมองหนี้สิน)
  const legacy = params.get('tab')
  const view = params.get('view')
    ?? (legacy === 'installments' || legacy === 'debts' ? 'debt' : null)
    ?? 'all'
  const setView = (v) => setParams(v === 'all' ? {} : { view: v }, { replace: true })

  const isCard = cards.some((c) => c.id === view)
  const currentCard = isCard ? cards.find((c) => c.id === view) : null

  const tabs = [
    {
      key: 'all', grow: 1, icon: 'credit_card', iconFg: '#16181D',
      label: 'รวมทุกบัตร', kicker: `${cards.length} ใบ`,
      sub: fmt(cards.reduce((n, c) => n + (Number(c.outstanding) || 0), 0)), unit: 'บาท',
    },
    ...cards.map((c) => ({
      key: c.id, grow: 1.2, cardIcon: c.icon ?? null, isCard: true,
      label: c.last4 ? `${c.bankName || c.name} · ${c.last4}` : (c.name || 'บัตร'),
      kicker: c.name || 'บัตรเครดิต',
      sub: fmt(Number(c.outstanding) || 0), unit: 'ยอดหนี้คงค้าง',
    })),
    {
      key: 'debt', grow: 1, icon: 'receipt_long', iconFg: '#6D4AA8',
      label: 'หนี้สินและงวดผ่อน', kicker: 'สัญญาผ่อน เงินกู้',
      sub: String(activeDebts), unit: 'สัญญาที่ยังผ่อนอยู่',
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      {/* แถวคำอธิบาย + ปุ่มจัดการบัตร — แยกจากแถวเลือกบัตรข้างล่าง
          เพราะปุ่มพวกนี้ทำงานกับบัตรที่เลือกอยู่ ไม่ใช่ตัวเลือกบัตร */}
      <div className="flex gap-2 items-center flex-none flex-wrap">
        <span className="flex-1 min-w-0 text-[11.5px] text-faint leading-snug">
          เลือกบัตรที่จะดู · ตัวเลขบนแต่ละใบคือยอดหนี้คงค้างที่หักรายการที่จ่ายแยกแล้ว
        </span>
        {currentCard && (
          <button
            onClick={() => navigate('/manage/cards')}
            className="flex-none h-[34px] px-3.5 rounded-[10px] border border-hairline bg-white text-[12.5px] font-semibold flex items-center gap-[5px] hover:bg-paper"
          >
            <Icon name="tune" size={17} />
            แก้ไขบัตรนี้
          </button>
        )}
        <button
          onClick={() => navigate('/manage/cards')}
          className="flex-none h-[34px] px-3.5 rounded-[10px] bg-ink text-white text-[12.5px] font-semibold flex items-center gap-[5px] hover:bg-black"
        >
          <Icon name="add" size={17} />
          เพิ่มบัตร
        </button>
      </div>

      {/* ตัวเลือกบัตรเป็นการ์ดเต็มความกว้าง ไม่ใช่ชิปเล็ก — ยอดหนี้ของทุกใบจึงอ่านได้
          พร้อมกันโดยไม่ต้องกดเข้าไปดูทีละใบ

          ขึ้นบรรทัดใหม่ได้ทุกขนาดจอ ของเดิมบังคับแถวเดียวตั้งแต่ md ขึ้นไป
          พอมีบัตรหลายใบ (เช่น 7 ใบ = 9 การ์ด × อย่างน้อย 190px ≈ 1,800px)
          จะกว้างเกินพื้นที่เนื้อหาแล้วล้นออกนอกจอ เพราะไม่มีตัวรับการเลื่อน
          ส่วน max-w กันไม่ให้การ์ดใบสุดท้ายที่เหลืออยู่ตัวเดียวในบรรทัดยืดเต็มแถว */}
      <div className="flex gap-2 flex-none flex-wrap">
        {tabs.map((t) => {
          const on = t.key === view || (t.key === 'all' && !isCard && view !== 'debt')
          return (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              style={{ flex: `${t.grow} 1 0` }}
              className={`min-w-[190px] max-w-[340px] flex items-center gap-2.5 rounded-[14px] border px-[11px] py-[9px] text-left transition ${
                on ? 'border-ink shadow-[0_0_0_1px_#16181D] bg-white' : 'border-hairline bg-white hover:border-ink'
              }`}
            >
              {t.isCard ? (
                // ไอคอนที่ตั้งไว้กับบัตร หรือรูปบัตรกลางๆ ถ้ายังไม่เลือก — ไม่เดาโลโก้จากชื่อธนาคาร
                <span className="w-[34px] h-[34px] flex-none rounded-[10px] bg-paper flex items-center justify-center">
                  <AppIcon value={t.cardIcon} size={20} fallback={DEFAULT_ICONS.card} />
                </span>
              ) : (
                <span className="w-[34px] h-[34px] flex-none rounded-[10px] bg-paper flex items-center justify-center">
                  <Icon name={t.icon} size={19} style={{ color: t.iconFg }} />
                </span>
              )}
              <span className="flex-1 min-w-0">
                <span className="block text-[12.5px] font-semibold truncate">{t.label}</span>
                <span className="block text-[10.5px] text-faint truncate">{t.kicker}</span>
              </span>
              <span className="flex-none text-right">
                <span className="tabular-nums block text-sm font-bold leading-[1.2]">{t.sub}</span>
                <span className="block text-[10px] text-faint whitespace-nowrap">{t.unit}</span>
              </span>
            </button>
          )
        })}
      </div>

      {isCard
        ? <CardDetailView key={view} cardId={view} />
        : view === 'debt'
          ? <DebtView onOpenBill={() => setView(cards[0]?.id ?? 'all')} />
          : <AllCardsView onOpenCard={setView} />}
    </div>
  )
}
