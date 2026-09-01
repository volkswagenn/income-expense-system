-- ============================================================================
-- JodFlow — ระบบ auth ของตัวเอง (แทน Supabase Auth)
--
-- แนวคิด: app_users ทำหน้าที่แทน auth.users แบบตรงตัว — id เป็น uuid เหมือนกัน
-- ตารางอื่นจึงแค่ย้ายปลาย foreign key มาชี้ที่นี่ ไม่ต้องแก้โครงสร้างอะไรอีก
--
-- ⚠ ไฟล์นี้เป็นด่านความปลอดภัยชั้นเดียวของทั้งระบบ อ่านให้เข้าใจก่อนแก้
--   หลักที่ยึดไว้ 5 ข้อ:
--     1. รหัสผ่านเก็บเป็น bcrypt (cost 12) ไม่เคยเก็บตัวจริง
--     2. token เก็บเป็น sha256 ไม่เคยเก็บตัวจริง — ฐานข้อมูลรั่วก็สวมสิทธิ์ไม่ได้
--     3. app_users / app_sessions เปิด RLS แต่ "ไม่มี policy เลย" = PostgREST
--        แตะไม่ได้ทุกกรณี เข้าถึงได้ทางเดียวคือผ่านฟังก์ชัน security definer ล่าง
--     4. ทุกฟังก์ชัน set search_path ตายตัว กัน search_path hijacking
--     5. login ตอบผิดเป็นข้อความเดียวกันหมด + หน่วงเวลาเท่ากัน = เดาไม่ได้ว่า
--        อีเมลนี้มีอยู่จริงไหม
--
-- รันไฟล์นี้ต่อจาก 05_wallet_functions.sql
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── ผู้ใช้ ─────────────────────────────────────────────────────────────────

create table if not exists app_users (
  id                  uuid primary key default gen_random_uuid(),
  username            text        not null,
  password_hash       text        not null,
  is_active           boolean     not null default true,
  failed_attempts     int         not null default 0,
  locked_until        timestamptz,
  password_changed_at timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

-- ล็อกอินไม่แยกตัวพิมพ์ใหญ่เล็ก ไม่งั้น "Somchai@x.com" กับ "somchai@x.com"
-- จะกลายเป็นคนละบัญชีโดยที่ผู้ใช้ไม่รู้ตัว
create unique index if not exists app_users_username_key on app_users (lower(username));

-- ── session ────────────────────────────────────────────────────────────────
-- เก็บ hash ของ token ไม่ใช่ token ตัวจริง ด้วยเหตุผลเดียวกับรหัสผ่าน
-- ถ้าใครหลุดเข้ามาอ่านตารางนี้ได้ ก็ยังเอา token ไปสวมสิทธิ์ไม่ได้

create table if not exists app_sessions (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references app_users(id) on delete cascade,
  token_hash   text        not null unique,
  issued_at    timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at   timestamptz
);

create index if not exists app_sessions_user_idx
  on app_sessions (user_id) where revoked_at is null;

-- ── ปิดตายไม่ให้เข้าถึงตรงๆ ────────────────────────────────────────────────
-- เปิด RLS แล้วไม่สร้าง policy สักตัว = deny ทั้งหมด (RLS ปฏิเสธเป็นค่าตั้งต้น)
-- revoke ซ้ำอีกชั้นกันพลาดกรณีมีใครเผลอ create policy ทีหลัง

alter table app_users    enable row level security;
alter table app_sessions enable row level security;

revoke all on table app_users    from anon, authenticated;
revoke all on table app_sessions from anon, authenticated;

-- ── ย้าย foreign key จาก auth.users มาที่ app_users ────────────────────────
-- ⚠ ถ้าฐานข้อมูลมีข้อมูลเดิมที่ผูกกับ auth.users อยู่ คำสั่งนี้จะ error
--   ให้ล้าง profiles / shop_members ก่อน แล้วสร้างผู้ใช้ใหม่ด้วย app_create_user

alter table profiles     drop constraint if exists profiles_id_fkey;
alter table profiles     add  constraint profiles_id_fkey
  foreign key (id) references app_users(id) on delete cascade;

alter table shops        drop constraint if exists shops_created_by_fkey;
alter table shops        add  constraint shops_created_by_fkey
  foreign key (created_by) references app_users(id);

alter table shop_members drop constraint if exists shop_members_user_id_fkey;
alter table shop_members add  constraint shop_members_user_id_fkey
  foreign key (user_id) references app_users(id) on delete cascade;

-- คอลัมน์บันทึกว่า "ใครเป็นคนทำ" — ถ้าไม่ย้ายด้วย ทุกการบันทึกจะ error ทันที
-- เพราะ app_uid() คืน id ที่ไม่มีอยู่ใน auth.users
do $mig$
declare
  r record;
begin
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
      'alter table %I add constraint %I foreign key (%I) references app_users(id)',
      r.tbl, r.tbl || '_' || r.col || '_fkey', r.col);
  end loop;
