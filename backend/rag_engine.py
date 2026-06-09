# rag_engine.py — pgvector 向量檢索引擎（原 ChromaDB 版已遷移）
# 架構：OpenAI Embedding → Supabase pgvector（<=> cosine 距離）→ LLM (GPT-4o-mini)
# 支援「縣市過濾」：查詢時只取適用該縣市的 wiki chunk
#
# 主要流程：
#   1. query_rag(question, city) → 語意搜尋 Top-K chunk（SQL + HNSW 索引）
#   2. build_system_message(chunks, user_ctx) → 組合帶有 child info 的 system prompt
#   3. generate_reply(question, user_context) → 完整 RAG 問答（對外主要入口）
#   4. embed_texts(texts) → 批次向量化（供 wiki_loader 使用）

import logging
from typing import Optional

from openai import OpenAI

import config
import db

logger = logging.getLogger(__name__)

# ── OpenAI 客戶端（singleton） ─────────────────────────────────────────────────

_openai_client: Optional[OpenAI] = None


def _get_openai_client() -> OpenAI:
    global _openai_client
    if _openai_client is None:
        if not config.OPENAI_API_KEY:
            raise RuntimeError("環境變數 OPENAI_API_KEY 未設定")
        _openai_client = OpenAI(api_key=config.OPENAI_API_KEY)
    return _openai_client


# ── Embedding 工具函式 ─────────────────────────────────────────────────────────

def embed_texts(texts: list[str]) -> list[list[float]]:
    """
    批次取得 OpenAI embedding。
    model: text-embedding-3-small（1536 維，對應 pgvector schema）

    Args:
        texts: 要向量化的文字列表
    Returns:
        list of embedding（每個 embedding 是 list[float]，長度 1536）
    """
    client = _get_openai_client()
    response = client.embeddings.create(
        model=config.EMBEDDING_MODEL,
        input=texts,
    )
    # 回傳順序與輸入相同
    return [item.embedding for item in response.data]


# ── 核心 RAG 函式 ──────────────────────────────────────────────────────────────

def query_rag(question: str, city: Optional[str] = None,
              top_k: int = None) -> list[dict]:
    """
    語意搜尋 Wiki 知識庫，回傳最相關的 chunk 列表。

    Args:
        question: 使用者問題（已完成 Context Enrichment）
        city:     使用者戶籍縣市（用於 SQL WHERE 過濾，可為 None）
        top_k:    取回幾筆，預設使用 config.RAG_TOP_K

    Returns:
        list of dict，每筆包含：
            - text:     chunk 原文
            - filename: 來源 wiki 檔案名稱
            - score:    相似度分數（0~1，越高越相關）
            - cities:   該 chunk 適用縣市
    """
    if top_k is None:
        top_k = config.RAG_TOP_K

    # 1. 取得問題的 embedding
    try:
        query_embedding = embed_texts([question])[0]
    except Exception as e:
        logger.error("Embedding 呼叫失敗：%s", e)
        return []

    # 2. pgvector 相似度搜尋
    # <=> 是 cosine 距離（距離越小越相似），score = 1 - distance
    # WHERE 條件：meta_cities ILIKE 縣市 OR meta_cities ILIKE '全國'
    if city:
        city_filter = "AND (rc.meta_cities ILIKE %s OR rc.meta_cities ILIKE '%%全國%%')"
        city_param = f"%{city}%"
    else:
        city_filter = ""
        city_param  = None

    sql = f"""
        SELECT
            rc.chunk_id,
            rc.chunk_text,
            rc.meta_cities,
            rc.filename,
            1 - (rc.embedding <=> %s::vector) AS score
        FROM rag_chunks rc
        WHERE rc.is_indexed = TRUE
          AND rc.embedding IS NOT NULL
          {city_filter}
        ORDER BY rc.embedding <=> %s::vector
        LIMIT %s
    """

    # 組合查詢參數（embedding 出現兩次：score 計算 + ORDER BY）
    params = [query_embedding, query_embedding, top_k]
    if city_param:
        params.insert(1, city_param)   # 插入 city_filter 的 %s 位置

    try:
        with db.get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()
    except Exception as e:
        logger.error("pgvector 查詢失敗：%s", e)
        return []

    chunks = []
    for row in rows:
        score = float(row["score"])
        if score < config.RAG_SCORE_THRESHOLD:
            continue  # 過濾相似度過低的結果
        chunks.append({
            "text":     row["chunk_text"],
            "filename": row["filename"] or "",
            "cities":   row["meta_cities"] or "全國",
            "score":    round(score, 4),
        })

    logger.info(
        "RAG 查詢完成：city=%s, 問題='%s...', 找到 %d 筆（門檻 %.2f）",
        city, question[:30], len(chunks), config.RAG_SCORE_THRESHOLD,
    )
    return chunks


