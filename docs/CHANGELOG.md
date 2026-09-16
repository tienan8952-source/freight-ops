# 版本紀錄

依 `git log` 整理，一行一件事，日期為系統時間（本專案於 2026-09-16
當天完成主要開發與改版）。

## 2026-09-16

- Initial commit：貨運行營運系統 UI 初版
- 階段一：新增帳號/權限 RLS schema（`schema-v2.sql`）
- 階段二/三：登入註冊、權限分流、帳號管理後台
- 階段零：v3 資料庫 schema（storage/部門/流程/工作單/通知/檔案庫/agent alerts）
- 重構：主程式拆成 `js/core.js`，`render()` 改成可擴充的模組 dispatcher
- 階段一/二：照片改存 Storage（含遷移工具）、系統維護頁的備份/匯出Excel/還原
- 階段三：Excel/CSV 匯入（欄位對應、民國年與 Excel 序號日期、金額格式辨識、分批匯入）
- 階段四：檔案庫（拖放上傳、篩選搜尋、預覽下載、刪除警告）
- 階段五：流程設定（可拖曳排序步驟）與部門管理
- 階段六：工作單/轉交/核准退回/流程軌跡
- 階段七：站內通知（鈴鐺清單、未讀紅點、輪詢、瀏覽器通知）
- 階段八：Claude Code 主動回報（agent_alerts、notify.ps1、CLAUDE.md 通知規則）
- 階段九：使用說明文件
- fix：`notify.ps1` 明確帶非瀏覽器 User-Agent，避免 Supabase 擋掉 secret key 請求
- docs：新增工具與帳號清單，記錄 Supabase/GitHub/gh CLI 等設定與踩過的坑
- 任務包 v4：建立設計 token（`css/tokens.css`）與共用元件（`css/components.css`）
- 任務包 v4：套用新設計到總覽頁、側欄/頂欄、清單頁與手機底部導覽
- 任務包 v4+5+6 階段 F：列印樣式（`css/print.css`）與鍵盤快捷鍵
- 任務包 v4+5+6 階段 G：工具手冊 `docs/tools/`
- 任務包 v4+5+6 階段 H：規範文件（資料字典、環境金鑰、事故處理、決策紀錄、提示詞範本）
- 任務包 v4+5+6 階段 I：指令庫 `.claude/commands/`、CLAUDE.md 補充、重建指南、新專案 checklist、`template/`
