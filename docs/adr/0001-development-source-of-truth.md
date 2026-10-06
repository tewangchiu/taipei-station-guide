# ADR 0001：單一共享開發來源

## 決定與理由

本 repository 維護可公開的程式碼、資料契約、現行規格、決策與 change。先前的本機原型保存為私人歷史，不再與這裡雙向維護第二份現行 spec；私人資料、測試影像、影片、機器位置與歷史結果不導入。

[PRODUCT_SPEC](../PRODUCT_SPEC.md) 是摘要；`openspec/specs/` 是正式行為；`openspec/changes/` 是單次變更；`docs/contracts/` 是資料形狀；[gates](../testing/gates.md) 定義證據與完成界線。AGENTS、README、Issue、PR 與研究筆記只能導流或提供脈絡，不能另定相矛盾的規則。

文件狀態、負責角色、更新日與 scope 只在 [registry](../spec-index.json) 維護；正文不另放一套 metadata。需求的唯一 ID、正式 spec 與所需 checks 也在 registry。checks 的 pending／needs-data／future 表示驗證安排，不是單次測試結果；結果記在對應 change matrix。舊 ID 只能依 [對照表](../product/requirements-legacy-map.md) 解讀，不自動去掉前導零合併。

## 工作原則

1. 先分辨研究事實、產品假設與已採用決策；新假設先進 [研究／決策流程](../research/README.md)，採用後才修改正式規格。
2. 局部變更可用一份有 owner、scope、AC 與檢查方式的輕量 change。跨領域、契約、資料風險或長時工作另有 plan，記依賴、取捨、驗證、回復方式與接續資訊。
3. 同一 change 對齊 requirement、contract、test 與 matrix。發現行為範圍改變，先更新 change 與受影響 spec；新需求另開 change，不偷偷加入已完成範圍。
4. 原始與私人資料不進 Git；缺料標 needs-data。不要偽造素材 metadata、來源、hash 或 readiness；也不能把公開的單元測試通過解讀成實景驗證。
5. 每次交付核對目前版本與證據。核心預設檢查使用 `npm run check`；高風險行為依 gates 另補，hooks 不是安全保證。
6. 收尾同步現行規格、registry、tracker、matrix 與決策；private evidence 可用不含個資的代號由授權者另外管理，不能在公開文件放機器路徑或私人附件。

## 參考採用範圍

| coding-workflow 來源 | 來源狀態 | 本專案採用 |
|---|---|---|
| Constitution、Daily Workflow、Bootstrap New Project | 已提交標準 | repo 內單一正式來源、domain／change／contract 分層、AC 映射、完成後合回主規格 |
| Planning Standard、Plan Template 的一般欄位 | 已提交標準 | 依工作大小選輕量 change 或 execution plan，保留 owner、scope、dependencies、verification、resume context |
| Completion Contract 增補 | 來源仍有未提交擴充 | 本次明確採用 final state、evidence、constraints、blocked condition；本 ADR 記錄本專案決定，不宣稱來源已提交 |
| GitHub 獨立 review pilot | 來源未追蹤的 pilot | 只採固定版本與獨立核對原則，不要求特定模型、CLI、付費工具或額外背景服務 |

## 影響與界線

現有共享 NAV-01～08 保留；必要細節分至四個領域。跨領域引用以 ID／連結取代重複條文。增加領域時，先有實際需求與 owner 再擴 registry，不為未定功能建立空模板。本次整理不改產品導航政策、不搬私人資料、不執行部署或商店發布。
