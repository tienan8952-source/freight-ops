-- ============================================================
-- 貨運行營運系統 — 完整 schema（重建用）
-- 產生方式：把 supabase/schema-v2.sql、supabase/schema-v3.sql、
-- supabase/migrations/schema-v4-raw-layer.sql 依實際建置順序原封不動
-- 接在一起，這三份本身就是這個系統會持續維護的 schema 來源，且都寫成
-- 可重複執行（create table if not exists / drop policy if exists ...）。
--
-- 【2026-09-18 補的例外】業務表（vehicles/drivers/customers/trips/
-- maint/petty/billing/insurance/docs）從一開始就是直接在 Supabase 後台
-- 手動建立，schema-v2.sql 只有一段「假設表已存在」去套用 RLS 的迴圈，
-- 沒有留下 CREATE TABLE 語法——導致這份檔案先前貼到全新專案會直接在
-- RLS 那段報錯（表不存在）。下面在「業務表 RLS」之前補的九張 CREATE
-- TABLE，是連線 Supabase 用內建工具拉即時 schema 逐欄位還原的（型別、
-- 預設值、可否為空、主鍵都對齊 2026-09-18 當時的線上實際狀態），不是
-- 從任何 schema-v*.sql 檔案裡的原文貼出來的，往後這九張表如果改欄位，
-- 記得也要回來同步這裡。
--
-- 在全新的空 Supabase 專案，SQL Editor 貼上整份執行一次，就能重建出
-- 目前的資料表結構、RLS 政策、trigger、function、pg_cron 保活排程。
-- 之後 schema-v2.sql / schema-v3.sql / schema-v4-raw-layer.sql 有新增
-- 修改時，記得同步更新這份檔案。
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

-- ---------- 業務表：CREATE TABLE（2026-09-18 從即時 schema 補回，見檔頭說明）----------
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  plate text not null,
  vtype text,
  driver text,
  status text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  base numeric,
  rate numeric,
  pct numeric,
  status text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tax text,
  contact text,
  phone text,
  kind text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  date date,
  plate text,
  driver text,
  customer text,
  "from" text,
  "to" text,
  trips numeric,
  weight numeric,
  freight numeric,
  bonus numeric,
  deduct numeric,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.maint (
  id uuid primary key default gen_random_uuid(),
  plate text,
  date date,
  done date,
  driver text,
  vendor text,
  cat text,
  items text,
  labor numeric,
  parts numeric,
  amount numeric,
  paid text,
  mileage numeric,
  next numeric,
  invoice text,
  note text,
  scans jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.petty (
  id uuid primary key default gen_random_uuid(),
  date date,
  cat text,
  item text,
  amount numeric,
  payer text,
  plate text,
  invoice text,
  note text,
  scans jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.billing (
  id uuid primary key default gen_random_uuid(),
  date date,
  kind text,
  customer text,
  invoice text,
  period text,
  amount numeric,
  tax numeric,
  paid text,
  paydate date,
  note text,
  scans jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.insurance (
  id uuid primary key default gen_random_uuid(),
  plate text,
  cat text,
  company text,
  policy text,
  start date,
  "end" date,
  premium numeric,
  paid text,
  note text,
  scans jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.docs (
  id uuid primary key default gen_random_uuid(),
  date date,
  cat text,
  title text,
  party text,
  docno text,
  tags text,
  due date,
  note text,
  scans jsonb,
  created_at timestamptz not null default now()
);

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


-- ============== 以下是 schema-v4-raw-layer.sql 原文 ==============

-- ============================================================
-- 貨運行營運系統 v4 — 原始層（匯入）／欄位對照／Supabase Cron 保活
-- 在 Supabase SQL Editor 貼上整段執行一次即可（可重複執行，具冪等性）
-- 前置需求：已執行過 schema-v2.sql（profiles / is_active / is_admin / has_perm）
--          與 schema-v3.sql（departments 等）
--
-- 這次建了什麼、為什麼：
-- 1) import_batches / raw_records：新增一條「原始層」匯入路線。跟既有
--    js/importer.js（欄位對欄位直接寫進業務表）不同，這條路線把整份
--    Excel 每一列「原封不動」存進 raw_records.raw（JSONB），不做任何
--    欄位裁切或型態轉換，下個月 Excel 欄位變了也不用改表結構。
--    import_batches 記錄每一次匯入的批次資訊，可整批撤銷（刪 raw_records，
--    批次紀錄保留讓使用者看得到「匯過幾次」）。
-- 2) field_mappings：使用者事後設定「原始欄位」要不要顯示、顯示成什麼
--    名字、順序、型態提示，畫面依這份設定把 raw 裡的內容撈出來呈現，
--    本身不影響、不修改 raw_records 內容。
-- 3) 新權限鍵：imports.view / imports.create / imports.revoke /
--    mappings.view / mappings.edit，沿用 has_perm() 機制。
-- 4) pg_cron 保活排程：每天固定時間對資料庫做一次輕量查詢，避免
--    Supabase 免費方案「七天無活動」暫停。2026 年起 pg_cron 在所有方案
--    （含免費）預設啟用，不需要 create extension。
-- ============================================================

