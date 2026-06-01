# flex_templates.py — LINE Flex Message 卡片模板
#
# 所有對外傳送的 Flex Message 統一在此定義，方便維護與視覺一致性。
# 配色沿用 v4「陶碗酒痕」系列：
#   主色  #99B6B4（瓷釉青）
#   暖色  #DFB199（杏皮褐）
#   強調  #D48982（酒痕紅）
#   深底  #243432（深青灰）
#
# 使用方式：
#   from flex_templates import push_notification_flex, rag_reply_flex
#   msg = FlexMessage(alt_text="育兒提醒", contents=push_notification_flex(...))

from linebot.v3.messaging import (
    FlexMessage, FlexContainer,
)

# ── 顏色常數 ───────────────────────────────────────────────────────────────────
C_PRIMARY  = "#99B6B4"   # 瓷釉青
C_WARM     = "#DFB199"   # 杏皮褐
C_ACCENT   = "#D48982"   # 酒痕紅
C_DARK     = "#243432"   # 深青灰
C_TEXT     = "#333333"   # 內文深灰
C_SUBTEXT  = "#888888"   # 次要文字
C_BG       = "#F5F9F8"   # 極淡背景


# ── 1. 每日推播通知卡片 ────────────────────────────────────────────────────────

def push_notification_flex(nickname: str, label: str,
                            detail: str = "", emoji: str = "📅") -> dict:
    """
    每日推播里程碑提醒卡片。
    顯示：icon + 標題 + 寶寶暱稱 + 里程碑說明 + 「立即查詢」按鈕

    Args:
        nickname: 寶寶暱稱
        label:    里程碑名稱，例如「滿 2 個月疫苗接種」
        detail:   補充說明文字（可空）
        emoji:    標題前的 emoji
    """
    return {
        "type": "bubble",
        "size": "kilo",
        "header": {
            "type": "box",
            "layout": "vertical",
            "backgroundColor": C_DARK,
            "paddingAll": "16px",
            "contents": [
                {
                    "type": "text",
                    "text": f"{emoji} 育兒提醒",
                    "color": C_PRIMARY,
                    "size": "xs",
                    "weight": "bold",
                    "letterSpacing": "2px",
                },
                {
                    "type": "text",
                    "text": label,
                    "color": "#FFFFFF",
                    "size": "lg",
                    "weight": "bold",
                    "wrap": True,
                    "margin": "sm",
                },
            ],
        },
        "body": {
            "type": "box",
            "layout": "vertical",
            "backgroundColor": C_BG,
            "paddingAll": "16px",
            "spacing": "sm",
            "contents": [
                {
                    "type": "box",
                    "layout": "horizontal",
                    "contents": [
                        {
                            "type": "text",
                            "text": "寶寶",
                            "color": C_SUBTEXT,
                            "size": "sm",
                            "flex": 2,
                        },
                        {
                            "type": "text",
                            "text": nickname,
                            "color": C_TEXT,
                            "size": "sm",
                            "weight": "bold",
                            "flex": 5,
                        },
                    ],
                },
                *([
                    {
                        "type": "separator",
                        "margin": "sm",
                        "color": "#E0E8E7",
                    },
                    {
                        "type": "text",
                        "text": detail,
                        "color": C_SUBTEXT,
                        "size": "sm",
                        "wrap": True,
                        "margin": "sm",
                    },
                ] if detail else []),
            ],
        },
        "footer": {
            "type": "box",
            "layout": "vertical",
            "paddingAll": "12px",
            "backgroundColor": C_BG,
            "contents": [
                {
                    "type": "button",
                    "style": "primary",
                    "color": C_PRIMARY,
                    "height": "sm",
                    "action": {
                        "type": "message",
                        "label": "🔍 立即查詢詳情",
                        "text": f"{label} 怎麼申辦？",
                    },
                },
            ],
        },
    }


# ── 2. RAG 問答回覆卡片 ────────────────────────────────────────────────────────

