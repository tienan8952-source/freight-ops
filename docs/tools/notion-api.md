# Notion API

角色：`.github/workflows/transcript.yml` 用來把泛科學院逐字稿寫進 Notion 資料庫。
未來也是 GPT／Claude 交接內容的存放處（見 `docs/briefs/03-外接AI.md`）。

## 設定步驟

1. 建立 Notion 頁面「freight-ops 交接區」，底下建一個資料庫（詳細欄位見下）。
2. 到 <https://notion.so/my-integrations> 建立一個整合（Integration），
   取得 API 金鑰（Internal Integration Secret，`ntn_` 或 `secret_` 開頭）。
3. 回到那個資料庫，右上角「⋯」→「連結」，把剛建立的整合加進去（不分享
   整合、資料庫寫不進去，第一次一定會遇到這步沒做而失敗）。
4. 金鑰存進 GitHub Secrets 的 `NOTION_API_KEY`；資料庫 ID（資料庫網址
   `notion.so/xxxx?v=yyyy` 裡的 `xxxx` 那段）存進 `NOTION_DATABASE_ID`。
   兩個都不要貼進對話或寫進任何會進 git 的檔案。

## 資料庫欄位要求

任務要求至少要有：**標題、類型、日期、內容**（內容欄用來裝逐字稿）。

`.github/scripts/transcript-sync.mjs` 實際運作另外需要兩個欄位，建立資料庫時
要一併加上：

| 欄位名稱 | Notion 型態 | 用途 |
|---|---|---|
| 標題 | Title | 影片標題 |
| 類型 | Select | 固定寫入「泛科學院逐字稿」 |
| 日期 | Date | 影片發布日 |
| 內容 | Text | 逐字稿全文（抓不到字幕時填「（無字幕）」） |
| 影片ID | Text | YouTube 影片 ID，腳本靠這欄判斷是否已經處理過，避免重複寫入 |
| 網址 | URL | 影片連結，方便直接點開 |

## 已知限制

- **單人工作區**：免費工作區只要超過一人使用就會有 **1000 block 終身上限**
  （2026-09-08 對 API 生效），刪除也不會恢復。所以這個工作區只能自己一個人用，
  **不要邀請任何其他成員**（包含之後找人幫忙也不行）。
- **單頁 1000 block 上限**：逐字稿一定要存成資料庫的「內容」欄位值，不能
  存成頁面內文（那樣很快會撞到單頁上限）。
- **API 頻率限制**：每秒最多 3 次請求。`transcript-sync.mjs` 內建節流
  （每次呼叫間隔約 350ms），遇到 429 會照 `Retry-After` 標頭指定的秒數等待
  後重試，不會用固定秒數硬等。
- **內容欄位長度**：Notion 一個 rich_text 區塊上限約 2000 字，腳本會把逐字稿
  切成多個區塊接在同一個屬性裡，不會截斷內容。

## 中文自動字幕品質

YouTube 中文自動字幕（尤其口語內容）常有錯字、斷句怪異的狀況，這是已知現象，
目前策略是照實存原文，不做自動修正或摘要；需要的話可以之後把逐字稿丟給
Claude 或使用者自己的 NotebookLM 整理。
