# 開發基礎整理驗收矩陣

本次 change 見 [proposal](../../../openspec/changes/chg-2026-10-development-foundation/proposal.md)，接續工作見 [plan](../../../openspec/changes/chg-2026-10-development-foundation/plan.md)。以下是本輪待執行檢查，不沿用舊私人驗收結果。產品的 browser／device／field 缺口依 [gates](../gates.md) 保留。

| AC | 完成條件 | Check／證據計畫 | Tier | Result |
|---|---|---|---|---|
| DF-01 | 本 repo 為唯一共享正式來源；摘要不重複 domain 條文，NAV-01～08 保留且 legacy 對照不錯配 | 獨立讀 ADR、四領域、摘要與對照表；docs checker | static | pending |
| DF-02 | registry 的文件、需求、change 與檢查路徑有效，無未登錄正式需求或重複 ID | `npm run check:docs`；[checker tests](../../../tests/documentation_check.test.mjs) | static / unit | pending |
| DF-03 | route schema 正反例及 runtime 有效／非法路線拒絕邊界被覆蓋，沒有把 test validator 宣稱成 runtime 全量驗證 | [route contract tests](../../../tests/camera_route_contract.test.mjs)；現行 schema 編譯 | contract / unit | pending |
| DF-04 | 小圖／大圖由相同 session 只讀投影，人工來源、unknown、時間不造成新事件 | [route map tests](../../../tests/camera_route_map.test.mjs)；既有 session／policy tests | unit | pending |
| DF-05 | 文件／程式 path allowlist 精準，私人與二進位資料仍拒絕；偵測程式有正反案例 | [hygiene tests](../../../tests/repository_hygiene.test.mjs)；`npm run check:repository`；staged diff review | unit / static | pending |
| DF-06 | Node 24 的單一檢查入口發現程式測試並執行語法、unit、docs、hygiene；不能靜默略過必要檢查 | `npm run check` 本機輸出；CI 設定及 runner 獨立審查；CI 實跑若尚無則明列未跑 | static / unit | pending |
| DF-07 | PR／Issue／runbook 能連 research→decision→requirement→change→AC；缺素材與產品 gates 不被改成完成 | 實際以本 change 做文件巡覽；回讀 [runbook](../../runbooks/development.md)、[decisions](../../product/decisions.md) 與 [tracker](../../roadmap/change-tracker.md) | static | pending |

## 本輪執行記錄

統籌在檢查後填入受測版本、命令、結果與限制。本檔建立時尚無本輪驗證結論；目前所有 AC 為 pending。registry 中 pending checks 是待驗證安排，不維護第二份即時測試結果。

## 產品驗證保留項

相機／重播 pixels、真實瀏覽器整合、iPhone、獨立資料及場站沒有在本輪由文件或單元測試補成通過。未提供素材或未執行的產品 check 仍是 needs-data／future；需要新的產品驗證 change 才能更新。
