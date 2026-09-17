# Known Issues

記錄任務範圍外、發現當下不處理的問題。每筆結構：發現日期、描述、分類、狀態。

分類定義：
- **阻塞功能**：使用者無法完成該做的事，發現時應立刻停下並呼叫 `scripts/notify.ps1` 回報，不會出現在這份清單裡累積太久。
- **體驗瑕疵**：不影響使用，但不理想，會被記在這裡繼續留著、原任務照常做完。
- **不影響使用**：純觀察/小地方，記錄備查即可。

---

## 2026-09-16：notify.ps1 中文內容在執行紀錄頁顯示亂碼

- **發現日期**：2026-09-16
- **描述**：`scripts/notify.ps1` 送出的中文標題／內容寫進 Supabase 的 `agent_alerts` 表後，系統內「執行紀錄」頁顯示時是亂碼（問號或亂字）。
- **根因（TP-07 復原演練時查出）**：不是 Supabase 顯示問題，是 Windows PowerShell 5.1 的 `Invoke-RestMethod` 在 `-Body` 傳字串時會用系統預設編碼（非 UTF-8）重新編碼，中文在送出前就已經壞掉了。
- **解法**：把要送出的 JSON 字串先轉成 UTF-8 位元組陣列（`[System.Text.Encoding]::UTF8.GetBytes(...)`）再傳給 `-Body`，已修正並實測確認 `scripts/notify.ps1` 送出的中文可以正確讀回。同批一起修正了同樣寫法的 `scripts/restore-table.ps1`、`scripts/backup-storage.ps1`。
- **分類**：體驗瑕疵
- **狀態**：**已解決**（2026-09-16，TP-07 復原演練時一併修正並驗證）

## 2026-09-18：scripts/backup.ps1 的表清單還沒加入原始層三張新表

- **發現日期**：2026-09-18（專案分工任務包，階段五準備 GitHub Actions 備份工作流程時發現）
- **描述**：`scripts/backup.ps1`（本機備份）與新的 `.github/workflows/backup.yml`（雲端定期備份）各自維護一份 `$Tables`／`TABLES` 表清單。本次任務新增了 `import_batches`／`raw_records`／`field_mappings` 三張表，`.github/workflows/backup.yml` 用的 `.github/scripts/backup-export.mjs` 已經包含這三張，但 `scripts/backup.ps1` 是既有檔案、本任務範圍只包含「新增兩條 GitHub Actions 排程」，沒有涵蓋修改既有本機備份腳本，所以先不動。
- **影響**：在補這行之前，執行 `.\scripts\backup.ps1` 做的本機備份不會包含原始層三張新表的資料。雲端的 GitHub Actions 備份不受影響（已包含）。
- **分類**：體驗瑕疵
- **狀態**：待處理——下次修改 `scripts/backup.ps1`（例如下一個任務包或用 `/加資料表`／`/加欄位` 流程）時，把 `import_batches`、`raw_records`、`field_mappings` 加進 `$Tables`，`$SchemaVersion` 也要更新成有包含 schema-v4-raw-layer.sql。
