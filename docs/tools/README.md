# 工具手冊

這個資料夾是每個工具的操作手冊（設定、常用操作、踩過的坑）。
`docs/工具與帳號清單.md` 是給人很快掃過一遍的簡版索引；這裡是更細的拆分版，
遇到問題要查怎麼解，來這裡找對應那一份。

## 狀態總表

| 工具 | 角色 | 狀態 |
|---|---|---|
| [Supabase](supabase.md) | 資料庫、登入、Storage、REST API | 使用中 |
| [GitHub + Pages](github.md) | 版本控制、靜態網站託管 | 使用中 |
| [gh CLI](gh-cli.md) | 終端機操作 GitHub | 使用中 |
| [Claude Code](claude-code.md) | 主要開發工具 | 使用中 |
| [Node / npm](node-npm.md) | 本機驗證工具（Playwright 等） | 使用中 |
| [Git](git.md) | 版本控制 | 使用中 |
| [PowerShell](powershell.md) | 本機腳本執行環境（notify.ps1 等） | 使用中 |
| [notify.ps1 / agent_alerts](notify-agent-alerts.md) | Claude Code 主動回報進度 | 已設定未用（僅 Claude Code 呼叫，尚無日常人工使用） |
| [LINE Messaging API](line-messaging-api.md) | 未來可能的行動端通知 | 未接但已規劃 |
| [Supabase Edge Functions](supabase-edge-functions.md) | 未來可能的伺服器端邏輯 | 未接但已規劃 |

## 依「這件事該找哪個工具」分類

- **寫程式**：[Claude Code](claude-code.md)、[Git](git.md)
- **部署**：[GitHub + Pages](github.md)、[gh CLI](gh-cli.md)
- **資料庫**：[Supabase](supabase.md)
- **檔案**：[Supabase](supabase.md)（Storage bucket `scans`）
- **通知**：[notify.ps1 / agent_alerts](notify-agent-alerts.md)、[PowerShell](powershell.md)、（未來）[LINE Messaging API](line-messaging-api.md)
- **文件**：本資料夾與 `docs/` 底下其他文件（見 [docs/index.md](../index.md)）
- **自動化**：[PowerShell](powershell.md)、[Node / npm](node-npm.md)（本機驗證腳本）、（未來）[Supabase Edge Functions](supabase-edge-functions.md)
