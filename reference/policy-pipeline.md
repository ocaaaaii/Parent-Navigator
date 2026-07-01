# 政策推薦引擎：文件更新到個人化推薦完整流程

## 1. 政策文件更新（來源同步）

原始文件來自 GitHub **ocaaaaii/AI-Parent-Navigator-**，執行 `sync docs` 觸發 `scripts/sync_documents.ps1`：

```
ocaaaaii/AI-Parent-Navigator-
├── pdfs/    ← PDF 政策文件
└── wiki/    ← Markdown 政策文件
    ↓
git sparse-checkout（只下載這兩個目錄）
    ↓
Copy 到本專案 policies/ 目錄
    ↓
建立 chore/sync-documents-YYYYMMDD branch → commit → push → 開 PR 合入 main
```

---

## 2. 結構化欄位萃取（Groq）

文件合入 `policies/` 後，執行 `reset db` 觸發 `app/services/groq_service.py` 的 `extract_policy_fields()`：

```
政策文件全文（最多 6000 字）
    ↓
Groq Qwen3-32B（temperature=0，最多重試 5 次）
    ↓
10 個結構化欄位（JSON）
    ↓
寫入 policy_documents 資料表
```

萃取的 10 個欄位：

| 欄位 | 用途 |
|------|------|
| `city` | 縣市過濾 |
| `min_age_months` / `max_age_months` | 月齡資格 |
| `benefit_amount` / `benefit_type` | 補助金額與頻率 |
| `deadline` | 申請截止日 |
| `application_window` | 出生後幾天內必須申請 |
| `birth_order_bonus` | 第幾胎起加碼 |
| `requires_status` | 需要哪種特殊身分 |
| `requires_employment` | 就業條件限制 |

萃取失敗時：數值欄位填 `null`，`city` 填 `"未取得"`。

---

## 3. 個人化推薦流程

前端呼叫 `GET /api/recommendations/{user_id}/{child_id}`（可帶 `?mode=personal|cohort|platform`）時，`app/services/recommendation.py` 執行：

```
從 DB 取得：使用者（city、employment、special_status、preferred_categories）
           + 孩子（age_months、birth_order、special_status）
    ↓
compute_dynamic_weights() → 依候選政策集合算出該使用者的 benefit/eligibility/urgency 權重
    ↓
對所有政策逐篇計算 3 計分 + 5 過濾維度
    ↓
should_filter() → 過濾掉不符合的
    ↓
calculate_total_score() → 依動態權重加權
    ↓
assign_priority_tiers() → 依百分位指派 high/medium/low
    ↓
generate_reason() → 純規則產生推薦理由字串（不呼叫 LLM）
    ↓
若指定 mode → 依點擊資料重新排序（不影響過濾結果）
    ↓
回傳結構化清單
```

---

## 4. 評分維度詳解（3 計分 + 5 過濾）

**3 個計分維度（權重動態計算，非固定值，見第 6 節）：**

| 維度 | NULL 時 | 計分邏輯 |
|------|---------|---------|
| `benefit_score` | 30 | 年化金額壓縮至 60–100；NULL 給 30（拉低基準） |
| `eligibility` | — | 月齡在範圍 → 100；未到齡 → 50；超齡 → 0（觸發過濾） |
| `urgency` | 30 | 距截止日越近越高；NULL = 30 |

**5 個純過濾維度（不計入總分）：**

| 維度 | 過濾條件 |
|------|---------|
| `city_match` | 縣市不符 → 過濾 |
| `parental_employment` | 就業條件差距兩級 → 過濾；差一級 → 放行但不計分 |
| `application_window` | 出生起算申請窗口已逾期 → 過濾；其餘一律放行、不計分 |
| `special_status_match` | 需特殊身分但不符合 → 過濾；其餘放行、不計分 |
| `birth_order_match` | 從不過濾，只是布林旗標，供推薦理由使用 |

---

## 5. 主題濃縮（8 → 4）

`TOPIC_CATEGORY_MAP`（`app/services/policy_engine.py`）把萃取出的細分類（`category`/`categories`）分組成 4 個使用者可見主題，同時也是 `users.preferred_categories` 的合法值：

| 主題 | 合併自 |
|------|--------|
| 醫療保健 | vaccine, health_check |
| 補助福利 | subsidy, social_welfare, gov_resource |
| 托育服務 | childcare |
| 親子教育活動 | parenting, announcement |

---

## 6. 動態權重與優先層級（取代固定權重/固定門檻）

`compute_dynamic_weights()` 依「候選政策集合」的 `benefit_score`/`eligibility`/`urgency` 平均分正規化成權重，**不使用任何人工訂的固定數字**：

```
候選集合優先序：
1. 使用者偏好類別（users.preferred_categories）內的政策
2. 全站所有政策（無偏好時）
```

優先層級改為百分位排序（`assign_priority_tiers()`），不是固定分數門檻：

```
前 20%  →  high
中間 50% →  medium
後 30%  →  low
```

---

## 7. 使用者偏好收集

`POST /api/auth/register` 可選填 `preferred_categories`（值為第 5 節的 4 個主題之一），事後可用 `PUT /api/users/{user_id}/preferences` 修改。此偏好是動態權重候選集合的來源之一，也是點擊資料不足時的冷啟動輸入。

---

## 8. 點擊追蹤與三種推薦模式

`POST /api/events/click` 記錄使用者對政策的點擊，寫入 `policy_click_events`。`GET /api/recommendations/{user_id}/{child_id}?mode=` 支援三種排序模式（皆用 SQL `COUNT`/`GROUP BY` 即時計算，不影響過濾結果）：

| mode | 排序依據 |
|------|---------|
| `personal` | 使用者點擊過的政策類別次數；點擊 < 5 次時退回預設的動態權重排序 |
| `cohort` | 同屬性 cohort（city + parental_employment + 年齡區間 + birth_order）的政策點擊次數 |
| `platform` | 全站政策點擊總次數 |

---

## 9. 推薦理由生成（純規則）

`generate_reason()` 根據維度分數組合最多 6 段中文短語，不呼叫任何 LLM，確保速度快且結果可預測。

| 條件 | 產生的短語 |
|------|-----------|
| `benefit_score ≥ 60` | 「年化補助達 XX 萬以上」 |
| `urgency` 高 | 「截止日期在 7 日內」 |
| `special_status_match == 100` | 「您符合特殊身分加碼條件」 |
| `special_status_match == 75` | 「您的情況與目標族群相近」 |
| `birth_order_bonus == True` | 「依胎次可享加碼補助」 |
| `parental_employment == 60` | 「就業條件部分符合，建議確認申請資格」 |

最終拼接成一句完整推薦理由回傳給前端。

---

## 10. 後台統計 API

`app/routers/admin_stats.py` 提供純資料聚合端點（無圖表 UI，圖表由使用者自行製作簡報）：

| Endpoint | 內容 |
|----------|------|
| `GET /api/admin/stats/personal-history/{user_id}` | 該使用者點擊時間序列 + 類別分佈 |
| `GET /api/admin/stats/cohort-popular` | 各 cohort 熱門政策排行 |
| `GET /api/admin/stats/platform-popular` | 全站熱門政策排行 + 每日點擊趨勢 |
| `GET /api/admin/stats/category-preferences` | 所有使用者 `preferred_categories` 彙總分佈 |
