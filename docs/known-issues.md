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
