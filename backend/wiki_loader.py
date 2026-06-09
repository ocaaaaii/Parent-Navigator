# wiki_loader.py — Markdown Wiki 解析器與向量化工具
#
# 功能：
#   1. 掃描 WIKI_DIR 下所有 .md 檔案
#   2. 解析 YAML Frontmatter（tags, 適用縣市, 時序規則）
#   3. 將正文切塊（chunk），寫入 PostgreSQL rag_chunks
#   4. 呼叫 rag_engine.embed_texts 取得 OpenAI embedding，直接存入 rag_chunks.embedding
#   5. 解析「時序規則」，插入 milestones 表
#
# 執行方式（一次性重建知識庫）：
#   python wiki_loader.py --rebuild
#
# 或只處理新增/未向量化的 chunk：
#   python wiki_loader.py

import argparse
import logging
import os
import re
from pathlib import Path
from typing import Optional

import yaml
import pdfplumber

import config
import db
import rag_engine

logger = logging.getLogger(__name__)

# ── 切塊設定 ───────────────────────────────────────────────────────────────────
CHUNK_SIZE    = 500   # 每個 chunk 最大字元數
CHUNK_OVERLAP = 50    # 相鄰 chunk 重疊字元數（避免語意被截斷）


# ── Frontmatter 解析 ───────────────────────────────────────────────────────────

def parse_markdown(filepath: Path) -> dict:
    """
    解析單一 Markdown 檔案，分離 YAML Frontmatter 與正文。

    回傳：
    {
        "filename": "台北市_好孕2U專車補助.md",
        "title":    "台北市 好孕2U 孕婦專車乘車補助",
        "tags":     ["台北市", "孕婦補助", "交通補助"],
        "cities":   "台北市",              # 逗號分隔字串，存入 ChromaDB meta
        "timing_rules": [...],             # 時序規則列表
        "body":     "## 補助對象...",      # Frontmatter 以下的正文
    }
    """
    raw = filepath.read_text(encoding="utf-8")

    frontmatter = {}
    body = raw

    # 嘗試抓取 YAML Frontmatter（--- 包夾區塊）
    fm_match = re.match(r"^---\s*\n(.*?)\n---\s*\n", raw, re.DOTALL)
    if fm_match:
        try:
            frontmatter = yaml.safe_load(fm_match.group(1)) or {}
        except yaml.YAMLError as e:
            logger.warning("%s Frontmatter 解析失敗：%s", filepath.name, e)
        body = raw[fm_match.end():]

    # 萃取欄位
    tags = frontmatter.get("tags", [])
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",")]

    raw_cities = frontmatter.get("適用縣市", ["全國"])
    if isinstance(raw_cities, str):
        raw_cities = [c.strip() for c in raw_cities.split(",")]
    cities_str = ",".join(raw_cities)   # ChromaDB metadata 用逗號分隔字串

    timing_rules = frontmatter.get("時序規則", [])
    if isinstance(timing_rules, str):
        timing_rules = [timing_rules]

    # 從 H1 或 Frontmatter 取得標題
    title_match = re.search(r"^#\s+(.+)$", body, re.MULTILINE)
    title = (
        frontmatter.get("title")
        or (title_match.group(1).strip() if title_match else filepath.stem)
    )

    return {
        "filename":     filepath.name,
        "title":        title,
        "tags":         tags,
        "cities":       cities_str,
        "timing_rules": timing_rules,
        "body":         body.strip(),
    }


# ── 文字切塊 ──────────────────────────────────────────────────────────────────

def chunk_text(text: str, chunk_size: int = CHUNK_SIZE,
               overlap: int = CHUNK_OVERLAP) -> list[str]:
    """
    將長文切成固定大小的 chunk，相鄰 chunk 有部分重疊以保留語意連貫性。
    切塊策略：優先在「換行」處切割，避免切斷完整句子。
    """
    if len(text) <= chunk_size:
        return [text]

    chunks = []
    start  = 0

    while start < len(text):
        end = start + chunk_size

        if end >= len(text):
            chunks.append(text[start:])
            break

        # 往回找最近的換行點
        newline_pos = text.rfind("\n", start, end)
        if newline_pos > start:
            end = newline_pos

        chunks.append(text[start:end].strip())
        start = end - overlap   # 重疊區域

    return [c for c in chunks if c]   # 過濾空字串


