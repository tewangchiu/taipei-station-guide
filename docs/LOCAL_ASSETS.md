# 本機素材準備

本 repository 不提供路線 JSON、照片、官方地圖、reference pack、錄影、sensor records、browser QA 素材或歷史報告。`npm ci` 不會下載這些資料；缺少資料時無法完成相機辨識、照片重播或人工導航。

## 僅供已獲授權的開發者

1. 透過獲授權的管道另取路線 JSON 與私人 reference pack，先確認使用範圍、去識別審查及來源。不在 Issue／PR 交換素材。
2. 將相機及人工路線 JSON 放入本機 `data/camera/`、`data/mvp/`。預期目標位置由 [camera server](../scripts/serve_camera_guidance.mjs) 與 [manual server](../scripts/serve_manual_visual.mjs) 的路由對應定義；不要從原始素材檔名猜對應。
3. 檢查路線符合 [camera route schema](contracts/route-package.schema.json) 或 [manual route schema](../data/mvp/manual_visual_route.schema.json)，並與同一個核准 pack 的來源、ROI、內容校驗資訊一致。取得不了必要資料時停止準備，不自行補假值。
4. 執行素材準備指令，將參數代入獲授權 pack 的本機位置：

   ```sh
   npm run prepare:camera -- --source "<approved-reference-pack>"
   ```

5. 再啟動 `npm run start:camera`。缺少或不相容的資產應保留錯誤提示；不要為了通過載入而放寬驗證。

[prepare script](../scripts/prepare_camera_prototype.mjs) 只支援程式預期的既有核准 pack 格式，並非任意照片匯入器。它檢查 manifest 與內容後，把必要衍生 reference 放入 `artifacts/`；它不產生路線 JSON、不取得私人 pack、不準備官方圖，也不替資料授權。

準備時可能下載固定版本 OpenCV；已備妥相符檔案時可用 `--opencv` 指定。這是第三方程式依賴，與上傳相機影像不同。官方圖若另有授權，依 server 路由在本機備妥；不具散布權利時不要加入 repository。

## 不可更動的界線

- 保留原始素材，衍生資料另存；不偽造 schema、manifest、來源、ROI、校驗值或審查狀態。
- 不升級 `navigationReady`、`physicalArrivalVerified`、`navigation_ready`、`station_ground_truth_passed` 等旗標。prototype 的載入成功不代表現場通過。
- 私人路線 JSON、pack、照片、地圖、診斷與衍生輸出只留在本機忽略路徑，不加入 Git。schema 檔案是程式契約，可以追蹤。
- 準備後執行 `npm run check:repository`，並檢查 Git 狀態與 staged diff。需要時用 `git check-ignore` 確認實際素材路徑；不要強制加入忽略檔案。
- hooks 與忽略規則只是輔助，不保證防止洩漏，也不會自動移除已被 Git 追蹤的資料。
