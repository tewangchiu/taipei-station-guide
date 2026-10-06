# 開發基礎整理

此 change 的狀態、owner 與 scope 以 [registry](../../../docs/spec-index.json) 為準；詳細拆解見 [plan](plan.md)，驗收見 [matrix](../../../docs/testing/matrices/chg-2026-10-development-foundation.md)。

## 問題與交付

共享程式碼需要可繼續維護的規格與驗證流程。單頁摘要無法承接跨領域需求，私人歷史主規格又不能作為新開發者唯一上下文；需求與測試之間也缺少可檢查的連結。

本輪建立四個領域的正式規格、唯一 registry、決策與研究入口、AC matrix／gates、操作 runbook，以及純程式可執行的 route／map／文件／衛生檢查。保留共享 NAV-01～08 的語意與編號，提供有 scope 的 legacy 對照；不重新導入私人歷史。

## Scope

- 共享 repo 為唯一正式來源；PRODUCT_SPEC 與工具入口只導流。
- navigation、visual-localization、route-data、privacy 的領域規格及資料契約索引。
- 研究→決策→規格→change→AC 的最小開發流程，依工作大小保留計畫。
- Node 24、單一 check 入口、程式測試發現、docs／schema 編譯與資料衛生檢查；新增精準測試與對應 CI 設定。
- route contract 正反例及小圖只讀進度的程式測試；結果不外推成完整 runtime schema 或實景驗證。

## Non-goals

不改相機辨識門檻或導航政策、不擴路線、不建立 native／付費／遠端服務、不新增私人資料／browser fixtures、不重新驗證舊私人歷史、不部署或發布產品。本次建立 CI 設定，不在未實跑時宣稱遠端 CI 通過。

## Completion contract

- **Final state**：只有一份現行正式規格；需求、檢查與 change 能透過 registry 找到；乾淨環境可執行所列無私人素材檢查，新增治理檔案仍受精準衛生限制。
- **Evidence**：DF-01～07 逐項實測或獨立回讀，記受測版本、命令與限制；只在 matrix 記結果，不回填舊私人數字。
- **Constraints**：保留 NAV-01～08、資料隔離、來源語意與現有產品邊界；不修改 readiness 或 schema 以掩蓋缺素材。
- **Blocked condition**：required check 失敗、索引與文件不一致、未處理安全問題或執行環境不可用時，記原因與解除條件，繼續可獨立完成的工作；不得把 required AC 改成 future 來結案。

## 接受與後續

本輪 G0／G1 通過可標 local-validated。產品 G2～G5、使用者體驗接受及發布各有獨立範圍，不由此 change 完成推定。追蹤入口見 [tracker](../../../docs/roadmap/change-tracker.md)。
