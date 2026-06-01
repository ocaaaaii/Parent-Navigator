# 育兒導航全攻略

**基於 RAG 與時序提醒之新手爸媽智慧應援 Agent**

> 上架與部署流程請見 [DEPLOY.md](./DEPLOY.md)

---

## 系統架構

```
使用者（LINE / 網頁）
        │
        ▼
┌─────────────────────────────────┐
│         Flask Backend           │
│  ┌──────────┐  ┌─────────────┐  │
│  │LINE      │  │REST /chat   │  │
│  │Webhook   │  │API          │  │
│  └────┬─────┘  └──────┬──────┘  │
│       │               │         │
│  ┌────▼───────────────▼──────┐  │
│  │      核心模組               │  │
│  │  conversation.py  狀態機   │  │
│  │  rag_engine.py    問答引擎  │  │
│  │  scheduler.py     推播排程  │  │
│  │  forum.py         論壇 API  │  │
│  └────────────────────────────┘  │
└──────────┬──────────────────────┘
           │
    ┌──────┴───────┐
    │              │
┌───▼───┐    ┌─────▼────┐    ┌──────────┐
│ MySQL │    │ChromaDB  │    │OpenAI API│
│users  │    │向量知識庫 │    │GPT-4o    │
│children│   │26+ wikis │    │Embedding │
│forum  │    │          │    │          │
└───────┘    └──────────┘    └──────────┘
                  ▲
         ┌────────┘
    ┌────┴──────┐
    │crawler.py │  每週一 02:00 自動爬蟲更新
    │wiki_loader│  PDF / MD 向量化
    └───────────┘
```

---

## 技術架構

### 後端

| 模組 | 說明 |
|------|------|
| `app.py` | Flask 主程式，整合 LINE Webhook 與 REST API |
| `rag_engine.py` | ChromaDB 向量搜尋 + Context Enrichment + GPT-4o-mini 生成 |
| `conversation.py` | 6 步驟對話狀態機（IDLE → ASK_CITY → … → DONE），狀態存於 MySQL |
| `scheduler.py` | APScheduler：每日 09:00 推播里程碑，每週一 02:00 觸發爬蟲 |
| `wiki_loader.py` | 解析 `.md` 與 `.pdf`，切塊向量化存入 ChromaDB，並將時序規則寫入 MySQL |
| `crawler.py` | BeautifulSoup 爬取 5 個政府網站，MD5 hash 比對後自動更新知識庫 |
| `flex_templates.py` | LINE Flex Message 卡片模板（推播通知、RAG 回覆、歡迎卡） |
| `auth.py` | 網頁版帳號系統（bcrypt 雜湊、Flask Session） |
| `forum.py` | Dcard 風格社群論壇 API（5 大板塊、匿名發文、巢狀留言、按讚） |
| `db.py` | PyMySQL + DBUtils 連線池，封裝常用查詢 |
| `config.py` | 從 `.env` 讀取所有環境變數 |

### 前端

| 檔案 | 說明 |
|------|------|
| `parenting-navigator-v5.html` | 單頁式網站，右下角浮動聊天 Widget，呼叫 `/chat` API |

### 資料庫

| 表格 | 用途 |
|------|------|
| `users` | LINE 使用者資料（戶籍縣市） |
| `children` | 寶寶基本資料（暱稱、生日、性別） |
| `milestones` | 已觸發的里程碑記錄 |
| `push_schedule` | 待推播事件（疫苗、補助到期） |
| `wiki_articles` | Wiki 文件元資料 |
| `rag_chunks` | 向量化 Chunk 紀錄（供去重） |
| `crawl_log` | 爬蟲執行記錄 |
| `conversation_state` | 對話狀態機當前狀態 |
| `web_users` | 網頁版帳號 |
| `forum_categories` | 論壇板塊（5 類） |
| `forum_posts` | 貼文 |
| `forum_comments` | 留言（支援巢狀） |
| `post_likes` / `comment_likes` | 按讚記錄 |

### 知識庫

- **Wiki 格式**：`.md` 含 YAML Frontmatter（`tags`、`適用縣市`、`時序規則`）
- **PDF 格式**：命名慣例 `縣市_標題.pdf`，自動解析縣市與標題
- **向量化流程**：文字 → 500 字切塊 → OpenAI `text-embedding-3-small` → ChromaDB
- **搜尋策略**：Metadata 過濾 `{$or: [{city: 目標縣市}, {city: 全國}]}`，搭配 Context Enrichment 個人化

---

## 使用介紹

### LINE Bot

1. 加入 LINE Bot 好友後，系統發送歡迎 Flex 卡片
2. 輸入「**設定寶寶**」→ 對話狀態機引導填入戶籍縣市、寶寶暱稱、生日、性別
3. 完成後系統自動計算疫苗與補助時程，寫入推播排程
4. 每日 09:00 若有里程碑到期，主動推播 LINE 通知
5. 任何育兒問題直接輸入文字 → RAG 問答引擎即時回覆（附來源標籤）

**特殊指令**

| 輸入 | 功能 |
|------|------|
| `設定寶寶` / `新增寶寶` | 啟動建檔流程 |
| `我的寶寶` / `查看資料` | 查看已建立的寶寶資料 |
| `今日提醒` | 查看今天的待辦推播 |

### 網頁版

1. 開啟 `parenting-navigator-v5.html`（或部署後的網址）
2. 右下角點擊聊天泡泡開啟浮動視窗
3. 選擇縣市（可選）後直接輸入問題
4. 回覆下方顯示來源 Wiki 標籤與延伸提問快捷鍵

### 論壇

1. 右上角「登入 / 註冊」建立帳號
2. 選擇板塊（補助討論 / 寶寶健康 / 托育分享 / 新手問答 / 生活日常）
3. 發文支援匿名選項；留言支援巢狀回覆
4. 可切換「最新」或「熱門」排序

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

> 部署步驟（Docker MySQL、Render 上架、ngrok 本地測試）請見 **[DEPLOY.md](./DEPLOY.md)**
