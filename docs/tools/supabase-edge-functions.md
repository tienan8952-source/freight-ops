# Supabase Edge Functions（未接，已規劃）

## 要做什麼
補足目前「純前端直接打 Supabase REST API」架構缺少的伺服器端邏輯，例如：
- 安全地代替前端呼叫外部服務（LINE 推播、未來可能的 Email 通知）而不用
  把第三方的金鑰放進前端程式碼
- 排程任務（例如每天固定時間檢查快到期的保險/證照，主動建立通知，而不
  是等使用者打開網頁才觸發檢查）

## 需要什麼前置
- 在 Supabase 專案啟用 Edge Functions（需要用 Supabase CLI 開發與部署，
  目前這台機器沒有安裝、也還沒試過）
- 需要決定哪些邏輯要搬到 Edge Function（目前的 `js/*.js` 全部邏輯都在
  前端執行，搬動前要盤點清楚哪些是「非搬不可」，避免不必要的重構）
- 若要做排程任務，需要另外設定 Supabase 的 `pg_cron` 或外部排程服務去
  觸發 Edge Function

## 卡在哪
- 還沒有具體、非做不可的需求逼著要導入（現有功能靠前端輪詢
  `js/notify.js` 的 60 秒／15 秒輪詢機制已經堪用）
- 導入會多一個要維護的部署管道（Supabase CLI + Edge Function 版本），
  需要先評估投入產出比，目前判斷是等 LINE 推播或排程提醒變成明確需求
  時再一起做，見 `docs/decisions.md`「為什麼暫不用 n8n」類似的判斷邏輯