end $mig$;

-- trigger เดิมผูกกับ auth.users ซึ่งเลิกใช้แล้ว
drop trigger  if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- ── helper ─────────────────────────────────────────────────────────────────

create or replace function public.app_hash_token(p_token text)
returns text language sql immutable set search_path = public, pg_temp as $fn$
  select encode(digest(p_token, 'sha256'), 'hex');
$fn$;

revoke all on function public.app_hash_token(text) from public, anon, authenticated;

-- ── app_uid() — หัวใจของทั้งระบบ ───────────────────────────────────────────
-- ทำหน้าที่แทน auth.uid() เดิม: ตอบว่า "request นี้เป็นของใคร"
--
-- PostgREST ยัด header ทุกตัวของ request ไว้ใน request.headers ให้อยู่แล้ว
-- เราจึงอ่าน x-session-token จากตรงนั้นแล้วเทียบกับ app_sessions
--
-- ทำไมต้อง security definer: app_sessions ปิดตายด้วย RLS ฟังก์ชันนี้จึงต้อง
-- รันในสิทธิ์เจ้าของถึงจะอ่านได้ — และนี่คือเหตุผลว่าทำไมมันปลอดภัย ผู้เรียก
-- อ่านตารางเองไม่ได้ ได้แค่คำตอบว่าเป็น uuid ไหน
--
-- ทำไมต้อง stable: RLS เรียกฟังก์ชันนี้ทุกแถวที่ตรวจ ถ้าไม่ประกาศ stable
-- Postgres จะวิ่ง query ใหม่ทุกแถว = ตารางหมื่นแถวก็หมื่นครั้ง
--
-- ไม่มี header (เช่นเรียกจาก SQL Editor) → current_setting คืน NULL → คืน NULL
-- เท่ากับ "ไม่ได้ล็อกอิน" ซึ่งเป็นค่าตั้งต้นที่ปลอดภัยอยู่แล้ว

create or replace function public.app_uid()
returns uuid language sql stable security definer set search_path = public, pg_temp as $fn$
  select s.user_id
    from app_sessions s
   where s.token_hash = app_hash_token(
           coalesce(current_setting('request.headers', true)::json ->> 'x-session-token', ''))
     and s.revoked_at is null
     and s.expires_at  > now();
$fn$;

revoke all     on function public.app_uid() from public;
grant  execute on function public.app_uid() to anon, authenticated;

-- ── สร้างผู้ใช้ ────────────────────────────────────────────────────────────
-- ตั้งใจไม่ grant ให้ใครเลย = เรียกได้จาก SQL Editor เท่านั้น
-- (หน้าจัดการสมาชิกในแอปจะเรียกผ่าน wrapper ที่เช็ก owner อีกที — ทำในเฟสถัดไป)

