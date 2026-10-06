# 視覺辨識與影像疊標

本領域處理 pixels → candidate → observation → decision。導航進度見 [navigation](../navigation/spec.md)；本文件不把視覺接受等同實際距離或 Ground Truth。驗證層級見 [gates](../../../docs/testing/gates.md)。

## Requirements

### Requirement: VL-01 像素候選與觀察契約

候選 SHALL 來自 decoded pixels 的固定牆標及周圍脈絡，不由檔名、素材標籤、單一 OCR 字串或目前目標直接指定。模糊、缺參考、矛盾或不足證據 SHALL 拒絕或回報 unknown。候選與接受分開；[observation](../../../docs/contracts/camera-observation.schema.json)、[decision](../../../docs/contracts/camera-decision.schema.json)、[event](../../../docs/contracts/camera-event.schema.json) 各保留自己的語意，不臆造來源。

#### Scenario: 只看見方向牌

- **GIVEN** 導航期待某個固定牆標。
- **WHEN** 影像只有指向該處的文字或場景證據不足。
- **THEN** 不因期待節點而選答案，不建立進度事件。

### Requirement: VL-02 有界時序與新鮮影格

live camera SHALL 以不同 decoded media time 證明新影格，最多一個推論工作在途。重送同幀、過期、逆序、session 不符或時鐘前進不能湊足接受證據。時間窗、數量及間隔以 [policy 設定](../../../src/features/camera_guidance/policy.mjs) 為準；改動須另列受影響負例與驗證，不把設定值描述為已校準的現場安全門檻。

#### Scenario: 相機畫面凍結

- **GIVEN** 相機沒有新 decoded frame。
- **WHEN** 取樣 timer 再次執行。
- **THEN** 不增加有效觀察；暫停／換來源後的證據不得與舊來源合併。

### Requirement: NAV-04 真實影像位置疊標

主畫面 SHALL 以相機影像為底層；地標位置來自本次 pixel 匹配投影，遵守 [image anchor contract](../../../docs/contracts/image-anchor.schema.json)。完整輸入座標需映射到實際 cover 視窗；牌子裁出可見區或幾何無效時，在 policy 前拒絕且不畫標籤。unknown、暫停、來源改變或展示證據過期時清除；展示期限自擷取時間起算，不能從推論完成後重新延長。這是影像座標提示，不是世界座標 AR 或連續藍點，也不能直接接受節點。

#### Scenario: 畫面被裁切

- **GIVEN** 原始影格與 viewport 比例不同。
- **WHEN** 投影的牌子沒有完整落在可見區。
- **THEN** 不把標籤吸附到畫面中央或邊緣，也不讓不可見牌子推進導航。

### Requirement: NAV-07 明示同管線重播

重播 SHALL 將獲授權的照片 pixels 送進相同候選與接受流程，清楚呈現示範來源。重複參考照片的時序 simulation 只用於流程演練；不宣稱獨立錄影、多幀泛化、相機硬體或現場驗證。選單／timer 可以選輸入影像，但不能直接注入接受事件。

#### Scenario: 同一照片重複輸入

- **GIVEN** 使用者選擇照片示範。
- **WHEN** 相同參考 pixels 重複進入管線。
- **THEN** 保留 replay 來源；即使流程完成，也不升級 live camera 或 field 證據。