# ── PostgreSQL 資料寫入 ───────────────────────────────────────────────────────

def upsert_article(parsed: dict) -> int:
    """
    將解析後的 wiki 資料 upsert 至 wiki_articles 表。
    回傳 article_id（用 RETURNING 取得）。
    """
    import hashlib
    tags_str = ",".join(parsed["tags"])
    # 計算檔案內容 hash（用 body + tags 混合，簡單防止無謂重建）
    file_hash = hashlib.md5((parsed["body"] + tags_str).encode()).hexdigest()

    sql = """
        INSERT INTO wiki_articles (filename, title, tags, cities, file_hash, is_active, updated_at)
        VALUES (%s, %s, %s, %s, %s, TRUE, NOW())
        ON CONFLICT (filename) DO UPDATE SET
            title      = EXCLUDED.title,
            tags       = EXCLUDED.tags,
            cities     = EXCLUDED.cities,
            file_hash  = EXCLUDED.file_hash,
            updated_at = NOW()
        RETURNING article_id
    """

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (
                parsed["filename"],
                parsed["title"],
                tags_str,
                parsed["cities"],
                file_hash,
            ))
            article_id = cur.fetchone()["article_id"]
        conn.commit()

    return article_id


def insert_chunks(article_id: int, chunks: list[str], cities: str) -> list[int]:
    """
    批次插入 chunk 至 rag_chunks 表（用 chunk_hash 去重），回傳 chunk_id 列表。
    重複執行安全：hash 不變則跳過，is_indexed 重置為 FALSE 觸發重新向量化。
    """
    import hashlib

    # 先刪除此 article 舊有 chunk（重建模式；增量模式可改為 DO NOTHING）
    sql_delete = "DELETE FROM rag_chunks WHERE article_id = %s"

    sql_insert = """
        INSERT INTO rag_chunks
            (article_id, chunk_text, chunk_hash, meta_cities, filename, is_indexed)
        VALUES (%s, %s, %s, %s, %s, FALSE)
        ON CONFLICT (chunk_hash) DO UPDATE SET
            meta_cities = EXCLUDED.meta_cities,
            is_indexed  = FALSE
        RETURNING chunk_id
    """

    # 從 wiki_articles 取得 filename（供 rag_chunks.filename 存放）
    sql_fn = "SELECT filename FROM wiki_articles WHERE article_id = %s"

    chunk_ids = []
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql_fn, (article_id,))
            fn_row = cur.fetchone()
            filename = fn_row["filename"] if fn_row else ""

            cur.execute(sql_delete, (article_id,))

            for chunk_text in chunks:
                chunk_hash = hashlib.md5(chunk_text.encode()).hexdigest()
                cur.execute(sql_insert, (
                    article_id, chunk_text, chunk_hash, cities, filename
                ))
                row = cur.fetchone()
                if row:
                    chunk_ids.append(row["chunk_id"])
        conn.commit()

    return chunk_ids


# ── 時序規則解析 ───────────────────────────────────────────────────────────────

# 時序規則關鍵字 → trigger_type 的對應表
TIMING_PATTERNS = [
    # 例：「滿2個月」「滿6個月」
    (re.compile(r"滿\s*(\d+)\s*個月"), "age_months"),
    # 例：「出生後60日內」「60天內」
    (re.compile(r"出生後?\s*(\d+)\s*[日天]"), "age_days"),
    # 例：「滿1歲」「2歲前」
    (re.compile(r"滿?\s*(\d+)\s*歲"), "age_years"),
    # 例：「懷孕第32週」「孕期第6週」
    (re.compile(r"(?:懷孕|孕期).*?第?\s*(\d+)\s*週"), "pregnancy_week"),
]


