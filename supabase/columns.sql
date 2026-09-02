-- ไฟล์: supabase/columns.sql
-- ============================================================================
-- JodFlow — เติมคอลัมน์ที่ schema เดิมตกหล่น   [columns.sql]
--
-- ที่มา: schema.sql ถูกออกแบบจากเอกสาร ไม่ได้ไล่เทียบกับฟิลด์ที่หน้าจอเขียนจริง
-- พอไล่โค้ดใน src/pages + src/components ทีละฟอร์มแล้วพบว่ามีฟิลด์ที่แอปใช้อยู่
-- แต่ไม่มีคอลัมน์รองรับ ถ้าไม่เติมก่อน ข้อมูลจะหายเงียบๆ ตอนบันทึก
-- (PostgREST ไม่รู้จักคีย์ที่ส่งมา = ปฏิเสธทั้ง request)
--
-- ปลอดภัยกับข้อมูลเดิม: ทุกคำสั่งเป็น add column if not exists
-- รันซ้ำได้ไม่เสียหาย
-- ============================================================================

-- ── transactions ───────────────────────────────────────────────────────────
-- detail            : รายละเอียดเพิ่มเติมใต้ชื่อรายการ (IncomeForm/ExpenseForm)
-- other_income_type : ชื่อประเภทรายรับอื่นๆ ที่ผู้ใช้พิมพ์เอง เช่น "เงินทอน", "ขายเศษเหล็ก"
-- tax_due_date      : กำหนดวันที่ต้องได้ใบกำกับภาษี (แยกจาก due_date ของตัวรายการ)
-- document_*        : ไฟล์แนบใบแรกแบบเดิม ที่หน้าจอยังอ่านอยู่คู่กับ attachments jsonb

alter table transactions add column if not exists detail            text;
alter table transactions add column if not exists other_income_type text;
alter table transactions add column if not exists tax_due_date      date;
alter table transactions add column if not exists document_path     text;
alter table transactions add column if not exists document_type     text;
alter table transactions add column if not exists document_label    text;

-- รายรับ "อื่นๆ" (เช่นยอดจากช่องทางที่ไม่เข้ากระเป๋าเงินสด/โอน) ใช้ method = 'other'
-- ทั้งในหน้านำเข้าข้อมูลและหน้าบันทึกรายรับ — check เดิมไม่รับค่านี้ ต้องขยาย
alter table transactions drop constraint if exists transactions_method_check;
alter table transactions add  constraint transactions_method_check
  check (method in ('cash', 'transfer', 'pending', 'other'));

-- ── pending_payments (ค้างชำระ) ────────────────────────────────────────────
-- description                  : ข้อความหัวการ์ด (แยกจาก item_name ที่เป็นชื่อสินค้า)
-- open_date                    : วันที่เปิดบิล — ต่างจาก due_date ที่เป็นวันครบกำหนด
-- missing_due_date             : true เมื่อผู้ใช้ไม่ได้ระบุวันครบกำหนด (ใช้เตือนบนการ์ด)
-- default_method / default_transfer_account_id : วิธีจ่ายที่ตั้งไว้ล่วงหน้าจากรายการประจำ

alter table pending_payments add column if not exists description      text;
alter table pending_payments add column if not exists open_date        date;
alter table pending_payments add column if not exists missing_due_date boolean not null default false;
alter table pending_payments add column if not exists default_method   text;
alter table pending_payments add column if not exists default_transfer_account_id uuid
  references transfer_accounts(id) on delete set null;
alter table pending_payments add column if not exists document_path    text;
alter table pending_payments add column if not exists document_type    text;
alter table pending_payments add column if not exists document_label   text;

-- ── pending_incomes (รอรับเงิน) ────────────────────────────────────────────
-- open_date         : วันที่เปิดบิล (หน้าจอส่งมาในชื่อ date)
-- source            : 'main' = ยอดสด/โอน, 'other' = ยอดจากช่องทางอื่น
-- other_income_type : ชื่อประเภทที่ผู้ใช้พิมพ์เอง
-- default_transfer_account_id : บัญชีที่ผูกไว้ กดรับเงินโอนแล้วเข้าบัญชีนี้ทันที

alter table pending_incomes add column if not exists open_date         date;
alter table pending_incomes add column if not exists description       text;
alter table pending_incomes add column if not exists source            text;
alter table pending_incomes add column if not exists other_income_type text;
alter table pending_incomes add column if not exists default_transfer_account_id uuid
  references transfer_accounts(id) on delete set null;
