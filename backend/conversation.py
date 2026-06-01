# conversation.py — 對話式設定狀態機
#
# 設計概念：
#   每個 LINE user_id 在設定流程中都有一個「對話狀態」，
#   儲存於 MySQL conversation_state 表（輕量 JSON 欄位）。
#   狀態機步驟：
#
#   IDLE ──[開始設定]──► ASK_CITY
#                              │ (選擇縣市)
#                              ▼
#                         ASK_NICKNAME
#                              │ (輸入暱稱)
#                              ▼
#                         ASK_BIRTHDATE
#                              │ (輸入日期)
#                              ▼
#                         ASK_GENDER
#                              │ (選擇性別)
#                              ▼
#                         ASK_FLAGS
#                              │ (選擇身分別)
#                              ▼
#                         DONE ──► 寫入 DB + 排程推播
#
# 狀態存 MySQL 而非 Redis 是為了降低課程展示的環境依賴；
# 正式產品建議改用 Redis + TTL。

import json
import logging
import re
from datetime import datetime
from typing import Optional, Tuple

import db

logger = logging.getLogger(__name__)

# ── 狀態常數 ──────────────────────────────────────────────────────────────────
STATE_IDLE         = "IDLE"
STATE_ASK_CITY     = "ASK_CITY"
STATE_ASK_NICKNAME = "ASK_NICKNAME"
STATE_ASK_BIRTHDATE= "ASK_BIRTHDATE"
STATE_ASK_GENDER   = "ASK_GENDER"
STATE_ASK_FLAGS    = "ASK_FLAGS"
STATE_DONE         = "DONE"

# 狀態順序（用於進階判斷）
STATE_ORDER = [
    STATE_IDLE, STATE_ASK_CITY, STATE_ASK_NICKNAME,
    STATE_ASK_BIRTHDATE, STATE_ASK_GENDER, STATE_ASK_FLAGS, STATE_DONE,
]

# ── 縣市清單（Quick Reply 用） ────────────────────────────────────────────────
CITIES = [
    "台北市", "新北市", "桃園市", "台中市",
    "台南市", "高雄市", "基隆市", "新竹市",
    "新竹縣", "苗栗縣", "彰化縣", "南投縣",
    "雲林縣", "嘉義市", "嘉義縣", "屏東縣",
    "宜蘭縣", "花蓮縣", "台東縣", "澎湖縣",
    "金門縣", "連江縣",
]

# ── DB 狀態讀寫 ───────────────────────────────────────────────────────────────

def _ensure_state_table() -> None:
    """確保 conversation_state 表存在（首次啟動自動建立）。"""
    sql = """
        CREATE TABLE IF NOT EXISTS conversation_state (
            user_id    VARCHAR(64) NOT NULL,
            state      VARCHAR(30) NOT NULL DEFAULT 'IDLE',
            payload    JSON,
            updated_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
                       ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    """
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()


def get_state(user_id: str) -> Tuple[str, dict]:
    """
    取得使用者當前狀態與暫存資料。
    回傳：(state_str, payload_dict)
    """
    sql = "SELECT state, payload FROM conversation_state WHERE user_id = %s"
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (user_id,))
            row = cur.fetchone()

    if row is None:
        return STATE_IDLE, {}

    payload = row["payload"] if row["payload"] else {}
    # payload 可能已是 dict（MySQLdb 自動解析 JSON），也可能是字串
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            payload = {}
    return row["state"], payload


def set_state(user_id: str, state: str, payload: dict = None) -> None:
    """更新使用者狀態與暫存資料。"""
    sql = """
        INSERT INTO conversation_state (user_id, state, payload)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE
            state      = VALUES(state),
            payload    = VALUES(payload),
            updated_at = NOW()
    """
    payload_json = json.dumps(payload or {}, ensure_ascii=False)
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (user_id, state, payload_json))
        conn.commit()


def reset_state(user_id: str) -> None:
    """重設為 IDLE 狀態（取消設定流程用）。"""
    set_state(user_id, STATE_IDLE, {})


# ── 狀態機核心 ────────────────────────────────────────────────────────────────

class ConversationResult:
    """狀態機處理結果，告訴 app.py 要回覆什麼。"""
    def __init__(self, text: str = None, flex: dict = None,
                 quick_reply_labels: list[str] = None,
                 quick_reply_postbacks: list[Tuple[str, str]] = None,
                 completed: bool = False):
        self.text = text
        self.flex = flex
        self.quick_reply_labels    = quick_reply_labels    or []
        self.quick_reply_postbacks = quick_reply_postbacks or []
        self.completed = completed   # True = 設定流程結束


