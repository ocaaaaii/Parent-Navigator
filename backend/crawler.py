# crawler.py — 自動爬蟲 + Cron Job
#
# 功能：
#   1. 定義目標政府網頁清單（TARGET_PAGES）
#   2. 每週一 02:00 自動爬取，用 MD5 hash 比對內容是否變化
#   3. 若有變化 → 更新對應 .md wiki 檔案 → 重新向量化
#   4. 爬蟲結果寫入 crawl_log 表，方便追蹤
#
# 使用方式：
#   - 由 scheduler.py 的 init_scheduler() 自動啟動
#   - 或手動執行：python crawler.py --run-now

import argparse
import hashlib
import logging
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

import config
import db

logger = logging.getLogger(__name__)

# ── 爬蟲設定 ───────────────────────────────────────────────────────────────────
REQUEST_TIMEOUT  = 20        # 秒
REQUEST_DELAY    = 2.0       # 每次請求間隔（秒），避免被封鎖
USER_AGENT = (
    "Mozilla/5.0 (compatible; ParentingNavigatorBot/1.0; "
    "+https://github.com/your-repo; for educational research)"
)

# ── 目標網頁清單 ───────────────────────────────────────────────────────────────
# 格式：{
#   "url":       完整網址,
#   "wiki_file": 對應的 .md 檔案名稱,
#   "title":     文章標題,
#   "tags":      Frontmatter tags,
#   "cities":    適用縣市,
#   "parser":    解析函式名稱（不同網站版型不同）
# }
TARGET_PAGES = [
    {
        "url":       "https://www.sfaa.gov.tw/SFAA/Pages/Detail.aspx?nodeid=494&pid=7756",
        "wiki_file": "全國_育兒津貼與托育補助.md",
        "title":     "全國 育兒津貼與公共托育補助",
        "tags":      ["補助", "育兒津貼", "托育補助", "全國"],
        "cities":    "全國",
        "parser":    "parse_sfaa",
    },
    {
        "url":       "https://born.taipei/cp.aspx?n=D98ABCB51B230AAE",
        "wiki_file": "台北市_好孕2U專車補助.md",
        "title":     "台北市 好孕2U 孕婦專車補助",
        "tags":      ["台北市", "孕婦補助", "交通補助", "好孕2U"],
        "cities":    "台北市",
        "parser":    "parse_born_taipei",
    },
    {
        "url":       "https://born.taipei/cp.aspx?n=F20B1F62316B6DC7",
        "wiki_file": "台北市_自費疫苗加碼補助.md",
        "title":     "台北市 自費疫苗加碼補助",
        "tags":      ["台北市", "疫苗補助", "輪狀病毒", "腸病毒"],
        "cities":    "台北市",
        "parser":    "parse_born_taipei",
    },
    {
        "url":       "https://www.hpa.gov.tw/Pages/List.aspx?nodeid=1156",
        "wiki_file": "全國_公費疫苗接種時程.md",
        "title":     "全國 公費疫苗接種時程",
        "tags":      ["疫苗", "公費疫苗", "接種時程", "全國"],
        "cities":    "全國",
        "parser":    "parse_hpa",
    },
    {
        "url":       "https://www.mohw.gov.tw/cp-88-70419-1.html",
        "wiki_file": "全國_兒童預防保健服務.md",
        "title":     "全國 兒童預防保健服務",
        "tags":      ["醫療", "兒童健檢", "預防保健", "全國"],
        "cities":    "全國",
        "parser":    "parse_mohw",
    },
]


# ── HTML 解析器 ────────────────────────────────────────────────────────────────

def parse_born_taipei(soup: BeautifulSoup, url: str) -> str:
    """解析 born.taipei 網頁內文（靜態 HTML，直接抓主內容區）。"""
    content_div = (
        soup.find("div", class_="content-box")
        or soup.find("div", id="ContentPlaceHolder1_ContentArea")
        or soup.find("article")
        or soup.find("main")
    )
    if not content_div:
        return soup.get_text(separator="\n", strip=True)[:3000]

    # 移除導覽列、頁首頁尾等雜訊
    for tag in content_div.find_all(["nav", "header", "footer", "script", "style"]):
        tag.decompose()

    return content_div.get_text(separator="\n", strip=True)


