# 復原手冊

四種「東西壞了／不見了」的情境，各自一套可以直接照做的步驟。跟 [docs/incident.md](incident.md) 的差異：`incident.md` 是「先止血」的快速排查，這份是「真的要重建／還原」時的完整流程，會用到 TP-07 建立的備份工具（`scripts/backup.ps1`、`backup-storage.ps1`、`restore-table.ps1`）與 `supabase/full-schema.sql`、`docs/config-snapshot.md`。

---

## 情境一：電腦壞了／換新電腦

從什麼都沒有的新電腦，到能繼續開發，完整流程：

1. **裝好基本工具**（Node.js、Git、GitHub CLI、Claude Code）
2. **設定 PowerShell 執行原則**（Windows 預設會擋 `.ps1` 腳本和 npm）：
   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
   ```
3. **登入 GitHub CLI**（這步需要互動瀏覽器登入，不能在腳本裡自動做）：
   ```bash
   gh auth login
   ```
4. **clone 專案**：
   ```bash
   git clone https://github.com/tienan8952-source/freight-ops.git
   cd freight-ops
   ```
5. **重建 `.env`**（這個檔案本來就沒有備份，因為裡面是金鑰——原因見 `docs/env.md`）：
   - 到 Supabase 後台 → Project Settings → API，複製 `service_role` secret key
   - 在 repo 根目錄新增 `.env`：
     ```
     SUPABASE_URL=https://ekzqrpgrxicyvaqagdjp.supabase.co
     SUPABASE_SERVICE_KEY=<貼上 service_role key>
     ```
6. **確認 Claude Code 讀得到專案指示**：打開 Claude Code、切換到這個資料夾，確認它讀到 `CLAUDE.md`（可以直接問它「讀一下 CLAUDE.md 跟 docs/project-brief.md，告訴我這是什麼專案」）

**驗證復原成功**：
- 跑 `.\scripts\notify.ps1 -Level info -Title "復原測試" -Body "換新電腦後測試"`，看到「已送出通知：」代表 `.env`、PowerShell 執行原則、網路都正常
- 跑 `git status`，確認是乾淨的 working tree、`git log -3` 看得到最近的 commit
- 開 `https://tienan8952-source.github.io/freight-ops/`，能正常登入看到資料

---

## 情境二：Supabase 專案沒了／被暫停

「被暫停」（免費方案 7 天無活動）通常在後台按一下 Restore 就好，見 `docs/incident.md`。這裡講的是更嚴重的情況：**專案被刪掉或整個沒了**，要從零建一個新的。

1. **建新的 Supabase 專案**，記下新的 Project URL 和 anon key、service_role key
2. **重建 schema**：把 `supabase/full-schema.sql` 整份貼到新專案的 SQL Editor 執行一次——這份檔案 2026-09-18 已補齊，現在真的是單檔可重建：除了原本就有的帳號／權限／流程／工作單／通知／檔案庫（schema-v2、v3）之外，也包含九張業務表（`vehicles`/`drivers`/`customers`/`trips`/`maint`/`petty`/`billing`/`insurance`/`docs`，這幾張表之前沒有留下建表 SQL，直接貼會在 RLS 那段報錯，現在已補上）以及原始層三張表（`import_batches`/`raw_records`/`field_mappings`）與 pg_cron 保活排程（schema-v4），一次貼上執行即可
3. **還原資料**——這一步有個現實限制要先知道：`profiles` 表的每一列都用 `id` 外鍵參照 `auth.users(id)`，而 `auth.users` 是 Supabase Auth 自己管理的，新專案不會有舊的使用者帳號，所以**不能直接把舊的 `profiles.json` 塞進新專案**（外鍵會失敗，就算用 service_role 能繞過 RLS 也繞不過外鍵約束）。實務作法：
   - 讓每個使用者在新專案重新註冊一次（Email 要跟舊帳號一樣，這樣資料才對得起來），系統的「第一個註冊的人自動變 admin」規則會再跑一次，所以要先讓原本的管理員第一個註冊
   - 使用者都重新註冊、`profiles` 表有對應資料後，再用 `.\scripts\restore-table.ps1 -Table profiles -File <備份路徑>\profiles.json` 補回原本的 `role`/`status`/`perms`（會用「只補缺的 id」邏輯，不會跟新註冊產生的資料衝突，但如果 id 對不上——新註冊會產生新的 auth id——這一步實質上等於沒有作用，真正需要做的是照舊資料手動把每個人的權限重新設定一次，不能指望自動還原）
   - 其他不依賴 `auth.users` 外鍵的表（`departments`、`vehicles`、`drivers`、`customers`、`trips`、`maint`、`petty`、`billing`、`insurance`、`docs`、`workflows`）可以直接照順序跑：
     ```powershell
     .\scripts\restore-table.ps1 -Table departments -File <備份路徑>\departments.json
     .\scripts\restore-table.ps1 -Table vehicles -File <備份路徑>\vehicles.json
     # ...其餘表依此類推
     ```
   - `tasks`/`task_events`/`notifications`/`uploads` 因為關聯到 `profiles`(auth id)，會有跟上面 `profiles` 一樣的錯位問題，還原前要先確認關聯的使用者 id 對得起來
