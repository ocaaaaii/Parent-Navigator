# 育兒導航全攻略 — 完整部署上架流程

> 照著這份文件一步一步做，就能把系統從零跑到線上。
> 打 ✅ 代表完成，打 ❌ 代表還沒做。

---

## 第零步：系統需求確認

| 工具 | 版本 | 用途 |
|------|------|------|
| Python | ≥ 3.11 | 後端語言 |
| Docker | ≥ 24 | 跑 MySQL |
| Git | 任意 | 版本控制 |
| ngrok | 任意 | 本地測試用 |

---

## 第一步：MySQL — 用 Docker 啟動（Linux 環境）

### 1-1 啟動 MySQL 容器

```bash
docker run -d \
  --name parenting-mysql \
  --restart always \
  -e MYSQL_ROOT_PASSWORD=Root@PNav2025 \
  -e MYSQL_DATABASE=parenting_nav \
  -e MYSQL_USER=pnav \
  -e MYSQL_PASSWORD=PNav@2025 \
  -p 3306:3306 \
  -v parenting_mysql_data:/var/lib/mysql \
  mysql:8.0 \
  --character-set-server=utf8mb4 \
  --collation-server=utf8mb4_unicode_ci
```

> 💡 `-v parenting_mysql_data:/var/lib/mysql` 讓資料持久化，重啟 Docker 不會消失。

### 1-2 確認容器正常運行

```bash
docker ps | grep parenting-mysql
# 看到 Up xx seconds 代表成功

docker logs parenting-mysql --tail 20
# 看到 /usr/sbin/mysqld: ready for connections 代表就緒
```

### 1-3 匯入資料庫 Schema

```bash
# 匯入主 schema（8 張表）
docker exec -i parenting-mysql mysql \
  -upnav -p'PNav@2025' parenting_nav \
  < backend/parenting_navigator_schema.sql

# 匯入論壇 schema（auth + forum 表）
docker exec -i parenting-mysql mysql \
  -upnav -p'PNav@2025' parenting_nav \
  < backend/forum_schema.sql
```

### 1-4 驗證資料表是否建立成功

```bash
docker exec -it parenting-mysql mysql -upnav -p'PNav@2025' parenting_nav -e "SHOW TABLES;"
```

應該看到：
```
users, children, milestones, push_schedule, wiki_articles,
rag_chunks, crawl_log, conversation_state,
web_users, forum_categories, forum_posts, forum_comments,
post_likes, comment_likes
```

---

## 第二步：申請外部服務帳號

### 2-1 LINE Bot

