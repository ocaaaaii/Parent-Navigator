# Changelog — 2025/07/01

## 本日摘要

新增後台管理員儀表板（admin dashboard），並針對 Vercel Hobby 方案 12 函式上限進行 API 合併重構。

---

## 新增功能

### admin.html — 後台管理員儀表板

Google Analytics 風格的單頁後台，深色主題。

**登入機制**
- 密碼輸入 → 呼叫 `POST /api/admin` → 取得 admin JWT，存入 `sessionStorage`
- 重整頁面後自動恢復登入狀態（token 未過期）
- 1 小時後自動失效，需重新登入

**五個頁面（側邊欄導覽）**

| 頁面 | 內容 |
|------|------|
| 整體概覽 | KPI 卡片 + 14 天趨勢折線 + 分類甜甜圈 + Top 10 橫向柱狀 |
| 熱門主題排名 | Top 15 橫向柱狀圖 + 分類圓餅 + 詳細排行清單（含色條）|
| 點擊趨勢 | 14 天折線圖（四類別各一條）+ 堆疊柱狀圖 |
| 用戶列表 | 可搜尋表格（暱稱/地區）+ 點擊次數 + 側滑 Drawer 詳情 |
| 論壇貼文 | 最新 50 篇貼文列表（標題、類別、瀏覽、按讚）|

**KPI 卡片（整體概覽頁）**
- 總用戶數、總點擊次數、本週新用戶（7 天）、本月點擊（30 天）

**用戶 Drawer（點擊「查看詳情」）**
- 基本資料：暱稱、地區、就業狀況、特殊身分、偏好主題、點擊次數
- 點擊記錄：政策名稱、類別 badge、priority 標籤、點擊時間

---

## 新增 API

### `api/admin.js`（合併自 admin-auth + admin-stats）

| Method | 說明 |
|--------|------|
| `POST /api/admin` | 密碼驗證，回傳 1 小時有效的 admin JWT |
| `GET /api/admin?type=overview` | KPI 總覽 |
| `GET /api/admin?type=topic_rank` | 熱門政策排行（Top 15）|
| `GET /api/admin?type=category_dist` | 四大類別點擊分布 |
| `GET /api/admin?type=click_trend` | 過去 14 天每日趨勢 |
| `GET /api/admin?type=users` | 用戶列表（含點擊次數）|
| `GET /api/admin?type=user_clicks&user_id=X` | 單一用戶點擊記錄 |
| `GET /api/admin?type=forum_posts` | 論壇貼文列表 |

所有 GET 請求需帶 `Authorization: Bearer <admin_jwt>`。

### `api/caregivers.js`（合併自 get / post / scrape）

| Method | Header | 說明 |
|--------|--------|------|
| `GET /api/caregivers` | — | 查詢保母列表（支援 region / type / keyword / page）|
| `POST /api/caregivers` | 無 secret | 使用者自行刊登保母 / 家教 |
| `POST /api/caregivers` | `x-scraper-secret` | 觸發爬蟲（PTT / Dcard / 1111）或接收外部資料 |

---

## 重構／修改

### Vercel Function 數量上限修正

**問題：** Vercel Hobby 方案上限 12 個 Serverless Functions，build 失敗。

**原因：** 當日新增 admin-auth、admin-stats 兩支後，總數達 14 支。

**處理：** 合併 5 支 → 2 支，總數從 14 降至 11。

**刪除的檔案（需手動 `git rm`）**

- `api/admin-auth.js` → 合併入 `api/admin.js`
- `api/admin-stats.js` → 合併入 `api/admin.js`
- `api/get-caregivers.js` → 合併入 `api/caregivers.js`
- `api/post-caregiver.js` → 合併入 `api/caregivers.js`
- `api/scrape-caregivers.js` → 合併入 `api/caregivers.js`

**合併後路徑對照（若其他前端有呼叫舊路徑須更新）**

| 舊路徑 | 新路徑 | 區分方式 |
|--------|--------|---------|
| `POST /api/admin-auth` | `POST /api/admin` | — |
| `GET /api/admin-stats?type=` | `GET /api/admin?type=` | — |
| `GET /api/get-caregivers` | `GET /api/caregivers` | HTTP GET |
| `POST /api/post-caregiver` | `POST /api/caregivers` | 無 `x-scraper-secret` header |
| `POST /api/scrape-caregivers` | `POST /api/caregivers` | 有 `x-scraper-secret` header |

---

## 環境變數

本日新增一個必要環境變數，請在 Vercel Dashboard → Settings → Environment Variables 新增：

```
ADMIN_PASSWORD=你設定的後台密碼
```

（`JWT_SECRET`、`SUPABASE_URL`、`SUPABASE_SERVICE_KEY` 沿用既有設定）

---

## 當前 API 目錄（共 11 支）

```
api/
├── admin.js            # 後台登入 + 統計查詢
├── caregivers.js       # 保母列表 / 刊登 / 爬蟲
├── chat.js
├── click.js
├── login.js
├── recommendations.js
├── register.js
├── reset-password.js
├── send-otp.js
├── user-preferences.js
└── verify-otp.js
```
