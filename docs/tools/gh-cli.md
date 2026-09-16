# gh CLI

## 1. 這個專案用它做什麼
在終端機直接操作 GitHub（repo 設定、查詢狀態），也是 `git push`／`git pull`
對 GitHub 認證的憑證來源，不用每次手動輸入帳密或另外設定 SSH key。

## 2. 目前的設定
- 版本：2.101.0（`gh --version` 可查）
- 登入帳號：`tienan8952-source`
- 認證方式：keyring（Windows 認證管理員），`Git operations protocol: https`
- Token scopes：`gist`、`read:org`、`repo`
- 金鑰放哪：gh 自己管理的 OAuth token，存在本機 keyring，不在 repo 裡，
  可用 `gh auth status` 確認登入狀態（會顯示遮蔽過的 token 開頭 `gho_***`）

## 3. 常用操作
- 確認登入狀態：`gh auth status`
- 看 repo 設定：`gh repo view tienan8952-source/freight-ops`
- 改 repo 設定（例：改說明文字）：`gh repo edit --description "..."`
- 需要重新登入時：`gh auth login`（**互動式**，見下方坑）

## 4. 踩過的坑
- **裝好但 PATH 沒刷新**：用安裝程式裝完 gh 之後，當下已經開著的終端機
  視窗還吃不到新的 PATH，執行 `gh` 會找不到指令；短期內可以先用完整
  路徑 `"C:\Program Files\GitHub CLI\gh.exe"` 呼叫，或開一個新的終端機
  視窗（新視窗會重新讀取使用者層級的 PATH）。
- **`gh auth login` 需要互動，Claude Code 的 shell 跑不了**：這個指令
  會跳出瀏覽器登入或要求貼一次性代碼，是互動流程，在 Claude Code 的
  非互動 shell 裡會卡住或直接失敗；這一步一定要使用者自己在終端機
  手動執行一次，之後的登入狀態會被 gh 存起來，後續 Claude Code 呼叫
  `git push`／`gh` 指令才吃得到。

## 5. 限制與風險
- token 的 scope 只有 `gist`/`read:org`/`repo`，如果之後要用 gh 操作
  workflow（Actions）、org 管理等功能，可能要重新 `gh auth login` 加
  對應 scope。
- keyring 存放認證是跟著這台電腦走的，換電腦或重灌系統要重新
  `gh auth login` 一次（見 `docs/重建指南.md`）。

## 6. 未驗證／待確認
- token 的實際到期時間／是否會自動更新，未特別確認過