1. 前往 [LINE Developers](https://developers.line.biz/)
2. 建立 Provider → 新增 **Messaging API** Channel
3. 取得：
   - `Channel Access Token`（Messaging API 頁面 → Issue）
   - `Channel Secret`（Basic settings 頁面）
4. 先不填 Webhook URL，等第三步取得網址再回來填

### 2-2 OpenAI

1. 前往 [platform.openai.com](https://platform.openai.com/)
2. API Keys → Create new secret key
3. 複製 `sk-...` 開頭的金鑰

---

## 第三步：後端環境設定

### 3-1 複製並填寫環境變數

```bash
cd backend/
cp .env.example .env
nano .env   # 或用任何編輯器
```

填入以下內容（DB 資訊直接複製，其他自行填入）：

```env
# Flask
FLASK_SECRET_KEY=請自行產生一個隨機字串（至少32字元）
FLASK_DEBUG=false
FLASK_PORT=5000

# LINE Bot（第二步取得）
LINE_CHANNEL_ACCESS_TOKEN=你的_token
LINE_CHANNEL_SECRET=你的_secret

# MySQL（已確定的值）
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=parenting_nav
DB_USER=pnav
DB_PASSWORD=PNav@2025

# OpenAI（第二步取得）
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small

# ChromaDB
CHROMA_PERSIST_DIR=./chroma_db
CHROMA_COLLECTION=parenting_wiki

# Wiki & Crawler
WIKI_DIR=./wiki

# 推播排程（每天早上9點台北時間）
SCHEDULER_PUSH_HOUR=9
SCHEDULER_PUSH_MINUTE=0
SCHEDULER_TIMEZONE=Asia/Taipei
```

### 3-2 安裝 Python 套件

```bash
cd backend/
pip install -r requirements.txt
```

---

## 第四步：載入知識庫（Wiki + PDF → ChromaDB）

```bash
cd backend/

# 確認 wiki/ 資料夾有 .md 和 .pdf 檔案
ls ../wiki/

# 載入全部（MD + PDF 都會被處理）
python wiki_loader.py

# 只向量化（如果 MD 已存在 MySQL，只需重新 embedding）
python wiki_loader.py --vectorize-only
```

> 第一次跑約需 3~5 分鐘（視 wiki 檔案數量與 OpenAI API 速度）。

---

## 第五步：本地測試

### 5-1 啟動 Flask

```bash
cd backend/
python app.py
# 看到 Scheduler 啟動完成 代表成功
```

### 5-2 用 ngrok 開通道（另開終端機）

```bash
ngrok http 5000
# 複製 https://xxxx.ngrok-free.app 這個網址
```

### 5-3 設定 LINE Webhook

1. 到 LINE Developers Console → 你的 Channel → Messaging API
2. Webhook URL 填入：`https://xxxx.ngrok-free.app/webhook`
3. 開啟「Use webhook」開關
4. 點「Verify」— 看到 Success 代表成功

### 5-4 測試 API

```bash
# 健康檢查
curl http://localhost:5000/health

# 測試聊天 API
curl -X POST http://localhost:5000/chat \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test001","message":"台北市有哪些生育補助？","city":"台北市"}'

# 取得論壇板塊
curl http://localhost:5000/forum/categories
```

---

## 第六步：部署到 Render（正式上線）

### 6-1 把程式碼推上 GitHub

```bash
# 在 backend/ 目錄
git init
git add .
git commit -m "init: 育兒導航 Agent 後端"

# 建立 GitHub repo（網頁操作）然後：
git remote add origin https://github.com/你的帳號/parenting-navigator.git
git push -u origin main
```

### 6-2 建立 Render Web Service

1. 前往 [render.com](https://render.com) → New → **Web Service**
2. 連接你的 GitHub repo
3. 設定：
   - **Runtime**: Docker
   - **Dockerfile Path**: `./Dockerfile`
   - **Region**: Singapore（離台灣最近）

### 6-3 設定環境變數（重要！）

在 Render Dashboard → Environment → Add Environment Variable，逐一填入：

| Key | Value |
|-----|-------|
| `LINE_CHANNEL_ACCESS_TOKEN` | 你的 token |
| `LINE_CHANNEL_SECRET` | 你的 secret |
| `OPENAI_API_KEY` | sk-... |
| `DB_HOST` | 你的 MySQL 主機 IP |
| `DB_PORT` | 3306 |
| `DB_NAME` | parenting_nav |
| `DB_USER` | pnav |
| `DB_PASSWORD` | PNav@2025 |
| `FLASK_SECRET_KEY` | 隨機長字串 |
| `FLASK_DEBUG` | false |
| `SCHEDULER_TIMEZONE` | Asia/Taipei |

> ⚠️ DB_HOST 若 MySQL 在你自己的 Linux 主機上，需要填**主機對外 IP**，
> 並確認 MySQL 的防火牆允許 Render IP 連入（或用 Render 的 Private DB）。

### 6-4 部署並取得網址

1. 點 **Deploy** — 等待 3~5 分鐘建置完成
2. 取得類似 `https://parenting-navigator-xxxx.onrender.com` 的網址
3. 測試：`curl https://parenting-navigator-xxxx.onrender.com/health`

### 6-5 更新 LINE Webhook URL

回到 LINE Developers Console，把 Webhook URL 改成：
```
https://parenting-navigator-xxxx.onrender.com/webhook
```

### 6-6 在 Render 上執行 Wiki 載入

Render Dashboard → 你的服務 → **Shell** → 執行：
```bash
python wiki_loader.py
```

### 6-7 更新前端 API 網址

開啟 `parenting-navigator-v5.html`，修改第 933 行：
```js
// 改成你的 Render 網址
const API_BASE = 'https://parenting-navigator-xxxx.onrender.com';
```

---

## 第七步：Docker MySQL 日常維護指令

```bash
# 啟動 MySQL 容器
docker start parenting-mysql

# 停止
docker stop parenting-mysql

# 查看 log
docker logs parenting-mysql --tail 50

# 進入 MySQL CLI
docker exec -it parenting-mysql mysql -upnav -p'PNav@2025' parenting_nav

# 備份資料庫
docker exec parenting-mysql mysqldump \
  -upnav -p'PNav@2025' parenting_nav \
  > backup_$(date +%Y%m%d).sql

# 還原資料庫
docker exec -i parenting-mysql mysql \
  -upnav -p'PNav@2025' parenting_nav \
  < backup_20250601.sql

# 手動執行爬蟲更新知識庫
cd backend/
python crawler.py --run-now

# 只重新向量化（知識庫有更新時）
python wiki_loader.py --vectorize-only
```

---

## 完整系統 API 一覽

| 方法 | 路由 | 說明 | 需登入 |
|------|------|------|--------|
| POST | `/webhook` | LINE Bot Webhook | — |
| GET  | `/health` | 健康檢查 | — |
| POST | `/chat` | 網頁聊天 API | — |
| POST | `/auth/register` | 註冊 | — |
| POST | `/auth/login` | 登入 | — |
| POST | `/auth/logout` | 登出 | — |
| GET  | `/auth/me` | 取得個人資料 | ✅ |
| PATCH| `/auth/me` | 更新個人資料 | ✅ |
| GET  | `/forum/categories` | 板塊列表 | — |
| GET  | `/forum/posts` | 貼文列表（?category=&sort=&page=）| — |
| POST | `/forum/posts` | 發文 | ✅ |
| GET  | `/forum/posts/<id>` | 單篇貼文+留言 | — |
| DELETE| `/forum/posts/<id>` | 刪除貼文 | ✅ |
| POST | `/forum/posts/<id>/comments` | 留言 | ✅ |
| POST | `/forum/posts/<id>/like` | 按讚/取消 | ✅ |
| POST | `/forum/comments/<id>/like` | 留言按讚 | ✅ |
| GET  | `/forum/hot` | 熱門貼文 | — |

---

## 帳號密碼一覽（請勿公開）

| 服務 | 帳號 | 密碼 |
|------|------|------|
| MySQL root | root | `Root@PNav2025` |
| MySQL app user | pnav | `PNav@2025` |
| MySQL DB name | — | `parenting_nav` |

---

## 常見問題排解

**Q: `docker: command not found`**
```bash
# Ubuntu/Debian 安裝 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# 重新登入後生效
```

**Q: MySQL 連線失敗 `Connection refused`**
```bash
docker ps   # 確認容器有在跑
docker logs parenting-mysql --tail 20   # 看錯誤訊息
# 最常見原因：容器還在初始化，等 30 秒再試
```

**Q: `OPENAI_API_KEY` 沒設定導致 RAG 失敗**
```bash
# 確認 .env 有設定
grep OPENAI_API_KEY backend/.env
# 確認 Python 有讀到
python -c "import config; print(config.OPENAI_API_KEY[:10])"
```

**Q: LINE Webhook Verify 失敗**
- 確認 Flask 有在跑（`/health` 要能打通）
- 確認 ngrok / Render 網址正確
- 確認 `LINE_CHANNEL_SECRET` 設定正確

**Q: ChromaDB 向量資料消失（Render 重新部署後）**
- Render 免費方案沒有持久化 Disk，每次部署都會重置
- 解法1：升級 Render Starter 方案加 Disk（$7/月）
- 解法2：部署後手動跑 `python wiki_loader.py`
- 解法3：改用 Pinecone 等雲端向量資料庫
