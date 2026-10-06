# 開發檢查與產品驗收門檻

本文件定義需要的證據，不宣稱已通過。registry 的 checks 列出驗證安排；單次執行結果、受測版本與限制記到 change matrix。私人素材、舊報告與歷史測試結果不導入本 repository。

## 證據分層

| Tier | 能證明什麼 | 不能替代什麼 |
|---|---|---|
| static | 語法、索引／連結、受控讀碼、檔案衛生 | runtime 旅程與辨識正確性 |
| unit | 純程式狀態、幾何、時序、錯誤邊界 | 真實相機、實際 pixels 泛化與實走 |
| contract | schema 可編譯、明列 payload 正反例 | 未測 schema 的 instance 覆蓋、runtime 自動套用完整驗證 |
| browser | 受控 UI／camera API／lifecycle／網路行為 | 真實硬體、現場條件；合成輸入需明示 |
| device | 指定真機上的 permission、效能、耗電、生命週期 | 車站位置正確性或陌生使用者成功 |
| field | 獨立行程、Ground Truth、實際使用者任務 | 未涵蓋路線、裝置與發布權利 |

private pixel 實驗另在受控環境執行，標明資料來源、同來源重播或獨立資料；結果不得因單元測試或照片示範成功而升級。缺資料記 needs-data，未執行記 pending，不改門檻或造資料來填 pass。

## Gates

| Gate | 完成條件 | 本次適用範圍 |
|---|---|---|
| G0 規格對齊 | 單一 change、owner、scope／non-goals、AC、需求／契約／驗證映射；無矛盾主規格 | required |
| G1 程式碼與文件整合 | `npm run check`、受影響契約正反例、獨立 diff／風險審查；result 記實際版本，沒有未處理阻擋項 | required |
| G2 受控產品旅程 | 有授權資產，驗 camera／replay／manual、來源、權限／失效／恢復／完成、地圖與privacy；輸入種類明示 | needs-data，這次文件／工具整理不冒稱已完成 |
| G3 真機與獨立資料 | 凍結資料切分／門檻／裝置，涵蓋負例與不同拍攝；量測 lifecycle、性能、耗電、影像失效 | needs-data |
| G4 現場與使用者 | 預定樣本與接受區域、Ground Truth、錯誤分類、分母、不確定性與陌生使用者任務；原型作者走通不能替代 | needs-data |
| G5 發布與維護 | 最終 build、適用產品 gates、資料／地圖／模型權利、隱私／支援、路線 owner、停用／回復及發布授權 | future，另開 change |

本輪只在 G0／G1 及本次矩陣的完成契約滿足後收斂為 local-validated；不升級產品 readiness。未來產品 change 自己列 required gates；若 required AC 未完成，保留 in-progress／blocked，不移到 future 掩蓋缺口。

## Schema 與結果規則

文件 checker 使用標準 schema 編譯檢查現有契約；路線 contract test 的正反 payload 只覆蓋該檔明列的案例。不能宣稱全部 schema 已有完整 instance cases，也不能宣稱 runtime 載入已採完整 schema validator。

matrix 至少記 AC、所需 check、tier、實測結果、證據及限制。可公開的執行記錄不含私人資料或機器路徑；必要私人 evidence 由授權者在外部管理，公開文件最多列無敏感含義的代號與未通過 gate。

change 結束後更新主規格與 registry；UAT 新需求另開 change。產品驗收、程式碼合併與外部發布各自判斷，不用一個 Done 包含全部。
