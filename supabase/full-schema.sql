-- ============================================================
-- 貨運行營運系統 — 完整 schema（重建用）
-- 產生方式：這不是從線上資料庫即時 pg_dump 出來的（這個專案手上只有
-- Supabase 的 REST/anon/service_role key，沒有直接的 Postgres 連線字串，
-- PostgREST 本身也不支援 DDL 內省），而是把 supabase/schema-v2.sql 和
-- supabase/schema-v3.sql 依實際建置順序原封不動接在一起。這兩份本身
-- 就是這個系統唯一的、會持續維護的 schema 來源，且都寫成可重複執行
-- （create table if not exists / drop policy if exists ...）。
--
-- 在全新的空 Supabase 專案，SQL Editor 貼上整份執行一次，就能重建出
-- 目前的資料表結構、RLS 政策、trigger、function。之後 schema-v2.sql /
-- schema-v3.sql 有新增修改時，記得同步更新這份檔案（或乾脆改成直接
-- cat 這兩份，看之後維護方便選一種）。
-- ============================================================

-- ============== 以下是 schema-v2.sql 原文 ==============

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


-- ============== 以下是 schema-v3.sql 原文 ==============

-- ============================================================
-- 貨運行營運系統 v3 — 資料保護 / 檔案庫 / 流程 / 工作單 / 通知 / 稽核
-- 在 Supabase SQL Editor 貼上整段執行一次即可（可重複執行，具冪等性）
-- 前置需求：已執行過 schema-v2.sql（profiles / is_active / is_admin / has_perm）
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- 1. Storage bucket：scans（private） ----------
insert into storage.buckets (id, name, public)
values ('scans', 'scans', false)
on conflict (id) do nothing;

drop policy if exists scans_select on storage.objects;
create policy scans_select on storage.objects
  for select using (bucket_id = 'scans' and public.is_active());

drop policy if exists scans_insert on storage.objects;
create policy scans_insert on storage.objects
  for insert with check (bucket_id = 'scans' and public.is_active());

-- 刪除需要，讓上傳者或 admin 能在「檔案庫」刪除自己/管理的檔案
drop policy if exists scans_delete on storage.objects;
create policy scans_delete on storage.objects
  for delete using (bucket_id = 'scans' and (public.is_admin() or owner = auth.uid()));

-- ---------- 2. departments ----------
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort int default 0,
  created_at timestamptz not null default now()
);
alter table public.departments enable row level security;

insert into public.departments (name, sort)
select v.name, v.sort
from (values ('行政',1),('會計',2),('調度',3),('修配',4),('業務',5)) as v(name, sort)
where not exists (select 1 from public.departments);

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

-- ---------- 3. profiles 增加部門欄位 ----------
alter table public.profiles add column if not exists dept_id uuid references public.departments(id);

-- ---------- 4. workflows（流程範本） ----------
create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  module text,
  steps jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.workflows enable row level security;

drop policy if exists workflows_select on public.workflows;
create policy workflows_select on public.workflows
  for select using (public.is_active());
drop policy if exists workflows_insert on public.workflows;
create policy workflows_insert on public.workflows
  for insert with check (public.has_perm('workflow'));
drop policy if exists workflows_update on public.workflows;
create policy workflows_update on public.workflows
  for update using (public.has_perm('workflow')) with check (public.has_perm('workflow'));
drop policy if exists workflows_delete on public.workflows;
create policy workflows_delete on public.workflows
  for delete using (public.has_perm('workflow'));

-- ---------- 5. tasks（工作單） ----------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  module text,
  ref_id uuid,
  workflow_id uuid references public.workflows(id),
  step int not null default 0,
  status text not null default 'open',
  from_user uuid references public.profiles(id),
  to_user uuid references public.profiles(id),
  to_dept uuid references public.departments(id),
  priority text not null default 'normal',
  due date,
  note text,
  files jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tasks enable row level security;

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select using (
    public.is_admin() or from_user = auth.uid() or to_user = auth.uid()
    or to_dept in (select dept_id from public.profiles where id = auth.uid())
  );
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert with check (public.is_admin() or from_user = auth.uid());
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update using (
    public.is_admin() or from_user = auth.uid() or to_user = auth.uid()
    or to_dept in (select dept_id from public.profiles where id = auth.uid())
  ) with check (
    public.is_admin() or from_user = auth.uid() or to_user = auth.uid()
    or to_dept in (select dept_id from public.profiles where id = auth.uid())
  );

