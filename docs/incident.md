# 事故處理

每一種狀況都寫成可以直接照做的步驟。

## 網站打不開
1. 確認網址是否正確：`https://tienan8952-source.github.io/freight-ops/`
2. `curl -sI https://tienan8952-source.github.io/freight-ops/` 看 HTTP
   狀態碼：
   - 404：Pages 設定可能被改掉了，檢查 GitHub repo → Settings → Pages
     的來源分支/資料夾是否還是 `main` 根目錄
   - 其他錯誤／逾時：檢查 GitHub 本身是否有大規模事故
     （https://www.githubstatus.com/）
3. 確認最近一次 push 有沒有把 `index.html` 改壞（`git log -3`），必要時
   `git revert`（見下方「改壞了要退回」）

## 登入不了
1. 先確認是帳號問題還是系統問題：換一個已知正常的帳號試登入
2. 如果是「畫面說帳號等待管理員核准」：這是正常訊息，不是壞掉，去
   「帳號管理」把狀態改成「啟用」
3. 如果輸入帳密後完全沒反應／一直轉圈：
   - 打開瀏覽器開發者工具看 Console 有沒有錯誤
   - 檢查 Supabase 專案是否被暫停（見下方「Supabase 專案被暫停」）
4. 如果是「註冊完找不到帳號資料」：代表 `profiles` 表沒有對應那筆，
   到 Supabase SQL Editor 執行：
   ```sql
   insert into public.profiles (id, email, name, role, status)
   select id, email, email, 'user', 'pending' from auth.users
   where id not in (select id from public.profiles);
   ```

## 資料被誤刪
1. 系統本身「刪除」是硬刪除（沒有軟刪除/垃圾桶機制），刪掉的資料只能
   靠備份救回
2. 到「系統維護」頁看上次備份時間，如果有備份 JSON：
   - 用「還原」功能上傳那份備份 JSON，它只會**補回**目前資料庫沒有的
     id，不會覆蓋或刪除現有資料，可以放心用
3. 如果沒有備份：檢查 Supabase 是否有 Point-in-Time Recovery（多半是
   付費方案才有，見 `docs/tools/supabase.md`「未驗證」），沒有的話這筆
   資料就真的救不回來——這也是為什麼要定期備份

## Supabase 專案被暫停（七天無活動）
免費方案的 Supabase 專案連續 7 天沒有 API 活動會自動暫停。
1. 登入 Supabase 後台，該專案會顯示「Paused」狀態跟一個「Restore」按鈕
2. 按 Restore 通常幾分鐘內恢復
3. 恢復後回系統重新整理確認資料還在、登入功能正常
4. 預防：讓系統維持每天有人使用即可（正常營業使用就足夠），或設一個
   最簡單的定期 ping（尚未實作，屬未來待辦）

## 額度快滿（資料庫或 Storage 容量）
1. Supabase 後台 → Project → Database / Storage 頁面看目前用量
2. 資料庫變大最大宗通常是舊的 base64 照片（已改存 Storage，若還有舊
   資料殘留，用「系統維護」頁的搬移工具處理）
3. Storage 變大：檢查「檔案庫」有沒有很多不再需要的舊檔案，用檔案庫的
   刪除功能清理（會提示是否有業務資料還在引用，避免誤刪還在用的檔案）
4. 額度真的不夠：考慮升級付費方案，或匯出舊資料歸檔後從資料庫清除

## 金鑰外洩
見 `docs/env.md` 每把金鑰各自的「外洩怎麼辦」；共通原則：
1. 立刻在對應服務後台把那把金鑰作廢/重新產生
2. 更新本機存放該金鑰的檔案（`.env` 等）
3. 檢查該金鑰權限範圍內的資料有沒有異常存取紀錄

## 改壞了要退回
1. 先確認是哪一次 commit 出的問題：`git log --oneline -10`
2. 用 `git revert` 建立一個新的提交來抵銷那次改動（不會改寫歷史，安全）：
   ```bash
   git revert <出問題的 commit hash>
   git push
   ```
3. 如果是連續好幾個 commit 一起出問題，可以指定範圍：
   ```bash
   git revert <舊的 commit>..<新的 commit>
   ```
4. push 後等 1～3 分鐘讓 GitHub Pages 重新部署，再次確認網站正常
5. **不要**用 `git reset --hard` 加 `git push --force` 去「消除」錯誤
   commit——那樣會改寫已經公開的歷史，且如果其他人已經 pull 過會造成
   衝突
