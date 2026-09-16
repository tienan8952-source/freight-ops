-- ============================================================
-- 範本：帳號 / 權限 / 部門 通用 schema
-- 抽自 freight-ops 的 supabase/schema-v2.sql + schema-v3.sql 第 2 節，
-- 拿掉了 freight-ops 專屬的業務表 RLS 迴圈，換新專案時業務表自己
-- 補一段類似的 RLS（用 has_perm('<模組>') 判斷）。
-- 在 Supabase SQL Editor 貼上整段執行一次即可。
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  role text not null default 'user',
  status text not null default 'pending',
  perms jsonb not null default '{}'::jsonb,
  dept_id uuid,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- 系統第一個使用者自動成為 admin / active，其餘為 user / pending。
-- perms 預設全空，第一人可以在下面 jsonb_build_object(...) 裡列出這個
-- 新專案的模組權限鍵，讓第一人（通常是建置者本人）一開始就全開。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first boolean;
begin
  select not exists(select 1 from public.profiles) into is_first;

  insert into public.profiles (id, email, name, role, status, perms)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    case when is_first then 'admin' else 'user' end,
    case when is_first then 'active' else 'pending' end,
    case when is_first then
      jsonb_build_object('admin', true) -- 換專案時把這個模組的所有權限鍵都列進來
    else '{}'::jsonb end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- helper functions（security definer，可安全在 RLS 政策內呼叫） ----------
create or replace function public.is_active()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

create or replace function public.has_perm(m text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_admin() or (
    public.is_active() and exists(
      select 1 from public.profiles
      where id = auth.uid() and (perms->>m) = 'true'
    )
  );
$$;

-- ---------- profiles RLS ----------
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select using (public.is_admin());

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- ---------- departments ----------
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort int default 0,
  created_at timestamptz not null default now()
);
alter table public.departments enable row level security;
alter table public.profiles add column if not exists dept_id uuid references public.departments(id);

drop policy if exists departments_select on public.departments;
create policy departments_select on public.departments
  for select using (public.is_active());
drop policy if exists departments_insert on public.departments;
create policy departments_insert on public.departments
  for insert with check (public.is_admin());
drop policy if exists departments_update on public.departments;
create policy departments_update on public.departments
  for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists departments_delete on public.departments;
create policy departments_delete on public.departments
  for delete using (public.is_admin());

-- ---------- 範例：新業務表要怎麼加 RLS（複製這段改表名/模組鍵） ----------
-- create table if not exists public.<你的表> (
--   id uuid primary key default gen_random_uuid(),
--   ...你的欄位...
--   created_at timestamptz not null default now()
-- );
-- alter table public.<你的表> enable row level security;
-- create policy <你的表>_select on public.<你的表> for select using (public.has_perm('<模組鍵>'));
-- create policy <你的表>_insert on public.<你的表> for insert with check (public.has_perm('<模組鍵>'));
-- create policy <你的表>_update on public.<你的表> for update using (public.has_perm('<模組鍵>')) with check (public.has_perm('<模組鍵>'));
-- create policy <你的表>_delete on public.<你的表> for delete using (public.has_perm('<模組鍵>'));