-- ---------- 1. import_batches（匯入批次） ----------
create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_hash text not null,
  data_type text not null,
  period text,
  imported_by uuid references public.profiles(id),
  imported_at timestamptz not null default now(),
  total_rows int,
  status text not null default '進行中' check (status in ('進行中','完成','已撤銷')),
  note text
);
alter table public.import_batches enable row level security;

create index if not exists import_batches_data_type_period_idx
  on public.import_batches (data_type, period);
create index if not exists import_batches_file_hash_idx
  on public.import_batches (file_hash);

-- ---------- 2. raw_records（原始資料，逐列 JSONB，不做任何裁切） ----------
create table if not exists public.raw_records (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_no int not null,
  raw jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.raw_records enable row level security;

create index if not exists raw_records_raw_gin_idx
  on public.raw_records using gin (raw);
create index if not exists raw_records_batch_id_idx
  on public.raw_records (batch_id);

-- ---------- 3. field_mappings（欄位對照設定） ----------
create table if not exists public.field_mappings (
  id uuid primary key default gen_random_uuid(),
  data_type text not null,
  source_field text not null,
  display_name text,
  sort_order int not null default 0,
  type_hint text not null default '文字' check (type_hint in ('文字','數字','日期')),
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (data_type, source_field)
);
alter table public.field_mappings enable row level security;

drop trigger if exists field_mappings_set_updated_at on public.field_mappings;
create trigger field_mappings_set_updated_at
  before update on public.field_mappings
  for each row execute function public.set_updated_at();

-- ---------- 4. RLS 政策（沿用 has_perm() 機制） ----------
-- import_batches：撤銷不刪批次紀錄，只改 status，所以沒有 delete 政策。
drop policy if exists import_batches_select on public.import_batches;
create policy import_batches_select on public.import_batches
  for select using (public.has_perm('imports.view'));

drop policy if exists import_batches_insert on public.import_batches;
create policy import_batches_insert on public.import_batches
  for insert with check (public.has_perm('imports.create'));

drop policy if exists import_batches_update on public.import_batches;
create policy import_batches_update on public.import_batches
  for update using (public.has_perm('imports.create') or public.has_perm('imports.revoke'))
  with check (public.has_perm('imports.create') or public.has_perm('imports.revoke'));

-- raw_records：本身不能改，只能新增或（整批撤銷時）刪除。
drop policy if exists raw_records_select on public.raw_records;
create policy raw_records_select on public.raw_records
  for select using (public.has_perm('imports.view'));

drop policy if exists raw_records_insert on public.raw_records;
create policy raw_records_insert on public.raw_records
  for insert with check (public.has_perm('imports.create'));

drop policy if exists raw_records_delete on public.raw_records;
create policy raw_records_delete on public.raw_records
  for delete using (public.has_perm('imports.revoke'));

-- field_mappings
drop policy if exists field_mappings_select on public.field_mappings;
create policy field_mappings_select on public.field_mappings
  for select using (public.has_perm('mappings.view'));

drop policy if exists field_mappings_insert on public.field_mappings;
create policy field_mappings_insert on public.field_mappings
  for insert with check (public.has_perm('mappings.edit'));

drop policy if exists field_mappings_update on public.field_mappings;
create policy field_mappings_update on public.field_mappings
  for update using (public.has_perm('mappings.edit')) with check (public.has_perm('mappings.edit'));

-- ---------- 5. profiles.perms 新增權限鍵：imports.* / mappings.* ----------
-- 新使用者若為系統第一個帳號，補上這五把鑰匙一起全開（沿用 schema-v3.sql 的寫法，累加新鍵）
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
        'workflow',true,'tasks',true,'uploads',true,
        'imports.view',true,'imports.create',true,'imports.revoke',true,
        'mappings.view',true,'mappings.edit',true
      )
    else '{}'::jsonb end
  );
  return new;
end;
$$;

-- 既有 admin 補上新模組權限，避免升級後反而看不到新功能
update public.profiles
set perms = coalesce(perms,'{}'::jsonb) || jsonb_build_object(
  'imports.view', true, 'imports.create', true, 'imports.revoke', true,
  'mappings.view', true, 'mappings.edit', true
)
where role = 'admin';

-- ---------- 6. Supabase Cron（pg_cron）保活排程 ----------
-- 2026 年起 pg_cron 在所有方案（含免費）預設啟用，不需要 create extension。
-- 每天固定時間對資料庫做一次輕量查詢，避免 Supabase 免費方案「七天無活動」暫停。
-- 排程時間為 UTC，'0 20 * * *' = 每天 UTC 20:00，即台灣時間（UTC+8）隔天 04:00。
-- 執行紀錄會寫進 cron.job_run_details，查執行狀況：
--   select * from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'freight_ops_keepalive')
--   order by start_time desc limit 20;
do $$
begin
  if exists (select 1 from cron.job where jobname = 'freight_ops_keepalive') then
    perform cron.unschedule('freight_ops_keepalive');
  end if;
end $$;

select cron.schedule(
  'freight_ops_keepalive',
  '0 20 * * *',
  $$ select count(*) from public.profiles; $$
);
