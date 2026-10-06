# 開發基礎整理驗收矩陣

本次 change 見 [proposal](../../../openspec/changes/chg-2026-10-development-foundation/proposal.md)，接續工作見 [plan](../../../openspec/changes/chg-2026-10-development-foundation/plan.md)。以下是本輪本機驗收結果，不沿用舊私人驗收結果。產品的 browser／device／field 缺口依 [gates](../gates.md) 保留。

| AC | 完成條件 | Check／證據計畫 | Tier | Result |
|---|---|---|---|---|
| DF-01 | 本 repo 為唯一共享正式來源；摘要不重複 domain 條文，NAV-01～08 保留且 legacy 對照不錯配 | 獨立讀 ADR、四領域、摘要與對照表；docs checker | static | pass（本機） |
| DF-02 | registry 的文件、需求、change 與檢查路徑有效，無未登錄正式需求或重複 ID | `npm run check:docs`；[checker tests](../../../tests/documentation_check.test.mjs) | static / unit | pass（本機） |
| DF-03 | route schema 正反例及 runtime 有效／非法路線拒絕邊界被覆蓋，沒有把 test validator 宣稱成 runtime 全量驗證 | [route contract tests](../../../tests/camera_route_contract.test.mjs)；現行 schema 編譯 | contract / unit | pass（本機） |
| DF-04 | 小圖／大圖由相同 session 只讀投影，人工來源、unknown、時間不造成新事件 | [route map tests](../../../tests/camera_route_map.test.mjs)；既有 session／policy tests | unit | pass（本機） |
| DF-05 | 文件／程式 path allowlist 精準，私人與二進位資料仍拒絕；偵測程式有正反案例 | [hygiene tests](../../../tests/repository_hygiene.test.mjs)；`npm run check:repository`；staged diff review | unit / static | pass（本機） |
| DF-06 | Node 24 的單一檢查入口發現程式測試並執行語法、unit、docs、hygiene；不能靜默略過必要檢查 | `npm run check` 本機輸出；CI 設定及 runner 獨立審查；CI 實跑若尚無則明列未跑 | static / unit | pass（本機） |
| DF-07 | PR／Issue／runbook 能連 research→decision→requirement→change→AC；缺素材與產品 gates 不被改成完成 | 實際以本 change 做文件巡覽；回讀 [runbook](../../runbooks/development.md)、[decisions](../../product/decisions.md) 與 [tracker](../../roadmap/change-tracker.md) | static | pass（本機） |

## 本輪執行記錄

日期：2026-10-06。受測實作與獨立審查版本：`8dd49b0420b58ec2627680b525aef05df40a6d4a`，相對基線 `848251e`。本次結案只更新狀態與驗收文字，不修改受測程式。registry 中 pending checks 是每次變更需要重驗的安排；單次結果以本矩陣為準。

| 驗證 | 實際結果與限制 |
|---|---|
| 環境 | Node.js 24.19.0、npm 10.2.4；本機執行，不是 GitHub runner |
| 完整檢查 | `npm run check` 通過；41 個模組語法、13 個測試檔，102 tests pass、0 fail、0 skip |
| 文件與契約 | 33 份文件、15 項需求、107 個本機相對連結、11 份 schema 編譯通過；route instance 正反例由 Ajv 執行，其他 schema 不宣稱相同覆蓋 |
| 乾淨 checkout | 從固定版本完整 clone；`npm ci --ignore-scripts --offline --no-audit --no-fund` 以既有套件快取安裝成功，再執行 `npm run check` 通過；未加入私人資產 |
| 衛生檢查 | 84 個 tracked 檔、2 個可達提交，working tree／index／完整歷史掃描通過；沒有 ignored untracked 私人檔被讀取 |
| 防護回歸 | 29 項 hygiene tests；含未暫存內容、已刪歷史內容、符號連結、replace／graft 與假 noreply 網域；敏感負例只在暫存 repo 產生 |
| 獨立審查 | 固定版本無未解阻擋項；測試入口忽略規則、缺 spec、目錄連結及歷史／metadata 漏掃均已修復並有回歸案例 |
| 產品範圍 | 與基線相比 `src/`、`data/`、`docs/contracts/` 零變更；本次不新增導航能力 |
| CI 設定 | YAML 解析及 trigger、唯讀權限、完整歷史、固定 action commit、無部署／附件上傳均已回讀；GitHub hosted CI 未執行，本次未修改或驗證遠端分支保護 |

完整輸出僅保留在受控本機；本表只保存不含私人素材與機器位置的摘要。契約、文件及靜態檢查通過不保證沒有所有漏洞，也不取代實機或現場驗證。

## 產品驗證保留項

相機／重播 pixels、真實瀏覽器整合、iPhone、獨立資料及場站沒有在本輪由文件或單元測試補成通過。未提供素材或未執行的產品 check 仍是 needs-data／future；需要新的產品驗證 change 才能更新。
