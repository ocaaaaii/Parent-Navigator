# app.py — Flask 主程式與 LINE Webhook 處理器（v2，整合 Flex + 對話狀態機）
#
# 架構流程：
#   LINE 使用者傳訊
#     → LINE Platform → POST /webhook
#       → 驗簽（LINE SDK）
#       → 解析事件（Text / Postback / Follow）
#         → conversation.handle_message（對話狀態機優先）
#           → 若 IDLE 且非觸發詞 → RAG 問答
#             → Flex Message 回覆

import atexit
import logging

from flask import Flask, request, abort, jsonify
from flask_cors import CORS

from linebot.v3 import WebhookHandler
from linebot.v3.exceptions import InvalidSignatureError
from linebot.v3.messaging import (
    ApiClient, MessagingApi,
    ReplyMessageRequest, PushMessageRequest,
    TextMessage, FlexMessage, FlexContainer,
    QuickReply, QuickReplyItem,
    MessageAction, PostbackAction,
    Configuration,
)
from linebot.v3.webhooks import (
    MessageEvent, TextMessageContent,
    PostbackEvent, FollowEvent,
)

import config
import db
import rag_engine
import conversation as conv
import flex_templates as flex_t
from scheduler import init_scheduler
from auth import auth_bp
from forum import forum_bp

# ── 日誌設定 ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if config.FLASK_DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Flask App ─────────────────────────────────────────────────────────────────
app = Flask(__name__)
app.secret_key = config.FLASK_SECRET_KEY
CORS(app, resources={r"/chat": {"origins": "*"}, r"/forum/*": {"origins": "*"}, r"/auth/*": {"origins": "*"}})
app.register_blueprint(auth_bp)
app.register_blueprint(forum_bp)

# ── LINE Bot SDK ──────────────────────────────────────────────────────────────
_line_conf = Configuration(access_token=config.LINE_CHANNEL_ACCESS_TOKEN)
handler    = WebhookHandler(config.LINE_CHANNEL_SECRET)

# ── 初始化 ────────────────────────────────────────────────────────────────────
db.get_pool()
conv._ensure_state_table()   # 確保 conversation_state 表存在

# APScheduler
with ApiClient(_line_conf) as _api_client:
    _sched_api = MessagingApi(_api_client)
scheduler = init_scheduler(_sched_api)
atexit.register(lambda: scheduler.shutdown())


# ── Webhook 路由 ──────────────────────────────────────────────────────────────

@app.route("/webhook", methods=["POST"])
def webhook():
    signature = request.headers.get("X-Line-Signature", "")
    body      = request.get_data(as_text=True)
    try:
        handler.handle(body, signature)
    except InvalidSignatureError:
        logger.warning("LINE 簽名驗證失敗")
        abort(400)
    return "OK", 200


@app.route("/health", methods=["GET"])
def health():
    return {"status": "ok", "service": "parenting-navigator-v2"}, 200


# ── 網頁版聊天 API ─────────────────────────────────────────────────────────────

