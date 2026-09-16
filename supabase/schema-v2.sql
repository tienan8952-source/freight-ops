-- ============================================================
-- 貨運行營運系統 v2 — 帳號 / 權限 schema
-- 在 Supabase SQL Editor 貼上整段執行一次即可
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  role text not null default 'user',
  status text not null default 'pending',
  perms jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- ---------- 新使用者註冊時自動建立 profile ----------
-- 系統第一個使用者自動成為 admin / active，其餘為 user / pending。
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
      jsonb_build_object(
        'trips',true,'maint',true,'petty',true,'billing',true,
        'insurance',true,'docs',true,'payroll',true,'masters',true,'admin',true
      )
    else '{}'::jsonb end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- helper functions（security definer，可安全在 RLS 政策內呼叫）----------
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

-- ---------- 業務表 RLS ----------
-- 模組對應：trips/maint/petty/billing/insurance/docs 同名；
-- vehicles / drivers / customers → masters
do $$
declare
  t text;
  m text;
  mapping jsonb := '{
    "trips":"trips","maint":"maint","petty":"petty","billing":"billing",
    "insurance":"insurance","docs":"docs",
    "vehicles":"masters","drivers":"masters","customers":"masters"
  }'::jsonb;
begin
  for t, m in select key, value#>>'{}' from jsonb_each(mapping)
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t||'_select', t);
    execute format(
      'create policy %I on public.%I for select using (public.has_perm(%L))',
      t||'_select', t, m
    );

    execute format('drop policy if exists %I on public.%I', t||'_insert', t);
    execute format(
      'create policy %I on public.%I for insert with check (public.has_perm(%L))',
      t||'_insert', t, m
    );

    execute format('drop policy if exists %I on public.%I', t||'_update', t);
    execute format(
      'create policy %I on public.%I for update using (public.has_perm(%L)) with check (public.has_perm(%L))',
      t||'_update', t, m, m
    );

    execute format('drop policy if exists %I on public.%I', t||'_delete', t);
    execute format(
      'create policy %I on public.%I for delete using (public.has_perm(%L))',
      t||'_delete', t, m
    );
  end loop;
end $$;

-- ---------- profiles RLS ----------
-- 每個人可讀自己那筆；admin 可讀全部、可更新任何人的 role/status/perms；沒有人可以刪除。
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select using (public.is_admin());

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());
