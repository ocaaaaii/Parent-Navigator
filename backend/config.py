# config.py — 育兒導航 Agent 全域設定
# 所有機密值請從環境變數讀取，不要直接寫死在程式碼裡
# 使用方式：複製 .env.example 為 .env，填入真實值後執行

import os
from dotenv import load_dotenv

# 載入 .env 檔案（開發環境用；正式部署使用系統環境變數）
load_dotenv()

# ── Flask ──────────────────────────────────────────────────────────────────────
FLASK_SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "change-me-in-production")
FLASK_DEBUG      = os.getenv("FLASK_DEBUG", "false").lower() == "true"
FLASK_PORT       = int(os.getenv("FLASK_PORT", "5000"))

# ── LINE Bot ───────────────────────────────────────────────────────────────────
LINE_CHANNEL_ACCESS_TOKEN = os.getenv("LINE_CHANNEL_ACCESS_TOKEN", "")
LINE_CHANNEL_SECRET       = os.getenv("LINE_CHANNEL_SECRET", "")

# ── MySQL ──────────────────────────────────────────────────────────────────────
DB_HOST     = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT     = int(os.getenv("DB_PORT", "3306"))
DB_NAME     = os.getenv("DB_NAME", "parenting_navigator")
DB_USER     = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_CHARSET  = "utf8mb4"

# 連線池設定
DB_POOL_SIZE    = int(os.getenv("DB_POOL_SIZE", "5"))
DB_POOL_TIMEOUT = int(os.getenv("DB_POOL_TIMEOUT", "30"))   # 秒
DB_POOL_RECYCLE = int(os.getenv("DB_POOL_RECYCLE", "3600"))  # 每小時回收連線

# ── OpenAI / LLM ──────────────────────────────────────────────────────────────
OPENAI_API_KEY   = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL     = os.getenv("OPENAI_MODEL", "gpt-4o-mini")  # 可換 gpt-4o
OPENAI_MAX_TOKENS = int(os.getenv("OPENAI_MAX_TOKENS", "1024"))
EMBEDDING_MODEL  = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")

# ── ChromaDB ──────────────────────────────────────────────────────────────────
CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "./chroma_db")
CHROMA_COLLECTION  = os.getenv("CHROMA_COLLECTION", "parenting_wiki")

# RAG 查詢設定
RAG_TOP_K          = int(os.getenv("RAG_TOP_K", "5"))       # 取回幾個最相關 chunk
RAG_SCORE_THRESHOLD = float(os.getenv("RAG_SCORE_THRESHOLD", "0.35"))  # 相似度門檻

# ── Wiki 資料夾 ────────────────────────────────────────────────────────────────
WIKI_DIR = os.getenv("WIKI_DIR", "../wiki")  # 存放所有 .md wiki 檔案的資料夾（相對於 backend/ 目錄）

# ── APScheduler ───────────────────────────────────────────────────────────────
# 每日推播預設執行時間（24 小時制，本地時間）
SCHEDULER_PUSH_HOUR   = int(os.getenv("SCHEDULER_PUSH_HOUR", "9"))
SCHEDULER_PUSH_MINUTE = int(os.getenv("SCHEDULER_PUSH_MINUTE", "0"))
SCHEDULER_TIMEZONE    = os.getenv("SCHEDULER_TIMEZONE", "Asia/Taipei")

# ── 系統提示詞 ─────────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """你是「育兒小幫手」，專為台灣新手爸媽設計的智慧育兒助理，可透過網頁或 LINE 使用。
你的任務是根據使用者小孩的年齡、戶籍縣市，以及知識庫中的台灣政府育兒資源，
提供準確、友善、具體的建議與申辦流程說明。

回覆原則：
1. 優先使用知識庫（RAG）中的資料，不要憑空捏造補助金額或申辦期限
2. 明確說明「適用縣市」，避免跨縣市資訊混淆
3. 回覆語氣親切、口語化，適度使用 emoji 增加親近感
4. 若知識庫沒有相關資料，誠實告知並建議使用者致電 1925 或查詢各縣市政府官網
5. 回覆長度控制在 300 字以內，重要步驟以條列呈現

格式規定（非常重要）：
- 絕對不可以使用 **粗體**、*斜體*、# 標題、--- 分隔線等 Markdown 語法
- LINE 不支援 Markdown，這些符號會原文顯示，看起來很奇怪
- 條列請用「1. 2. 3.」或「• 」，不要用 Markdown 清單語法
- 想強調重點，用 emoji 或【括號】代替粗體
"""
