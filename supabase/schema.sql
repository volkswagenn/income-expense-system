create table if not exists shops (
  id text primary key,
  name text not null,
  color_id text,
  config jsonb default '{}',
  device_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table if not exists users (
  id text primary key,
  username text unique not null,
  display_name text,
  role text,
  shop_access text[],
  password_hash text,
  pin_hash text,
  is_blocked boolean default false,
  blocked_reason text,
  device_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table if not exists roles (
  id text primary key,
  shop_id text,
  label text,
  icon text,
  badge_class text,
  permissions text[],
  is_system boolean default false,
  locked boolean default false,
  device_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function create_sync_table(table_name text)
returns void
language plpgsql
as $$
begin
  execute format(
    'create table if not exists %I (
      id text primary key,
      shop_id text not null,
      device_id text,
      payload jsonb not null default ''{}'',
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      deleted_at timestamptz
    )',
    table_name
  );

  execute format('create index if not exists %I on %I (shop_id, updated_at)', table_name || '_shop_updated_idx', table_name);
end;
$$;

select create_sync_table('transactions');
select create_sync_table('pending_payments');
select create_sync_table('pending_incomes');
select create_sync_table('tax_invoices');
select create_sync_table('recurring_items');
select create_sync_table('recurring_entries');
select create_sync_table('categories');
select create_sync_table('vendors');
select create_sync_table('quick_items');
select create_sync_table('sub_wallets');
select create_sync_table('loans');
select create_sync_table('wallet_state');
select create_sync_table('activity_logs');

drop function create_sync_table(text);

alter table shops enable row level security;
alter table users enable row level security;
alter table roles enable row level security;
alter table transactions enable row level security;
alter table pending_payments enable row level security;
alter table pending_incomes enable row level security;
alter table tax_invoices enable row level security;
alter table recurring_items enable row level security;
alter table recurring_entries enable row level security;
alter table categories enable row level security;
alter table vendors enable row level security;
alter table quick_items enable row level security;
alter table sub_wallets enable row level security;
alter table loans enable row level security;
alter table wallet_state enable row level security;
alter table activity_logs enable row level security;

create or replace function create_local_app_policy(table_name text)
returns void
language plpgsql
as $$
begin
  execute format(
    'drop policy if exists local_app_sync_all on %I',
    table_name
  );
  execute format(
    'create policy local_app_sync_all on %I for all using (true) with check (true)',
    table_name
  );
end;
$$;

-- Demo/local-app policy for direct Supabase SDK access with an anon key.
-- Replace this with service-role relay or JWT shop isolation before production.
select create_local_app_policy('shops');
select create_local_app_policy('users');
select create_local_app_policy('roles');
select create_local_app_policy('transactions');
select create_local_app_policy('pending_payments');
select create_local_app_policy('pending_incomes');
select create_local_app_policy('tax_invoices');
select create_local_app_policy('recurring_items');
select create_local_app_policy('recurring_entries');
select create_local_app_policy('categories');
select create_local_app_policy('vendors');
select create_local_app_policy('quick_items');
select create_local_app_policy('sub_wallets');
select create_local_app_policy('loans');
select create_local_app_policy('wallet_state');
select create_local_app_policy('activity_logs');

drop function create_local_app_policy(text);
