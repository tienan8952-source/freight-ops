# 設定快照（Config Snapshot）

記錄所有「可重建」的設定值（不含金鑰值本身）。目的：換一台電腦或 Supabase 專案炸掉時，照這份把設定重新打一遍。事實依來源分兩種：**可用 API／指令查到的實際狀態**，以及**只能到後台網頁看、這裡沒有存取權限查不到**（會標「未驗證」，同步列在 [pending-info.md](pending-info.md)）。

最後查證時間：2026-09-16。

## Supabase

- **Project 參考碼（ref）**：`ekzqrpgrxicyvaqagdjp`（從 `SUPABASE_URL` 網域推得：`https://ekzqrpgrxicyvaqagdjp.supabase.co`）
- **方案**：免費方案（Free）——使用者確認，2026-09-16
- **所在區域**：東京（ap-northeast-1）——使用者確認，2026-09-16
- **資料庫容量與用量**：**使用者自行確認**（使用者表示之後自己到後台看，不需要現在查）
- **是否有官方自動備份**：**使用者自行確認**。附帶已知的平台通則（非本專案專屬查證）：Supabase 免費方案預設不含每日自動備份／PITR，這項是 Pro 以上方案才有的功能；若要確認目前這個專案的實際狀態，需要到後台 Database → Backups 頁面看一眼。
- **Auth 設定**（用 anon key 打公開的 `GET /auth/v1/settings` 查到的實際狀態，2026-09-16）：
  - `disable_signup`: `false`（開放註冊）
  - `mailer_autoconfirm`: `false`（**需要 email 驗證**，對應 [docs/tools/supabase.md](tools/supabase.md) 記錄的「驗證信 10 分鐘過期」那個坑）
  - 外部登入方式：全部停用，只開 `email`（沒有 Google/GitHub 等第三方登入）
  - `anonymous_users`: `false`、`passkeys_enabled`: `false`
  - **Site URL、Redirect URLs 的實際設定值**：**未驗證**。`/auth/v1/settings` 這個公開端點不會回傳這兩項，只能到後台 Authentication → URL Configuration 看。已知的事實只有：這兩項曾經因為預設是 `http://localhost:3000` 而讓驗證信失效，後來手動改成 `https://tienan8952-source.github.io/freight-ops/`（見 [docs/建置歷程.md](建置歷程.md)），但目前確切填的值沒有再次核對。
- **Storage bucket**：`scans`，`public=false`（private bucket）。RLS 政策（來自 `supabase/schema-v3.sql` 第 1 節）：
  - `select`：已啟用帳號（`is_active()`）可讀
  - `insert`：已啟用帳號可上傳
  - `delete`：只有上傳者本人或 admin 可刪
- **所有 RLS 政策清單**：直接列在下面的「RLS 政策清單」一節，是從 `supabase/schema-v2.sql`、`supabase/schema-v3.sql` 的原始碼逐條讀出來的（這兩份檔案本身就是唯一真相來源，比反查資料庫更準）。

### RLS 政策清單

| 表 | 政策 | 規則 |
|---|---|---|
| `profiles` | select（自己） | `id = auth.uid()` |
| `profiles` | select（admin） | `is_admin()` |
| `profiles` | update（admin） | `is_admin()` |
| `trips`/`maint`/`petty`/`billing`/`insurance`/`docs` | select/insert/update/delete | `has_perm(模組名)`（模組名同表名） |
| `vehicles`/`drivers`/`customers` | select/insert/update/delete | `has_perm('masters')` |
| `departments` | select | `is_active()` |
| `departments` | insert/update/delete | `is_admin()` |
| `workflows` | select | `is_active()` |
| `workflows` | insert/update/delete | `has_perm('workflow')` |
| `tasks` | select/update | 本人相關（`from_user`/`to_user`/`to_dept`）或 `is_admin()` |
| `tasks` | insert | `is_admin()` 或本人為 `from_user` |
| `task_events` | select | 關聯 task 的相關人員或 `is_admin()`（只增不刪，沒有 update/delete 政策） |
| `task_events` | insert | `actor = auth.uid()` 且是該 task 的相關人員 |
| `notifications` | select/update | `user_id = auth.uid()`（insert 只透過 trigger，沒有開放的 insert 政策） |
| `uploads` | insert | `is_active()` 且 `uploader = auth.uid()` |
| `uploads` | select | 上傳者本人、同部門主管、或 `is_admin()` |
| `uploads` | delete | 上傳者本人或 `is_admin()` |
| `agent_alerts` | select/update | `is_admin()`（insert 只有 service_role 能做，繞過 RLS） |
| `storage.objects`（bucket=scans） | select/insert | `is_active()` |
| `storage.objects`（bucket=scans） | delete | 上傳者本人或 `is_admin()` |

## GitHub

查證方式：`gh api repos/tienan8952-source/freight-ops`（2026-09-16 實際查詢結果）。

- **repo**：`tienan8952-source/freight-ops`，**visibility: public**（`private: false`）
- **security_and_analysis**（目前實際狀態，不是要不要開的決定）：
  - `secret_scanning`: **enabled**
  - `secret_scanning_push_protection`: **enabled**
  - `dependabot_security_updates`: **disabled**
  - `secret_scanning_validity_checks` / `secret_scanning_non_provider_patterns`: disabled
- **branch protection（main）**：目前**沒有設定**任何分支保護規則（`gh api .../branches/main/protection` 回 404 "Branch not protected"）
- **merge 設定**：squash / merge commit / rebase merge 全部允許，`delete_branch_on_merge: false`
- **是否要改用 PR 流程、要不要開 Dependabot、要不要加分支保護**：已決定維持現況——不開 Dependabot、不強制 PR 流程、不加分支保護。理由見 [decisions.md](decisions.md)「為什麼不開 Dependabot、不強制 PR 流程」。
- **GitHub Pages**：來源 `main` 分支、根目錄 `/`，狀態 `built`，網址 `https://tienan8952-source.github.io/freight-ops/`

## gh CLI / GitHub token

- 登入帳號：`tienan8952-source`，透過 `gh auth login`（keyring 儲存）
- Token 類型：`gho_` 開頭，是 gh CLI 用 OAuth device flow 取得的個人存取權杖
- Token scopes：`gist`、`read:org`、`repo`
- **到期時間**：`gh auth status` 不會顯示到期日。這類 gh CLI 簽發的 OAuth token 預設**沒有固定到期日**，會一直有效直到使用者手動用 `gh auth logout` 登出、在 GitHub 帳號設定裡撤銷，或帳號被要求重新驗證為止——不是查不到，是這個機制本身就沒有到期日概念。已把這個結論同步回 [pending-info.md](pending-info.md)。

## 本機環境

- **Node.js**：`v24.14.1`
- **npm**：`11.11.0`
- **需要的 PowerShell 執行原則**：`CurrentUser` scope 需要至少 `RemoteSigned`（目前實測是 `RemoteSigned`），否則 `npm`/`npx` 和本機的 `.ps1` 腳本都跑不動。查詢指令：`Get-ExecutionPolicy -List`。
- **PATH 需求**：`gh`（GitHub CLI，目前裝在 `C:\Program Files\GitHub CLI`）需要在 PATH 裡才能直接打 `gh` 指令；`git`、`node`、`npm`、`npx`、`python` 也都需要在 PATH。