def parse_timing_rules(rules: list[str], article_id: int) -> list[dict]:
    """
    解析時序規則文字，轉為 milestones 表格式的 dict 列表。

    範例輸入：["出生後60日內出生登記（法定）", "滿2個月接種五合一"]
    範例輸出：[
        {"article_id":1, "trigger_type":"age_days",   "trigger_value":60,  "label":"..."},
        {"article_id":1, "trigger_type":"age_months", "trigger_value":2,   "label":"..."},
    ]
    """
    milestones = []
    for rule_text in rules:
        matched = False
        for pattern, t_type in TIMING_PATTERNS:
            m = pattern.search(rule_text)
            if m:
                milestones.append({
                    "article_id":        article_id,
                    "trigger_type":      t_type,
                    "trigger_value":     int(m.group(1)),
                    "label":             rule_text[:100],   # 截斷至 100 字
                    "notify_days_before": 7,                 # 預設提前 7 天提醒
                    "message_template":  None,               # 可日後補充
                    "priority":          5,
                })
                matched = True
                break
        if not matched:
            logger.debug("無法解析時序規則：%s", rule_text)
    return milestones


def upsert_milestones(milestones: list[dict]) -> None:
    """批次寫入 milestones 表（PostgreSQL ON CONFLICT 語法）。"""
    if not milestones:
        return

    sql = """
        INSERT INTO milestones
            (trigger_type, trigger_value, label,
             notify_days_before, message_template, priority)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (trigger_type, trigger_value, label) DO UPDATE SET
            notify_days_before = EXCLUDED.notify_days_before
    """
    rows = [
        (m["trigger_type"], m["trigger_value"],
         m["label"], m["notify_days_before"], m["message_template"], m["priority"])
        for m in milestones
    ]

    import psycopg2.extras
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_batch(cur, sql, rows)
        conn.commit()

    logger.info("寫入 %d 筆時序里程碑", len(milestones))


# ── 主流程 ────────────────────────────────────────────────────────────────────

# ── PDF 解析 ──────────────────────────────────────────────────────────────────

def extract_pdf_text(filepath: Path) -> str:
    """
    用 pdfplumber 提取 PDF 全文。
    自動跳過無法解析的頁面，回傳合併後的純文字。
    """
    pages_text = []
    try:
        with pdfplumber.open(filepath) as pdf:
            for i, page in enumerate(pdf.pages):
                text = page.extract_text()
                if text:
                    pages_text.append(text)
                else:
                    logger.debug("PDF 第 %d 頁無文字（可能是掃描圖片）：%s", i+1, filepath.name)
    except Exception as e:
        logger.error("PDF 解析失敗 %s：%s", filepath.name, e)
        return ""

    return "\n\n".join(pages_text)


def parse_pdf(filepath: Path) -> dict:
    """
    將 PDF 檔案解析為與 parse_markdown() 相同格式的 dict，
    使其可走相同的 upsert_article → insert_chunks → vectorize 流程。
    """
    body = extract_pdf_text(filepath)
    if not body:
        logger.warning("PDF 無可用文字，跳過：%s", filepath.name)
        return None

    # PDF 沒有 Frontmatter，用檔名推斷基本 metadata
    stem  = filepath.stem   # 例：台北市_親子廁所地圖
    parts = stem.split("_", 1)
    city  = parts[0] if len(parts) > 1 else "全國"
    title = parts[1] if len(parts) > 1 else stem

    return {
        "filename":     filepath.name,
        "title":        title,
        "tags":         [city, "PDF文件"],
        "cities":       city if city != "全國" else "全國",
        "timing_rules": [],
        "body":         body.strip(),
    }