def parse_sfaa(soup: BeautifulSoup, url: str) -> str:
    """解析社家署（sfaa.gov.tw）網頁。"""
    main = (
        soup.find("div", class_="article-content")
        or soup.find("div", id="ctl00_ContentPlaceHolder1_labContent")
        or soup.find("div", class_="news_content")
    )
    if main:
        for tag in main.find_all(["script", "style"]):
            tag.decompose()
        return main.get_text(separator="\n", strip=True)
    return soup.get_text(separator="\n", strip=True)[:3000]


def parse_hpa(soup: BeautifulSoup, url: str) -> str:
    """解析國健署（hpa.gov.tw）網頁。"""
    main = soup.find("div", class_="content") or soup.find("main")
    if main:
        for tag in main.find_all(["script", "style", "nav"]):
            tag.decompose()
        return main.get_text(separator="\n", strip=True)
    return soup.get_text(separator="\n", strip=True)[:3000]


def parse_mohw(soup: BeautifulSoup, url: str) -> str:
    """解析衛福部（mohw.gov.tw）網頁。"""
    main = (
        soup.find("div", class_="news_content")
        or soup.find("div", id="content")
        or soup.find("article")
    )
    if main:
        for tag in main.find_all(["script", "style"]):
            tag.decompose()
        return main.get_text(separator="\n", strip=True)
    return soup.get_text(separator="\n", strip=True)[:3000]


# parser 名稱對應函式
PARSERS = {
    "parse_born_taipei": parse_born_taipei,
    "parse_sfaa":        parse_sfaa,
    "parse_hpa":         parse_hpa,
    "parse_mohw":        parse_mohw,
}


# ── 核心爬蟲邏輯 ───────────────────────────────────────────────────────────────

def fetch_page(url: str) -> Optional[str]:
    """
    抓取網頁 HTML。
    回傳 HTML 字串，失敗回傳 None。
    """
    headers = {"User-Agent": USER_AGENT, "Accept-Language": "zh-TW,zh;q=0.9"}
    try:
        resp = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        resp.encoding = resp.apparent_encoding or "utf-8"
        return resp.text
    except requests.RequestException as e:
        logger.warning("抓取失敗 %s：%s", url, e)
        return None


def content_hash(text: str) -> str:
    """計算文字內容的 MD5 hash，用於偵測變化。"""
    return hashlib.md5(text.encode("utf-8")).hexdigest()


def build_wiki_md(target: dict, body_text: str) -> str:
    """
    將爬取到的純文字內容包裝成 Frontmatter + Markdown 格式。
    由爬蟲自動產生，比人工整理的格式簡略，但可作為知識庫基底。
    """
    now = datetime.now().strftime("%Y-%m-%d")
    tags_yaml = "\n  - ".join(target["tags"])

    return f"""---
title: {target['title']}
tags:
  - {tags_yaml}
適用縣市:
  - {target['cities']}
時序規則: []
資料來源: {target['url']}
最後更新: {now}
自動爬取: true
---

# {target['title']}

> ⚠️ 本文件由爬蟲自動更新，內容以各政府官網公告為準。

{body_text}
"""


def update_wiki_file(wiki_dir: str, target: dict, body_text: str) -> bool:
    """
    將爬取內容寫入 wiki .md 檔案。
    回傳 True = 有寫入（內容有變化），False = 無變化跳過。
    """
    wiki_path = Path(wiki_dir) / target["wiki_file"]
    new_md    = build_wiki_md(target, body_text)
    new_hash  = content_hash(new_md)

    # 比對現有檔案
    if wiki_path.exists():
        old_hash = content_hash(wiki_path.read_text(encoding="utf-8"))
        if old_hash == new_hash:
            return False   # 內容未變化

    wiki_path.write_text(new_md, encoding="utf-8")
    logger.info("Wiki 已更新：%s", target["wiki_file"])
    return True


