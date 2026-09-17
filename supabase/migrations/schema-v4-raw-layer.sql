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
