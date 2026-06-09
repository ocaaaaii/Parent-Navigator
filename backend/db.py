# db.py — PostgreSQL 連線池與核心查詢函式
# 使用 psycopg2 + ThreadedConnectionPool（thread-safe）
# 已從 MySQL 遷移至 Supabase PostgreSQL；所有 SQL 皆使用參數化查詢
# 注意：psycopg2 佔位符為 %s（與 PyMySQL 相同），但語法細節不同

import logging
from contextlib import contextmanager
from typing import Optional

import psycopg2
import psycopg2.extras          # RealDictCursor（回傳 dict）
from psycopg2.pool import ThreadedConnectionPool

import config

logger = logging.getLogger(__name__)

# ── 連線池初始化 ────────────────────────────────────────────────────────────────

_pool: Optional[ThreadedConnectionPool] = None


def get_pool() -> ThreadedConnectionPool:
    """取得（或初始化）全域連線池，Flask app 啟動時呼叫一次即可。"""
    global _pool
    if _pool is None:
        if not config.DATABASE_URL:
            raise RuntimeError("環境變數 DATABASE_URL 未設定，請檢查 .env 或 Render 設定")
        _pool = ThreadedConnectionPool(
            minconn=config.DB_POOL_MIN,
            maxconn=config.DB_POOL_MAX,
            dsn=config.DATABASE_URL,
        )
        logger.info(
            "PostgreSQL 連線池初始化完成（min=%d, max=%d）",
            config.DB_POOL_MIN, config.DB_POOL_MAX,
        )
    return _pool


@contextmanager
def get_conn():
    """
    Context manager：自動取出 / 歸還連線，發生例外時自動 rollback。
    cursor_factory 設為 RealDictCursor，讓 fetchall/fetchone 直接回傳 dict。

    用法：
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(...)
            conn.commit()
    """
    pool = get_pool()
    conn = pool.getconn()
    # 設定 cursor_factory 讓所有 cursor 回傳 dict
    conn.cursor_factory = psycopg2.extras.RealDictCursor
    try:
        yield conn
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)   # 歸還至連線池（不是真的關閉）


# ── 使用者與小孩資料 ────────────────────────────────────────────────────────────

def get_user_context(user_id: str) -> dict:
    """
    根據 LINE user_id 拉取「使用者 + 小孩」的完整上下文。
    用於 Context Enrichment，讓 RAG 查詢時可以帶入縣市與小孩年齡。

    回傳範例：
    {
        "user_id": "U1234...",
        "household_city": "台北市",
        "notify_enabled": True,
        "children": [
            {"child_id": 1, "nickname": "小寶", "birth_date": date(2024,3,1),
             "age_days": 120, "is_low_income": False, ...}
        ]
    }
    """
    sql_user = """
        SELECT user_id, household_city, notify_enabled, notify_hour
        FROM users
        WHERE user_id = %s
    """
    # PostgreSQL 日期差：(CURRENT_DATE - birth_date) 回傳 interval，轉 int 需取 .days
    # 或使用 EXTRACT(epoch FROM ...) / 86400；這裡直接用整數除法
    sql_children = """
        SELECT
            child_id,
            nickname,
            birth_date,
            (CURRENT_DATE - birth_date)::int                   AS age_days,
            ((CURRENT_DATE - birth_date) / 30)::int            AS age_months,
            gender,
            is_low_income,
            is_mid_low_income,
            is_disability,
            is_preterm
        FROM children
        WHERE user_id = %s AND is_active = TRUE
        ORDER BY birth_date DESC
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql_user, (user_id,))
            user = cur.fetchone()

            if user is None:
                user = _create_user(conn, user_id)

            cur.execute(sql_children, (user_id,))
            children = cur.fetchall()

    result = dict(user)
    result["children"] = [dict(c) for c in children] if children else []
    return result


def _create_user(conn, user_id: str) -> dict:
    """新使用者第一次互動時，自動插入 users 資料列。"""
    sql = """
        INSERT INTO users (user_id, created_at)
        VALUES (%s, NOW())
        ON CONFLICT (user_id) DO NOTHING
    """
    with conn.cursor() as cur:
        cur.execute(sql, (user_id,))
    conn.commit()
    logger.info("新使用者建立：%s", user_id)
    return {
        "user_id":        user_id,
        "household_city": None,
        "notify_enabled": True,
        "notify_hour":    9,
    }


def upsert_child(user_id: str, nickname: str, birth_date: str,
                 gender: str = "unknown", **flags) -> int:
    """
    新增或更新小孩資料。
    birth_date 格式：'YYYY-MM-DD'
    回傳 child_id（用 RETURNING 取得）。
    """
    sql = """
        INSERT INTO children
            (user_id, nickname, birth_date, gender,
             is_low_income, is_mid_low_income, is_disability, is_preterm)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (user_id, nickname, birth_date) DO UPDATE SET
            gender        = EXCLUDED.gender,
            updated_at    = NOW()
        RETURNING child_id
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (
                user_id, nickname, birth_date, gender,
                bool(flags.get("is_low_income", False)),
                bool(flags.get("is_mid_low_income", False)),
                bool(flags.get("is_disability", False)),
                bool(flags.get("is_preterm", False)),
            ))
            child_id = cur.fetchone()["child_id"]
        conn.commit()
    logger.info("小孩資料 upsert：child_id=%d, user=%s", child_id, user_id)
    return child_id


