-- ไฟล์: supabase/schema.sql
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
  transfer_account_id uuid references transfer_accounts(id) on delete set null, -- บัญชีที่จ่ายจริง (ใช้ตอนยกเลิกการจ่าย)
  amount_updated_at  timestamptz,                 -- ครั้งล่าสุดที่ผู้ใช้กรอกยอดของรอบนี้
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
-- ##  จัดเรียงลำดับหมวดหมู่ (category-sort.sql)
-- ###########################################################################

alter table categories add column if not exists sort_order int not null default 0;

create index if not exists categories_sort_idx
  on categories (shop_id, type, sort_order, created_at);

-- ── จัดลำดับใหม่ทั้งชุดในครั้งเดียว ────────────────────────────────────────
--
-- รับ id เรียงตามลำดับที่ต้องการ แล้วเขียน sort_order ตามตำแหน่งในอาเรย์
-- ต้องทำเป็นคำสั่งเดียว ไม่ใช่ยิงอัปเดตทีละแถวจากหน้าจอ เพราะถ้าเน็ตหลุดกลางทาง
-- จะได้ลำดับที่ครึ่งเก่าครึ่งใหม่ แล้วหมวดหมู่จะสลับตำแหน่งมั่วโดยไม่มีใครรู้

create or replace function public.reorder_categories(
  p_shop uuid,
  p_ids  uuid[]
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform assert_can_edit(p_shop);

  update categories c
     set sort_order = pos.idx
    from unnest(p_ids) with ordinality as pos(id, idx)
   where c.id = pos.id
     and c.shop_id = p_shop;
end;
$$;

