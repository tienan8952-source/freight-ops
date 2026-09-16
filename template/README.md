# template/

把 freight-ops 這個專案的做法抽出來的可複用範本。開新專案時，跟著
`docs/new-project.md` 的 checklist，從這裡複製對應的檔案。

## 內容

- `tokens.css` / `components.css` — 設計系統（色彩/圓角/陰影/字體/間距 +
  側欄/頂欄/KPI卡/面板/清單列/chip/按鈕/表單/手機底部導覽等共用元件）。
  換專案時只要改 `tokens.css` 裡的 `--pri`/`--grn`/`--amb`/`--red`/
  `--pur`/`--cy` 幾個色彩變數成新品牌色即可，其他規則不用動。
  `--plate`／`.plate` 是車號牌樣式，不是所有專案都需要，用不到可以從
  `components.css` 刪掉那一小段。
- `schema/departments-profiles.sql` — 帳號/權限/部門的通用 schema：
  `profiles` 表＋「第一個註冊的人自動變 admin」的 trigger、`departments`
  表、三個 RLS helper function（`is_active()`/`is_admin()`/`has_perm()`）。
  新專案的業務表都可以直接用 `has_perm('<模組>')` 寫 RLS。
- `frontend-skeleton/core.js` — 前端骨架：Auth（登入/註冊/refresh/登出）、
  `boot()`、通用的 `api()`、`M` 模組 dispatcher、表單產生
  （`fieldHTML`/`formHTML`/`saveRec`）、卡片式清單（`listHTML`/
  `rowCardHTML`）、側欄/頂欄/手機底部導覽、鍵盤快捷鍵。**這是骨架，不含
  任何業務邏輯**——新專案要自己定義 `M` 物件裡的模組、`TABLES` 陣列、
  儀表板內容。
- `notify.ps1` — Claude Code 主動回報用的通知腳本，需要新專案自己建
  `agent_alerts` 表（`schema/departments-profiles.sql` 沒有包含這張表，
  參考 `freight-ops` 的 `supabase/schema-v3.sql` 第 9 節）。
- `CLAUDE.md` — 通知規則／文件維護規則／工作方式／絕對不要做／慣例
  五節的通用版本，複製到新專案根目錄後填入專案名稱與細節。
- `.claude/commands/` — 八個指令庫範本，複製到新專案的 `.claude/commands/`，
  把裡面寫死的網址/repo 名稱改成新專案的。

## 使用方式
不要直接在這個資料夾裡改東西當成「另一個專案」——這裡只是範本來源。
開新專案時複製出去，在新專案裡繼續調整。
