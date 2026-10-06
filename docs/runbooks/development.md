# 本機開發與交接

先讀 [文件入口](../index.md)、相關 domain 與 [registry](../spec-index.json)。使用 Node 24；版本以 repository 的 Node 設定檔為準。

## 開始與檢查

```sh
npm ci --ignore-scripts
npm run check
```

`npm run check` 是語法、程式測試、docs 與 repository hygiene 的單一入口。`npm test` 發現受允許的程式單元測試；不讀私人 fixtures，拒絕不允許的測試路徑／符號連結。需要單獨定位失敗時使用 `npm run check:docs` 或 `npm run check:repository`。不要因缺私人資料而偷偷略過 required 檢查。

`npm run setup:hooks` 可設定本機 hooks；仍需人工檢查 staged diff。套件安裝不會取得私人 route JSON、照片或官方圖；素材準備與允許位置只看 [LOCAL_ASSETS](../LOCAL_ASSETS.md)。

## 預覽

```sh
npm run start:camera
```

打開本機相機入口，人工入口在同一 server 的根路徑。以 server 輸出的 loopback URL 為準；這不是部署。缺素材時入口可載入，導航／辨識／重播與照片不可用，回報 needs-data，不偽造 metadata 或放寬驗證。以 `Ctrl-C` 停止。

## 一次變更

1. 檢查 Git 狀態與分支，保留其他工作。判斷是研究、決策還是已採用需求。
2. 以唯一 change ID 記 owner、scope／non-goals、AC、相關 requirements／contracts／checks。小改可集中一檔；跨領域、長時或風險較高者另建 plan。
3. 本次基礎整理的 [proposal](../../openspec/changes/chg-2026-10-development-foundation/proposal.md) 與 [plan](../../openspec/changes/chg-2026-10-development-foundation/plan.md) 可作有內容的範例，不必複製所有章節。
4. 實作或規格有變時同步契約、受影響測試及 registry；一項需求只在一份 domain spec 定義。新增 docs／script 時一起檢查 path allowlist，不能直接關閉 hygiene。
5. 執行相應檢查，記受測版本與缺口到 matrix。Issue／PR 連 change、requirement、contract、matrix；review 對目前 diff 與版本，不只看作者摘要。
6. 通過本 change 的 required gates 後同步主規格、registry、tracker 與決策。產品新需求另立 change，私人證據不進 PR。

## 接續與停止條件

交接至少留下目前分支／版本、已完成項目、下一個未完成 task、檢查結果及缺資料原因；不要留下私人機器路徑。若 required AC 被阻擋，維持 in-progress／blocked 並記可解除條件。外部上傳、部署、資料分享及發布仍需要對應授權。