def update_user_city(user_id: str, city: str) -> None:
    """更新使用者戶籍縣市（Postback 選單觸發）。"""
    sql = """
        INSERT INTO users (user_id, household_city, created_at)
        VALUES (%s, %s, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
            household_city = EXCLUDED.household_city
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (user_id, city))
        conn.commit()


# ── 推播排程相關 ─────────────────────────────────────────────────────────────────

def get_today_pushes() -> list[dict]:
    """
    查詢今日待推播的所有記錄。
    APScheduler 每日早上呼叫一次。
    """
    sql = """
        SELECT
            ps.schedule_id,
            ps.user_id,
            c.nickname,
            m.label,
            m.message_template,
            m.priority,
            u.notify_hour
        FROM push_schedule ps
        JOIN children   c ON ps.child_id     = c.child_id
        JOIN milestones m ON ps.milestone_id  = m.milestone_id
        JOIN users      u ON ps.user_id       = u.user_id
        WHERE ps.scheduled_date = CURRENT_DATE
          AND ps.status         = 'pending'
          AND c.is_active       = TRUE
          AND u.notify_enabled  = TRUE
          AND m.is_active       = TRUE
        ORDER BY m.priority DESC, u.notify_hour ASC
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            return [dict(r) for r in cur.fetchall()]


