# Wiki 知識庫分類總表

> 依四大主題分類，對應 onboarding TOPICS：medical / subsidy / daycare / activity
> 最後更新：2026-07

---

## 🏥 醫療保健（medical）

| 檔案 | 主要 tags | 適用地區 |
|------|-----------|---------|
| 全國_兒童預防保健服務.md | 健檢・預防保健 | 全國 |
| 全國_公費疫苗接種時程.md | 疫苗・預防接種 | 全國 |
| 全國_兒童口腔健康預防保健.md | 口腔健康・牙齒保健 | 全國 |
| 全國_孕產婦心理健康與產後憂鬱.md | 心理健康・產後憂鬱 | 全國 |
| 全國_新生兒篩檢（聽力與代謝）.md | 新生兒・篩檢・聽力 | 全國 |
| 台北市_各區衛生所疫苗預約.md | 疫苗・衛生所・預約 | 台北市 |
| 台北市_兒童醫療補助.md | 兒童健保・醫療補助 | 台北市 |
| 台北市_自費疫苗加碼補助.md | 輪狀病毒・腸病毒71型 | 台北市 |
| 孕婦_0到42週完整孕期指南.md | 孕期・產檢・待產 | 全國 |
| 新手爸媽_高頻QA問答庫.md | 新生兒照護・常見焦慮 | 全國 |

**共 10 篇**

---

## 💰 補助福利（subsidy）

| 檔案 | 主要 tags | 適用地區 |
|------|-----------|---------|
| 全國_育兒津貼.md | 育兒補助 | 全國 |
| 全國_育兒津貼與托育補助_未滿2歲新制.md | 補助・托育 | 全國 |
| 全國_育嬰留職停薪津貼.md | 育嬰假・勞工權益 | 全國 |
| 全國_新生兒出生登記戶政流程.md | 出生登記・行政流程 | 全國 |
| 全國_職場哺集乳室與育嬰權益.md | 哺乳・職場・育嬰 | 全國 |
| 全國_1957福利諮詢專線.md | 社福資源・諮詢・急難救助 | 全國 |
| 全國_兒童少年保護服務緊急求助.md | 保護服務・兒少安全 | 全國 |
| 全國_兒童及少年未來教育發展帳戶.md | 補助・弱勢兒少・儲蓄帳戶 | 全國 |
| 台北市_生育獎勵金.md | 生育獎勵・出生登記 | 台北市 |
| 台北市_好孕2U專車補助.md | 孕婦補助・交通補助 | 台北市 |
| 台北市_特殊境遇家庭扶助.md | 特殊境遇・單親家庭・弱勢 | 台北市 |
| 台北市_早產兒與特殊身分補助加碼.md | 早產兒・身心障礙・補助加碼 | 台北市 |

**共 12 篇**

---

## 🏠 托育服務（daycare）

| 檔案 | 主要 tags | 適用地區 |
|------|-----------|---------|
| 台北市_托嬰中心申請指南.md | 公托・準公共化・費用比較 | 台北市 |
| 台北市_嬰幼兒照顧服務資源總覽.md | 托育・補助・親子資源 | 台北市 |
| 全國_公共場所親子廁所盥洗室.md | 親子友善・法規 | 全國 |

**共 3 篇**

---

## 📚 親子教育活動（activity）

| 檔案 | 主要 tags | 適用地區 |
|------|-----------|---------|
| 台北市_幼兒園與學前教育申請指南.md | 幼兒園・學前教育 | 台北市 |
| 台北市_特殊教育資源.md | 特殊教育・早療・融合教育 | 台北市 |
| 台北市_兒童與少年服務總覽.md | 兒童服務・早期療育・收出養 | 台北市 |

**共 3 篇**

---

## 統計

| 類別 | 篇數 | 全國 | 台北市 |
|------|------|------|--------|
| 醫療保健 | 10 | 7 | 3 |
| 補助福利 | 12 | 8 | 4 |
| 托育服務 | 3 | 1 | 2 |
| 親子教育活動 | 3 | 0 | 3 |
| **合計** | **28** | **16** | **12** |