def handle_message(user_id: str, text: str) -> Optional[ConversationResult]:
    """
    主要狀態機入口。
    若使用者目前不在設定流程中（STATE_IDLE），且訊息不是觸發詞，回傳 None
    （表示交由 RAG 問答處理）。

    Args:
        user_id: LINE user_id
        text:    使用者訊息（已去除首尾空白）

    Returns:
        ConversationResult 或 None
    """
    state, payload = get_state(user_id)

    # ── 觸發詞：進入設定流程 ─────────────────────────────────────────────────
    if text in ("開始設定", "設定寶寶", "新增寶寶", "設定") and state == STATE_IDLE:
        return _enter_ask_city(user_id, payload)

    # ── 取消指令（任意狀態） ─────────────────────────────────────────────────
    if text in ("取消", "cancel", "Cancel") and state != STATE_IDLE:
        reset_state(user_id)
        return ConversationResult(text="❌ 已取消設定，隨時輸入「設定寶寶」重新開始。")

    # ── 非設定流程狀態：交由 RAG 處理 ────────────────────────────────────────
    if state == STATE_IDLE:
        return None

    # ── 依照當前狀態處理輸入 ─────────────────────────────────────────────────
    if state == STATE_ASK_CITY:
        return _handle_city(user_id, text, payload)

    if state == STATE_ASK_NICKNAME:
        return _handle_nickname(user_id, text, payload)

    if state == STATE_ASK_BIRTHDATE:
        return _handle_birthdate(user_id, text, payload)

    if state == STATE_ASK_GENDER:
        return _handle_gender(user_id, text, payload)

    if state == STATE_ASK_FLAGS:
        return _handle_flags(user_id, text, payload)

    # 未知狀態，重設
    reset_state(user_id)
    return ConversationResult(text="發生了一些問題，請重新輸入「設定寶寶」。")


def handle_postback(user_id: str, data: str) -> Optional[ConversationResult]:
    """
    處理 Postback 事件（Quick Reply 選項）。
    data 格式：key=value 或 key=value&key2=value2
    """
    params = dict(kv.split("=", 1) for kv in data.split("&") if "=" in kv)
    state, payload = get_state(user_id)

    # 縣市選擇（設定流程 或 直接選擇）
    if "setup_city" in params:
        if state == STATE_IDLE:
            # 直接設定縣市（不進入寶寶設定流程）
            city = params["setup_city"]
            db.update_user_city(user_id, city)
            return ConversationResult(
                text=f"✅ 戶籍縣市已更新為【{city}】！"
            )
        return _handle_city(user_id, params["setup_city"], payload)

    if "setup_gender" in params and state == STATE_ASK_GENDER:
        return _handle_gender(user_id, params["setup_gender"], payload)

    if "setup_flag" in params and state == STATE_ASK_FLAGS:
        return _handle_flags(user_id, params["setup_flag"], payload)

    return None


# ── 各步驟處理函式 ────────────────────────────────────────────────────────────

def _enter_ask_city(user_id: str, payload: dict) -> ConversationResult:
    """進入「詢問縣市」狀態。"""
    set_state(user_id, STATE_ASK_CITY, payload)

    # 建立縣市 Quick Reply（每排最多 13 個，LINE 上限）
    postbacks = [
        (city, f"setup_city={city}") for city in CITIES[:13]
    ]

    return ConversationResult(
        text=(
            "📍 設定寶寶資料 (1/4)\n\n"
            "請問您的戶籍縣市？\n"
            "（請點選下方選項，或直接輸入縣市名稱）"
        ),
        quick_reply_postbacks=postbacks,
    )


def _handle_city(user_id: str, text: str, payload: dict) -> ConversationResult:
    """處理縣市輸入。"""
    # 清理輸入（允許「台北」「台北市」兩種格式）
    city = text.strip().replace("台", "台")
    if not city.endswith("市") and not city.endswith("縣"):
        # 嘗試補全
        for c in CITIES:
            if city in c:
                city = c
                break

    if city not in CITIES:
        return ConversationResult(
            text=f"❓ 找不到「{text}」，請選擇下方縣市或輸入完整縣市名稱（例如：台北市）。",
            quick_reply_postbacks=[(c, f"setup_city={c}") for c in CITIES[:13]],
        )

    payload["city"] = city
    db.update_user_city(user_id, city)
    set_state(user_id, STATE_ASK_NICKNAME, payload)

    return ConversationResult(
        text=(
            f"✅ 已記錄戶籍縣市：{city}\n\n"
            "📝 設定寶寶資料 (2/4)\n\n"
            "請問寶寶的暱稱？\n"
            "（例如：小寶、妹妹、奕翔）"
        )
    )


def _handle_nickname(user_id: str, text: str, payload: dict) -> ConversationResult:
    """處理暱稱輸入。"""
    nickname = text.strip()[:20]   # 最長 20 字
    if not nickname:
        return ConversationResult(text="❓ 請輸入寶寶暱稱（1~20 個字）。")

    payload["nickname"] = nickname
    set_state(user_id, STATE_ASK_BIRTHDATE, payload)

    return ConversationResult(
        text=(
            f"🍼 暱稱記下來了：{nickname}\n\n"
            "📅 設定寶寶資料 (3/4)\n\n"
            "請輸入寶寶的出生日期：\n"
            "格式：YYYY-MM-DD\n"
            "例如：2024-03-15\n\n"
            "（未出生的寶寶請輸入預產期）"
        )
    )


