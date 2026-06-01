-- =============================================================
-- 育兒導航全攻略 — MySQL Database Schema
-- 專案：基於 RAG 與時序提醒之新手爸媽智慧應援 Agent
-- 版本：v1.0  日期：2026-06-01
-- =============================================================
-- 架構說明：
--   1. 使用者與兒童管理 (users, children)
--   2. Wiki 知識庫 (wiki_articles, milestones)
--   3. 時序推播排程 (push_schedule, push_log)
--   4. RAG 向量化元資料 (rag_chunks)
--   5. 查詢記錄與分析 (query_log)
-- =============================================================

CREATE DATABASE IF NOT EXISTS parenting_navigator
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE parenting_navigator;

-- =============================================================
-- TABLE 1: users
-- 儲存 LINE Bot 使用者基本資料
-- 透過 LINE Webhook 首次互動時自動建立
-- =============================================================
CREATE TABLE IF NOT EXISTS users (
    user_id        VARCHAR(64)  NOT NULL COMMENT 'LINE userId (U開頭的33字元)',
    display_name   VARCHAR(100) NOT NULL DEFAULT '' COMMENT 'LINE 顯示名稱',
    picture_url    VARCHAR(512)          COMMENT 'LINE 頭像 URL',
    language       VARCHAR(10)  NOT NULL DEFAULT 'zh-TW',

    -- 戶籍地資訊（供 RAG Context Enrichment 使用）
    household_city     VARCHAR(20)  COMMENT '戶籍縣市，例：台北市',
    household_district VARCHAR(20)  COMMENT '戶籍行政區，例：內湖區',

    -- 通知偏好
    notify_enabled  TINYINT(1)   NOT NULL DEFAULT 1  COMMENT '是否開啟推播通知',
    notify_hour     TINYINT      NOT NULL DEFAULT 9   COMMENT '每日推播時間（小時，0-23）',

    -- 會員狀態
    line_follow_status ENUM('followed', 'blocked', 'unfollowed')
                       NOT NULL DEFAULT 'followed',

    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id),
    INDEX idx_household_city (household_city)
) ENGINE=InnoDB COMMENT='LINE Bot 使用者資料表';


