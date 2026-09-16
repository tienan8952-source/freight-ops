# GitHub + GitHub Pages

## 1. 這個專案用它做什麼
程式碼版本控制、遠端備份（GitHub），以及把 `index.html` + `js/` 直接發布成
使用者實際在用的正式網站（GitHub Pages）。

## 2. 目前的設定
- Repo：`tienan8952-source/freight-ops`（public）
- 遠端網址：`https://github.com/tienan8952-source/freight-ops.git`（HTTPS）
- Pages 網址：`https://tienan8952-source.github.io/freight-ops/`
- Pages 來源：main 分支根目錄（Settings → Pages）
- 金鑰放哪：沒有另外存 PAT/SSH key，推送用的憑證由 `gh CLI` 管理（見
  `docs/tools/gh-cli.md`），存在本機 Windows 認證管理員

## 3. 常用操作
- 一般開發流程：
  ```bash
  git add <檔案>
  git commit -m "說明這次改了什麼、為什麼"
  git push
  ```
- 看目前 repo 可見度與設定：
  ```bash
  gh repo view tienan8952-source/freight-ops --json visibility,defaultBranchRef
  ```
- 確認 Pages 目前狀態（HTTP 200）：
  ```bash
  curl -sI https://tienan8952-source.github.io/freight-ops/ | head -1
  ```
- 回退壞掉的一次改動：`git revert <commit-hash>`（見 `docs/incident.md`）

## 4. 踩過的坑
- **免費帳號把 repo 改成 private 會直接關掉 Pages**：GitHub Free 方案的
  Pages 只支援 public repo。曾經評估過要不要改 private（多一層保護），
  但 `gh repo edit --visibility private` 會要求額外的
  `--accept-visibility-change-consequences` 確認旗標，確認後果（掉星星/
  watcher、public fork 會斷開、push ruleset 會停用）之後決定維持 public，
  理由詳見 `docs/decisions.md`。
- Pages 從 push 到實際生效通常要等 1～3 分鐘，改完立刻檢查會看到舊版本，
  屬正常現象，不用重新部署。

## 5. 限制與風險
- Repo 是 public：任何人都能看到原始碼（不含 `.env`／金鑰，因為已
  `.gitignore`），但商業邏輯、UI 設計等於公開。
- 沒有付費方案的私有 Pages、進階分支保護等功能。
- 依賴 `gh auth login` 的登入狀態，帳號登出或 token 過期會導致
  push/`gh` 指令失敗（見 `docs/tools/gh-cli.md`）。

## 6. 未驗證／待確認
- 是否已啟用 GitHub 的 Dependabot / secret scanning 之類的安全提醒
  （public repo 通常預設有基本掃描，但未特別確認開啟項目）
- 有沒有設定分支保護規則（目前直接 push 到 main，未驗證是否應該改用
  PR 流程）