alter table pending_incomes add column if not exists document_path     text;
alter table pending_incomes add column if not exists document_type     text;
alter table pending_incomes add column if not exists document_label    text;

-- ── tax_invoices (รอใบกำกับภาษี) ───────────────────────────────────────────
-- due_date : กำหนดวันที่ต้องได้ใบกำกับ ใช้เรียงการ์ดและเตือนเมื่อเลยกำหนด

alter table tax_invoices add column if not exists due_date       date;
alter table tax_invoices add column if not exists document_path  text;
alter table tax_invoices add column if not exists document_type  text;
alter table tax_invoices add column if not exists document_label text;

-- ── recurring_items (รายการประจำ) ──────────────────────────────────────────
-- ตั้งวิธีจ่ายไว้ล่วงหน้า พอถึงรอบจะได้กดจ่ายรวดเดียวโดยไม่ต้องเลือกซ้ำทุกเดือน

alter table recurring_items add column if not exists default_method text;
alter table recurring_items add column if not exists default_transfer_account_id uuid
  references transfer_accounts(id) on delete set null;
-- รอบเรียกเก็บ: monthly = ทุกเดือน / yearly = ปีละครั้งในเดือน billing_month
alter table recurring_items add column if not exists frequency text not null default 'monthly'
  check (frequency in ('monthly', 'yearly'));
alter table recurring_items add column if not exists billing_month int
  check (billing_month between 1 and 12);
-- ลบแม่แบบที่เคยจ่ายไปแล้วต้องเป็นการ "ซ่อน" ไม่ใช่ลบแถวจริง เพราะ recurring_entries
-- ผูกด้วย on delete cascade — ลบแถวเดียวจะพารอบที่จ่ายไปแล้วหายตามไปทั้งหมด
alter table recurring_items add column if not exists deleted boolean not null default false;
-- พักการเรียกเก็บชั่วคราว (until = เดือนที่กลับมาเรียกเก็บ) และบวก VAT ให้ยอด
-- fixed_amount ยังเก็บยอดก่อน VAT เสมอ เพื่อให้ปิด VAT แล้วได้ยอดเดิมกลับมาตรงๆ
alter table recurring_items add column if not exists paused_from  date;
alter table recurring_items add column if not exists paused_until date;
alter table recurring_items add column if not exists vat_rate     numeric(5,2) not null default 0;

-- ── recurring_entries (รอบรายเดือนของรายการประจำ) ──────────────────────────
-- transfer_account_id : บัญชีที่จ่ายจริงในรอบนั้น (ใช้คืนเงินให้ถูกบัญชีตอนยกเลิกการจ่าย)
-- amount_updated_at   : ครั้งล่าสุดที่ผู้ใช้กรอกยอดของรอบนี้ (รายการยอดไม่คงที่)
-- หน้าจอส่งสองฟิลด์นี้มาตั้งแต่แรก แต่ schema เดิมไม่มี → PostgREST ปฏิเสธทั้ง request
-- ทำให้กดจ่าย / ยกเลิกจ่าย / บันทึกยอด ของรายการประจำล้มทั้งหมด

alter table recurring_entries add column if not exists transfer_account_id uuid
  references transfer_accounts(id) on delete set null;
alter table recurring_entries add column if not exists amount_updated_at timestamptz;

-- ── ตรวจผล ─────────────────────────────────────────────────────────────────
-- ควรได้ 33 แถว (คอลัมน์ที่เพิ่งเติมทั้งหมด)
select table_name, column_name
  from information_schema.columns
 where table_schema = 'public'
   and (
     (table_name = 'transactions'      and column_name in ('detail','other_income_type','tax_due_date','document_path','document_type','document_label'))
  or (table_name = 'pending_payments'  and column_name in ('description','open_date','missing_due_date','default_method','default_transfer_account_id','document_path','document_type','document_label'))
  or (table_name = 'pending_incomes'   and column_name in ('open_date','description','source','other_income_type','default_transfer_account_id','document_path','document_type','document_label'))
  or (table_name = 'tax_invoices'      and column_name in ('due_date','document_path','document_type','document_label'))
  or (table_name = 'recurring_items'   and column_name in ('default_method','default_transfer_account_id','frequency','billing_month','deleted','paused_from','paused_until','vat_rate'))
  or (table_name = 'recurring_entries' and column_name in ('transfer_account_id','amount_updated_at'))
   )
 order by table_name, column_name;
