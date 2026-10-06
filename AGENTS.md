# 專案協作規則

- 先讀 [README](README.md)、[產品規格](docs/PRODUCT_SPEC.md) 與 [本機素材說明](docs/LOCAL_ASSETS.md)。本 repository 是程式碼版本，不含私人資料或歷史驗收證據。
- 修改前檢查 Git 狀態，保留其他工作；只提交本次相關檔案。外部上傳、部署與發布需有對應授權。
- 不取得、搬移、改名、覆寫、轉碼或上傳私人原始素材。獲授權使用的路線 JSON、reference pack、照片、地圖、診斷及衍生輸出留在本機忽略路徑，不進 Git。
- 不將本機絕對路徑、個人識別、憑證、原始素材檔名或私人測試證據加入程式碼、文件、Issue 或 PR。
- 缺素材應保留載入失敗及復原行為；不得用假 metadata、修改 schema、偽造 hash 或升級 readiness 旗標讓流程通過。
- 視覺候選、時序接受、人工確認與實際位置證據必須分開。時間、地圖操作或預期下一站不得直接產生抵達；影像疊標不是世界座標 AR。
- 保留 loopback 預覽方式。不要因公開程式碼而擴大 server 存取範圍。
- 變更行為時同步產品規格與必要契約，執行相關檢查。`npm test` 僅涵蓋不依賴私人素材的單元測試；不得據此宣稱真機、辨識品質或現場通過。
- 提交前執行 `npm run check:repository` 並人工檢閱 staged diff。`npm run setup:hooks` 可安裝本機 hooks，但忽略規則、掃描與 hooks 都不是安全保證。
