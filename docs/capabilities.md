> **上次核對日期：2026-09-18**。這份文件會過期——版本號、額度數字、工具
> 清單都可能隨時間變動。用到新功能、新工具，或發現數字不對時，順手回來
> 補這份文件，不要放著不管。

# 能力對照表

## 上層：情境對照表（給使用者看）

「我想做 X」→ 有哪幾條路可以走 → 各自要付出什麼代價 → 建議走哪條。

### 我想定時做一件事（例如每天/每週自動跑一次）

| 路線 | 代價 | 適合場景 |
|---|---|---|
| **Supabase Cron（pg_cron）** | 只能在資料庫內部執行 SQL，不能呼叫外部網站/API | 資料庫內部的事，例如保活查詢、資料庫內彙整計算 |
| **GitHub Actions** | 需要寫 workflow 檔（`.github/workflows/`），public repo 每月 2000 分鐘免費 | 需要呼叫外部服務（Supabase REST、Notion API、YouTube）的排程 |
| n8n | 評估後不採用，上面兩個免費工具已經做得完現在的需求 | — |

**建議**：只碰資料庫內部 → Supabase Cron；要跟外部服務打交道 → GitHub Actions。
目前用法：`supabase/migrations/schema-v4-raw-layer.sql`（保活）、
`.github/workflows/backup.yml`、`.github/workflows/transcript.yml`。

### 我想備份資料

| 路線 | 代價 | 適合場景 |
|---|---|---|
| **本機 `scripts/backup.ps1`** | 要記得手動執行，或自己排 Windows 工作排程器 | 想要立刻備份、想做還原演練 |
| **GitHub Actions `backup.yml`** | 需要先設好 GitHub Secrets（`SUPABASE_URL`/`SUPABASE_SERVICE_KEY`） | 不想手動記得做的每週例行備份 |
| Supabase 官方自動備份 | 免費方案沒有這個功能 | 不適用（除非升級付費方案） |

**建議**：兩條都留著，本機的當「隨時想備份就手動跑」，GitHub Actions
當「不用記得也會自動做」的保險。兩邊表清單目前沒完全同步，見
`docs/known-issues.md`。

### 我想把資料從一個工具搬到另一個工具

| 路線 | 代價 | 適合場景 |
|---|---|---|
| **GitHub Actions + 對方的 API** | 每個工具的 API 各有速率限制、欄位規則要摸清楚 | 目前用法：YouTube RSS → Notion（逐字稿） |
| 人工手動搬 | 不會壞，但沒有自動化，每次要花時間 | 一次性、量很小的資料搬移 |
| n8n / Make 這類整合平台 | 評估後不採用 | — |

### 我想通知人（提醒、告警）

| 路線 | 代價 | 適合場景 |
|---|---|---|
| **系統內站內通知**（`notifications` 表） | 只有登入系統的人看得到 | 工作單指派、系統內部流程 |
| **`scripts/notify.ps1` → `agent_alerts`** | 只有 Claude Code 主動呼叫，不是給使用者日常發通知用的機制 | Claude Code 需要使用者操作或回報進度時 |
| LINE Messaging API | 還沒接；Reply 免費、Push 每月 200 則，2026-11-01 起會調整商用定價 | 未來想做到「手機也能收到通知」時 |

### 我想處理外部內容（例如別人的網頁、影片）

| 路線 | 代價 | 適合場景 |
|---|---|---|
| **一般 HTTP 請求（RSS、公開 API、頁面原始碼解析）** | 對方改版會壞，需要維護 | 目前用法：讀 YouTube RSS、解析影片頁面找字幕連結 |
| 專門的第三方 API（例如 TranscriptAPI、TranscriptMagic） | 需要使用者本人註冊、可能要付費 | 上面那條失敗率變高時的備援 |
| 模擬瀏覽器（Puppeteer 之類） | 刻意不用：容易因為改版而壞、用量大容易被封 IP | 不建議 |

### 我想做需要伺服器的功能（例如藏 API 金鑰、跑後端邏輯）

| 路線 | 代價 | 適合場景 |
|---|---|---|
| **Supabase Edge Functions** | 每月 50 萬次請求免費，要寫 Deno/TypeScript | 跟資料庫關係緊密的後端邏輯 |
| **Cloudflare Workers** | 每日 10 萬次請求免費，要另外學一套平台 | 未來 AI 助手／語音輸入代理金鑰用（見 `docs/briefs/04-Web與App.md`） |
| 直接在前端呼叫 API | 金鑰會外洩，**不能這樣做** | 不建議 |

GitHub Pages 本身只能放靜態網頁，這正是為什麼上面兩條都必須存在。

---

## 下層：能力明細（給 Claude／Claude Code 看）

### Claude Code 在這台電腦能做什麼

現有 slash commands（掃描 `.claude/commands/` 取得，2026-09-18）：