4. **還原 Storage**：新專案先跑一次 `supabase/schema-v3.sql` 裡的 bucket 建立語法（已包含在 `full-schema.sql` 內），確認 `scans` bucket 存在後，把 `backups/storage/` 底下的檔案重新上傳（目前沒有自動化上傳腳本，檔案數量不多時手動用 Supabase 後台 Storage 頁面拖曳上傳即可；檔案很多的話屬於這包沒涵蓋的風險，見下方「風險」）
5. **改前端設定**：`js/core.js` 開頭的 `SUPABASE_URL` 和 `ANON_KEY` 改成新專案的值，`.env` 的 `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` 也改成新專案的
6. commit、push

**驗證復原成功**：
- 用新專案的 anon key 打開系統網址，能登入（用重新註冊的帳號）
- Table Editor 裡看得到還原回來的業務資料，筆數跟 `backups/<日期>/manifest.json` 記錄的筆數對得起來
- 跑一次 `.\scripts\backup.ps1`，確認新專案也能正常備份

**這個情境最誠實的結論**：因為 `auth.users` 沒辦法備份/還原（那是 Supabase Auth 內部管理的，這個專案的金鑰拿不到直接操作權），「整個 Supabase 專案炸掉重建」對已有帳號的使用者來說一定會需要重新註冊，這不是這份手冊能繞過的限制，只能盡量讓其他資料照舊、把重新設定使用者權限的手動步驟降到最少。

---

## 情境三：資料被誤刪

只有某幾筆資料被誤刪（不是整張表不見），且距離上次備份不會太久：

1. 找到最近一次備份：`backups\<日期>\<表名>.json`
2. 執行：
   ```powershell
   .\scripts\restore-table.ps1 -Table <表名> -File backups\<日期>\<表名>.json
   ```
3. 這支腳本只會**補回**目前資料庫沒有的 `id`，不會覆蓋或動到現在還在的其他資料，可以放心執行

**驗證復原成功**：
- 到系統對應模組的清單頁，確認誤刪的資料筆數已經補回來
- 跑 `Invoke-RestMethod` 或直接看清單頁筆數，跟備份當時 `manifest.json` 記錄的筆數比對

---

## 情境四：Claude 帳號換了

換一個新的 Claude 帳號（或新電腦上第一次用 Claude Code 接手這個專案）：

1. 開 Claude Code，切換到 `freight-ops` 這個資料夾
2. 請它讀 `docs/project-brief.md`（專案背景主版本）和 `CLAUDE.md`（工作規則），確認它理解這是什麼專案、有哪些規則要遵守
3. 確認 `CLAUDE.md`、`.claude/commands/` 都還在（這些是 git 追蹤的檔案，只要 repo 還在就不會不見，不需要額外復原步驟）
4. 如果需要重新走一次 Claude Code 本身的登入/授權流程，照 Claude Code 官方畫面走即可，跟這個 repo 的內容無關

