# Supabase

## 1. 這個專案用它做什麼
整個系統的後端：Postgres 資料庫（業務資料 + 帳號權限）、Auth（登入註冊）、
Storage（照片/檔案）、REST API（前端直接呼叫，沒有另外寫後端伺服器）。

## 2. 目前的設定
- Project URL：`https://ekzqrpgrxicyvaqagdjp.supabase.co`
- 區域／方案：未驗證（建立時未特別記錄，預設多半是免費方案 Free tier）
- Auth：Email/密碼登入，未串第三方登入
- Storage：bucket `scans`（private），存維修/零用金/保險/公文/檔案庫的照片與檔案
- 資料表：`profiles`、`departments`、`workflows`、`tasks`、`task_events`、
  `notifications`、`uploads`、`agent_alerts`（schema 見 `supabase/schema-v2.sql`、
  `supabase/schema-v3.sql`），以及業務表 `trips`/`maint`/`petty`/`billing`/
  `insurance`/`docs`/`vehicles`/`drivers`/`customers`（這幾張表是在寫
  schema-v2.sql 之前就手動建好的，沒有對應的 CREATE TABLE 腳本留底，
  欄位定義以 `js/core.js` 裡 `M` 物件的 `fields` 為準，詳見 `docs/schema.md`）
- 權限：Row Level Security 全面開啟，透過 `is_admin()` / `is_active()` /
  `has_perm(module)` 三個 helper function 判斷
- 金鑰放哪：
  - anon（publishable）key：寫死在 `js/core.js` 開頭常數 `ANON_KEY`（設計上本來就可公開，靠 RLS 擋權限）
  - service_role（secret）key：本機 `.env` 的 `SUPABASE_SERVICE_KEY`（已加入 `.gitignore`，只給 `scripts/notify.ps1` 用）

## 3. 常用操作
- 改 schema：改 `supabase/*.sql`，貼到 Supabase 後台 SQL Editor 執行一次
  ```sql
  -- 範例：SQL Editor 直接貼上整段 supabase/schema-v3.sql 執行
  ```
- 看某張表目前筆數（SQL Editor）：
  ```sql
  select count(*) from public.maint;
  ```
- 把某人設成 admin（緊急時用，正常應該在「帳號管理」頁面操作）：
  ```sql
  update public.profiles set role='admin', status='active' where email='someone@example.com';
  ```
- 補一筆漏掉的 profile（見下方事故一）：
  ```sql
  insert into public.profiles (id, email, name, role, status)
  select id, email, email, 'user', 'pending' from auth.users
  where id not in (select id from public.profiles);
  ```
- 確認 Storage 用量：後台 Storage 頁面直接看，或 SQL Editor 查
  `select sum(metadata->>'size')::bigint from storage.objects where bucket_id='scans';`

## 4. 踩過的坑
- **先註冊帳號才建 profiles 表，導致登不進去**：一開始就開放註冊，但當時
  `profiles` 表跟 `handle_new_user` trigger 還沒佈署，註冊完 `auth.users`
  有資料、`profiles` 沒有對應那筆，前端 `boot()` 讀不到 profile 就直接
  登出（見 `js/core.js` 的 `if(!prof)throw new Error('找不到帳號資料')`）。
  解法：先把 schema-v2.sql 部署好，已卡住的帳號用上面「補一筆漏掉的
  profile」的 SQL 手動補上。
- **Site URL 預設 `http://localhost:3000` 讓驗證信失效**：Auth 後台
  Authentication → URL Configuration 的 Site URL 沒改之前，註冊驗證信
  裡的連結會指向 localhost，點了打不開。解法：改成
  `https://tienan8952-source.github.io/freight-ops/`。
- **驗證信 10 分鐘就過期**：Supabase 預設的 email 連結有效時間很短，
  來不及點就失效。緊急補救可以直接在 SQL Editor 執行
  `update auth.users set email_confirmed_at = now() where email='xxx';`
  手動標記已驗證，不用重寄信。
- **建表時選「Run without RLS」**：業務表最早是在後台手動建立時選了
  跳過 RLS（因為那時候登入系統還沒做出來），後來才在 schema-v2.sql
  補齊 RLS，這中間有一段時間資料表其實沒有權限保護，之後新建表都要
  記得從一開始就啟用 RLS。
- **notify.ps1 打 REST API 被 401**：service_role key 直接呼叫時，
  Supabase 會擋看起來像瀏覽器的 secret key 請求，要帶自訂 User-Agent
  （見 `scripts/notify.ps1`），另外 `.env` 裡的變數名稱/值要對應正確
  （曾經誤填成 publishable key，也會 401）。
- **照片存 base64 差點撐爆資料庫**：早期把照片直接轉 base64 存在
  資料表欄位裡，後來改成上傳到 Storage bucket `scans`，欄位只存路徑
  字串（見 `js/storage.js`），並提供一次性搬移工具（系統維護頁）。

## 5. 限制與風險
- 免費方案有連續 7 天無 API 活動會自動暫停專案的規則（見
  `docs/incident.md` 的處理步驟），這個系統平常應該天天有人用不太會踩到，
  但長假期間要注意。
- service_role key 等同資料庫最高權限、會繞過所有 RLS，一旦外洩等於
  整個資料庫都能被讀寫刪，處理方式見 `docs/env.md`。
- 免費方案有資料庫容量與 Storage 容量上限（未驗證實際數字，未在後台
  特別確認過用量告警設定）。

## 6. 未驗證／待確認
- 目前實際使用的方案（Free / Pro）與所在區域
- 資料庫與 Storage 目前用量、有沒有設定用量告警
- 是否有開啟每日自動備份（Supabase 付費方案才有的功能）
