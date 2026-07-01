# AI 個人化評分引擎 — 完整設計文件

> **本文件為歷史設計說明，權威規範請見 `.claude/rules/scoring-engine.md`。**
> 8 維度、固定權重、固定門檻的舊版設計已於主題濃縮 + 動態權重改動中移除；
> 以下章節已同步更新，但部分歷史章節（如「需要新增的資料庫欄位」）僅供沿革參考。

---

## 評分維度總覽（3 計分 + 5 過濾）

| 維度 | 角色 | 說明 |
|------|------|------|
| `benefit_score` 補助價值 | 計分（動態權重）| 金額 × 持續時間換算年化價值 |
| `eligibility` 年齡符合度 | 計分（動態權重）| 子女月齡是否落在政策年齡範圍 |
| `urgency` 截止緊急度 | 計分（動態權重）| 距政策固定截止日的天數 |
| `city_match` 地區符合 | 僅過濾 | 地區不符直接排除，不計分 |
| `parental_employment` 就業狀況 | 僅過濾 | 差距兩級直接排除，差一級放行但不計分 |
| `application_window` 申請時間窗口 | 僅過濾 | 只有逾期才排除，其餘一律放行、不計分 |
| `special_status_match` 特殊身分 | 僅過濾 | 只有完全不符（`0`）才排除，其餘放行、不計分 |
| `birth_order_match` 胎次加成 | 不計分不過濾 | 只是 `generate_reason()` 的加碼提示布林旗標 |

不再有固定權重比例——`benefit_score`/`eligibility`/`urgency` 三者的權重由 `compute_dynamic_weights()` 依候選政策集合動態算出，詳見下一節。

---

## 過濾邏輯（評分前執行）

下列任一條件成立時，政策直接排除，不進入評分流程：

```python
def should_filter(*, eligibility, urgency, special_status_match,
                   city_match, parental_employment, application_window_expired) -> bool:
    return (
        eligibility == 0               # 孩子已超齡，永久不符資格
        or urgency == 0                # 截止日已過，無法申請
        or special_status_match == 0   # 需特殊身分但使用者不符合
        or city_match == 0             # 地區不符，不適用
        or parental_employment == 0    # 就業條件不符，不具申請資格
        or application_window_expired  # 出生起算申請窗口已關閉
    )
```

> **設計原則：** 所有過濾條件統一以 `0`／布林值表示「排除」，語意一致。

---

## 動態權重公式（取代固定加權）

```python
def compute_dynamic_weights(candidate_policies: list[dict], age_months: int) -> dict[str, float]:
    avg_benefit     = mean(calculate_benefit_score(p["benefit_amount"], p["benefit_type"]) for p in candidate_policies)
    avg_eligibility = mean(calculate_eligibility(age_months, p) for p in candidate_policies)
    avg_urgency     = mean(calculate_urgency(p["deadline"]) for p in candidate_policies)
    total = avg_benefit + avg_eligibility + avg_urgency
    return {
        "benefit_score": avg_benefit / total,
        "eligibility":   avg_eligibility / total,
        "urgency":       avg_urgency / total,
    }

def calculate_total_score(dims: dict, weights: dict) -> float:
    return round(
        dims["benefit_score"] * weights["benefit_score"]
        + dims["eligibility"] * weights["eligibility"]
        + dims["urgency"]     * weights["urgency"],
        2,
    )
```

候選政策集合優先序：使用者偏好類別（`users.preferred_categories`）內的政策 → 全站所有政策。**不使用任何人工訂的固定數字**——這是本次改版的核心原則。

### 優先級：百分位排序（取代固定門檻）

因權重逐使用者不同，固定分數門檻（舊版 high≥72／medium≥55）已不適用。改為對本次請求的候選清單依 `final_score` 取百分位：

| 等級 | 百分位 |
|------|--------|
| 高關聯（high） | 前 20% |
| 中關聯（medium） | 中間 50% |
| 低關聯（low） | 後 30% |

實作為 `assign_priority_tiers()`，切點為初始值，需以實際 seed data 驗證分布是否合理。

---

## 各維度評分邏輯

---

### 1. benefit_score — 補助價值（權重 0.30）

將補助金額換算為年化價值，使每月補助和一次性補助可以公平比較。
原始 30–100 等比例壓縮至 60–100（`new = 60 + (old−30) × 40/70`）。
無金額資料（NULL）回傳 30，明顯低於有資料的最低值（60）。

```python
def calculate_benefit_score(benefit_amount: int | None, benefit_type: str | None) -> int:
    if benefit_amount is None or benefit_type is None:
        return 30   # 無金額資料，低於平均

    if benefit_type == "monthly":   annual = benefit_amount * 12
    elif benefit_type == "annual":  annual = benefit_amount
    else:                           annual = benefit_amount / 3  # one_time 攤提三年

    if annual >= 240000: return 100  # 月 20,000+（育嬰停薪等頂級補助）
    if annual >= 180000: return 94   # 月 15,000+
    if annual >= 120000: return 89   # 月 10,000+（托嬰中心）
    if annual >= 80000:  return 83   # 月  6,667+（台北特殊境遇）
    if annual >= 50000:  return 77   # 月  4,167+（育兒津貼）
    if annual >= 30000:  return 71   # 月  2,500+（台北兒童醫療）
    if annual >= 12000:  return 66   # 月  1,000+（兒少帳戶、生育獎勵金）
    return 60                        # 有金額資料，任意金額皆給最低有效分
```