-- =============================================================
-- TABLE 2: children
-- 每位使用者可登錄多名子女，時序推播以此為基準
-- =============================================================
CREATE TABLE IF NOT EXISTS children (
    child_id        INT          NOT NULL AUTO_INCREMENT,
    user_id         VARCHAR(64)  NOT NULL COMMENT 'FK → users.user_id',
    nickname        VARCHAR(50)  NOT NULL COMMENT '寶寶暱稱',

    -- 生日（核心欄位：APScheduler 計算里程碑日期依據）
    birth_date      DATE         NOT NULL COMMENT '出生日期（公曆）',
    gender          ENUM('M','F','unknown') NOT NULL DEFAULT 'unknown',

    -- 戶籍地（可與家長不同縣市，決定適用縣市補助）
    household_city     VARCHAR(20)  COMMENT '子女戶籍縣市',
    household_district VARCHAR(20)  COMMENT '子女戶籍行政區',

    -- 胎次（影響補助金額，例：第3名7000元/月）
    birth_order     TINYINT      NOT NULL DEFAULT 1 COMMENT '第幾胎（1起）',

    -- 特殊身分（影響補助資格）
    is_low_income       TINYINT(1) NOT NULL DEFAULT 0 COMMENT '低收入戶',
    is_mid_low_income   TINYINT(1) NOT NULL DEFAULT 0 COMMENT '中低收入戶',
    is_disability       TINYINT(1) NOT NULL DEFAULT 0 COMMENT '身心障礙',
    is_preterm          TINYINT(1) NOT NULL DEFAULT 0 COMMENT '早產兒（出生體重＜1500g）',

    is_active       TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '是否仍在追蹤（軟刪除）',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (child_id),
    INDEX idx_user_id (user_id),
    INDEX idx_birth_date (birth_date),
    CONSTRAINT fk_children_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='子女資料表（時序推播基準）';


-- =============================================================
-- TABLE 3: wiki_articles
-- 對應 Phase A 建立的 Markdown 知識庫筆記
-- 由 Python 腳本解析 Markdown Frontmatter 後匯入
-- =============================================================
CREATE TABLE IF NOT EXISTS wiki_articles (
    article_id      INT          NOT NULL AUTO_INCREMENT,
    filename        VARCHAR(200) NOT NULL COMMENT 'Markdown 檔名，例：全國_公費疫苗接種時程.md',
    title           VARCHAR(300) NOT NULL COMMENT '文章標題',

    -- 分類與標籤（對應 Frontmatter tags）
    category        ENUM(
        '補助申請', '醫療健檢', '疫苗接種', '托育教育',
        '孕期指南', '兒少保護', '心理健康', '口腔健康',
        '戶政行政', '弱勢資源', '勞工權益', 'QA問答', '其他'
    ) NOT NULL DEFAULT '其他',
    tags            JSON         COMMENT '標籤陣列，例：["補助","托育","全國"]',

    -- 適用地區（對應 Frontmatter 適用縣市）
    applicable_cities  JSON      COMMENT '適用縣市陣列，例：["全國"] 或 ["台北市"]',
    is_nationwide      TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否全國適用（加速查詢）',

    -- 來源
    source_title    VARCHAR(300) COMMENT '原始資料標題',
    source_url      VARCHAR(512) COMMENT '原始資料 URL',
    source_date     DATE         COMMENT '原始資料日期',

    -- 內容
    content_markdown LONGTEXT    NOT NULL COMMENT '完整 Markdown 內容',
    summary         TEXT         COMMENT '自動摘要（前256字或LLM生成）',

    -- 有效性
    is_active       TINYINT(1)   NOT NULL DEFAULT 1,
    last_verified   DATE         COMMENT '最後人工核實日期',

    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (article_id),
    UNIQUE KEY uk_filename (filename),
    INDEX idx_category (category),
    INDEX idx_is_nationwide (is_nationwide),
    FULLTEXT INDEX ft_content (title, content_markdown)
) ENGINE=InnoDB COMMENT='Wiki 知識庫文章（對應 Markdown 檔）';


-- =============================================================
-- TABLE 4: milestones
-- 從 Wiki Frontmatter「時序規則」欄位解析出的年齡節點
-- APScheduler 每日比對此表計算各小孩的推播日期
--
-- 設計原則：
--   trigger_type = 'age_days'   → 出生後第 N 天
--   trigger_type = 'age_months' → 出生後第 N 個月
--   trigger_type = 'age_years'  → 出生後第 N 年
--   trigger_type = 'deadline'   → 出生後N天內必須完成（倒數通知）
--   trigger_type = 'pregnancy_week' → 孕期第 N 週
-- =============================================================
CREATE TABLE IF NOT EXISTS milestones (
    milestone_id    INT          NOT NULL AUTO_INCREMENT,
    article_id      INT          NOT NULL COMMENT 'FK → wiki_articles.article_id',

    label           VARCHAR(200) NOT NULL COMMENT '里程碑標題，例：滿2個月接種五合一疫苗',
    description     TEXT         COMMENT '詳細說明',

    -- 觸發條件
    trigger_type    ENUM(
        'age_days', 'age_months', 'age_years',
        'deadline', 'pregnancy_week', 'manual'
    ) NOT NULL,
    trigger_value   SMALLINT     NOT NULL COMMENT '數值，例：2（月）',

    -- 提前幾天推播（預設7天前提醒）
    notify_days_before  TINYINT  NOT NULL DEFAULT 7,

    -- 適用對象篩選
    applicable_cities   JSON     COMMENT '覆蓋文章設定，null 表示繼承',
    min_birth_order     TINYINT  COMMENT '最低胎次限制，null=無限制',
    require_low_income  TINYINT(1) COMMENT '1=需低收入戶，null=不限',
    require_disability  TINYINT(1) COMMENT '1=需身心障礙，null=不限',

    -- 優先級（影響推播順序）
    priority        ENUM('high','medium','low') NOT NULL DEFAULT 'medium',

    -- 連結回原始資訊
    cta_label       VARCHAR(100) COMMENT '行動按鈕文字，例：立即申請',
    cta_url         VARCHAR(512) COMMENT '行動按鈕連結',

    is_active       TINYINT(1)   NOT NULL DEFAULT 1,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (milestone_id),
    INDEX idx_article_id (article_id),
    INDEX idx_trigger_type_value (trigger_type, trigger_value),
    CONSTRAINT fk_milestones_article
        FOREIGN KEY (article_id) REFERENCES wiki_articles(article_id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='時序里程碑（從 Frontmatter 解析，APScheduler 使用）';


-- =============================================================
-- TABLE 5: push_schedule
-- 為每個 child × milestone 組合預先計算推播日期
-- 由 Python 腳本在新增子女或更新里程碑時重算
-- APScheduler 每日掃描 scheduled_date = TODAY 的記錄並推播
-- =============================================================
CREATE TABLE IF NOT EXISTS push_schedule (
    schedule_id     BIGINT       NOT NULL AUTO_INCREMENT,
    child_id        INT          NOT NULL COMMENT 'FK → children.child_id',
    user_id         VARCHAR(64)  NOT NULL COMMENT 'FK → users.user_id（冗余加速查詢）',
    milestone_id    INT          NOT NULL COMMENT 'FK → milestones.milestone_id',

    -- 計算後的推播日期（= birth_date + trigger - notify_days_before）
    scheduled_date  DATE         NOT NULL COMMENT 'APScheduler 當日比對欄位',

    -- 狀態機
    status          ENUM('pending','sent','skipped','failed')
                    NOT NULL DEFAULT 'pending',

    -- 寄送結果
    sent_at         DATETIME     COMMENT '實際寄出時間',
    line_message_id VARCHAR(100) COMMENT 'LINE API 回傳的 message ID',
    error_message   VARCHAR(500) COMMENT '失敗原因',

    -- 重試次數
    retry_count     TINYINT      NOT NULL DEFAULT 0,

    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (schedule_id),
    UNIQUE KEY uk_child_milestone (child_id, milestone_id) COMMENT '避免重複排程',
    INDEX idx_scheduled_date_status (scheduled_date, status) COMMENT 'APScheduler 每日查詢主索引',
    INDEX idx_user_id (user_id),
    CONSTRAINT fk_schedule_child
        FOREIGN KEY (child_id) REFERENCES children(child_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_schedule_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_schedule_milestone
        FOREIGN KEY (milestone_id) REFERENCES milestones(milestone_id)
        ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='推播排程表（APScheduler 每日掃描）';


-- =============================================================
-- TABLE 6: push_log
-- 所有已發送推播訊息的完整記錄（含訊息內容，供除錯與分析）
-- =============================================================
CREATE TABLE IF NOT EXISTS push_log (
    log_id          BIGINT       NOT NULL AUTO_INCREMENT,
    schedule_id     BIGINT       COMMENT 'FK → push_schedule（手動觸發時為 NULL）',
    user_id         VARCHAR(64)  NOT NULL,
    child_id        INT          COMMENT '相關子女（可為 NULL，例：系統公告）',

    -- 訊息內容快照
    message_type    ENUM('milestone','announcement','qa_reply','system')
                    NOT NULL DEFAULT 'milestone',
    message_content TEXT         NOT NULL COMMENT '實際發出的 LINE 訊息內容',

    -- LINE API 回應
    line_message_id VARCHAR(100),
    http_status     SMALLINT     COMMENT 'LINE API HTTP 狀態碼',
    is_success      TINYINT(1)   NOT NULL DEFAULT 0,

    sent_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (log_id),
    INDEX idx_user_id_sent (user_id, sent_at),
    INDEX idx_schedule_id (schedule_id),
    INDEX idx_sent_at (sent_at)
) ENGINE=InnoDB COMMENT='推播訊息發送記錄';


-- =============================================================
-- TABLE 7: rag_chunks
-- Wiki Markdown 切分後的文字塊元資料
-- 實際向量（Embedding）儲存於 ChromaDB / FAISS
-- 此表儲存 chunk 元資料，供 RAG 結果回溯對應原始文章
-- =============================================================
CREATE TABLE IF NOT EXISTS rag_chunks (
    chunk_id        INT          NOT NULL AUTO_INCREMENT,
    article_id      INT          NOT NULL COMMENT 'FK → wiki_articles.article_id',

    -- 切分資訊
    chunk_index     SMALLINT     NOT NULL COMMENT '此文章中的第幾塊（0起）',
    section_header  VARCHAR(200) COMMENT '所屬 ## 標題',
    chunk_text      TEXT         NOT NULL COMMENT '切分後文字（最大約500字）',
    char_count      SMALLINT     NOT NULL,

    -- 向量資料庫對應 ID
    chroma_doc_id   VARCHAR(100) COMMENT 'ChromaDB document ID',
    embedding_model VARCHAR(100) NOT NULL DEFAULT 'text-embedding-3-small'
                                 COMMENT '使用的 Embedding 模型',

    -- 元資料（存入 ChromaDB metadata，供過濾）
    meta_category   VARCHAR(50)  COMMENT '繼承自 wiki_articles.category',
    meta_cities     JSON         COMMENT '繼承自 wiki_articles.applicable_cities',
    meta_tags       JSON         COMMENT '繼承自 wiki_articles.tags',

    is_indexed      TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '是否已向量化',
    indexed_at      DATETIME     COMMENT '向量化完成時間',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (chunk_id),
    UNIQUE KEY uk_article_chunk (article_id, chunk_index),
    INDEX idx_chroma_doc_id (chroma_doc_id),
    INDEX idx_is_indexed (is_indexed),
    CONSTRAINT fk_chunks_article
        FOREIGN KEY (article_id) REFERENCES wiki_articles(article_id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='RAG 文字塊元資料（向量存 ChromaDB，此表存 metadata）';


-- =============================================================
-- TABLE 8: query_log
-- 使用者 RAG 查詢記錄，供分析熱門問題與持續優化
-- =============================================================
CREATE TABLE IF NOT EXISTS query_log (
    query_id        BIGINT       NOT NULL AUTO_INCREMENT,
    user_id         VARCHAR(64)  NOT NULL COMMENT 'FK → users.user_id',
    child_id        INT          COMMENT '查詢時選定的子女（Context Enrichment）',

    -- 查詢內容
    query_text      TEXT         NOT NULL COMMENT '使用者原始問題',
    query_intent    VARCHAR(100) COMMENT '意圖分類，例：補助查詢/疫苗時程/緊急求助',

    -- RAG 檢索結果
    retrieved_chunk_ids  JSON    COMMENT '回傳的 chunk_id 陣列',
    retrieved_article_ids JSON   COMMENT '回傳的 article_id 陣列（去重）',
    top_score       FLOAT        COMMENT '最高相似度分數',

    -- LLM 回應
    response_text   TEXT         COMMENT 'LLM 生成的回覆',
    model_used      VARCHAR(50)  COMMENT '使用的 LLM 模型',
    latency_ms      INT          COMMENT '總回應時間（毫秒）',

    -- 使用者回饋（未來擴充）
    user_rating     TINYINT      COMMENT '使用者評分 1-5，NULL=未評分',
    user_feedback   VARCHAR(500) COMMENT '使用者文字回饋',

    queried_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (query_id),
    INDEX idx_user_id_queried (user_id, queried_at),
    INDEX idx_query_intent (query_intent),
    INDEX idx_queried_at (queried_at)
) ENGINE=InnoDB COMMENT='RAG 查詢記錄（分析與優化用）';


-- =============================================================
-- 補充：初始化預設資料
-- =============================================================

-- 示範：插入一筆 Wiki 文章（對應 全國_公費疫苗接種時程.md）
INSERT INTO wiki_articles
    (filename, title, category, tags, applicable_cities, is_nationwide,
     source_title, source_url, content_markdown, is_active)
VALUES (
    '全國_公費疫苗接種時程.md',
    'CDC 現行兒童公費疫苗接種時程（11401版）',
    '疫苗接種',
    '["疫苗","公費","兒童","全國"]',
    '["全國"]',
    1,
    'CDC 兒童疫苗接種時程',
    'https://www.cdc.gov.tw/Category/Page/TxRW-x3WzvPhvEtxM628GA',
    '-- 請由 Python 腳本讀取 Markdown 檔匯入 --',
    1
);

-- 示範：對應疫苗里程碑（出生24小時、滿2個月等）
INSERT INTO milestones
    (article_id, label, trigger_type, trigger_value, notify_days_before, priority, cta_label, description)
VALUES
    (1, 'B型肝炎疫苗第1劑 + 卡介苗',    'age_days',   1,  0, 'high', '查看接種說明', '出生24小時內於醫院施打，通常由醫院安排'),
    (1, '五合一疫苗第1劑 + PCV13 第1劑', 'age_months', 2,  7, 'high', '預約兒科診所', '滿2個月時接種，請提前預約'),
    (1, '五合一疫苗第2劑 + PCV13 第2劑', 'age_months', 4,  7, 'high', '預約兒科診所', '滿4個月時接種'),
    (1, '五合一疫苗第3劑 + 輪狀病毒',    'age_months', 6,  7, 'high', '預約兒科診所', '滿6個月時接種'),
    (1, 'MMR 麻疹腮腺炎德國麻疹',         'age_months', 12, 7, 'high', '預約兒科診所', '滿12個月時接種'),
    (1, '水痘疫苗第1劑',                  'age_months', 12, 7, 'medium','預約兒科診所', '滿12個月時接種'),
    (1, '日本腦炎疫苗第1劑',              'age_months', 15, 7, 'medium','預約兒科診所', '滿15個月時接種'),
    (1, 'A型肝炎疫苗第1劑',               'age_months', 18, 7, 'medium','預約兒科診所', '滿18個月時接種');


-- =============================================================
-- 視圖（Views）：便於後端查詢
-- =============================================================

-- 視圖 1：今日待推播清單（APScheduler 每日呼叫）
CREATE OR REPLACE VIEW v_today_push AS
SELECT
    ps.schedule_id,
    ps.user_id,
    ps.child_id,
    c.nickname          AS child_nickname,
    c.birth_date,
    u.display_name      AS user_name,
    u.household_city,
    m.label             AS milestone_label,
    m.description       AS milestone_desc,
    m.cta_label,
    m.cta_url,
    m.priority,
    wa.title            AS article_title,
    ps.scheduled_date
FROM push_schedule ps
JOIN children   c  ON ps.child_id     = c.child_id
JOIN users      u  ON ps.user_id      = u.user_id
JOIN milestones m  ON ps.milestone_id = m.milestone_id
JOIN wiki_articles wa ON m.article_id = wa.article_id
WHERE ps.scheduled_date = CURDATE()
  AND ps.status         = 'pending'
  AND c.is_active       = 1
  AND u.notify_enabled  = 1
  AND m.is_active       = 1
ORDER BY m.priority DESC, ps.schedule_id;


-- 視圖 2：使用者育兒時程總覽（LINE Bot 個人化查詢）
CREATE OR REPLACE VIEW v_user_timeline AS
SELECT
    ps.user_id,
    c.nickname,
    c.birth_date,
    m.label,
    m.trigger_type,
    m.trigger_value,
    ps.scheduled_date,
    ps.status,
    wa.category,
    wa.source_url
FROM push_schedule ps
JOIN children      c  ON ps.child_id     = c.child_id
JOIN milestones    m  ON ps.milestone_id = m.milestone_id
JOIN wiki_articles wa ON m.article_id    = wa.article_id
WHERE c.is_active = 1
ORDER BY ps.user_id, ps.scheduled_date;


-- 視圖 3：未向量化的 chunk（給 RAG 建置腳本使用）
CREATE OR REPLACE VIEW v_pending_chunks AS
SELECT
    rc.chunk_id,
    rc.article_id,
    rc.chunk_index,
    rc.chunk_text,
    rc.meta_category,
    rc.meta_cities,
    rc.meta_tags,
    wa.filename
FROM rag_chunks rc
JOIN wiki_articles wa ON rc.article_id = wa.article_id
WHERE rc.is_indexed = 0
  AND wa.is_active  = 1
ORDER BY rc.article_id, rc.chunk_index;
