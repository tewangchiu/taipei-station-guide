# 需求 ID 對照與適用範圍

共享版原有 NAV-01～08 是本 repository 保留的 ID。早期私人原型使用的 NAV-1、VL-1 等屬另一 namespace；前導零不是可忽略的格式。引用舊資料時必須先標來源，不能把 NAV-4 當成 NAV-04。

本表只做語意對照，不導入舊文件、私人素材、日期化結果或驗收結論。正式條文及檢查安排一律查 [registry](../spec-index.json)。

## 共享摘要 ID 的精確移轉

| 原 ID | 原意 | 新正式來源 |
|---|---|---|
| NAV-01 | 相機控制、模式與人工入口 | [navigation](../../openspec/specs/navigation/spec.md) 的 NAV-01 |
| NAV-02 | 影像接受後的有序進度 | [navigation](../../openspec/specs/navigation/spec.md) 的 NAV-02 |
| NAV-03 | 不確定、舊結果與復原 | [navigation](../../openspec/specs/navigation/spec.md) 的 NAV-03 |
| NAV-04 | 相機底層與影像位置疊標 | [visual-localization](../../openspec/specs/visual-localization/spec.md) 的 NAV-04 |
| NAV-05 | 底部指引、歷史參考、小路線圖 | [route-data](../../openspec/specs/route-data/spec.md) 的 NAV-05 |
| NAV-06 | 展開地圖、操作與失效恢復 | [route-data](../../openspec/specs/route-data/spec.md) 的 NAV-06 |
| NAV-07 | 明示照片重播、同管線及證據界線 | [visual-localization](../../openspec/specs/visual-localization/spec.md) 的 NAV-07 |
| NAV-08 | 視覺／人工完成與新 session | [navigation](../../openspec/specs/navigation/spec.md) 的 NAV-08 |

## 私人原型 domain ID 的有限對照

以下全部以 `prototype:<domain>:<id>` 解讀，不是目前 registry 的 alias。多對多表示責任拆分；標 future 的項目不能當本輪已實作需求。

| 舊 domain／ID | 現在讀哪裡 | 差異與限制 |
|---|---|---|
| navigation / NAV-1 | NAV-01、NAV-07、PRIV-01 | 入口、模式與權限分責 |
| navigation / NAV-2 | NAV-02 | 保留有序自動進度；不沿用舊測試結果 |
| navigation / NAV-3 | NAV-03 | 保留未知／錯序與上次進度 |
| navigation / NAV-4 | NAV-05 | 地圖及歷史時間；不是目前 NAV-04 的疊標 |
| navigation / NAV-5 | NAV-01、NAV-03、PRIV-02 | 使用者操作、candidate 清除與資源釋放分責 |
| navigation / NAV-6 | NAV-08 | 固定牆標完成，不是地面出口 |
| navigation / NAV-7 | NAV-01、NAV-06、G2 | 可操作性依新旅程驗收；舊「不放大」限制已由既有小圖功能取代；不搬尺寸測試結果 |
| navigation / NAV-8 | NAV-04、NAV-05 | 全幅實景與底部導引分責 |
| navigation / NAV-9 | NAV-01、NAV-06 | 協助維持次層；路線另有常駐小圖入口，不沿用全部地圖只在次層的限制 |
| navigation / NAV-10 | NAV-05、NAV-06 | 小圖與可展開平面圖 |
| visual-localization / VL-1 | VL-02、NAV-07、PRIV-01 | live freshness、replay simulation 與明確啟用分責 |
| visual-localization / VL-2 | VL-01 | pixels、牆標及 context；未校準分數不當正確率 |
| visual-localization / VL-3 | VL-01、NAV-02、PRIV-04 | observation／decision／event 與診斷來源分責，欄位仍以 schema 為準 |
| visual-localization / VL-4 | VL-02、NAV-07 | live 時序不與照片重播的 simulation 混用 |
| visual-localization / VL-5 | NAV-02 | 順序接受屬 navigation |
| visual-localization / VL-6 | NAV-03、PRIV-02 | session 失效與 camera 資源分責 |
| visual-localization / VL-7 | G2、G3、registry checks | 可重現驗證計畫；舊資料與結果不導入 |
| visual-localization / VL-8 | NAV-04 | 真實影像投影，不是預設位置 |
| visual-localization / VL-9 | NAV-04、NAV-03 | 標籤失效與拒絕不直接推進導航 |
| route-data / ROUTE-1 | ROUTE-01 | 路線版本、來源、readiness 與形狀契約 |
| route-data / ROUTE-2 | ROUTE-01、VL-01 | 參考完整性與像素候選分責 |
| route-data / ROUTE-3 | NAV-05、NAV-06 | 舊禁止放大條款已被現有共享小圖／大圖行為取代 |
| route-data / ROUTE-4 | NAV-05 | 只保留歷史參考／非即時 ETA 的限制；不導入私人量測或來源資料 |
| route-data / ROUTE-5 | DEC-06、G3～G5 | future：正式擴線與維護責任，未變成已交付功能 |
| privacy / PRIV-01 | PRIV-01 | 明確啟用與必要權限 |
| privacy / PRIV-02 | PRIV-02、G3 | 釋放資源與舊結果失效；裝置相關時限另需量測，不承接舊通過聲稱 |
| privacy / PRIV-03 | PRIV-03 | 裝置內與記憶體限制 |
| privacy / PRIV-04 | PRIV-04 | 最小診斷與主動本機匯出 |
| privacy / PRIV-05 | NAV-07、NAV-03、PRIV-04 | replay／manual／vision 來源分責 |
| privacy / PRIV-06 | LOCAL_ASSETS、ADR 0001、G1 | 原始資料、靜態資產與 repository 衛生屬操作規則；不是授權資料散布 |
| privacy / PRIV-07 | DEC-08、G5 | future：最終發布與資料申報，沒有帶入舊官方規則查核結果 |

本表不重編私人 PRD 的 FR／NFR 或舊 AC；它們維持歷史 namespace。若未來要採用其中一項，先逐條比較、建立決策與目前需求映射，不能從相近名稱推定等價。

決策 ID 見 [decisions](decisions.md)，G0～G5 見 [gates](../testing/gates.md)，操作界線見 [LOCAL_ASSETS](../LOCAL_ASSETS.md) 及 [ADR](../adr/0001-development-source-of-truth.md)。