---

## Python WIKI_CATEGORY_MAP（供 wiki_loader.py 使用）

```python
WIKI_CATEGORY_MAP = {
    # ── 醫療保健 ──────────────────────────────────────────────────
    "全國_兒童預防保健服務":             "medical",
    "全國_公費疫苗接種時程":             "medical",
    "全國_兒童口腔健康預防保健":         "medical",
    "全國_孕產婦心理健康與產後憂鬱":     "medical",
    "全國_新生兒篩檢（聽力與代謝）":     "medical",
    "台北市_各區衛生所疫苗預約":         "medical",
    "台北市_兒童醫療補助":               "medical",
    "台北市_自費疫苗加碼補助":           "medical",
    "孕婦_0到42週完整孕期指南":          "medical",
    "新手爸媽_高頻QA問答庫":             "medical",

    # ── 補助福利 ──────────────────────────────────────────────────
    "全國_育兒津貼":                      "subsidy",
    "全國_育兒津貼與托育補助_未滿2歲新制": "subsidy",
    "全國_育嬰留職停薪津貼":              "subsidy",
    "全國_新生兒出生登記戶政流程":        "subsidy",
    "全國_職場哺集乳室與育嬰權益":        "subsidy",
    "全國_1957福利諮詢專線":              "subsidy",
    "全國_兒童少年保護服務緊急求助":      "subsidy",
    "全國_兒童及少年未來教育發展帳戶":    "subsidy",
    "台北市_生育獎勵金":                  "subsidy",
    "台北市_好孕2U專車補助":              "subsidy",
    "台北市_特殊境遇家庭扶助":            "subsidy",
    "台北市_早產兒與特殊身分補助加碼":    "subsidy",

    # ── 托育服務 ──────────────────────────────────────────────────
    "台北市_托嬰中心申請指南":            "daycare",
    "台北市_嬰幼兒照顧服務資源總覽":      "daycare",
    "全國_公共場所親子廁所盥洗室":        "daycare",

    # ── 親子教育活動 ──────────────────────────────────────────────
    "台北市_幼兒園與學前教育申請指南":    "activity",
    "台北市_特殊教育資源":                "activity",
    "台北市_兒童與少年服務總覽":          "activity",
}
```

---

## Supabase UPDATE SQL（套用至 wiki_articles 資料表）

```sql
-- 醫療保健
UPDATE wiki_articles SET category = 'medical' WHERE filename ILIKE '%兒童預防保健服務%' OR filename ILIKE '%公費疫苗接種%' OR filename ILIKE '%兒童口腔%' OR filename ILIKE '%孕產婦心理%' OR filename ILIKE '%新生兒篩檢%' OR filename ILIKE '%衛生所疫苗%' OR filename ILIKE '%兒童醫療補助%' OR filename ILIKE '%自費疫苗加碼%' OR filename ILIKE '%孕期指南%' OR filename ILIKE '%高頻QA%';

-- 補助福利
UPDATE wiki_articles SET category = 'subsidy' WHERE filename ILIKE '%育兒津貼%' OR filename ILIKE '%育嬰留職%' OR filename ILIKE '%出生登記%' OR filename ILIKE '%哺集乳%' OR filename ILIKE '%1957%' OR filename ILIKE '%兒少保護%' OR filename ILIKE '%未來教育%' OR filename ILIKE '%生育獎勵%' OR filename ILIKE '%好孕2U%' OR filename ILIKE '%特殊境遇%' OR filename ILIKE '%早產兒%';

-- 托育服務
UPDATE wiki_articles SET category = 'daycare' WHERE filename ILIKE '%托嬰中心%' OR filename ILIKE '%嬰幼兒照顧%' OR filename ILIKE '%親子廁所%';

-- 親子教育活動
UPDATE wiki_articles SET category = 'activity' WHERE filename ILIKE '%幼兒園%' OR filename ILIKE '%特殊教育%' OR filename ILIKE '%兒童與少年服務%';
```
