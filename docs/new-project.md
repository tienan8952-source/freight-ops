# 用同一套方法開一個全新專案：Checklist

把這個專案的做法抽成可重複的步驟，開新專案時照著做。可搭配根目錄
`template/` 資料夾裡現成的檔案（見 `template/README.md`）。

## 1. 建 repo
```bash
gh repo create <帳號>/<新專案名> --public --clone
cd <新專案名>
```
（除非有付費方案，否則維持 public 才能用免費的 GitHub Pages，見
`docs/decisions.md`）

## 2. 建 Supabase 專案
1. 到 https://supabase.com 建立新專案，記下 Project URL
2. Project Settings → API 複製 `anon` key（會放前端）與 `service_role`
   key（只放本機 `.env`，絕不進 git）

## 3. Schema 與 RLS
1. 用 `template/schema/departments-profiles.sql` 當起點：建立
   `profiles`（含「系統第一人自動變 admin」的 trigger）、`departments`、
   三個 helper function `is_active()`/`is_admin()`/`has_perm()`
2. 每張新的業務表都要：`enable row level security` + 用
   `has_perm('<模組>')` 寫 select/insert/update/delete 政策，不要漏

## 4. 登入與權限（前端骨架）
用 `template/frontend-skeleton/` 裡的 `core.js` 當起點：已經包含
- Auth（signup/login/refresh/logout）
- `boot()` 讀取 profile、依 `status`（pending/active/suspended）決定
  顯示登入頁/等待審核頁/主畫面
- 通用的 `api()`／`M` 模組 dispatcher／`listHTML()` 卡片式清單／表單
  產生邏輯

改的地方：`SUPABASE_URL`、`ANON_KEY`、`M` 物件裡的業務模組定義。

## 5. 前端骨架與設計系統
複製 `template/tokens.css`、`template/components.css` 到新專案的
`css/`，套進 `index.html`。這套 token 是品牌中性的色票，換專案時可以
直接改 `--pri`/`--grn`/`--amb`/`--red`/`--pur`/`--cy` 這幾個色彩變數
套用新品牌色，其他圓角/陰影/字級規則不用動。

## 6. Pages 部署
1. GitHub repo → Settings → Pages → 來源選 `main` 分支根目錄
2. 等 1～3 分鐘後 `curl -sI https://<帳號>.github.io/<新專案名>/` 確認
   HTTP 200

## 7. 通知機制
複製 `template/notify.ps1` 到新專案 `scripts/`，複製
`template/CLAUDE.md`（已包含通知規則/工作方式/絕對不要做/慣例四節）到
新專案根目錄，依新專案調整內容。新建一張 `agent_alerts` 表（見
`template/schema/` 或 `supabase/schema-v3.sql` 的第 9 節）。

## 8. 文件初始化
複製 `template/.claude/commands/` 整套指令庫；建立新專案自己的
`docs/index.md`、`docs/工具與帳號清單.md`（或 `docs/tools/`）、
`docs/schema.md`、`docs/env.md`，內容從新專案的實際設定寫起，不要照抄
這個專案的內容。
