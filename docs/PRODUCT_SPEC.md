# 台北車站通產品摘要

產品協助不熟悉車站的旅客，以地圖與固定地標理解下一步。現有 Web 原型限定 B1 的 Y28 → Y26 → Y23 同方向路線；終點是固定牆標，不代表地面出口或站外目的地。

相機畫面、地標疊標、小路線圖、展開地圖、人工備援與完成畫面已有程式碼。必要路線與影像資產另行授權；乾淨 checkout 可開入口，但不能因安裝套件就取得可用導航資料。準備方式見 [LOCAL_ASSETS](LOCAL_ASSETS.md)。

## 正式行為

本頁只作摘要；具體要求只在下列領域規格維護。既有共享 NAV-01～08 保留原意與編號。

| 領域 | 正式來源 | 需求 |
|---|---|---|
| 導航、復原、完成 | [navigation](../openspec/specs/navigation/spec.md) | NAV-01、NAV-02、NAV-03、NAV-08 |
| 相機像素、時序、疊標、重播 | [visual-localization](../openspec/specs/visual-localization/spec.md) | NAV-04、NAV-07、VL-01、VL-02 |
| 小圖、展開圖、路線包 | [route-data](../openspec/specs/route-data/spec.md) | NAV-05、NAV-06、ROUTE-01 |
| 同意、資源、資料最小化、匯出 | [privacy](../openspec/specs/privacy/spec.md) | PRIV-01～04 |

## 下一階段

獨立資料、裝置、現場與陌生使用者驗證尚未完成；連續定位、多樓層、任意目的地、無障礙通行安全、原生 App 與商店發布不屬本次開發基礎交付。

平台、商業模式及擴線先進 [決策紀錄](product/decisions.md)，採用後建立 change。完成條件依 [gates](testing/gates.md)，當前工作依 [tracker](roadmap/change-tracker.md)。本摘要不導入私人歷史結果，也不宣稱目前產品通過現場驗收。
