-- ไฟล์: supabase/policies.sql
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
