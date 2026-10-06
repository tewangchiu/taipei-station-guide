# 隱私與相機資料生命週期

本規格定義原型的資料限制，不等同法規或商店審核已通過。資料形狀見 [diagnostic contract](../../../docs/contracts/camera-diagnostic.schema.json)，安全回報見 [SECURITY](../../../SECURITY.md)。

## Requirements

### Requirement: PRIV-01 主動且必要的權限

App SHALL 只在使用者明確啟動相機後請求 video，不要求不需要的 audio、定位或其他個人資料權限。照片重播不應以同意相機為前提；拒絕權限時仍有退出及適用的復原入口。

#### Scenario: 尚未啟用

- **GIVEN** 使用者只打開入口或重播。
- **WHEN** 尚未選擇相機模式。
- **THEN** 不請求相機或麥克風權限。

### Requirement: PRIV-02 停止與舊結果失效

暫停、停止、結束、完成、離頁、背景或來源切換時 SHALL 停止不需要的分析與 tracks，取消或忽略未完成工作；恢復需新有效觀察。晚到的授權結果不得重新打開已停止的 session。操作狀態可被使用者理解。

#### Scenario: 授權晚於停止

- **GIVEN** 相機請求尚未完成。
- **WHEN** 使用者先停止，再收到串流。
- **THEN** 釋放該串流，不附加到新 session 或重新開始辨識。

### Requirement: PRIV-03 裝置內處理與影格最小化

camera pixels、ROI 與動態特徵 SHALL 留在執行期記憶體，不預設錄影、保存或上傳；錯誤、重試也適用。套件／模型下載與本機靜態資產載入，不代表同意 camera 外傳。若未來需要雲端能力，先建立資料用途、同意、保存與刪除的獨立 change。

#### Scenario: 推論失敗

- **GIVEN** 辨識器無法處理某影格。
- **WHEN** 回報錯誤或重試。
- **THEN** 不把原始 pixels、base64 或完整 OCR 文字寫入持久儲存或外送作 fallback。

### Requirement: PRIV-04 主動本機診斷匯出

診斷 SHALL 只含必要摘要並符合契約，保留輸入／事件來源，不預設包含影像、音訊、裝置識別或精確個人移動軌跡。匯出由使用者明確操作，本機下載不等於同意公開或上傳。未知欄位不直接透傳，分享前需去識別檢查。

#### Scenario: 取消分享

- **GIVEN** 使用者查看診斷內容。
- **WHEN** 關閉而沒有選擇下載。
- **THEN** 不建立背景下載或網路傳送。
