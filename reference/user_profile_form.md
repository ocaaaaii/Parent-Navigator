# 使用者個人資料表單設計

使用者登入後填寫，資料用於個人化育兒政策推薦評分。

---

## 第一步：帳號註冊

| 問題 | 欄位 | 輸入類型 | 驗證規則 |
|---|---|---|---|
| 電子信箱 | `email` | Email 輸入框 | 必填、格式驗證、唯一值 |
| 密碼 | `password` | 密碼輸入框 | 必填、最少 8 字元 |

> 密碼以 hashed 格式儲存，不儲存明文。

---

## 第二步：家長基本資料

| 問題 | 欄位 | 輸入類型 | 必填 | 影響維度 |
|---|---|---|---|---|
| 您的姓名 | `name` | 文字輸入框 | — | — |
| 您目前設籍的縣市 | `city` | 下拉選單 | ✓ | `city_match`（過濾）|
| 父母就業狀況 | `parental_employment` | 單選 | ✓ | `parental_employment`（過濾）|
| 家庭特殊身分 | `user.special_status` | 多選勾選框 | — | `special_status_match`（僅過濾）|
| 您感興趣的主題 | `preferred_categories` | 多選勾選框（可全不選）| — | 動態權重候選集合、點擊推薦冷啟動輸入 |

**主題選項（`preferred_categories`，對應 `app/services/policy_engine.py` 的 `TOPIC_CATEGORY_MAP`）：** 醫療保健、補助福利、托育服務、親子教育活動

**縣市選項：** 全國、台北市、新北市、桃園市、台中市、台南市、高雄市、基隆市、新竹市、新竹縣、苗栗縣、彰化縣、南投縣、雲林縣、嘉義市、嘉義縣、屏東縣、宜蘭縣、花蓮縣、台東縣、澎湖縣、金門縣、連江縣

---

## 第三步：孩子資料

系統採用**一對多設計**（一個帳號對應多位孩子）。同一位家長無論幾胎，只需一個帳號，每位孩子分別建立一筆獨立資料，推薦時選擇要查詢的孩子即可。

```
User（家長帳號）
 ├── Child（大寶，18 個月）→ 推薦 /recommendations/{user_id}/{child_id_1}
 ├── Child（二寶，6 個月） → 推薦 /recommendations/{user_id}/{child_id_2}
 └── Child（三寶，0 個月） → 推薦 /recommendations/{user_id}/{child_id_3}
```

| 問題 | 欄位 | 輸入類型 | 必填 | 影響維度 |
|---|---|---|---|---|
| 孩子的名字 | `name` | 文字輸入框 | — | — |
| 孩子的出生日期 | → `age_months` | 日期選擇器 | ✓ | `eligibility`（計分，動態權重）|
| 孩子的性別 | `gender` | 單選（男 / 女）| — | — |
| 孩子是第幾胎 | `birth_order` | 數字選單 | ✓ | `birth_order_match`（不計分不過濾，僅提示旗標）|
| 孩子是否有特殊身分 | `child.special_status` | 多選勾選框 | — | `special_status_match`（僅過濾）|

> `age_months` 由出生日期於後端換算，前端只需傳入 `birth_date`。

---

### 孩子胎次選項

| 值 | 顯示文字 |
|---|---|
| `1` | 第 1 胎 |
| `2` | 第 2 胎 |
| `3` | 第 3 胎 |
| `4` | 第 4 胎以上 |

---

### 孩子特殊身分選項（`child.special_status`，多選，可全不選）

**醫療與生理類（存入 `child.special_status`）**

| 代碼 | 顯示文字 |
|---|---|
| `premature` | 早產兒（妊娠未滿 37 週）|
| `low_birth_weight` | 低出生體重兒（未滿 2,500 公克）|
| `very_low_birth_weight` | 極低出生體重兒（未滿 1,500 公克）|
| `developmental_delay` | 發展遲緩（持聯合評估中心證明）|
| `disability` | 身心障礙（持身心障礙證明）|
| `rare_disease` | 罕見疾病（衛福部公告病種）|
| `major_illness` | 重大傷病（持健保重大傷病卡）|
| `congenital_heart` | 先天性心臟病 |

> 以上皆無：欄位存空值，`special_status_match` 計為中性（50 分）。

---

### 家庭特殊身分選項（`user.special_status`，多選，可全不選）

**社經與家庭類（存入 `user.special_status`）**

| 代碼 | 顯示文字 |
|---|---|
| `low_income` | 低收入戶（持社會局核發證明）|
| `middle_low_income` | 中低收入戶 |
| `single_parent` | 單親家庭 |
| `grandparent_care` | 隔代教養（由祖父母照顧）|
| `domestic_violence` | 受暴家庭（持保護令）|
| `special_circumstances` | 特殊境遇家庭 |
| `indigenous` | 原住民族 |
| `new_resident` | 新住民子女（父或母為外籍或陸配）|

> 評分時 `user.special_status` 與 `child.special_status` 合併為一份清單，共同比對政策的 `requires_status`。

---

### 父母就業狀況選項（單選）

| 代碼 | 顯示文字 |
|---|---|
| `both_working` | 雙薪家庭（父母皆就業）|
| `single_working` | 單薪家庭（僅一方就業）|
| `not_working` | 全職照顧（父母皆未就業）|

---

## 資料儲存對照

| 表單資料 | 資料表 | 欄位 |
|---|---|---|
| email、password、姓名、縣市 | `users` | `email`, `password`, `name`, `city` |
| 就業狀況 | `users` | `parental_employment` |
| 家庭特殊身分（逗號串接） | `users` | `user.special_status` |
| 感興趣的主題（清單） | `users` | `preferred_categories`（JSON） |
| 孩子姓名、出生日期、性別、胎次 | `children` | `name`, `age_months`, `gender`, `birth_order` |
| 孩子特殊身分（逗號串接） | `children` | `child.special_status` |

> 評分時 `user.special_status` 與 `child.special_status` 合併後送入 `calculate_special_status()`。

---

## 注意事項

- 三步驟已整合為單一請求：`POST /api/auth/register`（`app/routers/auth.py`），一次送出帳密、家長資料、至少一位孩子資料（`preferred_categories` 選填）。
- 密碼使用 `bcrypt` hash 後存入資料庫（`app/services/auth_service.py`）。
- 多子女已支援：前端提供「新增孩子」按鈕，每次送出一筆 Child 資料；推薦查詢時透過 `child_id` 指定孩子。
- 事後修改偏好主題：`PUT /api/users/{user_id}/preferences`。