def rag_reply_flex(question: str, answer: str,
                   sources: list[str] = None) -> dict:
    """
    RAG 問答回覆的 Flex 卡片。
    顯示：問題摘要 + 回答正文 + 資料來源標籤（可選）

    Args:
        question: 使用者問題（截短顯示）
        answer:   LLM 產生的回覆
        sources:  來源 wiki 檔名列表（可空）
    """
    source_items = []
    if sources:
        source_items = [
            {
                "type": "separator",
                "margin": "md",
                "color": "#E0E8E7",
            },
            {
                "type": "text",
                "text": "📂 資料來源",
                "color": C_SUBTEXT,
                "size": "xxs",
                "margin": "md",
            },
            *[
                {
                    "type": "text",
                    "text": f"• {s.replace('.md', '')}",
                    "color": C_PRIMARY,
                    "size": "xxs",
                    "wrap": True,
                }
                for s in sources[:3]   # 最多顯示 3 個來源
            ],
        ]

    return {
        "type": "bubble",
        "header": {
            "type": "box",
            "layout": "vertical",
            "backgroundColor": C_DARK,
            "paddingAll": "14px",
            "contents": [
                {
                    "type": "text",
                    "text": "🍼 育兒導航小幫手",
                    "color": C_PRIMARY,
                    "size": "xs",
                    "weight": "bold",
                },
                {
                    "type": "text",
                    "text": f"Q：{question[:40]}{'…' if len(question) > 40 else ''}",
                    "color": "#CCCCCC",
                    "size": "xs",
                    "wrap": True,
                    "margin": "sm",
                },
            ],
        },
        "body": {
            "type": "box",
            "layout": "vertical",
            "backgroundColor": C_BG,
            "paddingAll": "16px",
            "contents": [
                {
                    "type": "text",
                    "text": answer,
                    "color": C_TEXT,
                    "size": "sm",
                    "wrap": True,
                },
                *source_items,
            ],
        },
        "footer": {
            "type": "box",
            "layout": "horizontal",
            "paddingAll": "10px",
            "backgroundColor": C_BG,
            "spacing": "sm",
            "contents": [
                {
                    "type": "button",
                    "style": "secondary",
                    "height": "sm",
                    "flex": 1,
                    "action": {
                        "type": "message",
                        "label": "👶 我的寶寶",
                        "text": "我的寶寶",
                    },
                },
                {
                    "type": "button",
                    "style": "primary",
                    "color": C_WARM,
                    "height": "sm",
                    "flex": 2,
                    "action": {
                        "type": "message",
                        "label": "💬 繼續提問",
                        "text": "我還想問...",
                    },
                },
            ],
        },
    }


# ── 3. 歡迎卡片（Follow 事件） ─────────────────────────────────────────────────

def welcome_flex() -> dict:
    """
    使用者首次加入時的歡迎 Flex 卡片。
    包含功能介紹 + 縣市選擇 Quick Reply 入口按鈕。
    """
    return {
        "type": "bubble",
        "hero": {
            "type": "box",
            "layout": "vertical",
            "backgroundColor": C_DARK,
            "paddingAll": "24px",
            "contents": [
                {
                    "type": "text",
                    "text": "🍼",
                    "size": "5xl",
                    "align": "center",
                },
                {
                    "type": "text",
                    "text": "育兒導航小幫手",
                    "color": "#FFFFFF",
                    "size": "xl",
                    "weight": "bold",
                    "align": "center",
                    "margin": "md",
                },
                {
                    "type": "text",
                    "text": "台灣新手爸媽的智慧應援祕書",
                    "color": C_PRIMARY,
                    "size": "sm",
                    "align": "center",
                },
            ],
        },
        "body": {
            "type": "box",
            "layout": "vertical",
            "backgroundColor": C_BG,
            "paddingAll": "16px",
            "spacing": "md",
            "contents": [
                _feature_row("💰", "補助查詢", "生育獎勵、育兒津貼、托育補助"),
                _feature_row("💉", "疫苗提醒", "公費、自費接種時程主動通知"),
                _feature_row("📋", "申辦攻略", "出生登記、健保加保、戶籍辦理"),
                _feature_row("📍", "縣市專屬", "依戶籍地提供精準在地資訊"),
            ],
        },
        "footer": {
            "type": "box",
            "layout": "vertical",
            "paddingAll": "14px",
            "backgroundColor": C_BG,
            "contents": [
                {
                    "type": "button",
                    "style": "primary",
                    "color": C_DARK,
                    "action": {
                        "type": "message",
                        "label": "📍 開始設定（選擇縣市）",
                        "text": "開始設定",
                    },
                },
            ],
        },
    }


def _feature_row(icon: str, title: str, desc: str) -> dict:
    """歡迎卡功能列的輔助函式。"""
    return {
        "type": "box",
        "layout": "horizontal",
        "spacing": "md",
        "contents": [
            {
                "type": "text",
                "text": icon,
                "size": "lg",
                "flex": 1,
                "gravity": "center",
            },
            {
                "type": "box",
                "layout": "vertical",
                "flex": 8,
                "contents": [
                    {
                        "type": "text",
                        "text": title,
                        "size": "sm",
                        "weight": "bold",
                        "color": C_TEXT,
                    },
                    {
                        "type": "text",
                        "text": desc,
                        "size": "xs",
                        "color": C_SUBTEXT,
                        "wrap": True,
                    },
                ],
            },
        ],
    }


