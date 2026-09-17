# GitHub Actions

角色：跑「跨系統」的排程任務（不是資料庫內部的排程，那個是 [Supabase Cron](supabase.md)）。
public repo 免費方案每月 2000 分鐘，這個專案兩條排程用量很小，不會接近上限。

## 目前有的兩條排程

### `.github/workflows/backup.yml`——每週備份 Supabase

- 排程：每週日 UTC 18:00（台灣時間週一 02:00），也可以在 GitHub 網頁的
  Actions 分頁手動觸發（workflow_dispatch）。
- 做的事：`.github/scripts/backup-export.mjs` 用 service_role key 把全部
  資料表匯出成 JSON，連同 manifest.json（各表筆數、Storage 檔案數）打包成
  zip，建立成一個 GitHub Release（不是放進 repo 的 `backups/` 目錄）。
- **為什麼放 Release 不放 repo**：`.gitignore` 本來就把本機的 `backups/`
  目錄排除在 git 之外（見 `scripts/backup.ps1` 的說明），這是既有決定——
  避免備份資料把 git 歷史越養越大。Release 一樣有日期、一樣能下載，又不會
  讓 repo 變大或讓 commit 記錄塞滿雜訊。
- 要怎麼看備份：repo 頁面右側 Releases，或網址
  `https://github.com/<repo>/releases`，每份標題是「資料庫備份 YYYY-MM-DD」。

### `.github/workflows/transcript.yml`——每天同步泛科學院逐字稿

- 排程：每天 UTC 21:00（台灣時間隔天 05:00）。
- 做的事：讀泛科學院 YouTube RSS（`https://www.youtube.com/feeds/videos.xml?channel_id=頻道ID`），
  比對 Notion 資料庫裡已經記錄過的影片 ID，新影片就抓字幕寫進 Notion。
  抓不到字幕的也會寫一筆標明「（無字幕）」，不會靜默跳過。
- **不用 Puppeteer**：只用一般 HTTP 請求讀 RSS、讀影片頁原始碼裡的
  `captionTracks`、讀字幕 XML。YouTube 改版容易讓模擬瀏覽器的方案壞掉，
  用量大也容易被封 IP，所以這條路線刻意不用。
- 本階段不做逐字稿摘要，原文照存，之後要不要為摘要另外付費 API，等實際
  跑一個月看用量再決定。

## 需要設定什麼

到 repo 的 **Settings → Secrets and variables → Actions**：

**Secrets 分頁**（新增備份與逐字稿都需要的金鑰，值不會被任何人看到）：
| 名稱 | 用途 |
|---|---|
| `SUPABASE_URL` | 備份腳本讀資料庫要用 |
| `SUPABASE_SERVICE_KEY` | 備份腳本用 service_role key 讀全部資料（繞過 RLS） |
| `NOTION_API_KEY` | 逐字稿腳本寫進 Notion 要用的整合金鑰 |
| `NOTION_DATABASE_ID` | 逐字稿要寫進哪個 Notion 資料庫 |

**Variables 分頁**（不是密鑰，只是設定值，開發者看得到也沒關係）：
| 名稱 | 用途 |
|---|---|
| `PANSCI_CHANNEL_ID` | 泛科學院的 YouTube 頻道 ID |

## 怎麼找泛科學院的頻道 ID

1. 打開泛科學院頻道首頁（`@panscischool`）。
2. 在頁面空白處按右鍵 →「檢視網頁原始碼」（或 Ctrl+U）。
3. 用瀏覽器內的搜尋（Ctrl+F）找 `"channelId"` 或 `"externalId"`，
   後面接的 `UC` 開頭一串英數字就是頻道 ID；也可以找
   `<link rel="canonical" href="https://www.youtube.com/channel/UC...">`，
   網址裡 `channel/` 後面那段就是。
4. 把這串貼進 GitHub Variables 的 `PANSCI_CHANNEL_ID`。

## 抓字幕失敗率高的替代方案

如果 YouTube 改版導致抓字幕經常失敗，可以換成：
- **TranscriptAPI**：免費額度 100 次，之後每月 5 美金起，需要註冊拿金鑰
  （這一步 Claude Code 做不到，需要使用者本人註冊）。
- **TranscriptMagic**：類似的付費字幕擷取服務。

兩者都是外部 API 服務，不是模擬瀏覽器，換過去只要把
`.github/scripts/transcript-sync.mjs` 裡抓字幕的那段改成呼叫對應 API，
金鑰一樣存 GitHub Secrets。中文自動字幕品質本來就不穩，這是已知狀況。

## 監看執行狀況

repo 頁面上方 **Actions** 分頁，可以看到每次排程有沒有跑成功、log 內容
（例如逐字稿腳本印出「RSS 讀到幾支影片」「其中幾支是新的」）。排程沒設定好
（缺 Secrets／Variables）時，執行紀錄會顯示失敗並在 log 裡寫出缺什麼。