**驗證復原成功**：
- 請它做一件小事（例如「跑一次 `/健康檢查`」），確認它讀得懂指令庫、能正常操作這個 repo

---

## 這份手冊沒涵蓋的風險

- 情境二的 Storage 檔案還原目前是手動拖曳上傳，檔案數量一多會很痛苦，沒有自動化上傳腳本（只有下載備份用的 `backup-storage.ps1`，沒有對應的「整批上傳回新專案」腳本）
- 情境二的 `auth.users`／使用者帳號本身沒有辦法備份還原，見上面情境二的說明
- 沒有測試過「資料庫容量真的爆了要清資料」這種情境下的還原流程
- 這份手冊假設 Supabase、GitHub 服務本身正常，沒有涵蓋「兩邊服務同時大規模故障」的情況（機率低，也不是這個規模的專案能自己解決的問題）

## 已驗證

**演練日期：2026-09-16**

實際演練的是**情境三「資料被誤刪」**，做法跟原規格（建一張新測試表）不同，改用「在既有的 `customers` 表（演練當時是空表）插入測試資料 → 備份 → REST API 直接刪除模擬誤刪 → 用 `restore-table.ps1` 還原 → 驗證 → 清乾淨」，理由：
- 這個系統只能透過 PostgREST 打 REST API，沒有直接的 Postgres 連線可以下 `CREATE TABLE`/`DROP TABLE`（DDL），建測試表需要使用者手動到 SQL Editor 執行，會中斷任務等待；用既有表的資料列來演練不需要 DDL，不用中斷就能完整跑完
- 這樣演練的情境（資料列被誤刪）也更貼近 `docs/incident.md`「資料被誤刪」實際會發生的狀況，比「整張表消失」更寫實

**演練步驟與結果**：
1. 用 service_role key 直接對 `customers` 表 REST insert 3 筆測試資料（`TP07演練測試客戶A/B/C`，含中文備註）
2. 執行 `.\scripts\backup.ps1`，確認 `backups\2026-09-16\customers.json` 正確匯出這 3 筆、中文內容完整無誤
3. 用 REST DELETE 模擬誤刪，確認 `customers` 表變回 0 筆
4. 執行 `.\scripts\restore-table.ps1 -Table customers -File backups\2026-09-16\customers.json`，還原成功：補回 3 筆、略過 0 筆
5. 用 REST GET 驗證還原後的 3 筆資料，id、`name`、`note`（含中文）都跟還原前完全一致
6. 清掉測試資料，`customers` 表恢復演練前的 0 筆狀態

**演練中發現並已修正的問題**：
- 插入測試資料時發現 Windows PowerShell 5.1 的 `Invoke-RestMethod` 在 `-Body` 傳字串時會用系統預設編碼重新編碼，中文會變亂碼——這其實就是 [docs/known-issues.md](known-issues.md) 原本記錄的「notify.ps1 中文亂碼」那個問題的真正根因，不是 Supabase 顯示問題。修法：一律把 JSON 字串轉成 UTF-8 位元組陣列（`[System.Text.Encoding]::UTF8.GetBytes(...)`）再傳給 `-Body`。已經修正 `scripts/notify.ps1`、`scripts/restore-table.ps1`、`scripts/backup-storage.ps1`，並實測確認中文正確送達、正確讀回。known-issues.md 已同步更新為「已解決」。
- 另外發現：用 Write/Edit 工具建立或修改 `.ps1` 檔案時，如果檔案沒有 UTF-8 BOM，Windows PowerShell 5.1 會用系統內碼（非 UTF-8）讀取整份腳本，導致腳本裡的中文字串把後面的語法也讀壞（引號、括號位置整個錯位），直接噴 parse error，不是邏輯錯誤。已把這次任務包新增的 `.ps1` 檔案都轉成有 BOM 的 UTF-8。這一條記錄進 [docs/tools/powershell.md](tools/powershell.md)。
