# 文件地圖

不知道要看哪一份的時候，先看這裡。

## 給使用者本人看的文件

這三份是寫給**你自己**照著操作的操作手冊，跟下面「技術文件」的差別是：那些是給 Claude Code／開發者讀的規格與細節，這三份是給你自己開電腦、動手做事時看的。

| 我想知道… | 看這份 |
|---|---|
| 日常怎麼開機、怎麼用 Claude Code、Supabase 後台、GitHub 網頁、線上系統 | [使用者操作手冊.md](使用者操作手冊.md) |
| Project URL／金鑰去哪拿／檔案放哪，一頁速查 | [設定速查卡.md](設定速查卡.md) |
| 出狀況了，情境對指令怎麼處理 | [緊急對照卡.md](緊急對照卡.md) |

## 技術文件（給 Claude Code／開發者）

| 我想知道… | 看這份 |
|---|---|
| 這個專案是什麼、為誰做、目標是什麼 | [project-brief.md](project-brief.md) |
| 這個系統怎麼用（給使用者看） | [使用說明.md](使用說明.md) |
| 用了哪些工具、快速掃過一遍 | [工具與帳號清單.md](工具與帳號清單.md) |
| 某個工具的詳細設定/操作/踩過的坑 | [tools/README.md](tools/README.md) → 對應那份 |
| 資料庫每張表每個欄位是什麼意思 | [schema.md](schema.md) |
| 有哪些金鑰、放在哪、外洩怎麼辦 | [env.md](env.md) |
| 網站掛了/登入不了/資料被刪，怎麼救 | [incident.md](incident.md) |
| 為什麼當初這樣設計、還有什麼其他選項沒選 | [decisions.md](decisions.md) |
| 怎麼跟 Claude Code 講話它才做得對 | [prompts.md](prompts.md) |
| 每次都改了什麼、按時間看 | [CHANGELOG.md](CHANGELOG.md) |
| 2026-09-16 從零到上線的完整故事 | [建置歷程.md](建置歷程.md) |
| 換一台新電腦要怎麼接手 | [重建指南.md](重建指南.md) |
| 想用同一套方法開一個全新專案 | [new-project.md](new-project.md) |
| 有哪些可以重複用的指令（新增功能/修bug/部署…） | `.claude/commands/`（見 repo 根目錄 `CLAUDE.md`） |
| 想抽這個專案的架構去做別的專案 | 根目錄 `template/README.md` |
| 任務包（給 Claude Code 執行的完整任務指示）存在哪 | [tasks/README.md](tasks/README.md) |
| 已知但還沒處理/決定不處理的小問題 | [known-issues.md](known-issues.md) |
| 哪些資訊還沒查到、需要使用者回答 | [pending-info.md](pending-info.md) |
| Supabase/GitHub 的實際設定值快照（可重建設定用） | [config-snapshot.md](config-snapshot.md) |
| 電腦壞了/Supabase 專案沒了/資料被誤刪，怎麼從備份復原 | [recovery.md](recovery.md) |
| 平常固定該做的維護（每週/每月/每季） | [maintenance.md](maintenance.md) |
| 四個專案（營運系統/自動化排程/外接AI/Web與App）怎麼分工、進度總表 | [briefs/00-總控.md](briefs/00-總控.md) |
| 營運系統專案指示（給 claude.ai／GPT 對話專案貼） | [briefs/01-營運系統.md](briefs/01-營運系統.md) |
| 自動化排程專案指示 | [briefs/02-自動化排程.md](briefs/02-自動化排程.md) |
| 外接 AI 專案指示 | [briefs/03-外接AI.md](briefs/03-外接AI.md) |
| Web 與 App 專案指示 | [briefs/04-Web與App.md](briefs/04-Web與App.md) |
| 給 GPT 專案貼的交接說明（GPT 該做/不該做什麼） | [handoff-gpt.md](handoff-gpt.md) |
| 目前進度快照，貼給外部 AI（Gemini、GPT）看 | [進度.md](進度.md) |
| 「我想做 X」該用哪個工具、代價是什麼；Claude Code 能力明細 | [capabilities.md](capabilities.md) |

第一次接觸這個 repo，建議看順序：根目錄 `README.md` → 這份文件地圖 →
`工具與帳號清單.md` → `schema.md`。
