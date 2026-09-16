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

## 5. 限制與風險
- `RemoteSigned` 執行原則允許本機自己寫的腳本執行、但下載回來的腳本要
  簽章才能跑，是相對安全但仍需注意的折衷；不要為了圖方便改成
  `Unrestricted` 或 `Bypass` 且設成 `LocalMachine` 範圍（那樣會放行所有
  使用者、所有腳本）。
- `.env` 裡的 `SUPABASE_SERVICE_KEY` 是明碼存在本機檔案，只要這台電腦
  被存取就可能外洩，處理方式見 `docs/env.md`。

## 6. 未驗證／待確認
- 無