create or replace function public.app_create_user(
  p_username     text,
  p_password     text,
  p_display_name text default null
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_id uuid;
begin
  if coalesce(trim(p_username), '') = '' then
    raise exception 'ต้องใส่ชื่อผู้ใช้หรืออีเมล';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร';
  end if;

  insert into app_users (username, password_hash)
  values (trim(p_username), crypt(p_password, gen_salt('bf', 12)))
  returning id into v_id;

  insert into profiles (id, email, display_name)
  values (v_id, trim(p_username),
          coalesce(nullif(trim(p_display_name), ''), split_part(trim(p_username), '@', 1)))
  on conflict (id) do nothing;

  return v_id;
end;
$fn$;

revoke all on function public.app_create_user(text, text, text) from public, anon, authenticated;

-- ── ล็อกอิน ────────────────────────────────────────────────────────────────
-- คืน jsonb { ok, error, token, user_id, expires_at } แทนการ raise exception
--
-- เหตุผลที่ไม่ raise: PostgREST ครอบทุก request ด้วย transaction เดียว ถ้า raise
-- ตัวนับ failed_attempts ที่เพิ่งบวกไปจะถูก rollback ไปด้วย = ล็อกบัญชีไม่เคยทำงาน
-- ผู้โจมตีสุ่มรหัสได้ไม่จำกัดครั้ง

create or replace function public.app_login(p_username text, p_password text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_user  app_users%rowtype;
  v_token text;
  v_ttl   interval := interval '30 days';
  v_wrong jsonb := jsonb_build_object('ok', false, 'error', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
begin
  select * into v_user from app_users where lower(username) = lower(trim(coalesce(p_username, '')));

  -- ไม่เจอผู้ใช้ก็ยังเสียเวลา hash เท่าเดิม ไม่งั้นจับเวลาตอบแล้วรู้ได้ว่าอีเมลไหนมีจริง
  if v_user.id is null then
    perform crypt(coalesce(p_password, ''), gen_salt('bf', 12));
    return v_wrong;
  end if;

  if not v_user.is_active then
    return jsonb_build_object('ok', false, 'error', 'บัญชีนี้ถูกปิดใช้งาน ติดต่อเจ้าของร้าน');
  end if;

  if v_user.locked_until is not null and v_user.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', format(
      'ใส่รหัสผิดหลายครั้งเกินไป ลองใหม่อีกครั้งในอีก %s นาที',
      ceil(extract(epoch from (v_user.locked_until - now())) / 60)::int));
  end if;

  if v_user.password_hash <> crypt(coalesce(p_password, ''), v_user.password_hash) then
    update app_users
       set failed_attempts = failed_attempts + 1,
           locked_until = case when failed_attempts + 1 >= 5
                               then now() + interval '15 minutes' end
     where id = v_user.id;
    return v_wrong;
  end if;

  update app_users set failed_attempts = 0, locked_until = null where id = v_user.id;

  -- 32 ไบต์จาก gen_random_bytes = สุ่มแบบเข้ารหัสได้จริง ไม่ใช่ random() ที่เดาลำดับได้
  v_token := encode(gen_random_bytes(32), 'hex');

  insert into app_sessions (user_id, token_hash, expires_at)
  values (v_user.id, app_hash_token(v_token), now() + v_ttl);

  return jsonb_build_object(
    'ok',         true,
    'token',      v_token,
    'user_id',    v_user.id,
    'username',   v_user.username,
    'expires_at', now() + v_ttl
  );
end;
$fn$;

revoke all     on function public.app_login(text, text) from public;
grant  execute on function public.app_login(text, text) to anon, authenticated;

-- ── ตรวจ token → บอกว่าเป็นใคร ─────────────────────────────────────────────
-- ต่ออายุ last_seen_at ไปด้วยในคำสั่งเดียว จะได้รู้ว่า session ไหนร้างแล้ว

create or replace function public.app_session_user(p_token text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_id uuid;
begin
  if coalesce(p_token, '') = '' then return null; end if;

  update app_sessions
     set last_seen_at = now()
   where token_hash = app_hash_token(p_token)
     and revoked_at is null
     and expires_at > now()
  returning user_id into v_id;

  return v_id;
end;
$fn$;

revoke all     on function public.app_session_user(text) from public;
grant  execute on function public.app_session_user(text) to anon, authenticated;

-- ── ออกจากระบบ ─────────────────────────────────────────────────────────────

create or replace function public.app_logout(p_token text)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  update app_sessions set revoked_at = now()
   where token_hash = app_hash_token(p_token) and revoked_at is null;
end;
$fn$;

revoke all     on function public.app_logout(text) from public;
grant  execute on function public.app_logout(text) to anon, authenticated;

-- ── เปลี่ยนรหัสผ่าน ────────────────────────────────────────────────────────
-- ต้องยืนยันรหัสเดิมด้วย ไม่งั้นใครยืมเครื่องที่เปิดค้างไว้ก็ยึดบัญชีได้เลย
-- เปลี่ยนเสร็จเพิกถอน session อื่นทั้งหมด เหลือแค่เครื่องที่กำลังใช้อยู่

create or replace function public.app_change_password(
  p_token        text,
  p_old_password text,
  p_new_password text
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_uid  uuid;
  v_hash text;
begin
  v_uid := app_session_user(p_token);
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'เซสชันหมดอายุ กรุณาล็อกอินใหม่');
  end if;

  if length(coalesce(p_new_password, '')) < 8 then
    return jsonb_build_object('ok', false, 'error', 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร');
  end if;

  select password_hash into v_hash from app_users where id = v_uid;
  if v_hash <> crypt(coalesce(p_old_password, ''), v_hash) then
    return jsonb_build_object('ok', false, 'error', 'รหัสผ่านเดิมไม่ถูกต้อง');
  end if;

  update app_users
     set password_hash       = crypt(p_new_password, gen_salt('bf', 12)),
         password_changed_at = now()
   where id = v_uid;

  update app_sessions set revoked_at = now()
   where user_id = v_uid and revoked_at is null
     and token_hash <> app_hash_token(p_token);

  return jsonb_build_object('ok', true);
end;
$fn$;

revoke all     on function public.app_change_password(text, text, text) from public;
grant  execute on function public.app_change_password(text, text, text) to anon, authenticated;
