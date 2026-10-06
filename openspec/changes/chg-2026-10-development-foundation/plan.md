# 開發基礎整理執行計畫

Metadata 與總狀態以 [registry](../../../docs/spec-index.json) 為準；完成契約見 [proposal](proposal.md)，AC 與執行結果見 [matrix](../../../docs/testing/matrices/chg-2026-10-development-foundation.md)。本檔保留工作拆解與接續資訊。

## 依賴與工作邊界

依賴現有共享程式／schemas、Node 24 與可安裝的 npm dependencies。本輪不依賴私人 route JSON 或 reference pack。文件、runner／hygiene、route／map tests 可分工；registry 形狀與檢查命令由統籌先對齊。

- 文件負責 docs 與 openspec，schema 只索引不改寫。
- 工具負責 runner、checker、套件與 CI，保留資料封鎖。
- reviewer 核對來源、需求 ID、受影響契約、實際 diff、負例與固定版本。

## Tasks

- [x] FND-1：四領域規格、摘要、legacy 對照與唯一正式來源 ADR 完成回讀。
- [x] FND-2：registry、decisions、research、tracker、runbook 互相連通，沒有重複 metadata 或漂移的正式條文。
- [x] FND-3：單一 check 入口與 Node／CI 設定完成，允許程式測試發現且拒絕不允許的 fixtures／符號連結。
- [x] FND-4：route schema／runtime 邊界、map 純程式行為與工具正反例完成。
- [x] FND-5：DF-01～07 依目前版本檢查並記錄；處理 reviewer 的阻擋項。
- [x] FND-6：統籌回讀並更新本輪狀態，產品未驗證 gates 保留，不上傳私人證據。

## 取捨與風險

registry 用 JSON 以沿用現有 runtime，不為索引另引 YAML 依賴。schema 編譯使用標準 validator；instance 測試只聲稱實際覆蓋的契約。小圖沿用 session 只讀行為，本次測試不重新設計導航。

主要風險是縮寫 ID 對錯、過度允許文件路徑、將單元測試混成產品驗收、引用私人歷史。處理方式為明確 namespace 對照、狹窄 path allowlist、分層 gates 與獨立內容審查。若新增工具不穩定，保留失敗與回復方案，不關閉檢查讓結果變綠。

## Resume context

本輪開發基礎已完成本機驗證，受測實作為 `8dd49b0420b58ec2627680b525aef05df40a6d4a`。獨立 review 的阻擋項已修復，乾淨 checkout 安裝與 `npm run check` 通過；詳見 matrix。後續變更新開 change，不追加此已完成範圍。GitHub CI 尚未執行，G2～G5 保留 needs-data／future；缺私人素材不授權取得新素材。
