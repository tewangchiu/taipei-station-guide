# 產品與技術決策

以下是決策狀態，不是驗證結果。accepted 表示採用方向；proposed／pending 不能直接變成實作要求。驗證狀態另見 [gates](../testing/gates.md) 與各 change matrix。新研究使用 [研究模板](../research/README.md)。

| ID | 決策／待決問題 | 狀態 | 依據與取捨 | 影響／下一步 | 負責角色 |
|---|---|---|---|---|---|
| DEC-01 | 本 repository 為唯一共享開發來源 | accepted | 本次已授權的開發基礎整理；避免共享程式與私人主規格分叉 | [ADR 0001](../adr/0001-development-source-of-truth.md)、[foundation change](../../openspec/changes/chg-2026-10-development-foundation/proposal.md) | maintainer |
| DEC-02 | 保留相機節點、影像疊標與小圖的既有範圍 | accepted | 現有共享行為；本次只整理與補驗程式契約，不擴成全站或連續定位 | [四領域規格](../PRODUCT_SPEC.md#正式行為) | product-owner |
| DEC-03 | 私人資產與實測不隨程式碼散布 | accepted | 素材授權與資料最小化要求；乾淨 checkout 不保證完整 demo 可用 | [LOCAL_ASSETS](../LOCAL_ASSETS.md)、PRIV-03／04、ROUTE-01 | data-owner |
| DEC-04 | 正式 App 平台與最低裝置 | proposed | iOS 可作先行方向，尚未定案；Web 程式碼不等於原生能力 | 決策前比較可測裝置、camera adapter、效能與維護成本；再建立 native change | product-owner |
| DEC-05 | 商業模式、付費者與營運責任 | pending | 尚無本 repository 可採用的需求驗證；不預設訂閱、廣告、B2B 或會員 | 先研究使用者／付費者與維護負擔，記錄來源與反例；不先加付款功能 | product-owner |
| DEC-06 | 擴線、資料維護與現場接受區域 | pending | 三節點原型不能外推全站；看得到牆標不等於物理抵達 | 擴線前定義路線 owner、複查／失效流程、獨立資料與現場標註，依 G3／G4 | data-owner |
| DEC-07 | BLE 或其他定位來源是否採用 | pending | 目前程式不依賴 BLE；未據此推論全站設備現況 | 如需硬體定位，先查證可用性及權利，再提出獨立方案 | engineering |
| DEC-08 | 生產發布與外部服務 | pending | 本機原型與程式碼共享不等於部署、資料外傳或商店發布授權 | 最終資料流、內容權利、操作責任及 G5 通過後另處理 | maintainer |

每筆採用或否決時補來源、理由、受影響 requirement／change；有後繼決策則標 superseded 並連新 ID。不要覆寫舊理由，也不要把事後結果回填成早已採用。架構取捨較大時另寫 ADR；一般產品決策維持本表即可。
