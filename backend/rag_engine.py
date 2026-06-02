# rag_engine.py — ChromaDB 向量檢索引擎
# 架構：OpenAI Embedding → ChromaDB → LLM (GPT-4o-mini)
# 支援「縣市過濾」：查詢時只取適用該縣市的 wiki chunk
#
# 主要流程：
#   1. query_rag(question, city) → 語意搜尋 Top-K chunk
#   2. build_prompt(question, ctx, user_ctx) → 組合帶有 child info 的提示詞
#   3. generate_reply(question, user_context) → 完整 RAG 問答（對外主要 API）

import logging
from typing import Optional

import chromadb
from chromadb.utils import embedding_functions
from openai import OpenAI

import config

logger = logging.getLogger(__name__)

# ── 單例初始化 ─────────────────────────────────────────────────────────────────

_chroma_client: Optional[chromadb.ClientAPI] = None
_collection = None
_openai_client: Optional[OpenAI] = None


def _get_chroma_collection():
    """取得（或初始化）ChromaDB collection，採 singleton 模式。"""
    global _chroma_client, _collection

    if _collection is not None:
        return _collection

    _chroma_client = chromadb.PersistentClient(path=config.CHROMA_PERSIST_DIR)

    # 使用 OpenAI Embedding function（chromadb 內建整合）
    openai_ef = embedding_functions.OpenAIEmbeddingFunction(
        api_key=config.OPENAI_API_KEY,
        model_name=config.EMBEDDING_MODEL,
    )

    _collection = _chroma_client.get_or_create_collection(
        name=config.CHROMA_COLLECTION,
        embedding_function=openai_ef,
        metadata={"hnsw:space": "cosine"},  # 使用 cosine 相似度
    )
    logger.info(
        "ChromaDB collection '%s' 載入完成（共 %d 筆）",
        config.CHROMA_COLLECTION,
        _collection.count(),
    )
    return _collection


def _get_openai_client() -> OpenAI:
    """取得 OpenAI 客戶端（singleton）。"""
    global _openai_client
    if _openai_client is None:
        _openai_client = OpenAI(api_key=config.OPENAI_API_KEY)
    return _openai_client


# ── 核心 RAG 函式 ──────────────────────────────────────────────────────────────

