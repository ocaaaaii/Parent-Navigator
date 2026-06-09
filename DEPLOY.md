# 育兒導航全攻略 — 完整部署上架流程

> 照著這份文件一步一步做，就能把系統從零跑到線上。
> 本版本使用 **Supabase（PostgreSQL + pgvector）+ Render** 部署，不需要自架 MySQL 或 ChromaDB。
> 打 ✅ 代表完成，打 ❌ 代表還沒做。

---

## 系統需求

| 工具 | 版本 | 用途 |
|------|------|------|
| Python | ≥ 3.11 | 本地開發執行 |
| Git | 任意 | 版本控制 |
| ngrok | 任意 | 本地 LINE Webhook 測試 |

---

## 專案結構說明

```
Final project/
├── backend/
│   ├── app.py              ← Flask 主程式
│   ├── config.py           ← 環境變數設定
│   ├── db.py               ← psycopg2 連線池 + 查詢函式
│   ├── rag_engine.py       ← pgvector 向量搜尋 + LLM 生成
│   ├── wiki_loader.py      ← MD/PDF 解析 + 向量化存入 Supabase
│   ├── scheduler.py        ← APScheduler 主動推播
│   ├── conversation.py     ← LINE 對話狀態機
│   ├── crawler.py          ← 自動爬蟲
│   ├── auth.py             ← 網頁版帳號系統
│   ├── forum.py            ← 論壇 API
│   ├── flex_templates.py   ← LINE Flex 卡片模板
│   ├── supabase_schema.sql ← 建表 SQL（在 Supabase 執行）
│   ├── requirements.txt
│   ├── Procfile            ← Render 啟動指令
│   ├── .env.example        ← 環境變數範本
│   └── .env                ← 你要建立的機密設定檔（不進 git）
├── wiki/                   ← 30+ 份 Markdown 知識庫文件
├── pdfs/                   ← 政府 PDF 原始檔
├── parenting-navigator-v6.html
├── .gitignore
└── README.md
```

---

## 第一步：申請外部服務帳號

### 1-1 Supabase（資料庫）

