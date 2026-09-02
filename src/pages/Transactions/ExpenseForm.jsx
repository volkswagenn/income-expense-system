import { useState, useMemo, useRef } from 'react'
import AmountInput from '../../components/shared/AmountInput'
import { format } from 'date-fns'
import { Link } from 'react-router-dom'
import DateNavigator from '../../components/shared/DateNavigator'
import DatePicker from '../../components/shared/DatePicker'
import EditableDropdown from '../../components/shared/EditableDropdown'
import CategorySelect from '../../components/shared/CategorySelect'
import ConfirmPopup from '../../components/shared/ConfirmPopup'
import FileUploadPopup from '../../components/shared/FileUploadPopup'
import TransferAccountPicker from '../../components/shared/TransferAccountPicker'
import CreditCardPicker from '../../components/shared/CreditCardPicker'
import PayFromPicker from '../../components/shared/PayFromPicker'
import DebtFields, { EMPTY_DEBT, computeDebt, validateDebt } from '../../components/shared/DebtFields'
import useDebtStore from '../../store/useDebtStore'
import useWalletStore from '../../store/useWalletStore'
import useCreditCardStore from '../../store/useCreditCardStore'
import {
  nextDueDate, formatThaiDate, installmentSchedule, installmentTotal,
  tieredSchedule, scheduleTotal, validateTiers, maxPrepaidCount, latestPurchaseDateFor, toDateString,
} from '../../lib/cardCycle'
import useTransactionStore from '../../store/useTransactionStore'
import usePendingStore from '../../store/usePendingStore'
import useCategoryStore from '../../store/useCategoryStore'
import useRecurringStore from '../../store/useRecurringStore'
import { walletTarget } from '../../lib/api/transactions'
import { buildLogEntry } from '../../lib/logBuilder'
import useLogStore from '../../store/useLogStore'
import { useNegativeConfirm } from '../../hooks/useNegativeConfirm'
import { useFormDraft, DraftBanner } from '../../hooks/useFormDraft'

const EMPTY = {
  itemName: '', category: '', amount: '', method: 'cash', transferAccountId: '', pendingAccountId: '',
  cardId: '', installment: false, installmentMonths: '6', installmentRate: '0',
  // 'even' = หารเท่ากันทุกงวด, 'tiered' = ค่างวดตามโปรโมชั่น (ขั้นบันได)
  installmentMode: 'even',
  installmentTiers: [{ from: 1, to: 6, amount: '' }, { from: 7, to: 6, amount: '' }],
  installmentPrepaid: false, installmentPrepaidCount: '',
  debt: { ...EMPTY_DEBT },
  vendor: '', receiptNo: '', taxStatus: 'none', dueDate: '', taxDueDate: '', note: ''
}

const MONTH_PRESETS = [3, 6, 10]

const fmtBaht = (n) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })

/**
 * ทำช่วงราคาให้ต่อกันสนิทเสมอ
 *
 * ต้นช่วงถัดไปถูกคำนวณจากปลายช่วงก่อนหน้า ผู้ใช้แก้เองไม่ได้ และช่วงสุดท้าย
 * ยืดไปจบที่งวดสุดท้ายให้อัตโนมัติ จึงไม่มีทางกรอกให้ขาดตอนหรือทับกันได้เลย
 */
function normalizedTiers(tiers, months) {
  const out = []
  let from = 1
  tiers.forEach((t, i) => {
    if (from > months) return
    const isLast = i === tiers.length - 1
    const to = isLast ? months : Math.min(Math.max(Number(t.to) || from, from), months)
    out.push({ from, to, amount: t.amount })
    from = to + 1
  })
  if (out.length > 0) out[out.length - 1].to = months
  return out
}

