# 開發文件入口

本 repository 是程式碼、現行規格與開發決策的唯一正式來源。私人素材及歷史驗收不隨 repository 散布。文件的類型、負責角色、更新日與狀態集中在 [spec-index.json](spec-index.json)，不在各頁重複維護。

| 要做什麼 | 先讀 |
|---|---|
| 理解產品範圍 | [產品摘要](PRODUCT_SPEC.md) |
| 修改導航／辨識／地圖／隱私 | [領域規格索引](PRODUCT_SPEC.md#正式行為) |
| 確认正式來源與工作規則 | [ADR：開發基礎](adr/0001-development-source-of-truth.md) |
| 查產品假設與決策 | [決策紀錄](product/decisions.md)、[研究入口與模板](research/README.md) |
| 查當前工作與執行拆解 | [change tracker](roadmap/change-tracker.md) |
| 定義完成與驗證範圍 | [測試與驗收門檻](testing/gates.md)、[本次矩陣](testing/matrices/chg-2026-10-development-foundation.md) |
| 本機開發與交接 | [開發 runbook](runbooks/development.md)、[素材準備](LOCAL_ASSETS.md) |
| 讀取資料契約／舊編號 | [contracts](contracts/)、[legacy ID 對照](product/requirements-legacy-map.md) |

研究、需求採用、實作完成、單元測試、私人素材驗證、實機／現場及發布是不同狀態。不要從文件存在或 CI 通過推定下一層也已通過。
