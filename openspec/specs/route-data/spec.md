# 路線、地圖與資產

目前只描述既有三節點路線。素材準備見 [LOCAL_ASSETS](../../../docs/LOCAL_ASSETS.md)，資料格式見 [route contract](../../../docs/contracts/route-package.schema.json)。擴線、更新維護責任與正式發布條件見 [decisions](../../../docs/product/decisions.md) 及 [gates](../../../docs/testing/gates.md)。

## Requirements

### Requirement: NAV-05 小圖與歷史參考

相機底部 SHALL 呈現當下指引、簡短歷史步行參考與常駐小路線圖。小圖是 session 的只讀投影，標示上次更新的地標、下一目標與路段進度，區分人工與視覺來源；不按時間移動，也不是精確比例或即時 ETA。單次 unknown 不改已接受節點；暫停／錯誤不顯示持續倒數到達。

#### Scenario: 等待期間查看小圖

- **GIVEN** 上次有效進度停在中途節點。
- **WHEN** 使用者等待或查看小圖。
- **THEN** 節點不移動、事件不增加，時間僅作歷史參考。

### Requirement: NAV-06 展開地圖與失效恢復

使用者 SHALL 可點小圖展開本段路線，切換另備的官方平面圖、縮放、捲動、重設並返回。小圖與大圖讀同一 session；圖面操作不能寫入導航事件。官方圖只供區域參考，不疊使用者或牆標精準位置；版本年份與原看板「現在位置」不代表目前實景或使用者位置。缺圖時可重試或返回，不能卡住導引。

#### Scenario: 官方圖載入失敗

- **GIVEN** 路線正在導引且使用者展開平面圖。
- **WHEN** 圖資不可用。
- **THEN** 可重試或回本段路線，來源與已接受進度不改變。

### Requirement: ROUTE-01 路線包與參考完整性

路線資料 SHALL 有版本、順序、樓層、指引、來源與 readiness；參考影像及 ROI 必須來自一致且獲授權的資料包。缺檔、不相容、來源不明或內容校驗失敗時停用自動模式並可退出，不猜另一張照片代替。不能因格式合法、安裝套件或 prepare 成功而升級 navigation／physical-arrival／Ground Truth 旗標。

目前 runtime 有特定前置檢查；完整 JSON Schema 正反例測試是另一驗證層，不宣稱 runtime 已逐欄執行完整 schema 驗證。任何新增資料或相容性策略另開 change，不搬入私人歷史資料。

#### Scenario: 參考與路線不一致

- **GIVEN** 路線引用的參考不可用或校驗不符。
- **WHEN** 初始化辨識。
- **THEN** 拒絕自動模式，不修改來源、hash 或 readiness 來繼續。