def mark_push_status(schedule_id: int, status: str,
                     error_msg: str = None) -> None:
    """更新推播狀態：sent / skipped / failed。"""
    sql = """
        UPDATE push_schedule
        SET status = %s, sent_at = NOW(), error_message = %s
        WHERE schedule_id = %s
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (status, error_msg, schedule_id))
        conn.commit()


def generate_push_schedule_for_child(child_id: int, user_id: str,
                                     birth_date) -> int:
    """
    新增小孩後，根據 milestones 表自動計算並批次插入 push_schedule。
    birth_date: datetime.date 物件
    回傳：插入的筆數
    """
    from datetime import date, timedelta
    from dateutil.relativedelta import relativedelta

    sql_milestones = """
        SELECT milestone_id, trigger_type, trigger_value, notify_days_before
        FROM milestones
        WHERE is_active = TRUE
    """
    insert_sql = """
        INSERT INTO push_schedule
            (child_id, user_id, milestone_id, scheduled_date, status)
        VALUES (%s, %s, %s, %s, 'pending')
        ON CONFLICT (child_id, milestone_id, scheduled_date) DO NOTHING
    """

    inserted = 0
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql_milestones)
            milestones = [dict(r) for r in cur.fetchall()]

        rows = []
        for m in milestones:
            scheduled_date = _calc_scheduled_date(
                birth_date, m["trigger_type"], m["trigger_value"],
                m["notify_days_before"]
            )
            if scheduled_date is None:
                continue
            if scheduled_date < date.today():
                continue  # 過去的里程碑不排
            rows.append((child_id, user_id, m["milestone_id"], scheduled_date))

        if rows:
            with conn.cursor() as cur:
                psycopg2.extras.execute_batch(cur, insert_sql, rows)
            conn.commit()
            inserted = len(rows)

    logger.info("child_id=%d 共排入 %d 筆推播", child_id, inserted)
    return inserted


def _calc_scheduled_date(birth_date, trigger_type: str,
                          trigger_value: int, notify_days_before: int):
    """根據 trigger_type 計算里程碑日期，再減去提前通知天數。"""
    from datetime import date, timedelta
    from dateutil.relativedelta import relativedelta

    try:
        if trigger_type == "age_days":
            milestone_date = birth_date + timedelta(days=trigger_value)
        elif trigger_type == "age_months":
            milestone_date = birth_date + relativedelta(months=trigger_value)
        elif trigger_type == "age_years":
            milestone_date = birth_date + relativedelta(years=trigger_value)
        else:
            return None

        return milestone_date - timedelta(days=notify_days_before)
    except Exception as e:
        logger.warning("計算 scheduled_date 失敗：%s", e)
        return None


# ── RAG 相關 ──────────────────────────────────────────────────────────────────

def get_pending_chunks() -> list[dict]:
    """取出尚未向量化的 wiki 片段（is_indexed=FALSE）。"""
    sql = """
        SELECT rc.chunk_id, rc.chunk_text, rc.meta_cities,
               wa.filename, wa.title
        FROM rag_chunks rc
        JOIN wiki_articles wa ON rc.article_id = wa.article_id
        WHERE rc.is_indexed = FALSE AND wa.is_active = TRUE
        ORDER BY rc.chunk_id
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            return [dict(r) for r in cur.fetchall()]


def save_chunk_embedding(chunk_id: int, embedding: list[float]) -> None:
    """
    將 OpenAI embedding 向量存入 rag_chunks，並標記 is_indexed=TRUE。
    embedding: list of float（長度 1536，對應 text-embedding-3-small）
    """
    sql = """
        UPDATE rag_chunks
        SET embedding  = %s::vector,
            is_indexed = TRUE
        WHERE chunk_id = %s
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # psycopg2 傳入 list，pgvector 驅動會自動序列化為 '[x,y,z,...]' 格式
            cur.execute(sql, (embedding, chunk_id))
        conn.commit()


def batch_save_embeddings(chunk_embedding_pairs: list[tuple]) -> None:
    """
    批次儲存 embedding，減少 DB 往返。
    chunk_embedding_pairs: [(chunk_id, embedding_list), ...]
    """
    sql = """
        UPDATE rag_chunks
        SET embedding  = %s::vector,
            is_indexed = TRUE
        WHERE chunk_id = %s
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # 注意欄位順序：embedding 在前，chunk_id 在後（對應 SQL %s 順序）
            psycopg2.extras.execute_batch(
                cur,
                sql,
                [(emb, cid) for cid, emb in chunk_embedding_pairs],
                page_size=50,
            )
        conn.commit()
    logger.info("批次儲存 %d 筆 embedding", len(chunk_embedding_pairs))


# ── 對話狀態機 ────────────────────────────────────────────────────────────────

def get_conversation_state(user_id: str) -> dict:
    """取得使用者目前的對話狀態（state + temp_data）。"""
    sql = """
        SELECT state, temp_data FROM conversation_state WHERE user_id = %s
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (user_id,))
            row = cur.fetchone()
    if row:
        return {"state": row["state"], "temp_data": row["temp_data"] or {}}
    return {"state": "IDLE", "temp_data": {}}


def set_conversation_state(user_id: str, state: str, temp_data: dict = None) -> None:
    """更新對話狀態機。"""
    import json
    sql = """
        INSERT INTO conversation_state (user_id, state, temp_data, updated_at)
        VALUES (%s, %s, %s::jsonb, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
            state      = EXCLUDED.state,
            temp_data  = EXCLUDED.temp_data,
            updated_at = NOW()
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (user_id, state, json.dumps(temp_data or {}, ensure_ascii=False)))
        conn.commit()