def load_all_wikis(wiki_dir: str = None, rebuild: bool = False) -> None:
    """
    掃描 wiki_dir 下所有 .md 與 .pdf 檔案並完整執行載入流程。

    Args:
        wiki_dir: Wiki 資料夾路徑，預設使用 config.WIKI_DIR
        rebuild:  True = 強制重建所有向量（重置 is_indexed=0）
    """
    wiki_path = Path(wiki_dir or config.WIKI_DIR)
    if not wiki_path.exists():
        logger.error("Wiki 資料夾不存在：%s", wiki_path)
        return

    md_files  = sorted(wiki_path.glob("*.md"))
    pdf_files = sorted(wiki_path.glob("*.pdf"))
    logger.info("發現 %d 個 Markdown + %d 個 PDF，開始載入...",
                len(md_files), len(pdf_files))

    total_chunks    = 0
    total_milestone = 0

    all_files = [(f, "md") for f in md_files] + [(f, "pdf") for f in pdf_files]

    for filepath, ftype in all_files:
        logger.info("處理 [%s]：%s", ftype.upper(), filepath.name)
        try:
            # 1. 解析（Markdown 或 PDF）
            parsed = parse_markdown(filepath) if ftype == "md" else parse_pdf(filepath)
            if parsed is None:
                continue

            # 2. 寫入 wiki_articles
            article_id = upsert_article(parsed)

            # 3. 切塊 + 寫入 rag_chunks
            chunks    = chunk_text(parsed["body"])
            chunk_ids = insert_chunks(article_id, chunks, parsed["cities"])
            total_chunks += len(chunk_ids)

            # 4. 解析並寫入 milestones
            milestones = parse_timing_rules(parsed["timing_rules"], article_id)
            upsert_milestones(milestones)
            total_milestone += len(milestones)

        except Exception as e:
            logger.error("載入失敗 %s：%s", filepath.name, e, exc_info=True)

    logger.info(
        "Wiki 載入完成：%d 個檔案，%d 個 chunk，%d 個里程碑",
        len(md_files), total_chunks, total_milestone
    )

    # 5. 向量化（取未 indexed 的 chunk，直接存入 PostgreSQL）
    vectorize_pending_chunks()


def vectorize_pending_chunks() -> None:
    """
    從 PostgreSQL 取出未向量化的 chunk，
    呼叫 OpenAI Embedding API，再批次寫回 rag_chunks.embedding。
    可獨立呼叫，支援增量更新。
    """
    pending = db.get_pending_chunks()
    if not pending:
        logger.info("無待向量化的 chunk。")
        return

    logger.info("開始向量化 %d 筆 chunk...", len(pending))

    # 每批 50 筆（OpenAI embedding API 最大 2048 tokens/item，50 筆足夠安全）
    BATCH_SIZE = 50
    for i in range(0, len(pending), BATCH_SIZE):
        batch = pending[i:i + BATCH_SIZE]
        texts = [c["chunk_text"] for c in batch]
        try:
            embeddings = rag_engine.embed_texts(texts)
            pairs = [(c["chunk_id"], emb) for c, emb in zip(batch, embeddings)]
            db.batch_save_embeddings(pairs)
            logger.info("向量化批次 %d/%d 完成", i // BATCH_SIZE + 1,
                        (len(pending) - 1) // BATCH_SIZE + 1)
        except Exception as e:
            logger.error("向量化批次 %d 失敗：%s", i // BATCH_SIZE, e)

    logger.info("向量化完成。")


# ── CLI 入口 ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    )
    parser = argparse.ArgumentParser(description="育兒導航 Wiki 載入工具")
    parser.add_argument(
        "--rebuild", action="store_true",
        help="強制重建所有向量（重置 is_indexed=0）"
    )
    parser.add_argument(
        "--wiki-dir", type=str, default=config.WIKI_DIR,
        help=f"Wiki 資料夾路徑（預設：{config.WIKI_DIR}）"
    )
    parser.add_argument(
        "--vectorize-only", action="store_true",
        help="只執行向量化，跳過 Markdown 解析步驟"
    )
    args = parser.parse_args()

    db.get_pool()  # 初始化 PostgreSQL 連線池

    if args.vectorize_only:
        vectorize_pending_chunks()
    else:
        load_all_wikis(wiki_dir=args.wiki_dir, rebuild=args.rebuild)
