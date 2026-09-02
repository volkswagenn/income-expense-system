-- ไฟล์: supabase/setup.sql
-- ============================================================================
-- JodFlow — ติดตั้งฐานข้อมูลทั้งหมดในไฟล์เดียว (เวอร์ชัน Supabase Auth)   [setup.sql]
--
-- รวม schema + columns + policies + functions + wallet
-- ปิดท้ายด้วยส่วน "ล้างระบบ custom auth เก่า" — สำหรับฐานข้อมูลที่เคยติดตั้ง
-- เวอร์ชัน app_users/app_sessions ไปแล้ว (ดู archive/06_custom_auth.sql)
-- ฐานข้อมูลใหม่เอี่ยมก็รันไฟล์นี้ได้เหมือนกัน ส่วนล้างจะข้ามตัวเองอัตโนมัติ
--
-- ระบบนี้ใช้ Supabase Auth ตามปกติ — ตัวตนของ request คือ auth.uid() จาก JWT
--
-- วิธีใช้: Supabase → SQL Editor → ตรวจว่า Role เป็น postgres → วางทั้งไฟล์ → Run
-- ทุกคำสั่งเป็น if not exists / create or replace รันซ้ำได้ไม่เสียหาย และไม่มีคำสั่งใด
-- ลบข้อมูลของร้าน — ปลอดภัยที่จะรันทับฐานข้อมูลที่มีข้อมูลจริงอยู่แล้ว
-- ท้ายไฟล์มี query ตรวจผลว่าติดตั้งครบไหม
-- ============================================================================

-- ###########################################################################
-- ##  schema.sql
-- ###########################################################################

-- ============================================================================
-- JodFlow — Supabase schema (online-only)
-- รันไฟล์นี้เป็นไฟล์แรกใน Supabase SQL Editor
-- ทุกตารางข้อมูลผูกกับ shop_id เสมอ และถูกกั้นด้วย RLS ใน policies.sql
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── ตัวตน / ร้าน / สมาชิก ───────────────────────────────────────────────────

create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  display_name  text,
  created_at    timestamptz not null default now()
);