---

### 2. eligibility — 年齡符合度（權重 0.25）

子女月齡與政策年齡範圍的比對，是推薦最基本的門檻。

```python
def calculate_eligibility(child_age_months: int, policy: dict) -> int:
    min_age = policy.get("min_age_months", 0)
    max_age = policy.get("max_age_months", 999)

    if min_age <= child_age_months <= max_age:
        return 100  # 目前符合資格
    elif child_age_months < min_age:
        return 50   # 尚未達到年齡下限，未來可能符合
    else:
        return 0    # 已超過年齡上限，永遠不符合 → 過濾掉
```

---

### 3. application_window — 申請時間窗口（僅過濾，不計分）

與 `urgency`（政策固定截止日）不同，`application_window` 是從出生日起算的申請期限。
例如生育獎勵金規定出生後 60 天內申請，錯過即失去資格，與政策截止日無關。

已簡化為純布林過濾：逾期即排除，其餘一律放行、不影響分數（舊版的緊急度分級已移除）。

```python
def is_application_window_expired(child_age_days: int, window_days: int | None) -> bool:
    if window_days is None:
        return False   # 無出生起算期限，永遠放行
    return (window_days - child_age_days) < 0   # 已逾期 → 過濾掉
```

---

### 4. urgency — 截止緊急度（計分，動態權重）

政策固定截止日距今的天數。無截止日（長期開放）視為低緊急。
已截止（`days < 0`）回傳 0，由 `should_filter` 排除。

```python
def calculate_urgency(deadline) -> int:
    if deadline is None:
        return 30   # 長期開放，低緊急

    days = (deadline - date.today()).days

    if days < 0:   return 0    # 已截止 → 過濾掉
    if days <= 7:  return 100  # 極緊急（一週內）
    if days <= 14: return 85   # 非常緊急（兩週內）
    if days <= 30: return 70   # 緊急（一個月內）
    if days <= 60: return 55   # 需注意（兩個月內）
    if days <= 90: return 40   # 充裕（三個月內）
    return 30                  # 寬裕（與無截止日相同）
```

---

### 5. birth_order_match — 胎次加成（不計分不過濾，僅提示旗標）

台灣許多補助依胎次加碼（如台北市生育獎勵金第 1 胎 4 萬、第 3 胎 5 萬）。
已簡化為布林旗標，只用於 `generate_reason()` 產生「依胎次可享加碼補助」提示，不影響分數或過濾。

```python
def has_birth_order_bonus(child_birth_order: int, policy_bonus_from: int | None) -> bool:
    if policy_bonus_from is None:
        return False   # 政策無胎次差異
    return child_birth_order >= policy_bonus_from
```

---

### 6. special_status_match — 特殊身分符合度（僅過濾，不計分）

台灣政府福利體系中，嬰幼兒的特殊身分分為兩大類：

#### 台灣嬰幼兒特殊身分完整分類

**醫療與生理類**

| 代碼 | 說明 | 備註 |
|------|------|------|
| `premature` | 早產兒 | 妊娠未滿 37 週出生 |
| `low_birth_weight` | 低出生體重兒 | 出生體重未滿 2,500 公克 |
| `very_low_birth_weight` | 極低出生體重兒 | 未滿 1,500 公克，補助力道更強 |
| `developmental_delay` | 發展遲緩 | 0–6 歲，需聯合評估中心鑑定 |
| `disability` | 身心障礙 | 持有身心障礙證明（依 ICF 分類） |
| `rare_disease` | 罕見疾病 | 衛福部公告病種 |
| `major_illness` | 重大傷病 | 持健保重大傷病卡 |
| `congenital_heart` | 先天性心臟病 | 部分縣市另有補助 |

**社經與家庭類**

| 代碼 | 說明 | 備註 |
|------|------|------|
| `low_income` | 低收入戶 | 需持社會局核發證明 |
| `middle_low_income` | 中低收入戶 | 補助金額低於低收入戶 |
| `special_circumstances` | 特殊境遇家庭 | 單親、家暴、非婚生等複合條件 |
| `indigenous` | 原住民族 | 需具原住民族身分 |
| `new_resident` | 新住民子女 | 父或母為外籍或陸配 |
| `single_parent` | 單親家庭 | 父或母單方撫養 |
| `grandparent_care` | 隔代教養 | 由祖父母照顧 |
| `domestic_violence` | 受暴家庭 | 持保護令或相關證明 |

#### 評分邏輯

