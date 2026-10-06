# 台北車站通

以固定地標輔助台北車站步行導引的 Web 原型。這個 repository 是**程式碼版本**，包含相機與人工導引程式、資料契約及不依賴私人素材的單元測試；不包含路線資料、照片、地圖、錄影或歷史驗收證據。

目前程式以 Y28 → Y26 → Y23 三個固定牆標為範圍，保留全幅相機、影像地標疊標、底部小路線圖與可展開的地圖介面。尚未通過 iPhone、車站現場或陌生使用者導航驗證，不是可直接用於實際導航的產品。

## 本機啟動

使用 `.node-version` 的 Node.js 24（建議最新修補版）及 npm 10 或 11，在 repository 目錄執行：

```sh
npm ci --ignore-scripts
npm run check
npm run start:camera
```

開啟 [相機入口](http://127.0.0.1:4206/camera)；同一 server 的 [人工入口](http://127.0.0.1:4206/) 也保留。這些入口頁可載入，但缺少私人素材時，地標照片、導航、辨識與重播不可使用；人工入口也可能顯示路線載入失敗。`npm ci` 只安裝套件，不會取得這些素材。

相機 server 固定使用 loopback。本說明只使用本機預覽，不提供 LAN 開放或部署流程；啟動 server 不代表已部署網站。以 `Ctrl-C` 停止。

## 素材與檢查

獲授權的開發者依 [本機素材說明](docs/LOCAL_ASSETS.md) 另備路線 JSON 與 reference pack，再執行 `npm run prepare:camera`。素材不由本 repository 散布，也不應加入 Git。

`npm run check` 執行 JavaScript 語法、合成單元／契約測試、文件索引與連結、schema 編譯及 repository hygiene。`npm test` 自動找出測試程式，不載入私人素材；測試不證明真實像素辨識品質、相機硬體或現場導航。可執行 `npm run setup:hooks` 啟用本機 Git hooks；掃描與 hooks 只能協助檢查，不能保證沒有敏感資料。

## 後續開發

本 repository 是正式共享開發來源；舊原型與首次匯出副本只作歷史參考，不再雙向維護現行規格。保留乾淨 Git 歷史，只移入審查過的內容；原始素材和私人驗證紀錄繼續分開保存。

從 [文件入口](docs/index.md) 找本次工作的領域規格與驗收條件。新增功能需連結需求、變更與驗證；小修正可用短說明。研究與商業假設先記錄來源及採用決策，再轉成正式需求。

[CI 設定](.github/workflows/checks.yml) 使用唯讀權限、完整歷史及固定 action commit，執行相同的 `npm run check`，不部署或上傳測試證據。加入設定檔不表示遠端 CI 已執行或分支保護已啟用；PR 應附實際結果。Action 版本依據：[checkout](https://github.com/actions/checkout/releases/tag/v7.0.1)、[setup-node](https://github.com/actions/setup-node/releases/tag/v7.0.0)。

文件入口見 [docs/index.md](docs/index.md)，目前產品行為見 [PRODUCT_SPEC](docs/PRODUCT_SPEC.md)，安全與資料回報原則見 [SECURITY](SECURITY.md)。