# ── 4. 寶寶資料摘要卡片 ───────────────────────────────────────────────────────

def child_summary_flex(city: str, children: list[dict]) -> dict:
    """
    「我的寶寶」指令的摘要 Flex 卡片。

    Args:
        city:     戶籍縣市
        children: db.get_user_context() 的 children 列表
    """
    child_boxes = []
    for c in children:
        age_days = c.get("age_days", 0)
        age_str  = _format_age(age_days)
        flags    = []
        if c.get("is_low_income"):     flags.append("低收")
        if c.get("is_mid_low_income"): flags.append("中低收")
        if c.get("is_disability"):     flags.append("身障")
        if c.get("is_preterm"):        flags.append("早產")
        flag_str = " ・ ".join(flags) if flags else "一般"

        child_boxes.append({
            "type": "box",
            "layout": "vertical",
            "backgroundColor": "#FFFFFF",
            "cornerRadius": "8px",
            "paddingAll": "12px",
            "margin": "sm",
            "contents": [
                {
                    "type": "box",
                    "layout": "horizontal",
                    "contents": [
                        {
                            "type": "text",
                            "text": "👶",
                            "size": "xl",
                            "flex": 1,
                        },
                        {
                            "type": "box",
                            "layout": "vertical",
                            "flex": 6,
                            "contents": [
                                {
                                    "type": "text",
                                    "text": c.get("nickname", "寶寶"),
                                    "size": "md",
                                    "weight": "bold",
                                    "color": C_TEXT,
                                },
                                {
                                    "type": "text",
                                    "text": age_str,
                                    "size": "sm",
                                    "color": C_PRIMARY,
                                },
                                {
                                    "type": "text",
                                    "text": flag_str,
                                    "size": "xs",
                                    "color": C_SUBTEXT,
                                },
                            ],
                        },
                    ],
                },
            ],
        })

    if not child_boxes:
        child_boxes = [{
            "type": "text",
            "text": "尚未設定寶寶資料，輸入「新增寶寶」開始！",
            "color": C_SUBTEXT,
            "size": "sm",
            "wrap": True,
        }]

    return {
        "type": "bubble",
        "header": {
            "type": "box",
            "layout": "vertical",
            "backgroundColor": C_DARK,
            "paddingAll": "14px",
            "contents": [
                {
                    "type": "text",
                    "text": "👤 我的育兒資料",
                    "color": C_PRIMARY,
                    "size": "sm",
                    "weight": "bold",
                },
                {
                    "type": "text",
                    "text": f"📍 {city or '縣市未設定'}",
                    "color": "#CCCCCC",
                    "size": "xs",
                    "margin": "sm",
                },
            ],
        },
        "body": {
            "type": "box",
            "layout": "vertical",
            "backgroundColor": C_BG,
            "paddingAll": "12px",
            "contents": child_boxes,
        },
        "footer": {
            "type": "box",
            "layout": "horizontal",
            "paddingAll": "10px",
            "backgroundColor": C_BG,
            "spacing": "sm",
            "contents": [
                {
                    "type": "button",
                    "style": "secondary",
                    "height": "sm",
                    "flex": 1,
                    "action": {
                        "type": "message",
                        "label": "＋ 新增寶寶",
                        "text": "新增寶寶",
                    },
                },
                {
                    "type": "button",
                    "style": "primary",
                    "color": C_WARM,
                    "height": "sm",
                    "flex": 1,
                    "action": {
                        "type": "message",
                        "label": "今日提醒",
                        "text": "今日提醒",
                    },
                },
            ],
        },
    }


# ── 工具函式 ───────────────────────────────────────────────────────────────────

def _format_age(age_days: int) -> str:
    if age_days < 0:  return "尚未出生"
    if age_days < 30: return f"{age_days} 天"
    months = age_days // 30
    if months < 24:   return f"{months} 個月"
    years = months // 12
    rem   = months % 12
    return f"{years} 歲 {rem} 個月" if rem else f"{years} 歲"


def make_flex_message(alt_text: str, contents: dict) -> FlexMessage:
    """統一建立 FlexMessage 物件（LINE SDK v3）。"""
    return FlexMessage(
        alt_text=alt_text,
        contents=FlexContainer.from_dict(contents),
    )
