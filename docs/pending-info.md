# Pending Info

記錄文件裡標記「未驗證」或「需要使用者補充」的項目。每筆結構：問題、出現在哪份文件、標記日期、狀態。

依 `CLAUDE.md`「未驗證資訊的彙整」規則：下次接到新任務包前，先讀這份清單，若新任務包涵蓋相關領域就一併詢問，不要分次打斷使用者。

---

## 1. Supabase 實際方案、區域、用量、是否有自動備份

- **出現在哪份文件**：`docs/tools/supabase.md`、`docs/config-snapshot.md`
- **標記日期**：2026-09-16
- **狀態**：**部分回答，仍待回答**——TP-07 查證後確認：這幾項是 Supabase 帳單／專案層級資訊，只能到後台 Project Settings 看，或需要 Management API 的個人存取權杖（Personal Access Token）才能用 API 查，這個專案手上只有 anon key／service_role key（資料層級金鑰），查不到。方案／區域／用量／官方自動備份與否，仍需要使用者自己到 Supabase 後台看一眼截圖告訴我們，或提供一組有權限的 Management API token。
- **已知替代方案**：TP-07 已經另外建立本機的 `scripts/backup.ps1`／`backup-storage.ps1` 自動備份機制，不依賴 Supabase 官方是否有自動備份。

## 2. GitHub repo 是否要改用 PR 流程、是否開 Dependabot／secret scanning

- **出現在哪份文件**：`docs/tools/github.md`、`docs/config-snapshot.md`
- **標記日期**：2026-09-16
- **狀態**：**目前狀態已查清楚，是否要改仍待使用者決定**——實際查詢結果（`gh api repos/tienan8952-source/freight-ops`，2026-09-16）：`secret_scanning` 已開啟、`secret_scanning_push_protection` 已開啟、`dependabot_security_updates` 未開啟、main 分支沒有分支保護規則、目前沒有強制 PR 流程（可直接 push 到 main）。**要不要開 Dependabot、要不要加分支保護強制 PR** 是政策決定，維持待回答。

## 3. gh token 到期時間

- **出現在哪份文件**：`docs/tools/gh-cli.md`、`docs/config-snapshot.md`
- **標記日期**：2026-09-16
- **狀態**：**已回答**——`gh auth status` 不會顯示到期日；這類 gh CLI 用 OAuth device flow 簽發的 token（`gho_` 開頭）本身**沒有固定到期日**，會一直有效到使用者手動 `gh auth logout` 或在 GitHub 帳號設定裡撤銷為止。不是查不到，是這個機制設計上就沒有到期日。
