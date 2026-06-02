# 育兒導航全攻略 — 完整部署上架流程

> 照著這份文件一步一步做，就能把系統從零跑到線上。
> 打 ✅ 代表完成，打 ❌ 代表還沒做。

---

## 系統需求

| 工具 | 版本 | 用途 |
|------|------|------|
| Docker + Docker Compose | ≥ 24 | 一鍵啟動整個環境 |
| Git | 任意 | 版本控制 |
| ngrok | 任意 | 本地 LINE Webhook 測試 |

> Python 不需要在本機安裝，所有執行都在 Docker 容器內。

---

## 專案結構說明

```
Final project/
├── backend/          ← Flask 後端程式碼
│   ├── app.py
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env          ← 你要建立的機密設定檔（不進 git）
├── wiki/             ← 28+ 份 Markdown 知識庫文件
├── pdfs/             ← 爬蟲下載的政府 PDF 原始檔
├── docker-compose.yml
├── parenting_navigator_schema.sql  ← 資料庫 Schema
├── .gitignore
└── .dockerignore
```

---

## 第一步：申請外部服務帳號

### 1-1 LINE Bot

1. 前往 [LINE Developers](https://developers.line.biz/)
2. 建立 Provider → 新增 **Messaging API** Channel
3. 取得：
   - `Channel Access Token`（Messaging API 頁面 → Issue）
   - `Channel Secret`（Basic settings 頁面）
4. Webhook URL 先留空，等第三步取得網址再填

### 1-2 OpenAI

1. 前往 [platform.openai.com](https://platform.openai.com/)
2. API Keys → Create new secret key
3. 複製 `sk-...` 開頭的金鑰

---

## 第二步：建立環境變數檔

```bash
# 在專案根目錄
cp backend/.env.example backend/.env
```

用任何編輯器開啟 `backend/.env`，填入以下內容：

```env
# Flask
FLASK_SECRET_KEY=請自行產生隨機字串（至少32字元，可用 python -c "import secrets; print(secrets.token_hex(32))"）
FLASK_DEBUG=false
FLASK_PORT=5000

# LINE Bot（第一步取得）
LINE_CHANNEL_ACCESS_TOKEN=你的_token
LINE_CHANNEL_SECRET=你的_secret

# MySQL（docker-compose 預設值，本地不需改）
DB_HOST=db
DB_PORT=3306
DB_NAME=parenting_navigator
DB_USER=pnav
DB_PASSWORD=PNav@2025

# OpenAI（第一步取得）
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small

# ChromaDB（Docker 內路徑，不需改）
CHROMA_PERSIST_DIR=/app/chroma_db
CHROMA_COLLECTION=parenting_wiki

# Wiki 路徑（Docker 內路徑，不需改）
WIKI_DIR=/app/wiki

# 推播排程
SCHEDULER_PUSH_HOUR=9
SCHEDULER_PUSH_MINUTE=0
SCHEDULER_TIMEZONE=Asia/Taipei

# RAG 設定
RAG_TOP_K=5
RAG_SCORE_THRESHOLD=0.35
```

> ⚠️ `.env` 絕對不能 git commit，已加入 `.gitignore`。

---

## 第三步：本地啟動（Docker Compose）

### 3-1 一鍵啟動

```bash
# 在專案根目錄執行
docker compose up -d --build
```

第一次會下載 MySQL image 和 build Flask image，約需 3~5 分鐘。

### 3-2 確認服務正常

```bash
# 查看所有容器狀態
docker compose ps

# 應該看到兩個容器都是 running：
# parenting_nav_db   ... Up (healthy)
# parenting_nav_app  ... Up (healthy)
```

如果 app 容器一直重啟，查看 log：
```bash
docker compose logs app --tail 50
```

### 3-3 建立向量知識庫（首次必做）

```bash
# 把所有 wiki/ 資料向量化存入 ChromaDB
docker compose exec app python wiki_loader.py --rebuild
```

> 約需 3~5 分鐘，視 wiki 檔案數量與 OpenAI API 速度。
> 日後 wiki 有新增時，重新跑這個指令即可。

### 3-4 驗證後端正常

```bash
# 健康檢查
curl http://localhost:5000/health
# 應回傳：{"status": "ok"}

# 測試 RAG 問答
curl -X POST http://localhost:5000/chat \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test001","message":"台北市有哪些生育補助？","city":"台北市"}'

# 確認論壇 API
curl http://localhost:5000/forum/categories
```

---

## 第四步：LINE Bot 本地測試

### 4-1 安裝並啟動 ngrok

```bash
# 開新的終端機視窗
ngrok http 5000
```

複製輸出的 `https://xxxx.ngrok-free.app` 網址。

### 4-2 設定 LINE Webhook

1. 到 LINE Developers Console → 你的 Channel → Messaging API
2. Webhook URL 填入：`https://xxxx.ngrok-free.app/webhook`
3. 開啟「Use webhook」
4. 點「Verify」— 看到 **Success** 代表成功

### 4-3 測試完整流程

在 LINE 上加入 Bot 好友，輸入「開始設定」，走完整個建檔流程，確認：
- [ ] 對話狀態機 6 步驟正常
- [ ] 寶寶資料寫入 MySQL
- [ ] RAG 問答有回覆（不是亂說）
- [ ] 回覆格式正常（沒有 `**粗體**` 原文顯示）

---

## 第五步：部署到 Render（正式上線）

### 5-1 推上 GitHub

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

### 5-2 Render 建立 Web Service

1. 前往 [render.com](https://render.com) → New → **Web Service**
2. 連接 GitHub repo
3. 設定：
   - **Runtime**: Docker
   - **Dockerfile Path**: `./backend/Dockerfile`
   - **Docker Build Context**: `.`（專案根目錄，這樣才能 COPY wiki/）
   - **Region**: Singapore（離台灣最近）

### 5-3 設定環境變數

Render Dashboard → Environment → Add Environment Variable，逐一填入（與本地 `.env` 相同，但 `DB_HOST` 改成外部資料庫 IP）：

| Key | Value |
|-----|-------|
| `LINE_CHANNEL_ACCESS_TOKEN` | 你的 token |
| `LINE_CHANNEL_SECRET` | 你的 secret |
| `OPENAI_API_KEY` | sk-... |
| `DB_HOST` | 你的 MySQL 外部 IP |
| `DB_PORT` | 3306 |
| `DB_NAME` | parenting_navigator |
| `DB_USER` | pnav |
| `DB_PASSWORD` | PNav@2025 |
| `FLASK_SECRET_KEY` | 隨機長字串 |
| `FLASK_DEBUG` | false |
| `CHROMA_PERSIST_DIR` | /app/chroma_db |
| `WIKI_DIR` | /app/wiki |
| `SCHEDULER_TIMEZONE` | Asia/Taipei |

> ⚠️ Render 免費方案沒有 Persistent Disk，每次重新部署 `chroma_db/` 會清空。
> 解法：升級 Starter 方案加掛 Disk（$7/月），或部署後手動跑 wiki_loader。

### 5-4 部署完成後

```bash
# 取得 Render 網址（類似）
# https://parenting-navigator-xxxx.onrender.com

# 在 Render Shell 建立向量知識庫
python wiki_loader.py --rebuild

# 更新 LINE Webhook URL
# LINE Developers → Webhook URL →
# https://parenting-navigator-xxxx.onrender.com/webhook
```

### 5-5 更新前端 API 網址

開啟 `parenting-navigator-v5.html`，找到並修改：
```js
const API_BASE = 'https://parenting-navigator-xxxx.onrender.com';
```

---

## 日常維護指令

```bash
# 啟動環境
docker compose up -d

# 停止環境
docker compose down

# 查看即時 log
docker compose logs -f app

# 進入 Flask 容器執行指令
docker compose exec app bash

# 重新建立知識庫（wiki 有新增時）
docker compose exec app python wiki_loader.py --rebuild

# 只重新向量化（MD 已在 MySQL，只要更新 ChromaDB）
docker compose exec app python wiki_loader.py --vectorize-only

# 手動觸發爬蟲
docker compose exec app python crawler.py --run-now

# 進入 MySQL CLI
docker compose exec db mysql -upnav -pPNav@2025 parenting_navigator

# 備份資料庫
docker compose exec db mysqldump -upnav -pPNav@2025 parenting_navigator \
  > backup_$(date +%Y%m%d).sql

# 還原資料庫
docker compose exec db mysql -upnav -pPNav@2025 parenting_navigator \
  < backup_20260101.sql
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

## 帳號密碼一覽（請勿公開）

| 服務 | 帳號 | 密碼 |
|------|------|------|
| MySQL root | root | `Root@PNav2025` |
| MySQL app user | pnav | `PNav@2025` |
| MySQL DB 名稱 | — | `parenting_navigator` |

---

## 常見問題排解

**Q: `docker compose up` 後 app 容器一直重啟**
```bash
docker compose logs app --tail 50
# 最常見原因：
# 1. .env 沒建立或 API key 沒填
# 2. DB 還沒 ready（等 10 秒讓 healthcheck 通過）
# 3. requirements.txt 有套件安裝失敗
```

**Q: `wiki_loader.py --rebuild` 跑完但 RAG 沒有回答**
```bash
# 確認 ChromaDB 有資料
docker compose exec app python -c "
import rag_engine
col = rag_engine._get_chroma_collection()
print('chunk 數量：', col.count())
"
```

**Q: LINE Webhook Verify 失敗**
- 確認 Flask 有在跑：`curl http://localhost:5000/health`
- 確認 ngrok 還在跑（ngrok 免費版 2 小時到期要重啟）
- 確認 `LINE_CHANNEL_SECRET` 設定正確

**Q: RAG 回答帶有 `**粗體**` 原文顯示**
- 已在 `config.py` 的 `SYSTEM_PROMPT` 加入格式規定
- 若仍出現，重啟 Flask 容器使設定生效：`docker compose restart app`

**Q: Render 部署後 ChromaDB 資料消失**
- Render 免費方案沒有持久化 Disk，每次部署都會清空
- 解法 1：Render Dashboard → Disks → Add Disk（掛在 `/app/chroma_db`）
- 解法 2：每次部署後在 Render Shell 執行 `python wiki_loader.py --rebuild`
- 解法 3：改用 Pinecone 等雲端向量資料庫（需修改 rag_engine.py）

**Q: `OPENAI_API_KEY` 沒設定導致 RAG 失敗**
```bash
docker compose exec app python -c "import config; print(config.OPENAI_API_KEY[:10])"
```
