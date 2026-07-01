# 前後端對接文件 — 育兒導航 × 個人化推薦引擎

> 本文件供組員整合參考。我方前端（Vercel）會透過 Vercel Serverless Function 代理呼叫你的 Python 後端。

---

## 1. 我方會呼叫你的哪些 API

| Method | 你的 Endpoint | 觸發時機 |
|--------|--------------|---------|
| `GET` | `/api/recommendations/{user_id}/{child_id}?mode=personal\|cohort\|platform` | 使用者登入後進入首頁，以及切換推薦模式時 |
| `POST` | `/api/events/click` | 使用者點擊推薦卡片時 |
| `PUT` | `/api/users/{user_id}/preferences` | 使用者更新偏好主題時 |

---

## 2. user_id / child_id 格式

- 兩者皆為 **UUID v4**（來自我方 Supabase `users.id` / `children.id`）
- 範例：`550e8400-e29b-41d4-a716-446655440000`
- 我方不使用 email 當 ID，請以 UUID 作為唯一識別鍵

---

## 3. 各 Endpoint 的 Request / Response 規格

### 3-1. `GET /api/recommendations/{user_id}/{child_id}`

**Query params**

| 參數 | 值 | 預設 |
|------|-----|------|
| `mode` | `personal` / `cohort` / `platform` | `personal` |

**我方期望的 Response（200）**

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

**欄位說明**

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | string | 政策唯一識別碼（slug），我方用於點擊追蹤 |
| `title` | string | 政策名稱 |
| `category` | string | `medical` / `subsidy` / `daycare` / `activity` |
| `priority` | string | `high` / `medium` / `low`（百分位排序） |
| `reason` | string | 純規則產生的推薦理由（`generate_reason()` 輸出） |
| `benefit_amount` | int \| null | 補助金額（元），可為 null |
| `benefit_type` | string \| null | `monthly` / `annual` / `one_time` |
| `deadline` | string \| null | ISO 日期字串，如 `"2026-09-30"`，可為 null |
| `url` | string \| null | 政策官方連結，可為 null |

---

### 3-2. `POST /api/events/click`

**Request Body**

```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "child_id": "661f9511-f30c-52e5-b827-557766551111",
  "policy_id": "taipei-birth-bonus",
  "category": "subsidy",
  "priority": "high"
}
```

**Response（200）**

```json
{ "success": true }
```

---

### 3-3. `PUT /api/users/{user_id}/preferences`

**Request Body**

```json
{
  "preferred_categories": ["medical", "subsidy"]
}
```

合法值：`medical` / `subsidy` / `daycare` / `activity`

**Response（200）**

```json
{ "success": true }
```

---

## 4. 我方傳給你的使用者資料結構

使用者完成 Onboarding 後，我方 Supabase 會有以下資料，你的引擎在查詢時可直接從 DB 讀取（如果你有讀取我方 Supabase 的權限），或由我方在呼叫 API 時帶入。

### users 表（家長）

| 欄位 | 型別 | 說明 | 範例值 |
|------|------|------|--------|
| `id` | UUID | 主鍵，即 `user_id` | `550e...` |
| `region` | text | 居住縣市 | `台北市` |
| `parental_employment` | text | 就業狀況 | `both_working` / `single_working` / `not_working` |
| `special_status` | text | 家庭特殊身分（逗號分隔） | `low_income,single_parent` |
| `preferred_categories` | jsonb | 偏好主題陣列 | `["medical","subsidy"]` |

### children 表（孩子）

| 欄位 | 型別 | 說明 | 範例值 |
|------|------|------|--------|
| `id` | UUID | 主鍵，即 `child_id` | `661f...` |
| `user_id` | UUID | 外鍵關聯 users.id | — |
| `birth_date` | date | 出生日期 | `2025-03-15` |
| `age_months` | int | 月齡（DB 自動計算，不需前端傳入）| `15` |
| `gender` | text | `male` / `female` / null | — |
| `birth_order` | int | 第幾胎（1~4，4 代表 4 胎以上）| `1` |
| `special_status` | text | 孩子特殊身分（逗號分隔）| `premature,disability` |
| `is_active` | bool | 是否為當前查詢孩子 | `true` |

### 孩子特殊身分代碼（child.special_status）

| 代碼 | 中文 |
|------|------|
| `premature` | 早產兒（未滿 37 週） |
| `low_birth_weight` | 低出生體重兒 |
| `very_low_birth_weight` | 極低出生體重兒 |
| `developmental_delay` | 發展遲緩 |
| `disability` | 身心障礙 |
| `rare_disease` | 罕見疾病 |
| `major_illness` | 重大傷病 |
| `congenital_heart` | 先天性心臟病 |

### 家庭特殊身分代碼（user.special_status）

| 代碼 | 中文 |
|------|------|
| `low_income` | 低收入戶 |
| `middle_low_income` | 中低收入戶 |
| `single_parent` | 單親家庭 |
| `grandparent_care` | 隔代教養 |
| `domestic_violence` | 受暴家庭 |
| `special_circumstances` | 特殊境遇家庭 |
| `indigenous` | 原住民族 |
| `new_resident` | 新住民子女 |

---

## 5. 我方如何設定你的後端 URL

我在 Vercel 環境變數設定以下兩個值，你部署後提供給我即可：

| 變數 | 說明 |
|------|------|
| `SCORING_ENGINE_URL` | 你的後端根 URL，例如 `https://your-app.onrender.com` |
| `SCORING_ENGINE_KEY` | 若你的 API 有設 Key 驗證，放這裡；沒有的話不用 |

我方代理層（`api/recommendations.js`）會自動組成完整路徑呼叫你的 API：

```
GET  {SCORING_ENGINE_URL}/api/recommendations/{user_id}/{child_id}?mode=personal
POST {SCORING_ENGINE_URL}/api/events/click
PUT  {SCORING_ENGINE_URL}/api/users/{user_id}/preferences
```

若你的 API 有 `X-API-Key` header 驗證，我方會自動帶上 `SCORING_ENGINE_KEY`。

---

## 6. 主題分類對應（4 大類）

| 我方 `category` 值 | 顯示名稱 | 你的 `TOPIC_CATEGORY_MAP` 對應 |
|-------------------|----------|-------------------------------|
| `medical` | 醫療保健 | vaccine, health_check |
| `subsidy` | 補助福利 | subsidy, social_welfare, gov_resource |
| `daycare` | 托育服務 | childcare |
| `activity` | 親子教育活動 | parenting, announcement |

---

## 7. 降級行為說明

- 若 `SCORING_ENGINE_URL` 未設定，或你的後端離線，我方前端會自動顯示靜態 Demo 推薦資料，不會白屏或報錯。
- 點擊事件仍會寫入我方 Supabase `policy_click_events`，轉發失敗只會 silent warn，不影響使用者體驗。