# ── Prompt 組合 ────────────────────────────────────────────────────────────────

def build_system_message(rag_chunks: list[dict], user_context: dict) -> str:
    """
    組合 System Message（背景知識 + 使用者資訊）。
    問題本身不放這裡，讓歷史對話可以正確插入 messages 陣列。
    """
    if rag_chunks:
        knowledge = "\n\n---\n\n".join(
            f"【來源：{c['filename']}（相似度 {c['score']:.2f}）】\n{c['text']}"
            for c in rag_chunks
        )
    else:
        knowledge = "（知識庫中未找到相關資料）"

    city = user_context.get("household_city") or "未設定"
    children = user_context.get("children", [])

    if children:
        child_info_lines = []
        for c in children:
            age_str = _format_age(c.get("age_days", 0))
            flags = []
            if c.get("is_low_income"):     flags.append("低收入戶")
            if c.get("is_mid_low_income"): flags.append("中低收入戶")
            if c.get("is_disability"):     flags.append("身心障礙")
            if c.get("is_preterm"):        flags.append("早產兒")
            flag_str = "、".join(flags) if flags else "一般"
            child_info_lines.append(
                f"- {c.get('nickname','寶寶')}：{age_str}，身分別：{flag_str}"
            )
        child_info = "\n".join(child_info_lines)
    else:
        child_info = "（尚未設定小孩資料）"

    return f"""{config.SYSTEM_PROMPT}

═══ 使用者個人資訊 ═══
戶籍縣市：{city}
小孩資料：
{child_info}

═══ 知識庫相關內容（本輪問題的語意搜尋結果）═══
{knowledge}

請根據以上資訊與對話歷史，用繁體中文、親切口語的方式回覆使用者。"""


def build_prompt(question: str, rag_chunks: list[dict], user_context: dict) -> str:
    """舊介面相容用（不帶歷史）。"""
    return build_system_message(rag_chunks, user_context) + f"\n\n使用者問題：{question}"


def generate_reply(question: str, user_context: dict,
                   history: list[dict] | None = None) -> str:
    """
    完整 RAG 問答流程的對外主要入口。

    流程：
        1. query_rag → 取得相關 chunk（pgvector HNSW 搜尋）
        2. build_system_message → 組合 system prompt
        3. 拼入對話歷史 history（[{role, content}, ...]）
        4. OpenAI Chat Completion → 產生回覆

    Args:
        question:     使用者原始訊息
        user_context: 來自 db.get_user_context() 的使用者資料
        history:      前端傳入的對話歷史，最多 10 輪

    Returns:
        str：回覆文字
    """
    city = user_context.get("household_city")

    # 步驟 1：語意搜尋
    chunks = query_rag(question, city=city)

    # 步驟 2：組合 system message
    system_content = build_system_message(chunks, user_context)

    # 步驟 3：組合完整 messages 陣列
    messages = [{"role": "system", "content": system_content}]

    if history:
        valid_roles = {"user", "assistant"}
        clean_history = [
            {"role": h["role"], "content": str(h["content"])[:1000]}
            for h in history[-20:]
            if isinstance(h, dict) and h.get("role") in valid_roles and h.get("content")
        ]
        messages.extend(clean_history)

    messages.append({"role": "user", "content": question})

    # 步驟 4：呼叫 LLM
    client = _get_openai_client()
    try:
        response = client.chat.completions.create(
            model=config.OPENAI_MODEL,
            messages=messages,
            max_tokens=config.OPENAI_MAX_TOKENS,
            temperature=0.3,
        )
        reply = response.choices[0].message.content.strip()
        logger.info("LLM 回覆產生完成（%d 字元）", len(reply))
        return reply

    except Exception as e:
        logger.error("OpenAI API 呼叫失敗：%s", e)
        return (
            "😅 抱歉，小幫手暫時無法回覆，請稍後再試。\n"
            "如有緊急問題，歡迎致電 1925（衛福部保護專線）或查詢各縣市政府官網。"
        )


# ── 工具函式 ───────────────────────────────────────────────────────────────────

def _format_age(age_days: int) -> str:
    """將天數轉為人類可讀的年齡字串。"""
    if age_days < 0:
        return "尚未出生"
    if age_days < 30:
        return f"{age_days} 天"
    months = age_days // 30
    if months < 24:
        return f"{months} 個月"
    years  = months // 12
    rem    = months % 12
    return f"{years} 歲 {rem} 個月" if rem else f"{years} 歲"
