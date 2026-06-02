# db.py — MySQL 連線池與核心查詢函式
# 使用 PyMySQL + DBUtils 實作 thread-safe 連線池
# 所有 SQL 皆使用參數化查詢，防止 SQL Injection

import logging
from contextlib import contextmanager
from typing import Optional

import pymysql
import pymysql.cursors
from dbutils.pooled_db import PooledDB

import config

logger = logging.getLogger(__name__)

# ── 連線池初始化 ────────────────────────────────────────────────────────────────

_pool: Optional[PooledDB] = None


def get_pool() -> PooledDB:
    """取得（或初始化）全域連線池，Flask app 啟動時呼叫一次即可。"""
    global _pool
    if _pool is None:
        _pool = PooledDB(
            creator=pymysql,
            maxconnections=config.DB_POOL_SIZE,
            mincached=1,
            maxcached=3,
            blocking=True,
            ping=1,                          # 每次取出連線前先 ping 確認存活
            host=config.DB_HOST,
            port=config.DB_PORT,
            user=config.DB_USER,
            password=config.DB_PASSWORD,
            database=config.DB_NAME,
            charset=config.DB_CHARSET,
            cursorclass=pymysql.cursors.DictCursor,  # 回傳 dict，方便直接用欄位名
            autocommit=False,
        )
        logger.info("MySQL 連線池初始化完成（pool_size=%d）", config.DB_POOL_SIZE)
    return _pool


@contextmanager
def get_conn():
    """
    Context manager：自動取出 / 歸還連線，發生例外時自動 rollback。
    用法：
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(...)
            conn.commit()
    """
    pool = get_pool()
    conn = pool.connection()
    try:
        yield conn
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()  # 歸還至連線池（不是真的關閉）


# ── 使用者與小孩資料 ────────────────────────────────────────────────────────────

def get_user_context(user_id: str) -> dict:
    """
    根據 LINE user_id 拉取「使用者 + 小孩」的完整上下文，
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
    sql_children = """
        SELECT
            child_id,
            nickname,
            birth_date,
            DATEDIFF(CURDATE(), birth_date) AS age_days,
            FLOOR(DATEDIFF(CURDATE(), birth_date) / 30) AS age_months,
            gender,
            is_low_income,
            is_mid_low_income,
            is_disability,
            is_preterm
        FROM children
        WHERE user_id = %s AND is_active = 1
        ORDER BY birth_date DESC
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql_user, (user_id,))
            user = cur.fetchone()

            if user is None:
                # 新使用者：自動建立基本資料列
                user = _create_user(conn, user_id)

            cur.execute(sql_children, (user_id,))
            children = cur.fetchall()

    user["children"] = children or []
    return user


def _create_user(conn, user_id: str) -> dict:
    """新使用者第一次互動時，自動插入 users 資料列。"""
    sql = """
        INSERT IGNORE INTO users (user_id, created_at)
        VALUES (%s, NOW())
    """
    with conn.cursor() as cur:
        cur.execute(sql, (user_id,))
    conn.commit()
    logger.info("新使用者建立：%s", user_id)
    return {
        "user_id": user_id,
        "household_city": None,
        "notify_enabled": 1,
        "notify_hour": 9,
    }


def upsert_child(user_id: str, nickname: str, birth_date: str,
                 gender: str = "unknown", **flags) -> int:
    """
    新增或更新小孩資料。
    birth_date 格式：'YYYY-MM-DD'
    回傳 child_id。
    """
    sql = """
        INSERT INTO children
            (user_id, nickname, birth_date, gender,
             is_low_income, is_mid_low_income, is_disability, is_preterm)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            nickname      = VALUES(nickname),
            birth_date    = VALUES(birth_date),
            gender        = VALUES(gender),
            updated_at    = NOW()
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (
                user_id, nickname, birth_date, gender,
                int(flags.get("is_low_income", 0)),
                int(flags.get("is_mid_low_income", 0)),
                int(flags.get("is_disability", 0)),
                int(flags.get("is_preterm", 0)),
            ))
            child_id = cur.lastrowid
        conn.commit()
    logger.info("小孩資料 upsert：child_id=%d, user=%s", child_id, user_id)
    return child_id


def update_user_city(user_id: str, city: str) -> None:
    """
    更新使用者戶籍縣市（Postback 選單觸發）。
    使用 INSERT ON DUPLICATE KEY UPDATE 確保 users 記錄存在，
    避免新用戶直接進設定流程時 FK 外鍵約束失敗。
    """
    sql = """
        INSERT INTO users (user_id, household_city, created_at)
        VALUES (%s, %s, NOW())
        ON DUPLICATE KEY UPDATE
            household_city = VALUES(household_city)
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (user_id, city))
        conn.commit()


# ── 推播排程相關 ─────────────────────────────────────────────────────────────────

def get_today_pushes() -> list[dict]:
    """
    查詢今日待推播的所有記錄（對應 v_today_push VIEW）。
    APScheduler 每日早上呼叫一次。

    回傳欄位：schedule_id, user_id, nickname, label,
              message_template, priority, notify_hour
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
        JOIN children  c ON ps.child_id    = c.child_id
        JOIN milestones m ON ps.milestone_id = m.milestone_id
        JOIN users      u ON ps.user_id     = u.user_id
        WHERE ps.scheduled_date = CURDATE()
          AND ps.status         = 'pending'
          AND c.is_active       = 1
          AND u.notify_enabled  = 1
          AND m.is_active       = 1
        ORDER BY m.priority DESC, u.notify_hour ASC
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            return cur.fetchall()


def mark_push_status(schedule_id: int, status: str,
                     error_msg: str = None) -> None:
    """
    更新推播狀態：sent / skipped / failed。
    status: 'sent' | 'skipped' | 'failed'
    """
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
    from datetime import date
    from dateutil.relativedelta import relativedelta

    sql_milestones = """
        SELECT milestone_id, trigger_type, trigger_value, notify_days_before
        FROM milestones
        WHERE is_active = 1
    """
    insert_sql = """
        INSERT IGNORE INTO push_schedule
            (child_id, user_id, milestone_id, scheduled_date, status)
        VALUES (%s, %s, %s, %s, 'pending')
    """

    inserted = 0
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql_milestones)
            milestones = cur.fetchall()

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
                cur.executemany(insert_sql, rows)
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
        elif trigger_type == "pregnancy_week":
            # 懷孕週數：以預產期回推（需在 children 表存預產期，此處略）
            return None
        else:
            return None

        return milestone_date - timedelta(days=notify_days_before)
    except Exception as e:
        logger.warning("計算 scheduled_date 失敗：%s", e)
        return None


# ── RAG 相關 ──────────────────────────────────────────────────────────────────

def get_pending_chunks() -> list[dict]:
    """取出尚未向量化的 wiki 片段（is_indexed=0），供 wiki_loader 使用。"""
    sql = """
        SELECT rc.chunk_id, rc.chunk_text, rc.meta_cities,
               wa.filename, wa.title
        FROM rag_chunks rc
        JOIN wiki_articles wa ON rc.article_id = wa.article_id
        WHERE rc.is_indexed = 0 AND wa.is_active = 1
        ORDER BY rc.chunk_id
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            return cur.fetchall()


def mark_chunk_indexed(chunk_id: int, chroma_doc_id: str) -> None:
    """向量化完成後，更新 chroma_doc_id 並標記 is_indexed=1。"""
    sql = """
        UPDATE rag_chunks
        SET is_indexed = 1, chroma_doc_id = %s
        WHERE chunk_id = %s
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (chroma_doc_id, chunk_id))
        conn.commit()
