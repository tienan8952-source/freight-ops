# 貨運行營運系統（freight-ops）

給貨運行內部使用的營運管理系統：出車報班、車輛維修、零用金、客戶對帳、
保險/證照到期提醒、公文合約建檔、工作單簽核、檔案庫，全部在一個網頁裡。

## 線上網址

**https://tienan8952-source.github.io/freight-ops/**

## 怎麼開始

- **我是使用者，想學怎麼操作系統** → 看 [docs/使用說明.md](docs/使用說明.md)
  （系統內登入後左邊選單也看得到同一份）
- **我要接手開發** → 看 [docs/index.md](docs/index.md) 文件地圖，
  或直接看 [docs/重建指南.md](docs/重建指南.md) 從零開始接手
- **我想知道用了哪些工具、怎麼設定的** → 看
  [docs/工具與帳號清單.md](docs/工具與帳號清單.md) 或更細的
  [docs/tools/](docs/tools/README.md)

## 技術概要

純前端 SPA（`index.html` + `js/*.js`，沒有 build 流程），直接呼叫
[Supabase](https://supabase.com/) 的 Auth / REST API / Storage 當後端，
透過 GitHub Pages 發布成靜態網站。詳細架構見
[docs/schema.md](docs/schema.md)（資料字典）與
[docs/decisions.md](docs/decisions.md)（為什麼這樣設計）。

## 文件在哪

所有文件都在 [docs/](docs/) 資料夾，完整索引看
[docs/index.md](docs/index.md)。