函式仍回傳 100/75/50/0 四級，但只有 `0` 用於過濾；100/75/50 不再計入總分，
僅供 `generate_reason()` 判斷要不要加上「符合特殊身分加碼條件」或「情況與目標族群相近」的提示語。
同一類群的不同身分視為「相關」，給予部分符合等級（75）：

```python
_STATUS_FAMILIES = (
    frozenset({"low_income", "middle_low_income"}),
    frozenset({"premature", "low_birth_weight", "very_low_birth_weight"}),
    frozenset({"single_parent", "special_circumstances", "domestic_violence", "grandparent_care"}),
    frozenset({"disability", "developmental_delay", "rare_disease", "major_illness", "congenital_heart"}),
)

def calculate_special_status(user_statuses: list, policy_required: str | None) -> int:
    if policy_required is None:
        return 50   # 開放所有人，中性
    if policy_required in user_statuses:
        return 100  # 完全符合
    if any(_is_related_status(policy_required, s) for s in user_statuses):
        return 75   # 同類群的相關身分，部分符合
    return 0        # 無關聯 → 過濾掉
```

| 分數 | 情境 |
|---|---|
| 100 | 政策要求 `low_income`，使用者有 `low_income` |
| 75 | 政策要求 `low_income`，使用者有 `middle_low_income`（同收入類群）|
| 50 | 政策無特殊身分要求（開放所有人）|
| 0 | 政策要求 `low_income`，使用者有 `premature`（不同類群）→ 過濾 |

---

### 7. city_match — 地區符合（僅過濾）

使用者設籍城市與政策適用範圍比對。全國性政策對所有使用者均符合。
城市不符合時回傳 0，由 `should_filter` 排除，**不計入總分**。

```python
def calculate_city_match(user_city: str | None, policy_city: str | None) -> int:
    if not policy_city or policy_city == "全國":
        return 100
    if not user_city:
        return 0  # 城市未知，無法確認符合 → 過濾掉
    return 100 if user_city == policy_city else 0
```

---

### 8. parental_employment_match — 就業狀況符合（僅過濾）

部分補助限定父母就業狀況，例如某些托育補助要求雙薪家庭。
就業條件不符時回傳 0，由 `should_filter` 排除，**不計入總分**。

就業狀況有自然等級順序：`not_working(0)` → `single_working(1)` → `both_working(2)`。
相差一級視為部分符合（60），通過過濾但不影響排名；相差兩級直接過濾。

```python
_EMPLOYMENT_LEVEL = {"not_working": 0, "single_working": 1, "both_working": 2}

def calculate_parental_employment(user_employment: str | None, policy_requires: str | None) -> int:
    if policy_requires is None:
        return 100  # 無就業限制
    if user_employment == policy_requires:
        return 100  # 完全符合
    user_lvl = _EMPLOYMENT_LEVEL.get(user_employment, -1)
    req_lvl  = _EMPLOYMENT_LEVEL.get(policy_requires, -1)
    if user_lvl == -1 or req_lvl == -1:
        return 0
    if abs(user_lvl - req_lvl) == 1:
        return 60   # 相鄰一級，部分符合
    return 0        # 差距兩級 → 過濾
```

| 分數 | 情境 |
|---|---|
| 100 | 無限制，或使用者就業狀況完全符合 |
| 60 | 政策要求 `both_working`，使用者是 `single_working`（相差一級）|
| 0（過濾）| 政策要求 `both_working`，使用者是 `not_working`（相差兩級）|

---

## 需要新增的資料庫欄位

### `policy_documents` 新增

```sql
ALTER TABLE policy_documents
  ADD COLUMN benefit_amount       INT          NULL,
  ADD COLUMN benefit_type         VARCHAR(20)  NULL,
  ADD COLUMN birth_order_bonus    INT          NULL,
  ADD COLUMN requires_status      VARCHAR(50)  NULL,
  ADD COLUMN application_window   INT          NULL,
  ADD COLUMN requires_employment  VARCHAR(30)  NULL;
```

| 欄位 | 說明 | 範例值 |
|------|------|--------|
| `benefit_amount` | 補助金額（元） | 18000 |
| `benefit_type` | 補助類型 | monthly / annual / one_time |
| `birth_order_bonus` | 第幾胎起加碼 | 2 或 3，NULL 表示無差異 |
| `requires_status` | 須具備的特殊身分 | low_income、premature、NULL |
| `application_window` | 出生後幾天內須申請 | 60、365、NULL |
| `requires_employment` | 就業條件 | both_working、NULL |

### `children` 新增

```sql
ALTER TABLE children
  ADD COLUMN birth_order          INT          DEFAULT 1,
  ADD COLUMN special_status       VARCHAR(255) NULL,
  ADD COLUMN parental_employment  VARCHAR(30)  NULL;
```

| 欄位 | 說明 | 範例值 |
|------|------|--------|
| `birth_order` | 第幾胎 | 1、2、3 |
| `special_status` | 特殊身分（逗號分隔） | premature,low_income |
| `parental_employment` | 父母就業狀況 | both_working |