1. 前往 [supabase.com](https://supabase.com) → **Start your project**（免費）
2. 建立 Organization → New Project（填入名稱、密碼、選 Region: **Northeast Asia**）
3. 等待 Project 建立完成（約 1 分鐘）
4. 取得以下資訊（**Project Settings → Database**）：

   | 項目 | 位置 |
   |------|------|
   | `DATABASE_URL` | Connection string → **Session mode（port 5432）** |
   | `SUPABASE_URL` | Settings → API → Project URL |
   | `SUPABASE_KEY` | Settings → API → service_role key（**不是 anon key**） |

> ⚠️ service_role key 有完整資料庫權限，僅後端使用，不可暴露在前端。

### 1-2 LINE Bot

1. 前往 [LINE Developers](https://developers.line.biz/)
2. 建立 Provider → 新增 **Messaging API** Channel
3. 取得：
   - `Channel Access Token`（Messaging API 頁面 → Issue）
   - `Channel Secret`（Basic settings 頁面）
4. Webhook URL 先留空，等第三步取得網址再填

### 1-3 OpenAI

1. 前往 [platform.openai.com](https://platform.openai.com/)
2. API Keys → Create new secret key
3. 複製 `sk-...` 開頭的金鑰

---

## 第二步：建立資料庫 Schema

### 2-1 在 Supabase 執行建表 SQL

1. 開啟 Supabase Dashboard → **SQL Editor**
2. 貼上 `backend/supabase_schema.sql` 全部內容
3. 點 **Run** 執行

執行完成後，左側 Table Editor 應該看到以下資料表：
`users`、`children`、`milestones`、`push_schedule`、
`wiki_articles`、`rag_chunks`、`conversation_state`、
`web_users`、`forum_categories`、`forum_posts`、`forum_comments`、
`post_likes`、`comment_likes`、`crawl_log`

`milestones` 和 `forum_categories` 已有預設值（疫苗時程 + 5 個板塊），不需要手動新增。

---

## 第三步：建立環境變數檔

```bash
cd backend
cp .env.example .env
```

用任何編輯器開啟 `backend/.env`，填入以下內容：

```env
# Flask
FLASK_SECRET_KEY=請自行產生隨機字串（可用 python -c "import secrets; print(secrets.token_hex(32))"）
FLASK_DEBUG=false
FLASK_PORT=5000

# LINE Bot（第一步取得）
LINE_CHANNEL_ACCESS_TOKEN=你的_token
LINE_CHANNEL_SECRET=你的_secret

# Supabase PostgreSQL（第一步取得）
# 格式：postgresql://postgres.[PROJECT_REF]:[PASSWORD]@...supabase.com:5432/postgres
DATABASE_URL=postgresql://postgres.xxxx:password@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI...（service_role key）

# 連線池（Render Free 建議 max=3）
DB_POOL_MIN=1
DB_POOL_MAX=3

# OpenAI（第一步取得）
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_MAX_TOKENS=1024
EMBEDDING_MODEL=text-embedding-3-small

# RAG 設定
RAG_TOP_K=5
RAG_SCORE_THRESHOLD=0.35

# Wiki 路徑（相對於 backend/ 目錄）
WIKI_DIR=../wiki

# 推播排程
SCHEDULER_PUSH_HOUR=9
SCHEDULER_PUSH_MINUTE=0
SCHEDULER_TIMEZONE=Asia/Taipei
```

> ⚠️ `.env` 絕對不能 git commit，已加入 `.gitignore`。

---

## 第四步：本地安裝與啟動

```bash
# 建立虛擬環境（建議）
python -m venv venv
source venv/bin/activate      # macOS / Linux
# 或 venv\Scripts\activate    # Windows

# 安裝套件
cd backend
pip install -r requirements.txt

# 啟動 Flask（開發模式）
python app.py
```

### 4-1 確認後端正常

```bash
# 健康檢查
curl http://localhost:5000/health
# 應回傳：{"status": "ok"}

# 測試 RAG 問答（向量化完成後）
curl -X POST http://localhost:5000/chat \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test001","message":"台北市有哪些生育補助？","city":"台北市"}'

# 確認論壇 API
curl http://localhost:5000/forum/categories
```

### 4-2 建立向量知識庫（首次必做）

```bash
# 在 backend/ 目錄執行
python wiki_loader.py --rebuild
```

這個指令會：
1. 掃描 `../wiki/` 下所有 `.md` 和 `.pdf`
2. 切塊後呼叫 OpenAI Embedding API
3. 將 embedding 直接存入 Supabase `rag_chunks.embedding`

> 約需 3~5 分鐘，視 wiki 檔案數量與 OpenAI API 速度。
> 日後新增 wiki 時，重新執行即可（已有 chunk 用 MD5 hash 去重，不重複呼叫 API）。

驗證向量化成功：
```bash
python -c "
import db
db.get_pool()
with db.get_conn() as conn:
    with conn.cursor() as cur:
        cur.execute('SELECT COUNT(*) AS cnt FROM rag_chunks WHERE is_indexed = TRUE')
        print('已向量化 chunk 數量：', cur.fetchone()['cnt'])
"
```

---

## 第五步：LINE Bot 本地測試

### 5-1 安裝並啟動 ngrok

```bash
# 開新的終端機視窗
ngrok http 5000
```

複製輸出的 `https://xxxx.ngrok-free.app` 網址。

### 5-2 設定 LINE Webhook

1. 到 LINE Developers Console → 你的 Channel → Messaging API
2. Webhook URL 填入：`https://xxxx.ngrok-free.app/webhook`
3. 開啟「Use webhook」
4. 點「Verify」— 看到 **Success** 代表成功

### 5-3 測試完整流程

在 LINE 上加入 Bot 好友，輸入「開始設定」，走完整個建檔流程，確認：
- [ ] 對話狀態機 6 步驟正常
- [ ] 寶寶資料寫入 Supabase（可在 Table Editor 確認）
- [ ] RAG 問答有回覆（不是亂說）
- [ ] 回覆格式正常（沒有 `**粗體**` 原文顯示）

---

## 第六步：部署到 Render（正式上線）

### 6-1 推上 GitHub

```bash
# 在專案根目錄
git init
git add .
git commit -m "init: 育兒導航 Agent"

# 建立 GitHub repo（網頁操作）後：
git remote add origin https://github.com/你的帳號/parenting-navigator.git
git push -u origin main
```

> 確認 `.env` 沒有被 commit：`git status` 應該看不到 `.env`。

### 6-2 Render 建立 Web Service

1. 前往 [render.com](https://render.com) → New → **Web Service**
2. 連接 GitHub repo
3. 設定：
   - **Language**: Python 3
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app --workers 2 --timeout 120`
   - **Region**: Singapore

### 6-3 設定環境變數

Render Dashboard → **Environment** → Add Environment Variable，填入以下所有變數：

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Supabase connection string（Session mode） |
| `SUPABASE_URL` | https://xxxx.supabase.co |
| `SUPABASE_KEY` | service_role key |
| `DB_POOL_MIN` | `1` |
| `DB_POOL_MAX` | `3` |
| `LINE_CHANNEL_ACCESS_TOKEN` | 你的 token |
| `LINE_CHANNEL_SECRET` | 你的 secret |
| `OPENAI_API_KEY` | sk-... |
| `OPENAI_MODEL` | `gpt-4o-mini` |
| `EMBEDDING_MODEL` | `text-embedding-3-small` |
| `FLASK_SECRET_KEY` | 隨機長字串 |
| `FLASK_DEBUG` | `false` |
| `WIKI_DIR` | `../wiki` |
| `SCHEDULER_TIMEZONE` | `Asia/Taipei` |
| `RAG_TOP_K` | `5` |
| `RAG_SCORE_THRESHOLD` | `0.35` |

> ✅ Supabase 資料持久化在雲端，不受 Render 重新部署影響，無需 Persistent Disk。

### 6-4 部署完成後

```bash
# 取得 Render 網址（類似）
# https://parenting-navigator-xxxx.onrender.com

# 在 Render Shell（Dashboard → Shell 頁籤）建立向量知識庫
python wiki_loader.py --rebuild

# 更新 LINE Webhook URL
# LINE Developers → Webhook URL →
# https://parenting-navigator-xxxx.onrender.com/webhook
```

### 6-5 更新前端 API 網址

開啟 `parenting-navigator-v6.html`，找到並修改：
```js
const API_BASE = 'https://parenting-navigator-xxxx.onrender.com';
```

---

## 日常維護指令

```bash
# 本地啟動後端
cd backend && python app.py

# 重新建立知識庫（wiki 有新增時）
cd backend && python wiki_loader.py --rebuild

# 只向量化尚未處理的 chunk（不重新解析 MD）
cd backend && python wiki_loader.py --vectorize-only

# 手動觸發爬蟲
cd backend && python crawler.py --run-now

# 驗證 Supabase 連線
cd backend && python -c "import db; db.get_pool(); print('連線成功')"
```

---

## API 路由總表

| 方法 | 路由 | 說明 | 需登入 |
|------|------|------|--------|
| POST | `/webhook` | LINE Bot Webhook | — |
| GET | `/health` | 健康檢查 | — |
| POST | `/chat` | 網頁聊天 API | — |
| POST | `/auth/register` | 註冊 | — |
| POST | `/auth/login` | 登入 | — |
| POST | `/auth/logout` | 登出 | — |
| GET | `/auth/me` | 取得個人資料 | ✅ |
| PATCH | `/auth/me` | 更新個人資料 | ✅ |
| GET | `/forum/categories` | 板塊列表 | — |
| GET | `/forum/posts` | 貼文列表（?category=&sort=&page=） | — |
| POST | `/forum/posts` | 發文 | ✅ |
| GET | `/forum/posts/<id>` | 單篇貼文 + 留言 | — |
| DELETE | `/forum/posts/<id>` | 刪除貼文 | ✅ |
| POST | `/forum/posts/<id>/comments` | 留言 | ✅ |
| POST | `/forum/posts/<id>/like` | 按讚 / 取消 | ✅ |
| POST | `/forum/comments/<id>/like` | 留言按讚 | ✅ |
| GET | `/forum/hot` | 熱門貼文 Top 10 | — |

---

## 常見問題排解

**Q: `psycopg2.OperationalError: could not connect to server`**
- 確認 `DATABASE_URL` 格式正確（Session mode，port 5432）
- 確認 Supabase Project 狀態為 Active（不是 Paused）
- Supabase 免費方案超過 7 天無活動會自動暫停，前往 Dashboard 手動恢復

**Q: `wiki_loader.py --rebuild` 跑完但 RAG 沒有回答**
```bash
# 確認 Supabase 有向量資料
python -c "
import db
db.get_pool()
with db.get_conn() as conn:
    with conn.cursor() as cur:
        cur.execute('SELECT COUNT(*) AS cnt FROM rag_chunks WHERE is_indexed = TRUE AND embedding IS NOT NULL')
        print('已向量化 chunk 數量：', cur.fetchone()['cnt'])
"
```

**Q: LINE Webhook Verify 失敗**
- 確認 Flask 有在跑：`curl http://localhost:5000/health`
- 確認 ngrok 還在跑（免費版 2 小時到期要重啟）
- 確認 `LINE_CHANNEL_SECRET` 設定正確

**Q: RAG 回答帶有 `**粗體**` 原文顯示**
- 已在 `config.py` 的 `SYSTEM_PROMPT` 加入格式規定
- 若仍出現，重啟 Flask 程式使設定生效

**Q: Render 部署後第一次請求很慢（30 秒以上）**
- Render 免費方案 15 分鐘無流量後會 Spin down（冷啟動）
- 解法：升級 Starter 方案（$7/月），或設定 UptimeRobot 每 10 分鐘 ping `/health` 保持 warm

**Q: `OPENAI_API_KEY` 沒設定導致 RAG 失敗**
```bash
python -c "import config; print(config.OPENAI_API_KEY[:10] if config.OPENAI_API_KEY else '未設定')"
```

**Q: Supabase `rag_chunks` 表的 pgvector HNSW 索引沒有被建立**
- 確認 `supabase_schema.sql` 有正確執行（包含 `CREATE INDEX ... USING hnsw`）
- 在 Supabase SQL Editor 執行：
  ```sql
  SELECT indexname FROM pg_indexes WHERE tablename = 'rag_chunks';
  ```
  應看到 `rag_chunks_embedding_hnsw`