def query_rag(question: str, city: Optional[str] = None,
              top_k: int = None) -> list[dict]:
    """
    語意搜尋 Wiki 知識庫，回傳最相關的 chunk 列表。

    Args:
        question: 使用者問題（已完成 Context Enrichment）
        city:     使用者戶籍縣市（用於 metadata 過濾，可為 None）
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

    collection = _get_chroma_collection()

    # 建立縣市過濾條件（ChromaDB where 語法）
    where_filter = _build_city_filter(city)

    try:
        results = collection.query(
            query_texts=[question],
            n_results=min(top_k, collection.count() or 1),
            where=where_filter,
            include=["documents", "metadatas", "distances"],
        )
    except Exception as e:
        logger.error("ChromaDB 查詢失敗：%s", e)
        return []

    chunks = []
    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]

    for doc, meta, dist in zip(documents, metadatas, distances):
        # ChromaDB cosine distance → similarity score（距離越小越相似）
        score = 1.0 - dist
        if score < config.RAG_SCORE_THRESHOLD:
            continue  # 過濾掉相似度太低的結果

        chunks.append({
            "text":     doc,
            "filename": meta.get("filename", ""),
            "cities":   meta.get("cities", "全國"),
            "score":    round(score, 4),
        })

    logger.info(
        "RAG 查詢完成：city=%s, 問題='%s...', 找到 %d 筆（門檻 %.2f）",
        city, question[:30], len(chunks), config.RAG_SCORE_THRESHOLD
    )
    return chunks


def _build_city_filter(city: Optional[str]) -> Optional[dict]:
    """
    建立 ChromaDB metadata 過濾條件。
    儲存格式：每個 chunk 的 metadata["cities"] 是逗號分隔的縣市字串，
    例如 "台北市,全國"。

    因 ChromaDB 不支援 LIKE，改用 $contains（需 chromadb >= 0.4.x）。
    若 city 為 None，則不過濾（全國適用）。
    """
    if not city:
        return None

    # 同時允許「指定縣市」或「全國」的 chunk 被找到
    return {
        "$or": [
            {"cities": {"$contains": city}},
            {"cities": {"$contains": "全國"}},
        ]
    }


def build_system_message(rag_chunks: list[dict], user_context: dict) -> str:
    """
    組合 System Message（背景知識 + 使用者資訊）。
    問題本身不放這裡，讓歷史對話可以正確插入 messages 陣列。
    """
    # 組裝知識庫片段
    if rag_chunks:
        knowledge = "\n\n---\n\n".join(
            f"【來源：{c['filename']}（相似度 {c['score']:.2f}）】\n{c['text']}"
            for c in rag_chunks
        )
    else:
        knowledge = "（知識庫中未找到相關資料）"

    # 組裝使用者個人資訊（Context Enrichment）
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


# 保留舊函式名稱供 LINE Bot 路由使用（不帶歷史）
def build_prompt(question: str, rag_chunks: list[dict], user_context: dict) -> str:
    return build_system_message(rag_chunks, user_context) + f"\n\n使用者問題：{question}"


def generate_reply(question: str, user_context: dict,
                   history: list[dict] | None = None) -> str:
    """
    完整 RAG 問答流程的對外主要入口。

    流程：
        1. query_rag → 取得相關 chunk
        2. build_system_message → 組合 system prompt
        3. 拼入對話歷史 history（[{role, content}, ...]）
        4. OpenAI Chat Completion → 產生回覆

    Args:
        question:     使用者原始訊息
        user_context: 來自 db.get_user_context() 的使用者資料
        history:      前端傳入的對話歷史，最多 10 輪
                      格式：[{"role": "user"|"assistant", "content": "..."}]

    Returns:
        str：回覆文字
    """
    city = user_context.get("household_city")

    # 步驟 1：語意搜尋（用當前問題搜，不用歷史）
    chunks = query_rag(question, city=city)

    # 步驟 2：組合 system message
    system_content = build_system_message(chunks, user_context)

    # 步驟 3：組合完整 messages 陣列
    # 結構：[system] + [history...] + [current user question]
    messages = [{"role": "system", "content": system_content}]

    if history:
        # 驗證並過濾格式，最多保留最近 20 則（10輪）
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
            temperature=0.3,   # 育兒資訊需要精確，溫度偏低
        )
        reply = response.choices[0].message.content.strip()
        logger.info("LLM 回覆產生完成（%d 字元）", len(reply))
        return reply

    except Exception as e:
        logger.error("OpenAI API 呼叫失敗：%s", e)
        return (
            "😅 抱歉，小幫手暫時無法回覆，請稍後再試。\n"
            "如有緊急問題，歡迎致電 **1925**（衛福部保護專線）或查詢各縣市政府官網。"
        )


# ── 向量化（由 wiki_loader 呼叫） ────────────────────────────────────────────────

def add_chunks_to_chroma(chunks: list[dict]) -> list[str]:
    """
    將 wiki chunk 批次寫入 ChromaDB。

    Args:
        chunks: list of dict，每筆需包含：
            - chunk_id:  MySQL rag_chunks.chunk_id
            - chunk_text: 文字內容
            - filename:  來源檔案名稱
            - meta_cities: 適用縣市（逗號分隔字串）

    Returns:
        list of chroma_doc_id（與輸入 chunks 順序對應）
    """
    if not chunks:
        return []

    collection = _get_chroma_collection()

    doc_ids   = [f"chunk_{c['chunk_id']}" for c in chunks]
    documents = [c["chunk_text"] for c in chunks]
    metadatas = [
        {
            "filename": c.get("filename", ""),
            "cities":   c.get("meta_cities", "全國"),
            "chunk_id": str(c["chunk_id"]),
        }
        for c in chunks
    ]

    # ChromaDB 批次 upsert（重複執行安全）
    collection.upsert(ids=doc_ids, documents=documents, metadatas=metadatas)
    logger.info("成功向量化 %d 筆 chunk", len(chunks))
    return doc_ids


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
    years = months // 12
    rem   = months % 12
    return f"{years} 歲 {rem} 個月" if rem else f"{years} 歲"
