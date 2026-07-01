# 整合改動說明 — CA → JL

> **背景：** 我方（CA）已依照你提供的 `scoring_engine_guide.md`、`policy-pipeline.md`、`user_profile_form.md` 完成前端與資料庫的整合改動，共分 5 個 Phase。
> 本文件說明「我方做了什麼」以及「你需要配合做什麼」。

---

## Phase 1 — Supabase Schema 擴充

**檔案：** `supabase-migration-phase5.sql`

我方新建 / 修改了以下資料表，**完全對齊你的欄位規格**：

### `users` 表（新增三欄）

| 新欄位 | 型別 | 說明 |
|--------|------|------|
| `parental_employment` | TEXT | `both_working` / `single_working` / `not_working` |
| `special_status` | TEXT | 家庭特殊身分，逗號分隔，例如 `low_income,single_parent` |
| `preferred_categories` | JSONB | 偏好主題陣列，例如 `["medical","subsidy"]` |

### `children` 表（全新建立）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | UUID | 主鍵 |
| `user_id` | UUID | 關聯 users.id（ON DELETE CASCADE）|
| `name` | TEXT | 孩子暱稱 |
| `birth_date` | DATE | 出生日期 |
| `age_months` | INT | **自動計算**（GENERATED ALWAYS），不需前端傳入 |
| `gender` | TEXT | `male` / `female` / null |
| `birth_order` | INT | 第幾胎（1~4，4 代表 4 胎以上）|
| `special_status` | TEXT | 孩子特殊身分，逗號分隔 |
| `is_active` | BOOL | 是否為當前查詢孩子 |

### `policy_click_events` 表（全新建立，供點擊追蹤）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `user_id` | UUID | 關聯 users.id |
| `child_id` | UUID | 關聯 children.id |
| `policy_id` | TEXT | 政策 slug / ID |
| `category` | TEXT | medical / subsidy / daycare / activity |
| `priority` | TEXT | high / medium / low |
| `clicked_at` | TIMESTAMPTZ | 點擊時間 |

---

## Phase 2 — Onboarding 表單補齊四個欄位

**檔案：** `onboarding.html`

依照你的 `user_profile_form.md` 規格，新增以下四個欄位讓使用者在 Onboarding 時填寫：

| 新增欄位 | 步驟位置 | 輸入方式 | 寫入位置 |
|---------|---------|---------|---------|
| 孩子胎次（birth_order） | Step 3 寶寶資訊 | 單選（第1/2/3/4胎以上）| `children.birth_order` |
| 孩子特殊身分（child special_status）| Step 3 寶寶資訊 | 多選（8 選項）| `children.special_status` |
| 父母就業狀況（parental_employment）| Step 4 居住地區 | 單選（雙薪/單薪/全職照顧）| `users.parental_employment` |
| 家庭特殊身分（family special_status）| Step 5 主題偏好 | 多選（8 選項）| `users.special_status` |

**孩子特殊身分選項（8 個，代碼完全對應你的規格）**

`premature` / `low_birth_weight` / `very_low_birth_weight` / `developmental_delay` / `disability` / `rare_disease` / `major_illness` / `congenital_heart`

**家庭特殊身分選項（8 個）**

`low_income` / `middle_low_income` / `single_parent` / `grandparent_care` / `domestic_violence` / `special_circumstances` / `indigenous` / `new_resident`

---

## Phase 3 — api/register.js 同時寫入兩張表

**檔案：** `api/register.js`

原本 register API 只寫入 `users` 表，現在改為：

```
POST /api/register
  → 寫入 users（含 parental_employment、special_status、preferred_categories）
  → 寫入 children（含 birth_date、birth_order、child_special_status）
```

兩張表共用同一個 `user_id`（UUID），這就是你我系統的**共同識別鍵**。

---

## Phase 4 — Vercel API Bridge（三支代理函式）

我方在 Vercel 新增三支 Serverless Function，作為前端呼叫你後端的橋接層。

### `GET /api/recommendations`

```
前端 → Vercel /api/recommendations?user_id=X&child_id=Y&mode=personal
      → 你的後端 GET /api/recommendations/{user_id}/{child_id}?mode=personal
      → 回傳推薦清單給前端
```

若你的後端 URL 未設定，會自動降級為靜態 Demo 資料（前端不會壞掉）。

### `POST /api/click`

```
前端（使用者點擊推薦卡片）
  → Vercel /api/click
  → 同時寫入我方 Supabase policy_click_events
  → 轉發 POST 給你的後端 /api/events/click
```

### `GET / PUT /api/user-preferences`

```
GET  → 查詢 users + children 資料回傳給前端
PUT  → 更新 users.preferred_categories
     → 轉發 PUT 給你的後端 /api/users/{user_id}/preferences
```

---

## Phase 5 — Demo.html 個人化推薦 Section

**檔案：** `parenting-navigator-demo.html`

首頁頂部新增「為你量身推薦 ✨」區塊，登入後自動顯示：

- **三種 mode**：個人化 / 同屬性 / 全站熱門（對應你的 personal / cohort / platform）
- **推薦卡片**：priority 色條（紅/橙/綠）+ 分類 badge + `generate_reason()` 推薦理由
- **點擊追蹤**：每次點卡片自動送 `/api/click`

---

## 你需要做的事

### ① 提供你的後端 URL 給我

部署完成後，請告訴我以下資訊，我填入 Vercel 環境變數後就能對接：

```
SCORING_ENGINE_URL=https://your-app.onrender.com
SCORING_ENGINE_KEY=（若你有 API Key 驗證的話）
```

### ② 確認你的三個 Endpoint 存在

```
GET  {你的後端}/api/recommendations/{user_id}/{child_id}?mode=personal|cohort|platform
POST {你的後端}/api/events/click
PUT  {你的後端}/api/users/{user_id}/preferences
```

### ③ 確認 Response 格式

我方前端期望 `/api/recommendations` 回傳以下格式：

```json
{
  "results": [
    {
      "id": "taipei-birth-bonus",
      "title": "台北市生育獎勵金",
      "category": "subsidy",
      "priority": "high",
      "reason": "符合台北市設籍條件；第 1 胎可領 4 萬元",
      "benefit_amount": 40000,
      "benefit_type": "one_time",
      "deadline": null,
      "url": "https://www.gov.taipei"
    }
  ]
}
```

欄位中 `category` 值必須是 `medical` / `subsidy` / `daycare` / `activity` 其中之一（對應你的 `TOPIC_CATEGORY_MAP`）。

### ④ 關於 user_id 的說明

我方使用者的 `user_id` 是 **Supabase 自動生成的 UUID**，不是 email。
請確認你的後端接受 UUID 格式作為路徑參數。

---

## 資料流全覽

```
使用者完成 Onboarding
  ↓
Supabase
  users（parental_employment, special_status, preferred_categories）
  children（birth_date, age_months ←自動, birth_order, special_status）
  ↓
使用者登入首頁
  ↓
Vercel /api/recommendations → 你的評分引擎
  compute_dynamic_weights() + should_filter() + calculate_total_score()
  assign_priority_tiers() + generate_reason()
  ↓
推薦卡片顯示在首頁
  ↓
使用者點擊
  ↓
Vercel /api/click → Supabase policy_click_events + 你的 /api/events/click
```

---

> 有任何欄位格式或 endpoint 路徑不一致，歡迎直接告知，我方可以快速調整 Vercel Bridge 層。