export default function ExpenseForm() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [form, setForm, clearDraft, hasDraft] = useFormDraft('expense', EMPTY)
  const [saved, setSaved] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  // ระบบออนไลน์อย่างเดียว การบันทึกต้องรอผลจริงจากเซิร์ฟเวอร์ จึงต้องกันกดซ้ำระหว่างรอ
  const [saving, setSaving] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadStatus, setUploadStatus] = useState(null)
  const [attachments, setAttachments] = useState([])
  const { warning, check, proceed, cancel } = useNegativeConfirm()

  const { addTransaction } = useTransactionStore()
  const { addPending, addTaxInvoice } = usePendingStore()
  const {
    addVendor, updateVendor, softDeleteVendor,
    addQuickItem, updateQuickItem, softDeleteQuickItem,
    getVendors, getQuickItems, getCategoryFilterIds,
  } = useCategoryStore()
  const { addLog } = useLogStore()
  const resolveAccount = useWalletStore((s) => s.resolveTransferAccountId)
  const refreshWallet = useWalletStore((s) => s.refresh)
  const resolveCard = useCreditCardStore((s) => s.resolveCardId)
  const refreshCards = useCreditCardStore((s) => s.refresh)
  const createInstallment = useCreditCardStore((s) => s.createInstallment)
  const cards = useCreditCardStore((s) => s.cards)
  const createDebt = useDebtStore((s) => s.createDebt)

  // สิ่งที่บันทึกลงเซิร์ฟเวอร์สำเร็จแล้วในรอบนี้ (รายการ / รายการค้าง) — ถ้าขั้นถัดไปล้ม
  // (เช่นสร้างการ์ดรอใบกำกับภาษีไม่สำเร็จ) ผู้ใช้กดบันทึกซ้ำได้โดยไม่สร้างรายการ
  // และตัดเงินซ้ำอีกรอบ ล้างเมื่อสำเร็จครบหรือเมื่อแก้ฟอร์ม
  const savedRef = useRef({ tx: null, pending: null, installment: null })

  const set = (k, v) => {
    savedRef.current = { tx: null, pending: null, installment: null }
    setForm((f) => ({ ...f, [k]: v }))
  }
  const setMany = (patch) => {
    savedRef.current = { tx: null, pending: null, installment: null }
    setForm((f) => ({ ...f, ...patch }))
  }

  const logVendorAdd = async (name) => {
    const item = await addVendor(name)
    await addLog(buildLogEntry({ activityType: 'VENDOR_CREATE', description: `สร้างผู้ขาย "${name}"`, newValue: item }))
    return item
  }

  const logVendorUpdate = async (id, name) => {
    const oldItem = getVendors().find((item) => item.id === id)
    await updateVendor(id, name)
    await addLog(buildLogEntry({ activityType: 'VENDOR_UPDATE', description: `แก้ไขผู้ขาย "${oldItem?.name ?? id}" → "${name}"`, oldValue: oldItem, newValue: { id, name } }))
  }

  const logVendorDelete = async (id) => {
    const oldItem = getVendors().find((item) => item.id === id)
    await softDeleteVendor(id)
    await addLog(buildLogEntry({ activityType: 'VENDOR_DELETE', description: `ลบผู้ขาย "${oldItem?.name ?? id}"`, oldValue: oldItem }))
  }

  const logQuickItemAdd = async (name, categoryId) => {
    const item = await addQuickItem(name, categoryId)
    await addLog(buildLogEntry({ activityType: 'QUICK_ITEM_CREATE', description: `สร้างรายการด่วน "${name}"`, newValue: item }))
    return item
  }

  const logQuickItemUpdate = async (id, changes) => {
    const oldItem = getQuickItems().find((item) => item.id === id)
    await updateQuickItem(id, changes)
    await addLog(buildLogEntry({ activityType: 'QUICK_ITEM_UPDATE', description: `แก้ไขรายการด่วน "${oldItem?.name ?? id}"`, oldValue: oldItem, newValue: { ...oldItem, ...changes } }))
  }

  const logQuickItemDelete = async (id) => {
    const oldItem = getQuickItems().find((item) => item.id === id)
    await softDeleteQuickItem(id)
    await addLog(buildLogEntry({ activityType: 'QUICK_ITEM_DELETE', description: `ลบรายการด่วน "${oldItem?.name ?? id}"`, oldValue: oldItem }))
  }

  const execute = async () => {
    if (saving) return
    const amt = Number(form.amount)
    const accountId = form.method === 'transfer' ? resolveAccount(form.transferAccountId) : null
    const cardId = form.method === 'card' ? resolveCard(form.cardId) : null
    const months = Math.max(1, Math.round(Number(form.installmentMonths) || 0))
    const isInstallment = form.method === 'card' && form.installment && !!selectedCard
    let tx = null

    setSaving(true)
    setErrMsg('')
    try {
    if (form.method === 'pending' && savedRef.current.pending) {
      // รายการค้างถูกสร้างไปแล้วในรอบก่อน (ล้มที่ขั้นถัดไป) — ข้ามไปทำขั้นที่เหลือ
    } else if (form.method === 'pending') {
      const missingDueDateNote = form.dueDate ? '' : 'ไม่ได้ลงกำหนดชำระเงิน'
      const pending = await addPending({
        amount: amt,
        dueDate: form.dueDate || date,
        description: form.itemName,
        itemName: form.itemName,
        category: form.category,
        vendor: form.vendor,
        receiptNo: form.receiptNo,
        taxStatus: form.taxStatus,
        openDate: date,
        note: [form.note, missingDueDateNote].filter(Boolean).join('\n'),
        missingDueDate: !form.dueDate,
        // ผูกบัญชีไว้ล่วงหน้า เวลากดชำระจะตัดจากบัญชีนี้ทันที
        ...(form.pendingAccountId ? { defaultTransferAccountId: form.pendingAccountId } : {}),
        ...(attachments.length > 0 ? {
          attachments,
          documentPath: attachments[0].path,
          documentType: attachments[0].type,
          documentLabel: attachments[0].label,
        } : {}),
      })
      await addLog(buildLogEntry({
        activityType: 'OPEN_BILL',
        description: `เปิดบิลรอจ่ายเงิน: "${form.itemName}" ${amt.toLocaleString()} บาท (วันที่เปิด: ${date}) ครบกำหนด: ${form.dueDate || date}${missingDueDateNote ? ` (${missingDueDateNote})` : ''}`,
        newValue: { pendingId: pending.id, itemName: form.itemName, amount: amt, dueDate: form.dueDate || date, openDate: date, missingDueDate: !form.dueDate },
        walletEffect: null,
      }))
      savedRef.current.pending = pending
    } else if (form.method === 'debt' && savedRef.current.installment) {
      // หนี้สินถูกสร้างไปแล้วในรอบก่อน — ห้ามสร้างซ้ำ
    } else if (form.method === 'debt') {
      // กู้ยืม: บันทึกเป็นหนี้สินที่มีตารางงวด ยังไม่สร้างรายจ่ายและยังไม่ขยับเงิน
      // เงินจะขยับตอนกดจ่ายทีละงวด ซึ่งตอนนั้นค่อยเป็นรายจ่ายจริง
      const v = { ...form.debt, name: form.itemName }
      const calc = computeDebt(v)
      if (!calc) throw new Error('ข้อมูลหนี้สินยังไม่ครบ')
      const isRecv = v.direction === 'receivable'
      const debt = await createDebt({
        direction: v.direction, name: form.itemName, counterparty: v.counterparty.trim(),
        categoryId: form.category || null, note: form.note,
        principalAmount: calc.principal, totalAmount: calc.total, months: calc.months,
        monthlyAmount: calc.monthly, interestRate: v.mode === 'calc' ? Number(v.rate) || 0 : 0,
        prepaidCount: calc.prepaidCount, firstDue: toDateString(calc.firstDue), dueDay: calc.dueDay, term: calc.term,
        defaultMethod: v.method, defaultAccountId: v.method === 'transfer' ? v.accountId : null,
      }, calc.rows, buildLogEntry({
        activityType: 'DEBT_CREATE',
        description:
          `${isRecv ? 'ให้ยืม' : 'เพิ่มหนี้'} "${form.itemName}" ${calc.total.toLocaleString()} บาท ${calc.months} งวด งวดละ ${calc.monthly.toLocaleString()}` +
          (calc.prepaidCount ? ` · ผ่อนมาแล้ว ${calc.prepaidCount} งวด` : ''),
        newValue: { debtId: debt.id, name: form.itemName, direction: v.direction, total: calc.total, months: calc.months },
      }))
      savedRef.current.installment = debt
    } else if (isInstallment && savedRef.current.installment) {
      // สัญญาผ่อนถูกสร้างไปแล้วในรอบก่อน — ห้ามสร้างซ้ำ
    } else if (isInstallment) {
      // ผ่อน: ยังไม่สร้างรายจ่ายและยังไม่ขยับหนี้ บันทึกแค่สัญญากับตารางงวด
      // งวดจะกลายเป็นรายจ่ายทีละงวดตอนปิดรอบ เพราะเงินไหลออกจริงทีละงวด
      //
      // ช่องจำนวนเงินคือราคาสินค้า ส่วนยอดที่ผ่อนจริงคือราคาบวกดอกเบี้ยแบบคงที่
      // ผลรวมของทุกงวดจึงเท่ากับ total ไม่ใช่ราคาสินค้า ซึ่งตรงกับเงินที่ไหลออกจริง
      //
      // โหมดขั้นบันได ยอดรวมถูกกำหนดโดยค่างวดที่กรอก ไม่ได้หารจากราคาสินค้า
      const buyDate = new Date(date + 'T00:00:00')
      const tiers = form.installmentMode === 'tiered'
        ? normalizedTiers(form.installmentTiers, months).map((t) => ({ ...t, amount: Number(t.amount) || 0 }))
        : null
      const schedule = tiers
        ? tieredSchedule(selectedCard, buyDate, months, tiers)
        : installmentSchedule(selectedCard, buyDate, months, installmentTotal(amt, months, Number(form.installmentRate) || 0).total)
      const money = tiers
        ? { principal: scheduleTotal(schedule), interest: 0, total: scheduleTotal(schedule), ratePerMonth: 0 }
        : installmentTotal(amt, months, Number(form.installmentRate) || 0)
      const prepaidCount = installmentPreview?.prepaidCount ?? 0

      const ins = await createInstallment(cardId, {
        name: form.itemName,
        vendor: form.vendor,
        categoryId: form.category || null,
        note: form.note,
        principalAmount: money.principal,
        totalAmount: money.total,
        months,
        monthlyAmount: schedule[prepaidCount]?.amount ?? schedule[0].amount,
        interestRate: money.ratePerMonth,
        tiers,
        prepaidCount,
        purchaseDate: date,
      }, schedule, buildLogEntry({
        activityType: 'INSTALLMENT_CREATE',
        description:
          `ผ่อน "${form.itemName}" ${months} งวด รวม ${money.total.toLocaleString()} บาท ` +
          (tiers
            ? `แบบขั้นบันได ${tiers.length} ช่วง (${tiers.map((t) => `งวด ${t.from}-${t.to} ละ ${t.amount.toLocaleString()}`).join(', ')})`
            : money.interest > 0
              ? `ดอกเบี้ย ${money.ratePerMonth}% ต่อเดือน งวดละ ${schedule[0].amount.toLocaleString()} บาท`
              : `ผ่อน 0% งวดละ ${schedule[0].amount.toLocaleString()} บาท`) +
          (prepaidCount > 0 ? ` · ผ่อนมาก่อนแล้ว ${prepaidCount} งวด` : ''),
        newValue: {
          itemName: form.itemName,
          principal: money.principal,
          interest: money.interest,
          total: money.total,
          ratePerMonth: money.ratePerMonth,
          tiers, prepaidCount,
          months, cardId, date,
        },
      }))
      savedRef.current.installment = ins
      await refreshCards()
    } else if (savedRef.current.tx) {
      // รายการถูกบันทึกและตัดเงินไปแล้วในรอบก่อน — ห้ามสร้างซ้ำ
      tx = savedRef.current.tx
    } else {
      // บันทึกรายการ + ตัดเงิน + เขียน log จบในคำสั่งเดียวที่ฐานข้อมูล
      // ถ้าแยกยิงแล้วเน็ตหลุดกลางทาง จะได้รายการที่ไม่ตัดเงิน หรือเงินหายโดยไม่มีรายการ
      const target = walletTarget(form.method, { transferAccountId: accountId, cardId })
      tx = await addTransaction({
        date, type: 'expense', amount: amt,
        method: form.method, category: form.category, itemName: form.itemName,
        ...(accountId ? { transferAccountId: accountId } : {}),
        ...(cardId ? { cardId } : {}),
        vendor: form.vendor, receiptNo: form.receiptNo, taxStatus: form.taxStatus,
        dueDate: null, note: form.note,
        ...(attachments.length > 0 ? {
          attachments,
          documentPath: attachments[0].path,
          documentType: attachments[0].type,
          documentLabel: attachments[0].label,
        } : {}),
      }, {
        effect: target ? { target, delta: -amt } : null,
        log: buildLogEntry({
          activityType: 'ADD_EXPENSE',
          description: `จ่าย "${form.itemName}" ${amt.toLocaleString()} บาท`,
          walletEffect: target ? { target: form.method, delta: -amt, transferAccountId: accountId, cardId } : null,
          newValue: { itemName: form.itemName, amount: amt, method: form.method, date, ...(cardId ? { cardId } : {}) },
        }),
      })
      savedRef.current.tx = tx
      // ยอดถูกแก้ที่เซิร์ฟเวอร์ ต้องดึงค่าจริงมาแสดง ไม่คำนวณเองเพราะอาจมีคนอื่นแก้พร้อมกัน
      // รูดบัตรไม่แตะเงินสด/เงินโอน แต่ไปเพิ่มหนี้ในบัตร จึงต้องดึงคนละชุดกัน
      if (cardId) await refreshCards()
      else await refreshWallet()
    }

    if (form.taxStatus === 'waiting') {
      const tax = await addTaxInvoice({
        ...(tx ? { transactionId: tx.id } : {}),
        itemName: form.itemName,
        receiptNo: form.receiptNo,
        amount: amt,
        dueDate: form.taxDueDate || null,
        createdAt: new Date(date + 'T00:00:00').toISOString(),
      })
      await addLog(buildLogEntry({
        activityType: 'CREATE_TAX_INVOICE',
        description: `สร้างรายการรอใบกำกับภาษี "${form.itemName}" ${amt.toLocaleString()} บาท`,
        newValue: { ...tax, ...(tx ? { transactionId: tx.id } : {}) },
      }))
    }

    savedRef.current = { tx: null, pending: null, installment: null }
    clearDraft()
    setSaved(true)
    setUploadStatus(null)
    setAttachments([])
    setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      // ยังไม่ล้างฟอร์ม ผู้ใช้จะได้กดบันทึกซ้ำได้โดยไม่ต้องกรอกใหม่
      // (ขั้นที่สำเร็จไปแล้วจะถูกข้าม ไม่สร้างรายการหรือตัดเงินซ้ำ)
      setErrMsg(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSave = () => {
    if (!form.itemName) return setErrMsg('กรุณาใส่รายการจ่าย')
    // กู้ยืมไม่ใช้ช่องจำนวนเงินของฟอร์ม ยอดอยู่ในส่วนหนี้สิน และไม่ต้องเช็คยอดติดลบ
    if (form.method === 'debt') {
      const v = { ...form.debt, name: form.itemName }
      const err = validateDebt(v, computeDebt(v))
      if (err) return setErrMsg(err)
      setErrMsg('')
      execute()
      return
    }
    if (!form.amount || Number(form.amount) <= 0) return setErrMsg('กรุณาใส่จำนวนเงิน')
    if (form.method === 'transfer' && !resolveAccount(form.transferAccountId)) {
      return setErrMsg('กรุณาเลือกบัญชีที่จะจ่ายเงินโอน')
    }
    if (form.method === 'card' && !resolveCard(form.cardId)) {
      return setErrMsg('กรุณาเลือกบัตรเครดิตที่ใช้รูด')
    }
    if (form.method === 'card' && form.installment) {
      const m = Math.round(Number(form.installmentMonths) || 0)
      if (!(m >= 1) || m > 120) return setErrMsg('จำนวนงวดต้องอยู่ระหว่าง 1 ถึง 120')
      if (form.installmentMode === 'tiered') {
        const tiers = normalizedTiers(form.installmentTiers, m)
        const err = validateTiers(tiers, m)
        if (err) return setErrMsg(err)
        if (!tiers.every((t) => Number(t.amount) > 0)) return setErrMsg('กรอกยอดต่องวดให้ครบทุกช่วงราคา')
      }
      // งวดที่บอกว่าจ่ายมาแล้วต้องครบกำหนดไปแล้วจริง ไม่งั้นยอดคงเหลือจะผิดตั้งแต่ต้น
      if (installmentPreview?.prepaidOver) {
        return setErrMsg(
          `วันเปิดบิลย้อนหลังไม่พอ ระบุว่าจ่ายมาแล้วได้มากสุด ${installmentPreview.maxPrepaid} งวด` +
          (installmentPreview.suggestDate
            ? ` — เลือกวันเปิดบิลไม่เกิน ${formatThaiDate(installmentPreview.suggestDate)}`
            : '')
        )
      }
    }
    setErrMsg('')
    // บัตรเครดิตไม่ต้องเช็คยอดติดลบ — เป็นหนี้อยู่แล้วโดยธรรมชาติ และไม่บล็อกเรื่องวงเงิน
    if (form.method === 'pending' || form.method === 'card') {
      execute()
    } else {
      check({
        method: form.method,
        amount: Number(form.amount),
        accountId: form.transferAccountId,
        onConfirm: execute,
      })
    }
  }

  const vendorList = getVendors()
  const quickList = getQuickItems()

  // บัตรที่จะถูกใช้จริง — เผื่อกรณีมีใบเดียวแล้ว picker ยังไม่ทันเซ็ตค่าให้
  const selectedCard = form.method === 'card'
    ? cards.find((c) => c.id === resolveCard(form.cardId)) ?? null
    : null

  // ตัวอย่างตารางผ่อน คำนวณสดขณะพิมพ์ ผู้ใช้จะได้เห็นยอดต่องวดก่อนกดบันทึก
  // ช่องจำนวนเงินคือ "ราคาสินค้า" ส่วนยอดที่ผ่อนจริงคือราคาบวกดอกเบี้ย
  const installmentPreview = (() => {
    if (!form.installment || !selectedCard) return null
    const m = Math.round(Number(form.installmentMonths) || 0)
    if (!(m >= 1) || m > 120) return null
    const buyDate = new Date(date + 'T00:00:00')

    let rows, money, tierError = null
    if (form.installmentMode === 'tiered') {
      // ยอดรวมถูกกำหนดโดยค่างวด ไม่ใช่หารจากยอดรวม จึงไม่มีเศษให้ปัด
      const tiers = normalizedTiers(form.installmentTiers, m)
      tierError = validateTiers(tiers, m)
      if (tierError) return { invalid: true, months: m, tierError }
      if (!tiers.every((t) => Number(t.amount) > 0)) return null
      rows = tieredSchedule(selectedCard, buyDate, m, tiers)
      const total = scheduleTotal(rows)
      money = { principal: total, interest: 0, total, ratePerMonth: 0, months: m }
    } else {
      const principal = Number(form.amount)
      const rate = Number(form.installmentRate) || 0
      if (!(principal > 0) || rate < 0) return null
      money = installmentTotal(principal, m, rate)
      rows = installmentSchedule(selectedCard, buyDate, m, money.total)
    }

    const first = rows[0]
    const last = rows[rows.length - 1]

    // งวดที่บอกว่าจ่ายมาแล้ว ต้องเป็นงวดที่ครบกำหนดไปแล้วจริงเมื่อนับจากวันเปิดบิล
    const maxPrepaid = Math.min(maxPrepaidCount(selectedCard, buyDate), m)
    const wantPrepaid = form.installmentPrepaid
      ? Math.max(0, Math.round(Number(form.installmentPrepaidCount) || 0))
      : 0
    const prepaidOver = wantPrepaid > maxPrepaid
    const suggestDate = prepaidOver ? latestPurchaseDateFor(selectedCard, wantPrepaid) : null
    const prepaidCount = prepaidOver ? 0 : wantPrepaid

    const remainingRows = rows.slice(prepaidCount)
    return {
      ...money,
      rows, first, last,
      hasRemainder: rows.length > 1 && last.amount !== first.amount,
      maxPrepaid, wantPrepaid, prepaidOver, suggestDate, prepaidCount,
      paidAlready: scheduleTotal(rows.slice(0, prepaidCount)),
      remainingTotal: scheduleTotal(remainingRows),
      nextRow: remainingRows[0] ?? null,
      tierError,
    }
  })()

  const recurringAllItems = useRecurringStore((s) => s.items)
  const recurringEntries = useRecurringStore((s) => s.entries)
  const currentMonth = format(new Date(), 'yyyy-MM')
  const matchingRecurring = useMemo(() => {
    if (!form.category) return null
    // เลือกหมวดหมู่หลัก → เตือนถึงรายการประจำที่อยู่ในหมวดหมู่ย่อยข้างในด้วย
    const scope = new Set(getCategoryFilterIds(form.category))
    const pendingThisMonth = recurringEntries.filter(
      (e) => e.month === currentMonth && e.status === 'pending'
    )
    for (const entry of pendingThisMonth) {
      const item = recurringAllItems.find((it) => it.id === entry.recurringId && scope.has(it.category))
      if (item) return item
    }
    return null
  }, [form.category, recurringAllItems, recurringEntries, currentMonth])

  // ทุก taxStatus → upload ใบเสร็จ ยกเว้น 'received' → upload ใบกำกับภาษี
  const isTaxUpload = form.taxStatus === 'received'

  const handleUploadDone = (savedPath) => {
    setUploadOpen(false)
    if (savedPath) {
      const paths = Array.isArray(savedPath) ? savedPath : [savedPath]
      const nextAttachments = paths.map((path, index) => ({
        path,
        type: isTaxUpload ? 'taxinvoice' : 'receipt',
        label: `${isTaxUpload ? 'ใบกำกับภาษี' : 'ใบเสร็จ'}${paths.length > 1 ? ` ${index + 1}` : ''}`,
        uploadedAt: new Date().toISOString(),
      }))
      setAttachments(nextAttachments)
      setUploadStatus(`✓ อัปโหลดเสร็จสิ้น — ${paths.length > 1 ? `${paths.length} ไฟล์` : paths[0]}`)
      addLog(buildLogEntry({
        activityType: isTaxUpload ? 'UPLOAD_TAX_INVOICE_FILE' : 'UPLOAD_RECEIPT',
        description: `อัปโหลด${isTaxUpload ? 'ไฟล์ใบกำกับภาษี' : 'ใบเสร็จ'}สำหรับรายจ่าย "${form.itemName || 'ยังไม่ระบุ'}"`,
        newValue: { savedPath: paths[0], savedPaths: paths, itemName: form.itemName, date, docType: isTaxUpload ? 'taxinvoice' : 'receipt' },
      }))
    }
  }

  return (
    <>
      <div className="space-y-4">
        <DraftBanner hasDraft={hasDraft} onClear={clearDraft} />
        <DateNavigator date={date} onChange={setDate} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EditableDropdown
            label="รายการจ่าย"
            value={form.itemName}
            onChange={(v) => set('itemName', v)}
            items={quickList}
            onAdd={(name) => logQuickItemAdd(name, form.category)}
            onUpdate={(id, name) => logQuickItemUpdate(id, { name })}
            onDelete={logQuickItemDelete}
            placeholder="พิมพ์หรือเลือกรายการ..."
          />

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">หมวดหมู่</label>
              <Link
                to="/categories"
                className="text-xs text-blue-500 hover:text-blue-700 hover:underline"
              >
                🗂️ จัดการหมวดหมู่
              </Link>
            </div>
            <CategorySelect value={form.category} onChange={(v) => set('category', v)} />
          </div>
        </div>

        {matchingRecurring && (
          <div className="p-2.5 bg-purple-50 rounded-lg border border-purple-200 text-xs text-purple-700">
            🔁 มีรายการประจำ <strong>"{matchingRecurring.name}"</strong> รอจ่ายในหมวดนี้เดือนนี้ — ตรวจสอบที่แท็บ <strong>รายการประจำ</strong> ก่อนบันทึก
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">จำนวนเงิน (บาท)</label>
            <AmountInput className="input" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0" />
          </div>
          <div>
            <PayFromPicker
              value={{ method: form.method, transferAccountId: form.transferAccountId, cardId: form.cardId }}
              onChange={setMany}
              options={['cash', 'transfer', 'card', 'debt', 'pending']}
              itemName={form.itemName}
              debt={form.debt}
              onDebtChange={(d) => set('debt', d)}
              pending={{ dueDate: form.dueDate, accountId: form.pendingAccountId }}
              onPendingChange={(p) => setMany({ dueDate: p.dueDate, pendingAccountId: p.accountId })}
            />
          </div>
        </div>


        {/* ผู้ใช้ไม่ต้องรู้เรื่องวันสรุปยอด — ระบบตอบคำถามเดียวที่เขาสนใจจริงๆ
            คือต้องหาเงินมาจ่ายเมื่อไร */}
        {form.method === 'card' && selectedCard && (
          <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 space-y-2.5">
            {!form.installment && (
              <p className="text-xs text-rose-700">
                💳 ยังไม่ตัดเงินตอนนี้ — รายการนี้จะไปอยู่ในบิลที่ครบกำหนด{' '}
                <strong>{formatThaiDate(nextDueDate(selectedCard.closingDay, selectedCard.dueDay, new Date(date + 'T00:00:00')))}</strong>
              </p>
            )}

            <label className="flex items-center gap-2 text-xs text-rose-800 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 accent-rose-600"
                checked={form.installment}
                onChange={(e) => set('installment', e.target.checked)}
              />
              <span className="font-medium">แบ่งชำระ (ผ่อน)</span>
            </label>

            {form.installment && (
              <div className="space-y-2">
                {/* โปรฯ ผ่อนจริงมักไม่ได้จ่ายเท่ากันทุกงวด ต้องกรอกกลับทาง
                    คือรู้ค่างวดอยู่แล้วแล้วรวมกลับเป็นยอด จึงแยกเป็นคนละโหมด */}
                <div>
                  <label className="label">รูปแบบการผ่อน</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {[
                      { v: 'even', t: 'หารเท่ากันทุกงวด' },
                      { v: 'tiered', t: 'ค่างวดตามโปรโมชั่น' },
                    ].map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        className={`btn text-xs py-1 px-3 ${form.installmentMode === o.v ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => set('installmentMode', o.v)}
                      >
                        {o.t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-end gap-2 flex-wrap">
                  <div className="w-28">
                    <label className="label">จำนวนงวด</label>
                    <input
                      className="input"
                      type="number"
                      min="1"
                      max="120"
                      value={form.installmentMonths}
                      onChange={(e) => set('installmentMonths', e.target.value)}
                    />
                  </div>
                  <div className="flex gap-1.5 pb-0.5">
                    {MONTH_PRESETS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`btn text-xs py-1 px-2.5 ${String(m) === String(form.installmentMonths) ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => set('installmentMonths', String(m))}
                      >
                        {m} งวด
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── ค่างวดตามโปรโมชั่น (ขั้นบันได) ── */}
                {form.installmentMode === 'tiered' && (
                  <div>
                    <label className="label">ค่างวดตามโปรโมชั่น</label>
                    {normalizedTiers(form.installmentTiers, Math.round(Number(form.installmentMonths) || 1)).map((t, i, arr) => (
                      <div key={i} className="flex items-center gap-1.5 flex-wrap bg-white/70 border border-rose-200 rounded-lg px-2 py-1.5 mb-1.5">
                        <span className="text-xs text-rose-800">งวดที่</span>
                        {/* ต้นช่วงคำนวณจากช่วงก่อนหน้าเสมอ แก้เองไม่ได้ กันกรอกขาดตอน */}
                        <span className="text-xs tabular-nums bg-rose-50 border border-rose-200 rounded px-2 py-0.5 min-w-[34px] text-center">{t.from}</span>
                        <span className="text-xs text-rose-800">–</span>
                        {i === arr.length - 1 ? (
                          <span className="text-xs tabular-nums bg-rose-50 border border-rose-200 rounded px-2 py-0.5 min-w-[34px] text-center" title="ช่วงสุดท้ายยืดไปจบที่งวดสุดท้ายให้เอง">{t.to}</span>
                        ) : (
                          <input
                            className="input !h-7 w-16 text-xs text-center px-1"
                            type="number"
                            min={t.from}
                            max={form.installmentMonths}
                            value={form.installmentTiers[i]?.to ?? ''}
                            onChange={(e) => {
                              const next = form.installmentTiers.map((x, k) => (k === i ? { ...x, to: e.target.value } : x))
                              set('installmentTiers', next)
                            }}
                          />
                        )}
                        <span className="text-xs text-rose-800">งวดละ</span>
                        <input
                          className="input !h-7 w-24 text-xs text-right px-2"
                          type="number"
                          min="0"
                          placeholder="0.00"
                          value={form.installmentTiers[i]?.amount ?? ''}
                          onChange={(e) => {
                            const next = form.installmentTiers.map((x, k) => (k === i ? { ...x, amount: e.target.value } : x))
                            set('installmentTiers', next)
                          }}
                        />
                        <span className="text-xs text-rose-800">บาท</span>
                        {arr.length > 1 && i < arr.length - 1 && (
                          <button
                            type="button"
                            className="ml-auto text-rose-400 hover:text-rose-700 text-sm leading-none px-1"
                            onClick={() => set('installmentTiers', form.installmentTiers.filter((_, k) => k !== i))}
                            title="ลบช่วงนี้"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="w-full text-xs text-rose-700 border border-dashed border-rose-300 rounded-lg py-1.5 hover:bg-white/60"
                      onClick={() => {
                        const m = Math.round(Number(form.installmentMonths) || 1)
                        const cur = normalizedTiers(form.installmentTiers, m)
                        const last = cur[cur.length - 1]
                        const split = Math.min(last.from + 5, m)
                        set('installmentTiers', [
                          ...cur.slice(0, -1),
                          { from: last.from, to: String(split), amount: last.amount },
                          { from: split + 1, to: m, amount: '' },
                        ])
                      }}
                    >
                      + เพิ่มช่วงราคา
                    </button>
                    {installmentPreview?.tierError && (
                      <p className="text-xs text-red-600 mt-1">⚠️ {installmentPreview.tierError}</p>
                    )}
                    <p className="text-xs text-rose-600 mt-1">
                      ไม่ต้องกรอกราคาสินค้า ระบบรวมยอดจากค่างวดให้เอง
                    </p>
                  </div>
                )}

                {form.installmentMode === 'even' && (
                <div>
                  <label className="label">ดอกเบี้ย</label>
                  <div className="flex items-end gap-2 flex-wrap">
                    <button
                      type="button"
                      className={`btn text-xs py-1 px-3 ${Number(form.installmentRate) === 0 ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => set('installmentRate', '0')}
                    >
                      ผ่อน 0%
                    </button>
                    <div className="flex items-center gap-1.5">
                      <input
                        className="input w-24"
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.installmentRate}
                        onChange={(e) => set('installmentRate', e.target.value)}
                      />
                      <span className="text-xs text-rose-800 whitespace-nowrap">% ต่อเดือน</span>
                    </div>
                  </div>
                </div>
                )}

                {/* ── สัญญาที่ผ่อนมาก่อนเริ่มใช้แอป ── */}
                <div className="border-t border-rose-200 pt-2">
                  <label className="flex items-center gap-2 text-xs text-rose-800 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-rose-600"
                      checked={form.installmentPrepaid}
                      onChange={(e) => set('installmentPrepaid', e.target.checked)}
                    />
                    <span className="font-medium">เคยผ่อนมาก่อนแล้ว</span>
                  </label>

                  {form.installmentPrepaid && (
                    <div className="mt-2 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-rose-800">จ่ายมาแล้ว</span>
                        <input
                          className="input !h-8 w-20 text-sm text-center"
                          type="number"
                          min="0"
                          value={form.installmentPrepaidCount}
                          onChange={(e) => set('installmentPrepaidCount', e.target.value)}
                          placeholder="0"
                        />
                        <span className="text-xs text-rose-800">
                          งวด จากทั้งหมด {form.installmentMonths} งวด
                        </span>
                      </div>

                      {installmentPreview?.prepaidOver ? (
                        <div className="text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-700 space-y-1">
                          <p className="font-medium">⚠️ วันเปิดบิลย้อนหลังไม่พอ</p>
                          <p>
                            เปิดบิล {formatThaiDate(new Date(date + 'T00:00:00'))} มีงวดที่ครบกำหนดแล้วมากสุด{' '}
                            <strong>{installmentPreview.maxPrepaid} งวด</strong> จะบอกว่าจ่ายมา{' '}
                            {installmentPreview.wantPrepaid} งวดไม่ได้
                          </p>
                          {installmentPreview.suggestDate && (
                            <>
                              <p>
                                ถ้าจ่ายมาแล้ว {installmentPreview.wantPrepaid} งวดจริง ต้องเลือกวันเปิดบิลไม่เกิน{' '}
                                <strong>{formatThaiDate(installmentPreview.suggestDate)}</strong>
                              </p>
                              <button
                                type="button"
                                className="btn btn-primary text-xs py-1 px-3 mt-1"
                                onClick={() => setDate(toDateString(installmentPreview.suggestDate))}
                              >
                                ใช้วันที่ {formatThaiDate(installmentPreview.suggestDate)} ให้เลย
                              </button>
                            </>
                          )}
                        </div>
                      ) : (
                        installmentPreview && (
                          <p className="text-xs text-rose-600">
                            วันเปิดบิลนี้มีงวดครบกำหนดไปแล้ว {installmentPreview.maxPrepaid} งวด
                            {' '}ระบุได้ 0 ถึง {installmentPreview.maxPrepaid} งวด
                          </p>
                        )
                      )}

                      <p className="text-xs text-rose-600">
                        งวดที่จ่ายมาก่อนจะไม่ถูกบันทึกเป็นรายจ่ายย้อนหลังและไม่เพิ่มยอดหนี้บัตร
                        เพราะจ่ายไปก่อนเริ่มใช้ระบบ มีไว้ให้เลขงวดกับยอดคงเหลือถูกต้องเท่านั้น
                      </p>
                    </div>
                  )}
                </div>

                {installmentPreview && !installmentPreview.invalid ? (
                  <div className="text-xs text-rose-800 bg-white/70 rounded-lg px-3 py-2 leading-relaxed space-y-0.5">
                    {installmentPreview.interest > 0 ? (
                      <>
                        <div className="flex justify-between gap-3">
                          <span>ราคาสินค้า</span>
                          <span className="tabular-nums">{fmtBaht(installmentPreview.principal)}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span>
                            ดอกเบี้ย {installmentPreview.ratePerMonth}% × {installmentPreview.months} งวด
                          </span>
                          <span className="tabular-nums">+ {fmtBaht(installmentPreview.interest)}</span>
                        </div>
                        <div className="flex justify-between gap-3 border-t border-rose-200 pt-0.5 font-semibold">
                          <span>ยอดผ่อนรวม</span>
                          <span className="tabular-nums">{fmtBaht(installmentPreview.total)}</span>
                        </div>
                      </>
                    ) : form.installmentMode === 'tiered' ? (
                      <>
                        {normalizedTiers(form.installmentTiers, installmentPreview.months).map((t, i) => (
                          <div key={i} className="flex justify-between gap-3">
                            <span>งวด {t.from}–{t.to} · {t.to - t.from + 1} งวด × {fmtBaht(t.amount)}</span>
                            <span className="tabular-nums">{fmtBaht((t.to - t.from + 1) * (Number(t.amount) || 0))}</span>
                          </div>
                        ))}
                        <div className="flex justify-between gap-3 border-t border-rose-200 pt-0.5 font-semibold">
                          <span>ยอดรวมทั้งสัญญา</span>
                          <span className="tabular-nums">{fmtBaht(installmentPreview.total)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between gap-3 font-semibold">
                        <span>ยอดผ่อนรวม (ผ่อน 0%)</span>
                        <span className="tabular-nums">{fmtBaht(installmentPreview.total)}</span>
                      </div>
                    )}

                    {installmentPreview.prepaidCount > 0 && (
                      <>
                        <div className="flex justify-between gap-3 pt-0.5">
                          <span>จ่ายมาแล้ว {installmentPreview.prepaidCount} งวด</span>
                          <span className="tabular-nums">− {fmtBaht(installmentPreview.paidAlready)}</span>
                        </div>
                        <div className="flex justify-between gap-3 font-semibold border-t border-rose-200 pt-0.5">
                          <span>คงเหลือที่ต้องผ่อนต่อ</span>
                          <span className="tabular-nums">{fmtBaht(installmentPreview.remainingTotal)}</span>
                        </div>
                      </>
                    )}

                    {installmentPreview.prepaidCount > 0 && installmentPreview.nextRow ? (
                      <p className="pt-1">
                        งวดถัดไปคืองวดที่ <strong>{installmentPreview.nextRow.seq}</strong>{' '}
                        <strong>{fmtBaht(installmentPreview.nextRow.amount)}</strong> บาท ครบกำหนด{' '}
                        <strong>{formatThaiDate(installmentPreview.nextRow.dueDate)}</strong>
                      </p>
                    ) : form.installmentMode === 'even' ? (
                      <p className="pt-1">
                        งวดละ <strong>{fmtBaht(installmentPreview.first.amount)}</strong> บาท{' '}
                        {installmentPreview.months} งวด
                        {installmentPreview.hasRemainder && (
                          <> (งวดสุดท้าย {fmtBaht(installmentPreview.last.amount)} บาท)</>
                        )}
                      </p>
                    ) : null}
                    <p>
                      งวดแรกอยู่ในบิลที่ครบกำหนด <strong>{formatThaiDate(installmentPreview.first.dueDate)}</strong>{' '}
                      งวดสุดท้าย <strong>{formatThaiDate(installmentPreview.last.dueDate)}</strong>
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-rose-600">ใส่จำนวนเงินก่อน ระบบจะคำนวณยอดต่องวดให้</p>
                )}

                <p className="text-xs text-rose-600">
                  ไม่บันทึกรายจ่ายก้อนเดียวตอนนี้ — จะทยอยลงทีละงวดตามที่ธนาคารเรียกเก็บ
                  ติดตามได้ที่แท็บ <strong>ผ่อนชำระ</strong>
                </p>
              </div>
            )}
          </div>
        )}


        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EditableDropdown
            label="ผู้ขาย/ร้านค้า"
            value={form.vendor}
            onChange={(v) => set('vendor', v)}
            items={vendorList}
            onAdd={logVendorAdd}
            onUpdate={logVendorUpdate}
            onDelete={logVendorDelete}
            placeholder="พิมพ์หรือเลือกร้านค้า..."
          />
          <div>
            <label className="label">เลขที่ใบเสร็จ</label>
            <input className="input" value={form.receiptNo} onChange={(e) => set('receiptNo', e.target.value)} placeholder="เลขที่ใบเสร็จ (ถ้ามี)" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">ใบกำกับภาษี</label>
            <select className="input" value={form.taxStatus} onChange={(e) => { set('taxStatus', e.target.value); setUploadStatus(null) }}>
              <option value="none">ไม่ต้องการ</option>
              <option value="receipt">ใบเสร็จ</option>
              <option value="received">มีใบกำกับภาษี</option>
              <option value="waiting">รอใบกำกับภาษี</option>
            </select>
            {/* ปุ่ม upload แสดงทันทีตาม taxStatus ที่เลือก */}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <button
                type="button"
                className="btn btn-secondary text-sm py-1.5"
                onClick={() => setUploadOpen(true)}
              >
                {isTaxUpload ? '📎 อัปโหลดใบกำกับภาษี' : '📎 อัปโหลดใบเสร็จ'}
              </button>
              {uploadStatus && (
                <span className="text-emerald-600 text-xs">{uploadStatus}</span>
              )}
            </div>
          </div>
          <div>
            <label className="label">หมายเหตุ</label>
            <input className="input" value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="หมายเหตุ (ถ้ามี)" />
          </div>
        </div>

        {form.taxStatus === 'waiting' && (
          <div className="p-3 bg-orange-50 rounded-xl border border-orange-200 space-y-2">
            <p className="text-xs text-orange-700 font-medium">📋 รอใบกำกับภาษี — ระบบจะสร้างการ์ดติดตามให้อัตโนมัติ</p>
            <div>
              <label className="label">วันที่คาดว่าจะได้รับใบกำกับภาษี</label>
              <DatePicker value={form.taxDueDate} onChange={(v) => set('taxDueDate', v)} placeholder="ไม่ระบุ" />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button className="btn btn-danger px-6" onClick={handleSave} disabled={saving}>
            {saving ? '⏳ กำลังบันทึก…' : '💾 บันทึกรายจ่าย'}
          </button>
          {saved && <span className="text-emerald-600 text-sm font-medium">✓ บันทึกสำเร็จ</span>}
          {errMsg && <span className="text-red-500 text-sm">{errMsg}</span>}
        </div>
      </div>

      <ConfirmPopup
        open={!!warning}
        title="⚠️ ยอดเงินจะติดลบ"
        message={warning?.message ?? ''}
        onConfirm={proceed}
        onCancel={cancel}
        confirmLabel="ยืนยัน (ติดลบ)"
        danger
      />

      {uploadOpen && (
        <FileUploadPopup
          title={isTaxUpload ? 'อัปโหลดใบกำกับภาษี' : 'อัปโหลดใบเสร็จ'}
          description={`วันที่: ${date}`}
          createdAt={new Date(date + 'T00:00:00').toISOString()}
          filenamePrefix={isTaxUpload ? 'taxinvoice' : 'receipt'}
          folderBase={isTaxUpload ? 'taxinvoices' : 'receipts'}
          onConfirm={handleUploadDone}
          onCancel={() => setUploadOpen(false)}
        />
      )}
    </>
  )
}