| 指令 | 說明 |
|---|---|
| `/交接` | 產生狀態摘要：做到哪、卡在哪、下一步 |
| `/修bug` | 修一個 bug。只修這個 bug，不順手重構 |
| `/健康檢查` | 檢查 Supabase 連線、各表筆數（與上次比較）、容量、備份時間、Supabase 活動時間、未處理通知、未提交變更、文件更新日期 |
| `/備份` | 匯出所有表為 JSON 到 `backups/`，檔名含日期 |
| `/加欄位` | 幫某個模組加一個欄位，會提醒五個要一起改的地方 |
| `/加資料表` | 新增一整張資料表（新模組）：schema + RLS + 前端 + 權限 + 選單 + 資料字典一起做 |
| `/新功能` | 新增一個功能，一次只做一個 |
| `/部署` | commit、push，確認 GitHub Pages 正常，回報網址 |

其餘一般能力：讀寫本機檔案、跑 git/gh/node/PowerShell 指令、呼叫 Supabase
REST API（用 `.env` 裡的金鑰）、呼叫已連結的 MCP（Supabase、Notion、
Google Drive 等）。

### Claude Code 不能做什麼

- 互動式登入（例如 `gcloud auth login` 這種要跳瀏覽器登入畫面的流程）。
- 註冊新帳號、申請/核發 API 金鑰、完成付費訂閱這類需要「本人身份」的操作。
- 開瀏覽器點按鈕、滑動頁面這種 GUI 互動（除非透過已連結的 MCP 工具，
  而且該工具本身有支援）。
- 這些事都需要使用者本人操作，Claude Code 只能把「要做什麼、去哪裡做、
  大概多久」講清楚，請使用者去做。

### 這台電腦已裝的工具（2026-09-18 實際執行版本）

| 工具 | 版本 |
|---|---|
| git | 2.55.0.windows.3 |
| node | v24.19.0 |
| claude（Claude Code） | 2.1.274 |
| code（VS Code） | 1.138.0 |

### 外部工具能力與限制（2026-09-18 查證）

- **GitHub**：放程式碼；**GitHub Pages** 代管網站，免費方案只能 public
  repo，100GB/月流量，每小時最多 10 次建置。**GitHub Actions** 跑跨系統
  排程，public repo 免費每月 2000 分鐘。
- **Supabase**：放業務資料庫與檔案，是系統唯一的資料儲存。免費方案：
  500MB 資料庫、1GB 檔案、5GB 流量、50000 月活躍用戶、500000 次 Edge
  Function、最多 2 個專案、沒有官方自動備份，七天無活動會暫停（登入後台
  按「恢復」，資料保留，一年內可恢復）。**Supabase Cron（pg_cron）**
  2026 年起在所有方案（含免費）預設啟用。
- **Notion**：交接區資料庫已建立：https://app.notion.com/p/b54d19cb9f8249268315540345abfe4d
  （資料庫「🚚 freight-ops 交接區」，資料庫 ID `b54d19cb9f8249268315540345abfe4d`，
  2026-09-18 已用 Notion 連接器驗證欄位，詳見 `docs/tools/notion-api.md`）。
  放 GPT／Claude 交接內容與逐字稿。免費工作區超過一人使用
  就有 1000 block 終身上限（2026-09-08 對 API 生效，刪除不會恢復），
  所以工作區必須維持單人。單頁也有 1000 block 上限，逐字稿要存成資料庫
  欄位不是頁面內容。API 每秒最多 3 次請求。
- **Google Workspace**：已購買，含 Gemini 與 NotebookLM。Google 雲端是
  使用者個人查閱轉發用，不進系統。
- **LINE Messaging API**：做通知用，Reply 免費、Push 每月 200 則。
  2026-11-01 起會調整商用定價，屆時要重新確認費用。
- **Cloudflare Workers**：未來做 AI 助手時用，每日 10 萬次請求免費，
  現在不做。
- **n8n**：評估後不採用，Supabase Cron 與 GitHub Actions 免費就做得完
  當前需求。
- **Figma**：評估後不採用，介面直接寫成程式碼，沒有「先畫稿再實作」
  這一段。

### 本專案已有的工具（掃描 `scripts/`，2026-09-18）

| 檔名 | 用途 |
|---|---|
| `backup.ps1` | 本機備份：把全部資料表匯出成 `backups/YYYY-MM-DD/*.json` |
| `backup-storage.ps1` | 備份 Supabase Storage（`scans` bucket）檔案 |
| `restore-table.ps1` | 從本機備份還原單一資料表 |
| **`notify.ps1`** | **Claude Code 在需要使用者手動操作、遇到解決不了的錯誤、單一階段超過 10 分鐘、或整包任務完成時，停下前必須呼叫的通知機制**（寫進 Supabase `agent_alerts` 表，使用者可在系統內「執行紀錄」頁看到） |