@app.route("/chat", methods=["POST"])
def web_chat():
    """
    網頁小幫手 Widget 呼叫的 REST API。
    Request JSON：
        {
            "session_id": "瀏覽器產生的 UUID（代替 LINE user_id）",
            "message":    "使用者輸入的問題",
            "city":       "台北市"  （可選，前端選擇後帶入）
        }
    Response JSON：
        {
            "reply":   "小幫手回覆文字",
            "sources": ["來源檔案1", "來源檔案2"],
            "quick_replies": ["補助申請", "托嬰資訊", "兒童健檢", "育嬰留職"]
        }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "請傳入 JSON 格式"}), 400

    session_id = data.get("session_id", "web_anonymous")
    message    = (data.get("message") or "").strip()
    city       = data.get("city")
    # 對話歷史：前端傳來的 [{role, content}] 陣列，可為 None 或空陣列
    history    = data.get("history") or []

    if not message:
        return jsonify({"error": "message 不能為空"}), 400

    logger.info("Web Chat：session=%s, city=%s, history_len=%d, msg='%s'",
                session_id, city, len(history), message[:50])

    # 建立輕量版 user_context（網頁版無 LINE user_id，用 session_id 代替）
    user_context = {
        "user_id":       f"web_{session_id}",
        "household_city": city,
        "children":      [],   # 網頁版暫不支援寶寶資料（可日後擴充登入功能）
    }

    try:
        # 語意搜尋（只用當前問題做向量搜尋，不受歷史影響）
        chunks  = rag_engine.query_rag(message, city=city)
        sources = list({c["filename"] for c in chunks})

        # LLM 生成回覆（帶入對話歷史，AI 不再失憶）
        reply = rag_engine.generate_reply(message, user_context, history=history)

        # 動態 Quick Reply：根據問題類型推薦後續問法
        quick_replies = _suggest_quick_replies(message, reply)

        return jsonify({
            "reply":         reply,
            "sources":       [s.replace(".md", "") for s in sources[:3]],
            "quick_replies": quick_replies,
        })

    except Exception as e:
        logger.error("Web Chat 失敗：%s", e, exc_info=True)
        return jsonify({
            "reply":         "😅 小幫手暫時無法回覆，請稍後再試，或致電 1925 衛福部諮詢專線。",
            "sources":       [],
            "quick_replies": ["補助申請", "托嬰資訊", "兒童健檢", "育嬰留職"],
        }), 200   # 維持 200 讓前端正常顯示錯誤訊息


def _suggest_quick_replies(question: str, reply: str) -> list[str]:
    """根據問題關鍵字推薦相關的後續快速提問。"""
    kw_map = {
        "補助":   ["育兒津貼怎麼申請？", "生育獎勵金多少錢？", "托育補助資格？"],
        "疫苗":   ["公費疫苗有哪些？", "自費疫苗值得打嗎？", "疫苗接種時程？"],
        "托嬰":   ["公托怎麼申請？", "準公共托育費用？", "居家托育怎麼找？"],
        "健檢":   ["兒童定期健檢幾次？", "健檢補助怎麼用？", "發展遲緩怎麼辦？"],
        "請假":   ["育嬰留職停薪怎麼申請？", "陪產假有幾天？", "育嬰津貼多少錢？"],
        "出生":   ["出生登記要準備什麼？", "健保怎麼加保？", "新生兒補助有哪些？"],
    }
    default = ["補助申請", "托嬰資訊", "兒童健檢", "育嬰留職"]

    for kw, suggestions in kw_map.items():
        if kw in question or kw in reply:
            return suggestions[:4]

    return default


# ── Follow 事件（新用戶加入） ─────────────────────────────────────────────────

@handler.add(FollowEvent)
def handle_follow(event: FollowEvent):
    user_id = event.source.user_id
    logger.info("Follow：%s", user_id)
    db.get_user_context(user_id)   # 建立 users 資料列

    # 發送 Flex 歡迎卡
    welcome = flex_t.make_flex_message(
        alt_text="歡迎使用育兒導航小幫手！",
        contents=flex_t.welcome_flex(),
    )
    _reply_flex(event.reply_token, welcome)


# ── 文字訊息事件 ──────────────────────────────────────────────────────────────

@handler.add(MessageEvent, message=TextMessageContent)
def handle_text(event: MessageEvent):
    user_id = event.source.user_id
    text    = event.message.text.strip()
    logger.info("文字訊息：user=%s, text='%s'", user_id, text[:50])

    # ── 優先交由對話狀態機處理 ──────────────────────────────────────────────
    result = conv.handle_message(user_id, text)
    if result is not None:
        _send_conv_result(event.reply_token, result)
        return

    # ── 特殊指令 ─────────────────────────────────────────────────────────────
    if text in ("我的寶寶", "寶寶資料", "查看資料"):
        user_ctx = db.get_user_context(user_id)
        flex_msg = flex_t.make_flex_message(
            alt_text="你的育兒資料",
            contents=flex_t.child_summary_flex(
                city=user_ctx.get("household_city"),
                children=user_ctx.get("children", []),
            ),
        )
        _reply_flex(event.reply_token, flex_msg)
        return

    if text in ("今日提醒", "今天提醒"):
        pushes = db.get_today_pushes()
        if not pushes:
            _reply_text(event.reply_token, "✅ 今天沒有待辦的育兒提醒！繼續加油 💪")
        else:
            msgs = "\n".join(
                f"• {p['label']}（{p['nickname']}）" for p in pushes[:5]
            )
            _reply_text(event.reply_token, f"📅 今日提醒（{len(pushes)} 筆）：\n\n{msgs}")
        return

    # ── RAG 問答（主流程） ────────────────────────────────────────────────────
    try:
        user_ctx = db.get_user_context(user_id)
        city     = user_ctx.get("household_city")

        # 語意搜尋
        chunks   = rag_engine.query_rag(text, city=city)
        sources  = list({c["filename"] for c in chunks})

        # LLM 生成回覆
        answer   = rag_engine.generate_reply(text, user_ctx)

        # 用 Flex 卡片回覆
        flex_msg = flex_t.make_flex_message(
            alt_text=answer[:60],
            contents=flex_t.rag_reply_flex(
                question=text,
                answer=answer,
                sources=sources,
            ),
        )
        _reply_flex(event.reply_token, flex_msg)

    except Exception as e:
        logger.error("RAG 失敗：%s", e, exc_info=True)
        _reply_text(
            event.reply_token,
            "😅 小幫手遇到了點問題，請稍後再試。\n緊急問題可致電 1925。"
        )


# ── Postback 事件 ─────────────────────────────────────────────────────────────

@handler.add(PostbackEvent)
def handle_postback(event: PostbackEvent):
    user_id = event.source.user_id
    data    = event.postback.data
    logger.info("Postback：user=%s, data='%s'", user_id, data)

    # 交由對話狀態機處理
    result = conv.handle_postback(user_id, data)
    if result is not None:
        _send_conv_result(event.reply_token, result)
        return

    # 未識別的 postback
    _reply_text(event.reply_token, "（收到了！如有問題請直接輸入文字詢問 😊）")


# ── 回覆工具函式 ──────────────────────────────────────────────────────────────

def _reply_text(reply_token: str, text: str,
                quick_reply: QuickReply = None) -> None:
    """發送純文字訊息。"""
    MAX = 4990
    if len(text) > MAX:
        text = text[:MAX] + "…"
    msg = TextMessage(type="text", text=text)
    if quick_reply:
        msg.quick_reply = quick_reply
    with ApiClient(_line_conf) as client:
        MessagingApi(client).reply_message(
            ReplyMessageRequest(reply_token=reply_token, messages=[msg])
        )


def _reply_flex(reply_token: str, flex_msg: FlexMessage) -> None:
    """發送 Flex Message。"""
    with ApiClient(_line_conf) as client:
        try:
            MessagingApi(client).reply_message(
                ReplyMessageRequest(reply_token=reply_token, messages=[flex_msg])
            )
        except Exception as e:
            logger.error("Flex 回覆失敗：%s", e)


def _send_conv_result(reply_token: str, result: conv.ConversationResult) -> None:
    """
    將 ConversationResult 轉為 LINE 回覆。
    若有 Quick Reply，組合後附加到文字訊息上。
    """
    # 建立 Quick Reply（若有）
    qr = None
    if result.quick_reply_postbacks:
        items = [
            QuickReplyItem(
                action=PostbackAction(
                    label=label[:20],     # LINE 上限 20 字
                    data=data,
                    display_text=label[:20],
                )
            )
            for label, data in result.quick_reply_postbacks[:13]  # 最多 13 個
        ]
        qr = QuickReply(items=items)

    if result.flex:
        flex_msg = flex_t.make_flex_message(
            alt_text=(result.text or "育兒小幫手")[:60],
            contents=result.flex,
        )
        _reply_flex(reply_token, flex_msg)
    elif result.text:
        _reply_text(reply_token, result.text, quick_reply=qr)


# ── 啟動 ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logger.info("育兒導航 Agent 啟動（port=%d）", config.FLASK_PORT)
    app.run(
        host="0.0.0.0",
        port=config.FLASK_PORT,
        debug=config.FLASK_DEBUG,
        use_reloader=False,   # 避免 APScheduler 重複啟動
    )
