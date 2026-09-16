# Pending Info

記錄文件裡標記「未驗證」或「需要使用者補充」的項目。每筆結構：問題、出現在哪份文件、標記日期、狀態。

依 `CLAUDE.md`「未驗證資訊的彙整」規則：下次接到新任務包前，先讀這份清單，若新任務包涵蓋相關領域就一併詢問，不要分次打斷使用者。

---

## 1. Supabase 實際方案、區域、用量、是否有自動備份

- **出現在哪份文件**：`docs/tools/supabase.md`、`docs/config-snapshot.md`
- **標記日期**：2026-09-16
- **狀態**：**已回答**——使用者 2026-09-17 確認：方案為免費方案、區域為東京。用量與是否有官方自動備份，使用者表示之後自己到後台看，不需要現在查，已在 `config-snapshot.md` 標「使用者自行確認」，不再列入待回答。
- **已知替代方案**：TP-07 已經另外建立本機的 `scripts/backup.ps1`／`backup-storage.ps1` 自動備份機制，不依賴 Supabase 官方是否有自動備份。

## 2. GitHub repo 是否要改用 PR 流程、是否開 Dependabot／secret scanning

- **出現在哪份文件**：`docs/tools/github.md`、`docs/config-snapshot.md`
- **標記日期**：2026-09-16
- **狀態**：**已回答**——使用者 2026-09-17 決定維持現況：Dependabot 不開、不強制 PR 流程（連帶不加分支保護）。理由已記進 [decisions.md](decisions.md)「為什麼不開 Dependabot、不強制 PR 流程」。

## 3. gh token 到期時間

- **出現在哪份文件**：`docs/tools/gh-cli.md`、`docs/config-snapshot.md`
- **標記日期**：2026-09-16
- **狀態**：**已回答**——`gh auth status` 不會顯示到期日；這類 gh CLI 用 OAuth device flow 簽發的 token（`gho_` 開頭）本身**沒有固定到期日**，會一直有效到使用者手動 `gh auth logout` 或在 GitHub 帳號設定裡撤銷為止。不是查不到，是這個機制設計上就沒有到期日。