-- ---------- 6. task_events（流程軌跡，只增不刪：沒有 update/delete 政策） ----------
create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor uuid references public.profiles(id),
  action text not null,
  from_user uuid references public.profiles(id),
  to_user uuid references public.profiles(id),
  to_dept uuid references public.departments(id),
  comment text,
  created_at timestamptz not null default now()
);
alter table public.task_events enable row level security;

drop policy if exists task_events_select on public.task_events;
create policy task_events_select on public.task_events
  for select using (
    public.is_admin() or exists (
      select 1 from public.tasks t where t.id = task_events.task_id
      and (t.from_user = auth.uid() or t.to_user = auth.uid()
        or t.to_dept in (select dept_id from public.profiles where id = auth.uid()))
    )
  );
drop policy if exists task_events_insert on public.task_events;
create policy task_events_insert on public.task_events
  for insert with check (
    actor = auth.uid() and (
      public.is_admin() or exists (
        select 1 from public.tasks t where t.id = task_events.task_id
        and (t.from_user = auth.uid() or t.to_user = auth.uid()
          or t.to_dept in (select dept_id from public.profiles where id = auth.uid()))
      )
    )
  );

-- ---------- 7. notifications（只能看/改自己的；insert 只透過下面的 trigger） ----------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  task_id uuid references public.tasks(id) on delete cascade,
  kind text,
  title text,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (user_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- 8. uploads（獨立檔案庫 metadata） ----------
create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  path text not null,
  name text,
  mime text,
  size int,
  module text,
  ref_id uuid,
  uploader uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.uploads enable row level security;

drop policy if exists uploads_insert on public.uploads;
create policy uploads_insert on public.uploads
  for insert with check (public.is_active() and uploader = auth.uid());
drop policy if exists uploads_select on public.uploads;
create policy uploads_select on public.uploads
  for select using (
    public.is_admin() or uploader = auth.uid() or exists (
      select 1 from public.profiles me, public.profiles owner
      where me.id = auth.uid() and owner.id = uploads.uploader
      and me.dept_id is not null and me.dept_id = owner.dept_id
    )
  );
-- 刪除檔案需要同步清 Storage 物件，這裡讓上傳者或 admin 可以刪 metadata
drop policy if exists uploads_delete on public.uploads;
create policy uploads_delete on public.uploads
  for delete using (public.is_admin() or uploader = auth.uid());

-- ---------- 9. agent_alerts（Claude Code 回報用；一般使用者不能寫，只有 service role 或 admin 能碰） ----------
create table if not exists public.agent_alerts (
  id uuid primary key default gen_random_uuid(),
  level text not null default 'action',
  title text not null,
  body text,
  session text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.agent_alerts enable row level security;

drop policy if exists agent_alerts_select on public.agent_alerts;
create policy agent_alerts_select on public.agent_alerts
  for select using (public.is_admin());
drop policy if exists agent_alerts_update on public.agent_alerts;
create policy agent_alerts_update on public.agent_alerts
  for update using (public.is_admin()) with check (public.is_admin());

-- ---------- 10. tasks.updated_at 自動更新 ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------- 11. tasks 指派變更時自動建立 notifications ----------
create or replace function public.notify_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed boolean;
  msg text;
  r record;
begin
  changed := (tg_op = 'INSERT')
    or (new.to_user is distinct from old.to_user)
    or (new.to_dept is distinct from old.to_dept);
  if not changed then
    return new;
  end if;

  msg := coalesce(new.title, '工作單');

  if new.to_user is not null then
    insert into public.notifications (user_id, task_id, kind, title, body)
    values (new.to_user, new.id, 'task_assigned', '有新的待處理工作', msg);
  elsif new.to_dept is not null then
    for r in select id from public.profiles where dept_id = new.to_dept and status = 'active'
    loop
      insert into public.notifications (user_id, task_id, kind, title, body)
      values (r.id, new.id, 'task_assigned', '有新的待處理工作（部門）', msg);
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_notify on public.tasks;
create trigger tasks_notify
  after insert or update on public.tasks
  for each row execute function public.notify_task_assignment();

-- ---------- 12. profiles.perms 新增權限鍵：workflow / tasks / uploads ----------
-- 新使用者若為系統第一個帳號，補上這三把鑰匙一起全開
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
        'insurance',true,'docs',true,'payroll',true,'masters',true,'admin',true,
        'workflow',true,'tasks',true,'uploads',true
      )
    else '{}'::jsonb end
  );
  return new;
end;
$$;

-- 既有 admin（v2 建立的）補上新模組權限，避免升級後反而看不到新功能
update public.profiles
set perms = coalesce(perms,'{}'::jsonb) || jsonb_build_object('workflow', true, 'tasks', true, 'uploads', true)
where role = 'admin';
