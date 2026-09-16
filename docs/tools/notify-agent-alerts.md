# notify.ps1 與 agent_alerts 回報機制

## 1. 這個專案用它做什麼
讓 Claude Code 在執行任務時，能主動把進度、需要人工處理的事、或任務
完成的訊息，寫進 Supabase 的 `agent_alerts` 表；系統前端（`js/alerts.js`）
會用橫幅、音效、瀏覽器通知、閃爍網頁標題等方式提醒管理員。

## 2. 目前的設定
- 觸發規則寫在 `CLAUDE.md`「通知規則」一節：需要手動執行 SQL、需要
  授權/登入/貼金鑰、遇到無法排除的錯誤、整包任務完成、單一階段超過
  10 分鐘，都要先呼叫 `scripts/notify.ps1` 再停下等待
- 資料表：`public.agent_alerts`（`level`：action/info/done，`title`，
  `body`，`session`，`resolved_at`）
- 前端只有 admin 能讀（RLS `agent_alerts_select` 限定 `is_admin()`），
  一般使用者看不到、也不受影響
- 系統內對應頁面：「執行紀錄」（`js/help.js`／`M.alerts`）
- 金鑰放哪：`scripts/notify.ps1` 用本機 `.env` 的
  `SUPABASE_SERVICE_KEY`（見 `docs/tools/supabase.md`）

## 3. 常用操作
- 手動測試送出一則通知：
  ```powershell
  .\scripts\notify.ps1 -Level info -Title "測試" -Body "確認機制還在運作"
  ```
- 在系統的「執行紀錄」頁把某則標記已處理（畫面上按「標記已處理」按鈕，
  對應 `resolveAlert()`）

## 4. 踩過的坑
- 見 `docs/tools/supabase.md`：Supabase 擋掉看起來像瀏覽器的 secret key
  請求（401），要帶自訂 User-Agent；以及 `.env` 欄位對應錯誤導致金鑰
  讀不到。

## 5. 限制與風險
- 這是「Claude Code → 管理員」單向的回報機制，目前沒有反向管道（管理員
  沒辦法透過這個系統回覆訊息給 Claude Code，只能標記已處理）。
- 依賴管理員登入系統才會看到橫幅通知，如果 Claude Code 呼叫
  `-Level action` 但沒人在系統上，需要等到下次有人登入才會被看到（沒有
  額外的簡訊/Email/LINE 提醒），這也是規劃 LINE Messaging API 的原因之一
  （見 `docs/tools/line-messaging-api.md`）。

## 6. 未驗證／待確認
- 目前歸類為「已設定未用」是指：機制本身已經接好、Claude Code 也用過
  （這次任務就實際送過測試通知成功），但還沒有進入「管理員每天實際
  依賴這個管道處理事情」的日常使用階段，這個判斷未經使用者確認。
