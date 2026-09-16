# LINE Messaging API（未接，已規劃）

## 要做什麼
讓系統的通知（工作單指派、逾期提醒、Claude Code 的 action 級回報）能
直接推播到管理員或相關人員的 LINE，不用依賴登入系統才看得到。

## 需要什麼前置
- 一個 LINE Official Account，並在 LINE Developers 後台建立
  Messaging API channel，取得 Channel access token / Channel secret
- 需要知道要推播給「誰」：目前系統的 `profiles` 表沒有存 LINE user id，
  要嘛請每個使用者自己綁定一次（走 LINE Login 或手動填 LINE ID），要嘛
  先只做「推播到單一群組/官方帳號」的簡化版
- 需要一個能對外發送 HTTP 請求的執行環境來呼叫 LINE 的推播 API——目前
  這個系統是純前端 + Supabase，沒有自己的伺服器，可能要靠
  Supabase Edge Function（見下一份文件）或另外找地方跑這段程式

## 卡在哪
- 還沒決定要不要開一個新的 LINE Official Account 專門給這個系統用，
  或是沿用既有的（`line-ai-bot` 專案看起來是另一個獨立用途，不建議
  混用）
- 綁定使用者身分這件事還沒設計（要問使用者怎麼取得自己的 LINE user id、
  怎麼在系統裡填進去）
- 目前沒有伺服器端可以安全存放 Channel access token 並主動發送請求，
  這塊要先有 Edge Function 或其他後端才能繼續