def _handle_birthdate(user_id: str, text: str, payload: dict) -> ConversationResult:
    """處理出生日期輸入，支援多種格式。"""
    date_str = _parse_date(text.strip())
    if date_str is None:
        return ConversationResult(
            text=(
                "❓ 日期格式不對，請重新輸入：\n"
                "✅ 正確格式：2024-03-15\n"
                "❌ 不支援：2024/3/15 或 113年3月15日"
            )
        )

    payload["birth_date"] = date_str
    set_state(user_id, STATE_ASK_GENDER, payload)

    return ConversationResult(
        text=(
            f"✅ 出生日期：{date_str}\n\n"
            "👶 設定寶寶資料 (4/4)\n\n"
            "請選擇寶寶性別："
        ),
        quick_reply_postbacks=[
            ("男生 👦", "setup_gender=male"),
            ("女生 👧", "setup_gender=female"),
            ("暫不設定", "setup_gender=unknown"),
        ],
    )


def _handle_gender(user_id: str, text: str, payload: dict) -> ConversationResult:
    """處理性別選擇。"""
    gender_map = {
        "male": "male", "male": "male",
        "female": "female",
        "unknown": "unknown",
        "男": "male", "男生": "male", "男生 👦": "male",
        "女": "female", "女生": "female", "女生 👧": "female",
    }
    gender = gender_map.get(text.strip(), "unknown")
    payload["gender"] = gender
    set_state(user_id, STATE_ASK_FLAGS, payload)

    gender_label = {"male": "男生 👦", "female": "女生 👧"}.get(gender, "未設定")

    return ConversationResult(
        text=(
            f"✅ 性別：{gender_label}\n\n"
            "🏷️ 最後一步！\n\n"
            "寶寶是否有以下身分別？\n"
            "（影響補助資格，可跳過）"
        ),
        quick_reply_postbacks=[
            ("低收入戶", "setup_flag=low_income"),
            ("中低收入戶", "setup_flag=mid_low_income"),
            ("身心障礙", "setup_flag=disability"),
            ("早產兒", "setup_flag=preterm"),
            ("都沒有", "setup_flag=none"),
        ],
    )


def _handle_flags(user_id: str, text: str, payload: dict) -> ConversationResult:
    """處理身分別選擇，完成設定流程。"""
    flag_map = {
        "low_income":     "is_low_income",
        "mid_low_income": "is_mid_low_income",
        "disability":     "is_disability",
        "preterm":        "is_preterm",
        "none":           None,
        # 文字輸入支援
        "低收入戶":  "is_low_income",
        "中低收入戶": "is_mid_low_income",
        "身心障礙":  "is_disability",
        "早產兒":    "is_preterm",
        "都沒有":    None,
    }

    flag_key = text.strip()
    # Postback data 格式：setup_flag=low_income
    if flag_key.startswith("setup_flag="):
        flag_key = flag_key.split("=", 1)[1]

    db_flag = flag_map.get(flag_key)
    flags   = {k: 0 for k in ["is_low_income", "is_mid_low_income",
                                "is_disability", "is_preterm"]}
    if db_flag:
        flags[db_flag] = 1

    # 寫入 MySQL
    try:
        child_id = db.upsert_child(
            user_id    = user_id,
            nickname   = payload.get("nickname", "寶寶"),
            birth_date = payload.get("birth_date"),
            gender     = payload.get("gender", "unknown"),
            **flags,
        )

        # 自動排程推播
        from datetime import date
        birth_date_obj = datetime.strptime(payload["birth_date"], "%Y-%m-%d").date()
        push_count = db.generate_push_schedule_for_child(
            child_id, user_id, birth_date_obj
        )

        reset_state(user_id)

        return ConversationResult(
            text=(
                f"🎉 設定完成！\n\n"
                f"寶寶資料：\n"
                f"• 暱稱：{payload.get('nickname','寶寶')}\n"
                f"• 出生日期：{payload.get('birth_date')}\n"
                f"• 戶籍縣市：{payload.get('city','未設定')}\n\n"
                f"已自動安排 {push_count} 筆疫苗與補助提醒 💌\n\n"
                "有任何育兒問題，直接問我就好！"
            ),
            completed=True,
        )

    except Exception as e:
        logger.error("寫入寶寶資料失敗：%s", e, exc_info=True)
        reset_state(user_id)
        return ConversationResult(
            text="😅 資料儲存時遇到問題，請稍後再試一次，或輸入「設定寶寶」重新設定。"
        )


# ── 工具函式 ───────────────────────────────────────────────────────────────────

def _parse_date(text: str) -> Optional[str]:
    """
    嘗試解析多種日期格式，統一回傳 'YYYY-MM-DD'。
    支援：2024-03-15、2024/03/15、20240315
    """
    patterns = [
        (r"(\d{4})[/-](\d{1,2})[/-](\d{1,2})", "%Y-%m-%d"),
        (r"(\d{4})(\d{2})(\d{2})",              "%Y-%m-%d"),
    ]
    for pat, _ in patterns:
        m = re.match(pat, text)
        if m:
            try:
                groups = m.groups()
                date_str = f"{groups[0]}-{int(groups[1]):02d}-{int(groups[2]):02d}"
                # 驗證日期合法性
                datetime.strptime(date_str, "%Y-%m-%d")
                return date_str
            except ValueError:
                continue
    return None
