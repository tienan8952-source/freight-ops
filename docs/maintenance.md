# 維護節奏

固定該做的事，寫成可以直接勾的清單。不是每次都要人工做——能自動化的已經自動化（見備註），這份清單主要是提醒「該檢查一下了」。

## 每週

- [ ] 打開 Claude Code，跑一次 `/健康檢查`，看有沒有紅字項目（連線失敗、超過 7 天沒備份、有未處理的 action alert）
- [ ] 跑一次 `.\scripts\backup.ps1`（如果這週沒有其他自動化排程幫你跑過）
- [ ] 檢查「執行紀錄」頁（`agent_alerts`）有沒有還沒處理的通知

> 備註：`scripts/backup.ps1` 可以透過 Windows 工作排程器設定每天自動執行一次，設定好之後這條每週檢查主要是確認排程真的有在跑，不是每次手動跑。

## 每月

- [ ] 跑一次 `.\scripts\backup-storage.ps1`，確認 Storage 檔案也有備份到本機
- [ ] 檢查 `backups\` 底下的備份資料夾數量是否正常（`backup.ps1` 會自動只留最近 12 份，如果每天跑一次，等於留最近 12 天）
- [ ] 到 Supabase 後台看一次 Project → Usage，確認資料庫/Storage 用量沒有快滿（這部分 API 查不到，只能人工看，見 `docs/pending-info.md`）
- [ ] 檢查 GitHub repo 的 `security_and_analysis` 狀態有沒有變化（`gh api repos/tienan8952-source/freight-ops --jq .security_and_analysis`），跟 `docs/config-snapshot.md` 記錄的狀態對一下

## 每季

- [ ] 重新看一次 `docs/recovery.md`，確認步驟還跟現況吻合（尤其是 schema 有變動時，`supabase/full-schema.sql` 要記得同步更新）
- [ ] 抽一個情境實際演練一次復原流程（不用每季都演練情境二那種大工程，情境三「資料被誤刪」的小演練成本低，可以每季做一次維持手感）
- [ ] 檢查 `docs/pending-info.md` 裡還有沒有待回答的項目，有沒有辦法補上
- [ ] 檢查 `docs/known-issues.md` 裡「體驗瑕疵」「不影響使用」的項目，有沒有值得排進下一個任務包處理的