def _ensure_crawl_log_table() -> None:
    """確保 crawl_log 表存在。"""
    sql = """
        CREATE TABLE IF NOT EXISTS crawl_log (
            log_id       INT          NOT NULL AUTO_INCREMENT,
            url          VARCHAR(512) NOT NULL,
            wiki_file    VARCHAR(200) NOT NULL,
            status       ENUM('success','no_change','failed') NOT NULL,
            content_hash VARCHAR(32),
            crawled_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            error_msg    TEXT,
            PRIMARY KEY (log_id),
            INDEX idx_crawled_at (crawled_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    """
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()


def _log_crawl(url: str, wiki_file: str, status: str,
               content_hash_val: str = None, error_msg: str = None) -> None:
    """寫入爬蟲執行記錄。"""
    sql = """
        INSERT INTO crawl_log (url, wiki_file, status, content_hash, error_msg)
        VALUES (%s, %s, %s, %s, %s)
    """
    try:
        with db.get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (url, wiki_file, status, content_hash_val, error_msg))
            conn.commit()
    except Exception as e:
        logger.error("寫入 crawl_log 失敗：%s", e)


# ── 主爬蟲任務（APScheduler 呼叫） ────────────────────────────────────────────

def crawl_all_targets(wiki_dir: str = None) -> None:
    """
    爬取所有 TARGET_PAGES，自動更新 wiki 並重新向量化有變化的檔案。
    由 APScheduler 每週一 02:00 呼叫，或手動觸發。
    """
    wiki_dir = wiki_dir or config.WIKI_DIR
    logger.info("[Crawler] 開始爬取 %d 個目標頁面", len(TARGET_PAGES))
    _ensure_crawl_log_table()

    updated_files = []

    for target in TARGET_PAGES:
        url = target["url"]
        logger.info("[Crawler] 爬取：%s", url)

        # 1. 抓取 HTML
        html = fetch_page(url)
        if not html:
            _log_crawl(url, target["wiki_file"], "failed", error_msg="fetch 失敗")
            time.sleep(REQUEST_DELAY)
            continue

        # 2. 解析主內容
        soup          = BeautifulSoup(html, "html.parser")
        parser_fn     = PARSERS.get(target["parser"], parse_mohw)
        body_text     = parser_fn(soup, url)
        body_text     = _clean_text(body_text)

        if len(body_text) < 100:
            logger.warning("[Crawler] 內容太少（%d 字），跳過：%s", len(body_text), url)
            _log_crawl(url, target["wiki_file"], "failed", error_msg="內容不足 100 字")
            time.sleep(REQUEST_DELAY)
            continue

        # 3. 比對 hash，更新 wiki 檔案
        h = content_hash(body_text)
        changed = update_wiki_file(wiki_dir, target, body_text)

        if changed:
            updated_files.append(target["wiki_file"])
            _log_crawl(url, target["wiki_file"], "success", content_hash_val=h)
            logger.info("[Crawler] 內容更新：%s", target["wiki_file"])
        else:
            _log_crawl(url, target["wiki_file"], "no_change", content_hash_val=h)
            logger.info("[Crawler] 無變化：%s", target["wiki_file"])

        time.sleep(REQUEST_DELAY)   # 禮貌性延遲

    # 4. 有更新才重新向量化
    if updated_files:
        logger.info("[Crawler] %d 個檔案有更新，開始重新向量化…", len(updated_files))
        try:
            import wiki_loader
            wiki_loader.load_all_wikis(wiki_dir=wiki_dir)
        except Exception as e:
            logger.error("[Crawler] 向量化失敗：%s", e)
    else:
        logger.info("[Crawler] 所有頁面均無變化，無需重新向量化。")

    logger.info("[Crawler] 本次爬蟲完成。")


def _clean_text(text: str) -> str:
    """清理多餘空白與特殊字元。"""
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


# ── CLI 入口 ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    parser = argparse.ArgumentParser(description="育兒導航爬蟲工具")
    parser.add_argument("--run-now", action="store_true", help="立即執行一次爬蟲")
    parser.add_argument("--wiki-dir", default=config.WIKI_DIR)
    args = parser.parse_args()

    db.get_pool()

    if args.run_now:
        crawl_all_targets(wiki_dir=args.wiki_dir)
    else:
        print("請加 --run-now 參數立即執行，或由 scheduler.py 自動排程。")
