# PowerShell

## 1. 這個專案用它做什麼
本機腳本執行環境，目前主要用來跑 `scripts/notify.ps1`（Claude Code 主動
回報進度用），以及作為 Windows 上執行 `npm`/`npx` 的底層 shell。

## 2. 目前的設定
- `scripts/notify.ps1`：讀 repo 根目錄的 `.env`（`SUPABASE_URL` /
  `SUPABASE_SERVICE_KEY`），呼叫 Supabase REST API 寫入 `agent_alerts` 表
- 執行原則：本機曾經歷過從預設值調整為
  `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`（見下方坑）
- 金鑰放哪：不涉及金鑰本身，只負責讀取 `.env`（見
  `docs/tools/supabase.md`、`docs/env.md`）

## 3. 常用操作
- 手動送一則測試通知：
  ```powershell
  .\scripts\notify.ps1 -Level info -Title "測試通知" -Body "確認可以正常送出"
  ```
- 檢查目前的執行原則：`Get-ExecutionPolicy -Scope CurrentUser`
- 單次應急放行（只在當次視窗有效，不永久變更）：
  ```powershell
  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
  ```

## 4. 踩過的坑
- **執行原則擋住 npm.ps1**：Windows 預設的 PowerShell 執行原則
  （Restricted）會擋掉 `npm`/`npx` 背後呼叫的 `.ps1` script，導致
  「因為在此系統上停用了指令碼執行，所以無法載入」的錯誤。解法：
  `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` 永久放行目前使用者
  （只影響這台電腦、這個使用者帳號，不影響其他人）。
- **notify.ps1 一開始打 Supabase 被 401**：見
  `docs/tools/supabase.md` 的對應坑，解法是帶自訂 User-Agent。
- **`Invoke-RestMethod -Body <字串>` 送中文會變亂碼**（2026-09-16，TP-07
  復原演練時查出）：Windows PowerShell 5.1 的 `Invoke-RestMethod` 傳字串
  當 `-Body` 時，會用系統預設編碼（不是 UTF-8）重新編碼再送出，中文在
  送出前就壞了——這才是原本以為的「notify.ps1 中文亂碼」的真正根因，
  不是 Supabase 顯示問題。解法：先把 JSON 字串轉成 UTF-8 位元組陣列再送：
  ```powershell
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonString)
  Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body $bytes
  ```
  `scripts/notify.ps1`、`scripts/restore-table.ps1`、
  `scripts/backup-storage.ps1` 都已經這樣修正。**以後任何新腳本只要用
  `Invoke-RestMethod` 送含中文的 JSON body，都要記得套這個寫法。**
- **`.ps1` 檔案沒有 UTF-8 BOM，中文腳本會直接 parse error**（2026-09-16）：
  用一般文字工具（例如 Write 工具）新建或改寫含中文的 `.ps1` 檔案時，如果
  存檔沒有帶 UTF-8 BOM，Windows PowerShell 5.1 會用系統內碼讀取整份腳本，
  中文字元被讀壞後連帶讓後面的引號、括號位置錯位，直接跳出一堆看似無關
  的語法錯誤（例如「遺漏右大括號」「字串缺少結束字元」），很容易誤判成
  邏輯寫錯。解法：確認檔案是 UTF-8 with BOM（開頭三個位元組是
  `EF BB BF`），沒有的話用下面指令轉一次：
  ```powershell
  $p = "路徑\你的.ps1"
  $content = [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)
  [System.IO.File]::WriteAllText($p, $content, (New-Object System.Text.UTF8Encoding($true)))
  ```

## 5. 限制與風險
- `RemoteSigned` 執行原則允許本機自己寫的腳本執行、但下載回來的腳本要
  簽章才能跑，是相對安全但仍需注意的折衷；不要為了圖方便改成
  `Unrestricted` 或 `Bypass` 且設成 `LocalMachine` 範圍（那樣會放行所有
  使用者、所有腳本）。
- `.env` 裡的 `SUPABASE_SERVICE_KEY` 是明碼存在本機檔案，只要這台電腦
  被存取就可能外洩，處理方式見 `docs/env.md`。

## 6. 未驗證／待確認
- 無
