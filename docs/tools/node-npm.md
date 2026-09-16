# Node / npm

## 1. 這個專案用它做什麼
正式站台本身是純靜態 HTML/JS（`index.html` + `js/*.js`），**不需要**
Node 建置流程；Node/npm 只用在本機驗證工具（例如用 `npx playwright` 開
無頭瀏覽器截圖驗證改版後的畫面），不會被打包進上線的網站。

## 2. 目前的設定
- 沒有專案自己的 `package.json`／固定依賴，需要工具時用
  `npx <套件名>` 現抓現用（例如 `npx playwright@1.63.0 screenshot ...`）
- 沒有 CI/CD 建置流程，GitHub Pages 直接發布 repo 裡的靜態檔案
- 金鑰放哪：無

## 3. 常用操作
- 本機起一個靜態伺服器預覽（不用裝任何套件）：
  ```bash
  python -m http.server 8091
  ```
- 用 Playwright 對本機伺服器截圖驗證（一次性，不寫進 repo）：
  ```bash
  npx --yes playwright@1.63.0 screenshot --browser chromium http://localhost:8091/index.html out.png
  ```

## 4. 踩過的坑
- **PowerShell 執行原則擋住 npm**：npm 在 Windows 上是靠 `npm.ps1` 這支
  PowerShell script 執行，預設的執行原則（Restricted）會擋掉，一跑
  `npm`/`npx` 就出現「因為在此系統上停用了指令碼執行」的錯誤。解法見
  `docs/tools/powershell.md`。

## 5. 限制與風險
- 因為沒有鎖版本（沒有 `package-lock.json`），`npx` 現抓的套件版本可能
  隨時間變動，若要重現某次驗證的結果，最好指定明確版本（例如
  `playwright@1.63.0`）。
- 這些都是「開發時的驗證工具」，跟正式站台的運作完全無關；就算本機
  Node 環境壞掉，也不影響 GitHub Pages 上線中的系統。

## 6. 未驗證／待確認
- 無
