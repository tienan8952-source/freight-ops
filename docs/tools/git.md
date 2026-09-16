# Git

## 1. 這個專案用它做什麼
版本控制：紀錄每次改動的原因與內容，讓所有改版可以回溯、比對、必要時
復原。

## 2. 目前的設定
- 單一分支開發：`main`，目前沒有使用 feature branch / PR 流程
- `.gitignore` 排除：`.env`（Supabase service key）、
  `scripts/.session-id`（notify.ps1 的本機 session 識別碼）
- 金鑰放哪：不涉及金鑰，push 認證由 gh CLI 管理（見
  `docs/tools/gh-cli.md`）

## 3. 常用操作
- 看目前狀態／尚未提交的變更：`git status`
- 看某段時間做了什麼：`git log --oneline -20`
- 復原某次改動（見 `docs/incident.md`「改壞了要退回」）：
  ```bash
  git revert <要復原的 commit hash>
  ```

## 4. 踩過的坑
- 目前沒有 git 本身操作上的事故；因為只有一個人在單一分支上開發，還
  沒遇過合併衝突之類的問題。

## 5. 限制與風險
- 直接在 main 上開發、沒有 PR 審核機制，任何一次 commit 都可能直接
  影響到 GitHub Pages 正式站（push 後幾分鐘內生效）。之後如果協作人數
  變多，建議改用 feature branch + PR。
- `git revert` 是安全的退回方式（會保留歷史），要避免用
  `git reset --hard` 之類會改寫歷史或遺失資料的操作，尤其是已經 push
  過的 commit。

## 6. 未驗證／待確認
- 無
