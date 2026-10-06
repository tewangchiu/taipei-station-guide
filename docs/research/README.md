# 研究入口與最小模板

研究是 reference，不是正式需求。競品、文章或工具的能力不能直接推論本產品的使用者需求、權利、可行性或付費意願。產品取捨進 [decisions](../product/decisions.md)；可驗證的採用才進 [domain specs](../PRODUCT_SPEC.md#正式行為) 與 change。

## 一條追溯路徑

研究問題 → 來源／觀察／假設 → decision ID → requirement ID → change ID → AC／check → 固定版本的驗收。

只在有實際研究時建立 `docs/research/<topic>.md`，加入 registry，kind 設 reference。不得放私人影像、原始檔名、個資、機器路徑或未授權資料。公開來源 URL 可保存為研究引用；repo 內文件連結使用相對路徑。

## 可直接填寫的模板

- **Question**：這次要做哪個產品或工程決定？
- **Sources**：來源、查核日、適用地區／版本、可追溯連結；事實與宣傳聲稱分開。
- **Observations**：已看到什麼，尚未看到什麼？
- **Hypotheses**：從觀察推論什麼？哪些反例能推翻？
- **Options**：採用、試驗、延後、不採用，各自成本與限制。
- **Validation**：下一個最小驗證、預先定義成功／失敗與所需資料；未執行不填結果。
- **Decision links**：待定或已採用的 decision ID；採用後連 requirement／change，未採用保留 reference 身分。

研究 Issue 的完成條件是回答問題與留下證據、建議；實作 Issue 的完成條件則來自已採用需求及 AC。Issue／PR 只連正式文件，不另複製一份規格。