create table if not exists shops (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

-- role: owner = จัดการสมาชิก/ตั้งค่า/ลบข้อมูล, editor = บันทึก-แก้ไขข้อมูล, viewer = อ่านอย่างเดียว
create table if not exists shop_members (
  shop_id    uuid not null references shops(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'viewer' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);
create index if not exists shop_members_user_idx on shop_members (user_id);

create table if not exists shop_settings (
  shop_id            uuid primary key references shops(id) on delete cascade,
  notify_days_before int not null default 3,
  updated_at         timestamptz not null default now()
);

-- ── ยอดเงิน ────────────────────────────────────────────────────────────────
-- ยอดทุกก้อนต้องถูกแก้ผ่าน RPC ใน functions.sql เท่านั้น (atomic += / -=)
-- ห้าม client อ่านยอดมาคำนวณแล้วเขียนทับ เพราะหลายคนใช้พร้อมกันจะทับกันเอง

create table if not exists wallet_state (
  shop_id    uuid primary key references shops(id) on delete cascade,
  cash       numeric(14,2) not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists transfer_accounts (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references shops(id) on delete cascade,
  bank_name  text not null default '',
  name       text not null default '',
  balance    numeric(14,2) not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists transfer_accounts_shop_idx on transfer_accounts (shop_id);

create table if not exists sub_wallets (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references shops(id) on delete cascade,
  name       text not null,
  balance    numeric(14,2) not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists sub_wallets_shop_idx on sub_wallets (shop_id);

create table if not exists loans (
  id                  uuid primary key default gen_random_uuid(),
  shop_id             uuid not null references shops(id) on delete cascade,
  sub_wallet_id       uuid references sub_wallets(id) on delete set null,
  sub_name            text,
  amount              numeric(14,2) not null,
  method              text not null check (method in ('cash', 'transfer')),
  transfer_account_id uuid references transfer_accounts(id) on delete set null,
  borrowed_at         timestamptz not null default now(),
  returned            boolean not null default false,
  returned_at         timestamptz,
  return_method       text check (return_method in ('cash', 'transfer')),
  return_account_id   uuid references transfer_accounts(id) on delete set null
);
create index if not exists loans_shop_idx on loans (shop_id, returned);

-- ── ข้อมูลอ้างอิง ──────────────────────────────────────────────────────────

create table if not exists categories (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references shops(id) on delete cascade,
  name       text not null,
  type       text not null check (type in ('expense', 'income')),
  parent_id  uuid references categories(id) on delete cascade,
  deleted    boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists categories_shop_idx on categories (shop_id, type, deleted);

create table if not exists vendors (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references shops(id) on delete cascade,
  name       text not null,
  deleted    boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists vendors_shop_idx on vendors (shop_id, deleted);

create table if not exists quick_items (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id) on delete cascade,
  name        text not null,
  category_id uuid references categories(id) on delete set null,
  deleted     boolean not null default false,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists quick_items_shop_idx on quick_items (shop_id, deleted);

-- ── รายการประจำ ────────────────────────────────────────────────────────────

create table if not exists recurring_items (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references shops(id) on delete cascade,
  name         text not null,
  category_id  uuid references categories(id) on delete set null,
  vendor       text,
  billing_day  int not null check (billing_day between 1 and 31),
  amount_type  text not null default 'fixed' check (amount_type in ('fixed', 'variable')),
  fixed_amount numeric(14,2) default 0,
  note         text,
  enabled      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists recurring_items_shop_idx on recurring_items (shop_id, enabled);

create table if not exists recurring_entries (
  id                 uuid primary key default gen_random_uuid(),
  shop_id            uuid not null references shops(id) on delete cascade,
  recurring_id       uuid not null references recurring_items(id) on delete cascade,
  month              text not null,               -- 'YYYY-MM'
  due_date           date not null,
  status             text not null default 'pending' check (status in ('pending', 'paid', 'skipped')),
  amount             numeric(14,2) not null default 0,
  paid_at            timestamptz,
  paid_method        text check (paid_method in ('cash', 'transfer', 'pending')),
  transaction_id     uuid,
  pending_payment_id uuid,
  created_at         timestamptz not null default now(),
  unique (recurring_id, month)                    -- generateEntries เรียกซ้ำได้โดยไม่เกิดรายการซ้ำ
);
create index if not exists recurring_entries_shop_idx on recurring_entries (shop_id, month, status);

-- ── ธุรกรรม ────────────────────────────────────────────────────────────────

create table if not exists transactions (
  id                  uuid primary key default gen_random_uuid(),
  shop_id             uuid not null references shops(id) on delete cascade,
  date                date not null,
  type                text not null check (type in ('income', 'expense')),
  amount              numeric(14,2) not null,
  method              text not null check (method in ('cash', 'transfer', 'pending')),
  category_id         uuid references categories(id) on delete set null,
  item_name           text not null default '',
  vendor              text,
  receipt_no          text,
  tax_status          text,
  due_date            date,
  note                text,
  transfer_account_id uuid references transfer_accounts(id) on delete set null,
  recurring_entry_id  uuid references recurring_entries(id) on delete set null,
  attachments         jsonb not null default '[]',
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists transactions_shop_date_idx on transactions (shop_id, date desc);
create index if not exists transactions_shop_type_idx on transactions (shop_id, type, date desc);

create table if not exists pending_payments (
  id                  uuid primary key default gen_random_uuid(),
  shop_id             uuid not null references shops(id) on delete cascade,
  item_name           text not null default '',
  amount              numeric(14,2) not null,
  category_id         uuid references categories(id) on delete set null,
  vendor              text,
  receipt_no          text,
  tax_status          text,
  due_date            date,
  note                text,
  status              text not null default 'pending' check (status in ('pending', 'paid')),
  paid_at             timestamptz,
  paid_method         text check (paid_method in ('cash', 'transfer')),
  transfer_account_id uuid references transfer_accounts(id) on delete set null,
  transaction_id      uuid references transactions(id) on delete set null,
  recurring_entry_id  uuid references recurring_entries(id) on delete set null,
  attachments         jsonb not null default '[]',
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now()
);
create index if not exists pending_payments_shop_idx on pending_payments (shop_id, status, due_date);

create table if not exists pending_incomes (
  id                  uuid primary key default gen_random_uuid(),
  shop_id             uuid not null references shops(id) on delete cascade,
  item_name           text not null default '',
  amount              numeric(14,2) not null,
  category_id         uuid references categories(id) on delete set null,
  payer               text,
  due_date            date,
  note                text,
  status              text not null default 'pending' check (status in ('pending', 'received')),
  received_at         timestamptz,
  received_method     text check (received_method in ('cash', 'transfer')),
  transfer_account_id uuid references transfer_accounts(id) on delete set null,
  transaction_id      uuid references transactions(id) on delete set null,
  attachments         jsonb not null default '[]',
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now()
);
create index if not exists pending_incomes_shop_idx on pending_incomes (shop_id, status, due_date);

create table if not exists tax_invoices (
  id             uuid primary key default gen_random_uuid(),
  shop_id        uuid not null references shops(id) on delete cascade,
  transaction_id uuid references transactions(id) on delete cascade,
  vendor         text,
  receipt_no     text,
  amount         numeric(14,2),
  item_name      text,
  status         text not null default 'waiting' check (status in ('waiting', 'received')),
  received_at    timestamptz,
  file_path      text,
  attachments    jsonb not null default '[]',
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now()
);
create index if not exists tax_invoices_shop_idx on tax_invoices (shop_id, status);

-- ── ปฏิทิน / ประวัติการใช้งาน ───────────────────────────────────────────────

create table if not exists calendar_notes (
  shop_id    uuid not null references shops(id) on delete cascade,
  date       date not null,
  text       text not null default '',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (shop_id, date)
);

create table if not exists activity_logs (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references shops(id) on delete cascade,
  user_id       uuid references auth.users(id),
  timestamp     timestamptz not null default now(),
  activity_type text not null,
  description   text,
  old_value     jsonb,
  new_value     jsonb,
  change_note   text,
  wallet_effect jsonb,
  status        text not null default 'success',
  error_message text,
  device_info   text,
  session_id    text
);
create index if not exists activity_logs_shop_time_idx on activity_logs (shop_id, timestamp desc);

-- ── trigger: สร้าง profile อัตโนมัติเมื่อสมัครสมาชิก ─────────────────────────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── trigger: คนสร้างร้านได้เป็น owner + ตั้งค่าเริ่มต้นให้ร้านทันที ──────────

create or replace function public.handle_new_shop()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- สร้างร้านจาก SQL Editor จะไม่มีผู้ใช้ล็อกอินอยู่ auth.uid() จึงเป็น NULL
  -- ต้องข้ามบรรทัดนี้ ไม่งั้นชน NOT NULL แล้วพังทั้งคำสั่ง (on conflict ไม่ช่วย
  -- เพราะมันกันแค่คีย์ซ้ำ ไม่ได้กันค่าว่าง) — กรณีนั้นให้ผู้สั่งเพิ่ม owner เองทีหลัง
  if auth.uid() is not null then
    insert into shop_members (shop_id, user_id, role) values (new.id, auth.uid(), 'owner')
      on conflict do nothing;
  end if;
  insert into shop_settings (shop_id) values (new.id) on conflict do nothing;
  insert into wallet_state (shop_id) values (new.id) on conflict do nothing;
  insert into categories (shop_id, name, type) values (new.id, 'อื่นๆ', 'expense'), (new.id, 'อื่นๆ', 'income');
  return new;
end;
$$;

drop trigger if exists on_shop_created on shops;
create trigger on_shop_created
  after insert on shops
  for each row execute function public.handle_new_shop();

-- ── realtime: ให้ทุกเครื่องที่เปิดอยู่เห็นการเปลี่ยนแปลงทันที ────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'wallet_state', 'transfer_accounts', 'sub_wallets', 'loans',
    'categories', 'vendors', 'quick_items',
    'recurring_items', 'recurring_entries',
    'transactions', 'pending_payments', 'pending_incomes', 'tax_invoices',
    'calendar_notes', 'activity_logs', 'shop_settings', 'shop_members'
  ] loop
    execute format('alter table %I replica identity full', t);
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ###########################################################################
-- ##  columns.sql
-- ###########################################################################

-- ============================================================================
-- JodFlow — เติมคอลัมน์ที่ schema เดิมตกหล่น
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

-- ── ตรวจผล ─────────────────────────────────────────────────────────────────
-- ควรได้ 31 แถว (คอลัมน์ที่เพิ่งเติมทั้งหมด)
select table_name, column_name
  from information_schema.columns
 where table_schema = 'public'
   and (
     (table_name = 'transactions'     and column_name in ('detail','other_income_type','tax_due_date','document_path','document_type','document_label'))
  or (table_name = 'pending_payments' and column_name in ('description','open_date','missing_due_date','default_method','default_transfer_account_id','document_path','document_type','document_label'))
  or (table_name = 'pending_incomes'  and column_name in ('open_date','description','source','other_income_type','default_transfer_account_id','document_path','document_type','document_label'))
  or (table_name = 'tax_invoices'     and column_name in ('due_date','document_path','document_type','document_label'))
  or (table_name = 'recurring_items'  and column_name in ('default_method','default_transfer_account_id','frequency','billing_month','deleted'))
   )
 order by table_name, column_name;

-- ###########################################################################
-- ##  policies.sql
-- ###########################################################################

-- ============================================================================
-- JodFlow — Row Level Security
-- anon key ถูกฝังอยู่ในหน้าเว็บและใครก็อ่านได้ → RLS คือด่านความปลอดภัยเดียวจริงๆ
-- กติกา: เห็นได้เฉพาะร้านที่ตัวเองเป็นสมาชิก, แก้ได้เฉพาะ owner/editor
-- ============================================================================

-- ── helper (security definer เพื่อไม่ให้ policy วน loop กับ shop_members) ────

create or replace function public.is_member(p_shop uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from shop_members m where m.shop_id = p_shop and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_edit(p_shop uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from shop_members m
    where m.shop_id = p_shop and m.user_id = auth.uid() and m.role in ('owner', 'editor')
  );
$$;

create or replace function public.is_owner(p_shop uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from shop_members m
    where m.shop_id = p_shop and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

-- ── ตาราง identity ─────────────────────────────────────────────────────────

alter table profiles enable row level security;
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select using (
  id = auth.uid()
  or exists (
    select 1 from shop_members me
    join shop_members other on other.shop_id = me.shop_id
    where me.user_id = auth.uid() and other.user_id = profiles.id
  )
);
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());

alter table shops enable row level security;
drop policy if exists shops_select on shops;
create policy shops_select on shops for select using (is_member(id));
drop policy if exists shops_insert on shops;
create policy shops_insert on shops for insert with check (auth.uid() is not null);
drop policy if exists shops_update on shops;
create policy shops_update on shops for update using (is_owner(id)) with check (is_owner(id));
drop policy if exists shops_delete on shops;
create policy shops_delete on shops for delete using (is_owner(id));

alter table shop_members enable row level security;
drop policy if exists shop_members_select on shop_members;
create policy shop_members_select on shop_members for select using (is_member(shop_id));
drop policy if exists shop_members_write on shop_members;
create policy shop_members_write on shop_members for all
  using (is_owner(shop_id)) with check (is_owner(shop_id));

-- ── ตารางข้อมูลทั้งหมด: อ่าน = สมาชิก, เขียน = owner/editor ─────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'shop_settings', 'wallet_state', 'transfer_accounts', 'sub_wallets', 'loans',
    'categories', 'vendors', 'quick_items',
    'recurring_items', 'recurring_entries',
    'transactions', 'pending_payments', 'pending_incomes', 'tax_invoices',
    'calendar_notes', 'activity_logs'
  ] loop
    execute format('alter table %I enable row level security', t);

    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format(
      'create policy %I on %I for select using (is_member(shop_id))', t || '_select', t);

    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format(
      'create policy %I on %I for insert with check (can_edit(shop_id))', t || '_insert', t);

    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format(
      'create policy %I on %I for update using (can_edit(shop_id)) with check (can_edit(shop_id))',
      t || '_update', t);

    execute format('drop policy if exists %I on %I', t || '_delete', t);
    execute format(
      'create policy %I on %I for delete using (can_edit(shop_id))', t || '_delete', t);
  end loop;
end $$;

-- ประวัติการใช้งานต้องแก้ย้อนหลังไม่ได้ ลบได้เฉพาะเจ้าของร้าน (ใช้ตอนล้าง log เก่า)
drop policy if exists activity_logs_update on activity_logs;
drop policy if exists activity_logs_delete on activity_logs;
create policy activity_logs_delete on activity_logs for delete using (is_owner(shop_id));

-- ตั้งค่าร้านให้แก้ได้เฉพาะเจ้าของ
drop policy if exists shop_settings_update on shop_settings;
create policy shop_settings_update on shop_settings for update
  using (is_owner(shop_id)) with check (is_owner(shop_id));

-- ── Storage: ไฟล์แนบ ───────────────────────────────────────────────────────
-- bucket 'attachments' ตั้งเป็น private แล้วอ่านผ่าน signed URL
-- โครงพาธบังคับ: <shop_id>/<receipts|taxinvoices>/<YYYY>/<MM>/<filename>

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

drop policy if exists attachments_read on storage.objects;
create policy attachments_read on storage.objects for select using (
  bucket_id = 'attachments' and is_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists attachments_write on storage.objects;
create policy attachments_write on storage.objects for insert with check (
  bucket_id = 'attachments' and can_edit(((storage.foldername(name))[1])::uuid)
);

drop policy if exists attachments_update on storage.objects;
create policy attachments_update on storage.objects for update using (
  bucket_id = 'attachments' and can_edit(((storage.foldername(name))[1])::uuid)
);

drop policy if exists attachments_delete on storage.objects;
create policy attachments_delete on storage.objects for delete using (
  bucket_id = 'attachments' and can_edit(((storage.foldername(name))[1])::uuid)
);

-- ###########################################################################
-- ##  functions.sql
-- ###########################################################################

-- ============================================================================
-- JodFlow — RPC สำหรับงานที่ต้อง "จบในครั้งเดียว" (atomic)
--
-- ทำไมต้องมี: ตอนนี้แอปทำงานหลายคนพร้อมกัน ถ้า client อ่านยอด → บวกเลข → เขียนกลับ
-- สองคนที่กดพร้อมกันจะเขียนทับกันและเงินหาย ทุกการขยับยอดจึงต้องเป็น
-- `set balance = balance + delta` ที่ฝั่งฐานข้อมูล และงานที่มีหลายสเต็ป
-- (บันทึกรายการ + ตัดเงิน + เขียน log) ต้องอยู่ใน transaction เดียวกัน
-- ============================================================================

create or replace function public.assert_can_edit(p_shop uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not can_edit(p_shop) then
    raise exception 'ไม่มีสิทธิ์แก้ไขข้อมูลของร้านนี้' using errcode = '42501';
  end if;
end;
$$;

-- ── ขยับยอดทีละก้อน ────────────────────────────────────────────────────────

create or replace function public.adjust_cash(p_shop uuid, p_delta numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_cash numeric;
begin
  perform assert_can_edit(p_shop);
  update wallet_state set cash = cash + p_delta, updated_at = now()
   where shop_id = p_shop
  returning cash into v_cash;
  return v_cash;
end;
$$;

create or replace function public.adjust_transfer_account(p_account uuid, p_delta numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_shop uuid; v_balance numeric;
begin
  select shop_id into v_shop from transfer_accounts where id = p_account;
  if v_shop is null then raise exception 'ไม่พบบัญชีเงินโอน'; end if;
  perform assert_can_edit(v_shop);
  update transfer_accounts set balance = balance + p_delta
   where id = p_account
  returning balance into v_balance;
  return v_balance;
end;
$$;

create or replace function public.adjust_sub_wallet(p_sub uuid, p_delta numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_shop uuid; v_balance numeric;
begin
  select shop_id into v_shop from sub_wallets where id = p_sub;
  if v_shop is null then raise exception 'ไม่พบกระเป๋าตังค์ย่อย'; end if;
  perform assert_can_edit(v_shop);
  update sub_wallets set balance = balance + p_delta
   where id = p_sub
  returning balance into v_balance;
  return v_balance;
end;
$$;

create or replace function public.move_between_transfer_accounts(
  p_from uuid, p_to uuid, p_amount numeric
) returns void language plpgsql security definer set search_path = public as $$
declare v_shop uuid;
begin
  select shop_id into v_shop from transfer_accounts where id = p_from;
  if v_shop is null then raise exception 'ไม่พบบัญชีต้นทาง'; end if;
  perform assert_can_edit(v_shop);
  update transfer_accounts set balance = balance - p_amount where id = p_from;
  update transfer_accounts set balance = balance + p_amount where id = p_to and shop_id = v_shop;
end;
$$;

-- ── ปลายทางของเงินแบบข้อความเดียว: 'cash' | 'transfer:<uuid>' | 'sub:<uuid>' ──

create or replace function public.apply_wallet_effect(
  p_shop uuid, p_target text, p_delta numeric
) returns void language plpgsql security definer set search_path = public as $$
declare v_kind text; v_id text;
begin
  if p_target is null or p_delta = 0 then return; end if;
  perform assert_can_edit(p_shop);

  v_kind := split_part(p_target, ':', 1);
  v_id   := nullif(split_part(p_target, ':', 2), '');

  if v_kind = 'cash' then
    update wallet_state set cash = cash + p_delta, updated_at = now() where shop_id = p_shop;
  elsif v_kind = 'transfer' then
    update transfer_accounts set balance = balance + p_delta
     where id = v_id::uuid and shop_id = p_shop;
  elsif v_kind = 'sub' then
    update sub_wallets set balance = balance + p_delta
     where id = v_id::uuid and shop_id = p_shop;
  else
    raise exception 'ปลายทางไม่ถูกต้อง: %', p_target;
  end if;
end;
$$;

create or replace function public.write_log(p_shop uuid, p_log jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_log is null then return; end if;
  insert into activity_logs (
    shop_id, user_id, activity_type, description, old_value, new_value,
    change_note, wallet_effect, status, error_message, device_info, session_id
  ) values (
    p_shop, auth.uid(),
    p_log->>'activityType', p_log->>'description',
    p_log->'oldValue', p_log->'newValue',
    p_log->>'changeNote', p_log->'walletEffect',
    coalesce(p_log->>'status', 'success'), p_log->>'errorMessage',
    p_log->>'deviceInfo', p_log->>'sessionId'
  );
end;
$$;

-- ── บันทึกรายการ + ตัด/เพิ่มเงิน + เขียน log ในครั้งเดียว ────────────────────

create or replace function public.post_transaction(
  p_shop   uuid,
  p_tx     jsonb,
  p_target text default null,
  p_delta  numeric default 0,
  p_log    jsonb default null
) returns transactions language plpgsql security definer set search_path = public as $$
declare v_tx transactions;
begin
  perform assert_can_edit(p_shop);

  insert into transactions (
    shop_id, date, type, amount, method, category_id, item_name, vendor,
    receipt_no, tax_status, due_date, note, transfer_account_id,
    recurring_entry_id, attachments, created_by
  ) values (
    p_shop,
    (p_tx->>'date')::date,
    p_tx->>'type',
    (p_tx->>'amount')::numeric,
    p_tx->>'method',
    nullif(p_tx->>'categoryId', '')::uuid,
    coalesce(p_tx->>'itemName', ''),
    p_tx->>'vendor',
    p_tx->>'receiptNo',
    p_tx->>'taxStatus',
    nullif(p_tx->>'dueDate', '')::date,
    p_tx->>'note',
    nullif(p_tx->>'transferAccountId', '')::uuid,
    nullif(p_tx->>'recurringEntryId', '')::uuid,
    coalesce(p_tx->'attachments', '[]'::jsonb),
    auth.uid()
  ) returning * into v_tx;

  perform apply_wallet_effect(p_shop, p_target, p_delta);
  perform write_log(p_shop, p_log);
  return v_tx;
end;
$$;

-- ยกเลิกรายการ: คืนเงิน + ลบรายการค้าง/ใบกำกับที่ผูกอยู่ + ย้อนสถานะรอรับเงิน
create or replace function public.cancel_transaction(
  p_tx_id  uuid,
  p_target text default null,
  p_delta  numeric default 0,
  p_log    jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_shop uuid;
begin
  select shop_id into v_shop from transactions where id = p_tx_id;
  if v_shop is null then raise exception 'ไม่พบรายการนี้'; end if;
  perform assert_can_edit(v_shop);

  perform apply_wallet_effect(v_shop, p_target, p_delta);

  update pending_incomes
     set status = 'pending', received_at = null, received_method = null,
         transaction_id = null, transfer_account_id = null
   where transaction_id = p_tx_id;

  update recurring_entries
     set status = 'pending', transaction_id = null, pending_payment_id = null,
         paid_at = null, paid_method = null, amount = 0
   where transaction_id = p_tx_id;

  delete from pending_payments where transaction_id = p_tx_id;
  delete from tax_invoices    where transaction_id = p_tx_id;
  delete from transactions    where id = p_tx_id;

  perform write_log(v_shop, p_log);
end;
$$;

-- ── ล้างข้อมูลทั้งร้าน (เฉพาะเจ้าของ) — ใช้กับปุ่ม "ล้างข้อมูลทั้งหมด" ────────

create or replace function public.clear_shop_data(p_shop uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_owner(p_shop) then
    raise exception 'เฉพาะเจ้าของร้านเท่านั้นที่ล้างข้อมูลได้' using errcode = '42501';
  end if;

  delete from tax_invoices      where shop_id = p_shop;
  delete from pending_payments  where shop_id = p_shop;
  delete from pending_incomes   where shop_id = p_shop;
  delete from transactions      where shop_id = p_shop;
  delete from recurring_entries where shop_id = p_shop;
  delete from recurring_items   where shop_id = p_shop;
  delete from loans             where shop_id = p_shop;
  delete from sub_wallets       where shop_id = p_shop;
  delete from transfer_accounts where shop_id = p_shop;
  delete from calendar_notes    where shop_id = p_shop;
  delete from activity_logs     where shop_id = p_shop;
  delete from quick_items       where shop_id = p_shop;
  delete from vendors           where shop_id = p_shop;
  delete from categories        where shop_id = p_shop;

  update wallet_state set cash = 0, updated_at = now() where shop_id = p_shop;
  insert into categories (shop_id, name, type)
  values (p_shop, 'อื่นๆ', 'expense'), (p_shop, 'อื่นๆ', 'income');
end;
$$;

-- ###########################################################################
-- ##  wallet.sql
-- ###########################################################################

-- ============================================================================
-- JodFlow — RPC สำหรับงานเงินที่ขยับ "สองก้อนพร้อมกัน"
--
-- functions.sql มี post_transaction / cancel_transaction / adjust_* แล้ว
-- แต่ยังขาดงานที่ต้องย้ายเงินจากที่หนึ่งไปอีกที่หนึ่ง ซึ่งถ้าปล่อยให้ client
-- ยิง adjust_* สองครั้งแล้วเน็ตหลุดคั่นกลาง = เงินหายจริง (ตัดออกแล้วไม่เข้าปลายทาง)
-- ทุกฟังก์ชันในไฟล์นี้จึงทำทั้งขาออกและขาเข้าใน transaction เดียว
--
-- รันไฟล์นี้หลัง functions.sql — เป็น create or replace ทั้งหมด รันซ้ำได้
-- ============================================================================

-- ── ย้ายเงินสด ↔ บัญชีเงินโอน ───────────────────────────────────────────────

create or replace function public.move_cash_transfer(
  p_shop    uuid,
  p_account uuid,
  p_amount  numeric,
  p_to      text,               -- 'transfer' = สด→โอน, 'cash' = โอน→สด
  p_log     jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform assert_can_edit(p_shop);
  if p_amount <= 0 then raise exception 'จำนวนเงินต้องมากกว่า 0'; end if;

  if p_to = 'transfer' then
    update wallet_state set cash = cash - p_amount, updated_at = now() where shop_id = p_shop;
    update transfer_accounts set balance = balance + p_amount
     where id = p_account and shop_id = p_shop;
  elsif p_to = 'cash' then
    update transfer_accounts set balance = balance - p_amount
     where id = p_account and shop_id = p_shop;
    update wallet_state set cash = cash + p_amount, updated_at = now() where shop_id = p_shop;
  else
    raise exception 'ปลายทางไม่ถูกต้อง: %', p_to;
  end if;

  if not found then raise exception 'ไม่พบบัญชีเงินโอนของร้านนี้'; end if;
  perform write_log(p_shop, p_log);
end;
$$;

-- ── ฝาก/ถอน ระหว่างกระเป๋าหลักกับกระเป๋าย่อย ────────────────────────────────
-- p_direction: 'in'  = จากกระเป๋าหลัก → กระเป๋าย่อย (ฝาก)
--              'out' = จากกระเป๋าย่อย → กระเป๋าหลัก (ถอน)
-- p_method: 'cash' หรือ 'transfer' (ถ้า transfer ต้องมี p_account)

create or replace function public.move_sub_wallet(
  p_shop      uuid,
  p_sub       uuid,
  p_amount    numeric,
  p_direction text,
  p_method    text,
  p_account   uuid default null,
  p_log       jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_sign numeric;
begin
  perform assert_can_edit(p_shop);
  if p_amount <= 0 then raise exception 'จำนวนเงินต้องมากกว่า 0'; end if;
  if p_direction not in ('in', 'out') then raise exception 'ทิศทางไม่ถูกต้อง: %', p_direction; end if;
  if p_method = 'transfer' and p_account is null then
    raise exception 'ต้องระบุบัญชีเงินโอน';
  end if;

  -- ฝาก = กระเป๋าย่อยเพิ่ม กระเป๋าหลักลด / ถอน = กลับกัน
  v_sign := case when p_direction = 'in' then 1 else -1 end;

  update sub_wallets set balance = balance + (v_sign * p_amount)
   where id = p_sub and shop_id = p_shop;
  if not found then raise exception 'ไม่พบกระเป๋าตังค์ย่อยของร้านนี้'; end if;

  if p_method = 'cash' then
    update wallet_state set cash = cash - (v_sign * p_amount), updated_at = now()
     where shop_id = p_shop;
  else
    update transfer_accounts set balance = balance - (v_sign * p_amount)
     where id = p_account and shop_id = p_shop;
    if not found then raise exception 'ไม่พบบัญชีเงินโอนของร้านนี้'; end if;
  end if;

  perform write_log(p_shop, p_log);
end;
$$;

-- ── โอนระหว่างกระเป๋าย่อยสองใบ ──────────────────────────────────────────────

create or replace function public.move_between_sub_wallets(
  p_shop uuid, p_from uuid, p_to uuid, p_amount numeric, p_log jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform assert_can_edit(p_shop);
  if p_amount <= 0 then raise exception 'จำนวนเงินต้องมากกว่า 0'; end if;
  if p_from = p_to then raise exception 'ต้นทางกับปลายทางเป็นกระเป๋าเดียวกัน'; end if;

  update sub_wallets set balance = balance - p_amount where id = p_from and shop_id = p_shop;
  if not found then raise exception 'ไม่พบกระเป๋าต้นทาง'; end if;

  update sub_wallets set balance = balance + p_amount where id = p_to and shop_id = p_shop;
  if not found then raise exception 'ไม่พบกระเป๋าปลายทาง'; end if;

  perform write_log(p_shop, p_log);
end;
$$;

-- ── ยืมเงินจากกระเป๋าย่อย (ตัดกระเป๋า + เข้ากระเป๋าหลัก + สร้างรายการยืม) ────

create or replace function public.borrow_from_sub_wallet(
  p_shop     uuid,
  p_sub      uuid,
  p_amount   numeric,
  p_method   text,                    -- เงินที่ยืมออกมาเข้าทางไหน
  p_account  uuid default null,
  p_sub_name text default null,
  p_log      jsonb default null
) returns loans language plpgsql security definer set search_path = public as $$
declare v_loan loans;
begin
  perform assert_can_edit(p_shop);
  if p_amount <= 0 then raise exception 'จำนวนเงินต้องมากกว่า 0'; end if;
  if p_method = 'transfer' and p_account is null then raise exception 'ต้องระบุบัญชีเงินโอน'; end if;

  update sub_wallets set balance = balance - p_amount where id = p_sub and shop_id = p_shop;
  if not found then raise exception 'ไม่พบกระเป๋าตังค์ย่อยของร้านนี้'; end if;

  if p_method = 'cash' then
    update wallet_state set cash = cash + p_amount, updated_at = now() where shop_id = p_shop;
  else
    update transfer_accounts set balance = balance + p_amount
     where id = p_account and shop_id = p_shop;
    if not found then raise exception 'ไม่พบบัญชีเงินโอนของร้านนี้'; end if;
  end if;

  insert into loans (shop_id, sub_wallet_id, sub_name, amount, method, transfer_account_id)
  values (p_shop, p_sub, p_sub_name, p_amount, p_method, p_account)
  returning * into v_loan;

  perform write_log(p_shop, p_log);
  return v_loan;
end;
$$;

-- ── คืนเงินที่ยืม (ตัดกระเป๋าหลัก + คืนกระเป๋าย่อย + ปิดรายการยืม) ──────────

create or replace function public.return_loan(
  p_loan    uuid,
  p_method  text,
  p_account uuid default null,
  p_log     jsonb default null
) returns loans language plpgsql security definer set search_path = public as $$
declare v_loan loans;
begin
  select * into v_loan from loans where id = p_loan;
  if v_loan.id is null then raise exception 'ไม่พบรายการยืมนี้'; end if;
  if v_loan.returned then raise exception 'รายการนี้คืนไปแล้ว'; end if;
  perform assert_can_edit(v_loan.shop_id);
  if p_method = 'transfer' and p_account is null then raise exception 'ต้องระบุบัญชีเงินโอน'; end if;

  if p_method = 'cash' then
    update wallet_state set cash = cash - v_loan.amount, updated_at = now()
     where shop_id = v_loan.shop_id;
  else
    update transfer_accounts set balance = balance - v_loan.amount
     where id = p_account and shop_id = v_loan.shop_id;
    if not found then raise exception 'ไม่พบบัญชีเงินโอนของร้านนี้'; end if;
  end if;

  update sub_wallets set balance = balance + v_loan.amount where id = v_loan.sub_wallet_id;

  update loans
     set returned = true, returned_at = now(), return_method = p_method, return_account_id = p_account
   where id = p_loan
  returning * into v_loan;

  perform write_log(v_loan.shop_id, p_log);
  return v_loan;
end;
$$;

-- ── จ่ายรายการค้างชำระ (สร้าง transaction + ตัดเงิน + ปิดรายการค้าง + log) ──

create or replace function public.pay_pending_payment(
  p_pending uuid,
  p_method  text,
  p_account uuid default null,
  p_date    date default null,
  p_log     jsonb default null
) returns transactions language plpgsql security definer set search_path = public as $$
declare v_p pending_payments; v_tx transactions; v_target text;
begin
  select * into v_p from pending_payments where id = p_pending;
  if v_p.id is null then raise exception 'ไม่พบรายการค้างชำระนี้'; end if;
  if v_p.status = 'paid' then raise exception 'รายการนี้จ่ายไปแล้ว'; end if;
  perform assert_can_edit(v_p.shop_id);
  if p_method = 'transfer' and p_account is null then raise exception 'ต้องระบุบัญชีเงินโอน'; end if;

  insert into transactions (
    shop_id, date, type, amount, method, category_id, item_name, vendor,
    receipt_no, tax_status, note, transfer_account_id, recurring_entry_id,
    attachments, document_path, document_type, document_label, created_by
  ) values (
    v_p.shop_id, coalesce(p_date, current_date), 'expense', v_p.amount, p_method,
    v_p.category_id, v_p.item_name, v_p.vendor, v_p.receipt_no, v_p.tax_status,
    v_p.note, p_account, v_p.recurring_entry_id,
    v_p.attachments, v_p.document_path, v_p.document_type, v_p.document_label, auth.uid()
  ) returning * into v_tx;

  v_target := case when p_method = 'cash' then 'cash' else 'transfer:' || p_account end;
  perform apply_wallet_effect(v_p.shop_id, v_target, -v_p.amount);

  update pending_payments
     set status = 'paid', paid_at = now(), paid_method = p_method,
         transfer_account_id = p_account, transaction_id = v_tx.id
   where id = p_pending;

  -- รายการประจำที่ผูกอยู่ต้องเปลี่ยนเป็นจ่ายแล้วด้วย ไม่งั้นเดือนนั้นจะค้างอยู่
  if v_p.recurring_entry_id is not null then
    update recurring_entries
       set status = 'paid', paid_at = now(), paid_method = p_method,
           transaction_id = v_tx.id, amount = v_p.amount
     where id = v_p.recurring_entry_id;
  end if;

  perform write_log(v_p.shop_id, p_log);
  return v_tx;
end;
$$;

-- ── รับเงินที่รออยู่ (สร้าง transaction + เพิ่มเงิน + ปิดรายการรอ + log) ────

create or replace function public.receive_pending_income(
  p_pending uuid,
  p_method  text,
  p_account uuid default null,
  p_date    date default null,
  p_log     jsonb default null
) returns transactions language plpgsql security definer set search_path = public as $$
declare v_p pending_incomes; v_tx transactions; v_target text;
begin
  select * into v_p from pending_incomes where id = p_pending;
  if v_p.id is null then raise exception 'ไม่พบรายการรอรับเงินนี้'; end if;
  if v_p.status = 'received' then raise exception 'รายการนี้รับเงินไปแล้ว'; end if;
  perform assert_can_edit(v_p.shop_id);
  if p_method = 'transfer' and p_account is null then raise exception 'ต้องระบุบัญชีเงินโอน'; end if;

  insert into transactions (
    shop_id, date, type, amount, method, category_id, item_name, note,
    transfer_account_id, other_income_type, attachments,
    document_path, document_type, document_label, created_by
  ) values (
    v_p.shop_id, coalesce(p_date, current_date), 'income', v_p.amount, p_method,
    v_p.category_id, coalesce(v_p.item_name, v_p.description, 'รับเงินจากรายการรอ'),
    v_p.note, p_account, v_p.other_income_type, v_p.attachments,
    v_p.document_path, v_p.document_type, v_p.document_label, auth.uid()
  ) returning * into v_tx;

  v_target := case when p_method = 'cash' then 'cash' else 'transfer:' || p_account end;
  perform apply_wallet_effect(v_p.shop_id, v_target, v_p.amount);

  update pending_incomes
     set status = 'received', received_at = now(), received_method = p_method,
         transfer_account_id = p_account, transaction_id = v_tx.id
   where id = p_pending;

  perform write_log(v_p.shop_id, p_log);
  return v_tx;
end;
$$;

-- ── ตรวจว่าฟังก์ชันครบ (ควรได้ 7 แถว) ───────────────────────────────────────

select routine_name
  from information_schema.routines
 where routine_schema = 'public'
   and routine_name in (
     'move_cash_transfer', 'move_sub_wallet', 'move_between_sub_wallets',
     'borrow_from_sub_wallet', 'return_loan',
     'pay_pending_payment', 'receive_pending_income'
   )
 order by routine_name;


-- ###########################################################################
-- ##  ล้างระบบ custom auth เก่า (app_users / app_sessions)
-- ##
-- ##  ฐานข้อมูลที่เคยรันเวอร์ชัน custom auth จะมี foreign key ชี้ไปที่ app_users
-- ##  ต้องย้ายกลับมาชี้ auth.users ไม่งั้นบันทึกอะไรไม่ได้เลย
-- ##  ฐานข้อมูลที่ไม่เคยติดตั้ง: บล็อกนี้ตรวจแล้วข้ามตัวเองทั้งหมด
-- ###########################################################################

do $cleanup$
declare r record;
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'app_users'
  ) then
    return; -- ไม่เคยติดตั้ง custom auth — ไม่มีอะไรต้องล้าง
  end if;

  -- identity ที่สร้างด้วย app_create_user ไม่มีตัวตนใน auth.users จึงต้องจัดการก่อน
  -- ไม่งั้น add constraint ใหม่จะ validate ไม่ผ่าน
  --
  -- ⚠ ห้าม delete from shops เด็ดขาด — ตารางลูกทุกตัวผูกด้วย on delete cascade
  --   ลบร้านทิ้ง 1 แถว = รายการ ยอดเงิน หมวดหมู่ รายการประจำ และประวัติของร้านนั้น
  --   หายถาวรทั้งหมดในคำสั่งเดียว ทั้งที่ปัญหาจริงมีแค่ค่าในคอลัมน์ created_by
  --   แค่ล้างค่าให้เป็น null ก็พอให้ foreign key ใหม่ผ่านแล้ว ข้อมูลอยู่ครบ
  update shops set created_by = null
   where created_by is not null and created_by not in (select id from auth.users);

  -- สมาชิกที่ไม่มีตัวตนใน auth.users ต้องออก ไม่งั้น FK ใหม่ validate ไม่ผ่าน
  -- ลบเฉพาะ "สิทธิ์เข้าถึง" ไม่แตะข้อมูลของร้าน — ถ้าร้านไหนเหลือ owner 0 คน
  -- จะมี NOTICE เตือนท้ายบล็อก ให้เพิ่ม owner ใหม่ด้วย access.sql
  delete from shop_members where user_id not in (select id from auth.users);
  delete from profiles where id not in (select id from auth.users);

  -- คอลัมน์บันทึกว่า "ใครเป็นคนทำ" — ตั้งเป็น null พอ ไม่ต้องลบทั้งแถว
  update transactions     set created_by = null where created_by is not null and created_by not in (select id from auth.users);
  update pending_payments set created_by = null where created_by is not null and created_by not in (select id from auth.users);
  update pending_incomes  set created_by = null where created_by is not null and created_by not in (select id from auth.users);
  update tax_invoices     set created_by = null where created_by is not null and created_by not in (select id from auth.users);
  update calendar_notes   set updated_by = null where updated_by is not null and updated_by not in (select id from auth.users);
  update activity_logs    set user_id    = null where user_id    is not null and user_id    not in (select id from auth.users);

  -- ย้าย foreign key กลับไปชี้ auth.users
  alter table profiles drop constraint if exists profiles_id_fkey;
  alter table profiles add  constraint profiles_id_fkey
    foreign key (id) references auth.users(id) on delete cascade;

  alter table shops drop constraint if exists shops_created_by_fkey;
  alter table shops add  constraint shops_created_by_fkey
    foreign key (created_by) references auth.users(id);

  alter table shop_members drop constraint if exists shop_members_user_id_fkey;
  alter table shop_members add  constraint shop_members_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;

  for r in
    select * from (values
      ('transactions',     'created_by'),
      ('pending_payments', 'created_by'),
      ('pending_incomes',  'created_by'),
      ('tax_invoices',     'created_by'),
      ('calendar_notes',   'updated_by'),
      ('activity_logs',    'user_id')
    ) as t(tbl, col)
  loop
    execute format('alter table %I drop constraint if exists %I', r.tbl, r.tbl || '_' || r.col || '_fkey');
    execute format(
      'alter table %I add constraint %I foreign key (%I) references auth.users(id)',
      r.tbl, r.tbl || '_' || r.col || '_fkey', r.col);
  end loop;

  -- ร้านที่ไม่มี owner เหลืออยู่ = ข้อมูลยังอยู่ครบแต่ไม่มีใครเข้าถึงได้
  for r in
    select s.id, s.name from shops s
     where not exists (select 1 from shop_members m where m.shop_id = s.id and m.role = 'owner')
  loop
    raise notice '⚠ ร้าน % (%) ไม่มี owner แล้ว — ข้อมูลยังอยู่ครบ ให้เพิ่ม owner ด้วย supabase/access.sql', r.name, r.id;
  end loop;
end $cleanup$;

-- ฟังก์ชัน/ตารางของ custom auth — policy ทุกตัวถูกสร้างใหม่ด้วย auth.uid() ไปแล้ว
-- ข้างบน จึงไม่มีอะไรพึ่งของพวกนี้เหลืออยู่ ลบได้เลย
drop function if exists public.app_login(text, text);
drop function if exists public.app_logout(text);
drop function if exists public.app_session_user(text);
drop function if exists public.app_change_password(text, text, text);
drop function if exists public.app_create_user(text, text, text);
drop function if exists public.app_hash_token(text);
drop function if exists public.app_uid();
drop table if exists public.app_sessions;
drop table if exists public.app_users cascade;

-- ###########################################################################
-- ##  ตรวจผลการติดตั้ง — ต้องได้ครบทั้ง 4 บรรทัด
-- ###########################################################################

select 'ตาราง' as รายการ, count(*)::text || ' / 19' as ผล
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('profiles','shops','shop_members','shop_settings','wallet_state',
     'transfer_accounts','sub_wallets','loans','categories','vendors','quick_items',
     'recurring_items','recurring_entries','transactions','pending_payments',
     'pending_incomes','tax_invoices','calendar_notes','activity_logs')
union all
select 'คอลัมน์ที่เติมเพิ่ม', count(*)::text || ' / 31'
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name='transactions' and column_name in ('detail','other_income_type','tax_due_date','document_path','document_type','document_label'))
     or (table_name='pending_payments' and column_name in ('description','open_date','missing_due_date','default_method','default_transfer_account_id','document_path','document_type','document_label'))
     or (table_name='pending_incomes' and column_name in ('open_date','description','source','other_income_type','default_transfer_account_id','document_path','document_type','document_label'))
     or (table_name='tax_invoices' and column_name in ('due_date','document_path','document_type','document_label'))
     or (table_name='recurring_items' and column_name in ('default_method','default_transfer_account_id','frequency','billing_month','deleted')))
union all
select 'ฟังก์ชัน RPC', count(*)::text || ' / 20'
  from information_schema.routines
 where routine_schema = 'public'
   and routine_name in ('is_member','can_edit','is_owner','assert_can_edit','adjust_cash',
     'adjust_transfer_account','adjust_sub_wallet','move_between_transfer_accounts',
     'apply_wallet_effect','write_log','post_transaction','cancel_transaction','clear_shop_data',
     'move_cash_transfer','move_sub_wallet','move_between_sub_wallets',
     'borrow_from_sub_wallet','return_loan','pay_pending_payment','receive_pending_income')
union all
select 'custom auth ถูกล้างแล้ว',
       case when exists (select 1 from information_schema.tables
                         where table_schema = 'public' and table_name = 'app_users')
            then '❌ ยังเหลืออยู่' else '✅' end;

-- ตรวจว่าไม่มีตารางไหนหลุด RLS — ต้องได้ 0 แถว
select table_name as "ตารางที่ยังไม่เปิด RLS"
  from information_schema.tables t
 where table_schema = 'public'
   and table_type = 'BASE TABLE'
   and not exists (
     select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t.table_name and c.relrowsecurity);

-- สั่งให้ API โหลด schema ใหม่ทันที (กันอาการฟังก์ชัน 404 จาก cache ค้าง)
notify pgrst, 'reload schema';
