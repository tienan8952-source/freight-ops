# 環境與金鑰

只寫每個金鑰放在哪裡、怎麼拿到、外洩怎麼辦，**不寫金鑰本身的值**。

## Supabase anon（publishable）key
- 用途：前端（`js/core.js`）呼叫 Supabase Auth / REST API 時的 `apikey`，
  搭配使用者自己的 access token，實際權限由 RLS（`has_perm`/`is_admin`）
  決定，就算被看到也無法繞過 RLS
- 去哪拿：Supabase 後台 → Project Settings → API → `anon` `public` key
- 放在哪：寫死在 `js/core.js` 開頭的 `ANON_KEY` 常數（會被推上 GitHub，
  這是刻意的設計，這把 key 本來就設計成可以公開在前端）
- 權限範圍：僅代表「匿名/一般前端」身分，實際資料存取權限完全依賴每
  張表的 RLS 政策
- 外洩怎麼辦：這把本來就是公開的，不算「外洩」；如果要輪替，Supabase
  後台可以重新產生，產生後要同步更新 `js/core.js` 並重新部署

## Supabase service_role（secret）key
- 用途：`scripts/notify.ps1` 用來繞過 RLS，直接寫入 `agent_alerts` 表
- 去哪拿：Supabase 後台 → Project Settings → API → `service_role` `secret`
  key
- 放在哪：本機 repo 根目錄的 `.env`（`SUPABASE_SERVICE_KEY=`），已列在
  `.gitignore`，絕對不能出現在任何會 commit 的檔案裡
- 權限範圍：**等同資料庫最高權限**，會繞過所有 RLS，能讀寫刪任何一張表
- 外洩怎麼辦：立刻到 Supabase 後台 Project Settings → API 重新產生
  （Reset）這把 key，舊的會立即失效；更新本機 `.env`；檢查
  `agent_alerts` 表跟其他表有沒有異常資料寫入

## GitHub / gh CLI 認證
- 用途：`git push`／`gh` 指令操作 `tienan8952-source/freight-ops` 這個
  repo
- 去哪拿：`gh auth login`（互動式，需要使用者自己在終端機操作一次，見
  `docs/tools/gh-cli.md`）
- 放在哪：gh 自己管理，存在本機 Windows 認證管理員（keyring），不在任何
  repo 檔案裡
- 權限範圍：token scopes 為 `gist`/`read:org`/`repo`
- 外洩怎麼辦：到 GitHub 帳號設定 → Applications / Authorized OAuth Apps
  撤銷該授權，並重新 `gh auth login`

## 未來：LINE Messaging API token（規劃中，尚未申請）
- 用途：規劃中的推播通知（見 `docs/tools/line-messaging-api.md`）
- 去哪拿：LINE Developers 後台，建立 Messaging API channel 後取得
  Channel access token / Channel secret
- 放在哪：**尚未決定**——因為目前系統是純前端 + Supabase，沒有安全的
  伺服器端可以存放這種需要保密的 token（放前端等於公開），必須先有
  Supabase Edge Function 或其他後端才能安全存放，見
  `docs/tools/supabase-edge-functions.md`
- 外洩怎麼辦：（尚未申請，暫無）

## 通則
- 任何新金鑰，第一個問題永遠是「這把金鑰放前端安不安全」：能被 RLS/
  範圍限制保護的（像 anon key）可以放前端；不能的（service_role、任何
  第三方服務的 secret）一律只能放在不會進 git 的本機檔案或伺服器端環境
  變數。
- `.gitignore` 目前排除：`.env`、`scripts/.session-id`。新增金鑰檔案時
  記得同步檢查 `.gitignore`。
