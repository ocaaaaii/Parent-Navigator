-- ============================================================
-- 育兒導航 Agent — Supabase PostgreSQL Schema
-- 執行方式：在 Supabase Dashboard → SQL Editor 貼上執行
-- 注意：Supabase 已預設啟用 pgvector，無需額外申請
-- ============================================================

-- 啟用 pgvector 擴充套件（向量相似度搜尋）
CREATE EXTENSION IF NOT EXISTS vector;

-- ── 使用者表 ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  user_id          VARCHAR(64) PRIMARY KEY,
  household_city   VARCHAR(20),
  notify_enabled   BOOLEAN DEFAULT TRUE,
  notify_hour      SMALLINT DEFAULT 9,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── 小孩資料表 ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS children (
  child_id          BIGSERIAL PRIMARY KEY,
  user_id           VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  nickname          VARCHAR(20) NOT NULL,
  birth_date        DATE NOT NULL,
  gender            VARCHAR(10) DEFAULT 'unknown',
  is_low_income     BOOLEAN DEFAULT FALSE,
  is_mid_low_income BOOLEAN DEFAULT FALSE,
  is_disability     BOOLEAN DEFAULT FALSE,
  is_preterm        BOOLEAN DEFAULT FALSE,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, nickname, birth_date)
);

-- ── 里程碑定義表 ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS milestones (
  milestone_id       BIGSERIAL PRIMARY KEY,
  label              VARCHAR(100) NOT NULL,
  trigger_type       VARCHAR(20)  NOT NULL,  -- age_days / age_months / age_years
  trigger_value      INT          NOT NULL,
  notify_days_before INT          DEFAULT 7,
  message_template   TEXT         NOT NULL,
  category           VARCHAR(20)  DEFAULT 'vaccine',  -- vaccine / subsidy / health
  priority           SMALLINT     DEFAULT 1,
  is_active          BOOLEAN      DEFAULT TRUE,
  UNIQUE(trigger_type, trigger_value, label)
);

-- ── 推播排程表 ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_schedule (
  schedule_id    BIGSERIAL PRIMARY KEY,
  child_id       BIGINT    NOT NULL REFERENCES children(child_id) ON DELETE CASCADE,
  user_id        VARCHAR(64) NOT NULL,
  milestone_id   BIGINT    REFERENCES milestones(milestone_id),
  scheduled_date DATE      NOT NULL,
  status         VARCHAR(10) DEFAULT 'pending',  -- pending / sent / skipped / failed
  sent_at        TIMESTAMPTZ,
  error_message  TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(child_id, milestone_id, scheduled_date)
);

-- ── Wiki 文章元資料表 ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wiki_articles (
  article_id  BIGSERIAL PRIMARY KEY,
  filename    VARCHAR(200) UNIQUE NOT NULL,
  title       VARCHAR(200),
  tags        TEXT,
  cities      TEXT    DEFAULT '全國',
  file_hash   VARCHAR(32),
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── RAG 向量 chunk 表（核心：整合 pgvector）─────────────────────
CREATE TABLE IF NOT EXISTS rag_chunks (
  chunk_id    BIGSERIAL PRIMARY KEY,
  article_id  BIGINT REFERENCES wiki_articles(article_id) ON DELETE CASCADE,
  chunk_text  TEXT    NOT NULL,
  chunk_hash  VARCHAR(32) UNIQUE NOT NULL,
  meta_cities TEXT    DEFAULT '全國',
  filename    VARCHAR(200),
  embedding   vector(1536),          -- OpenAI text-embedding-3-small 維度
  is_indexed  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW 近似最近鄰索引（cosine 相似度，速度快 10-100x vs ivfflat）
CREATE INDEX IF NOT EXISTS rag_chunks_embedding_hnsw
  ON rag_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ── 爬蟲執行記錄表 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crawl_log (
  log_id            BIGSERIAL PRIMARY KEY,
  source_url        TEXT,
  status            VARCHAR(20) DEFAULT 'success',
  articles_updated  INT         DEFAULT 0,
  error_message     TEXT,
  crawled_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── 對話狀態機表 ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversation_state (
  user_id    VARCHAR(64) PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  state      VARCHAR(30) DEFAULT 'IDLE',
  temp_data  JSONB       DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 網頁使用者表 ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS web_users (
  web_user_id   BIGSERIAL PRIMARY KEY,
  email         VARCHAR(100) UNIQUE NOT NULL,
  username      VARCHAR(50)  NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 論壇板塊表 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS forum_categories (
  category_id BIGSERIAL PRIMARY KEY,
  name        VARCHAR(30)  NOT NULL,
  description VARCHAR(200),
  icon        VARCHAR(10),
  sort_order  SMALLINT DEFAULT 0
);

-- ── 論壇貼文表 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS forum_posts (
  post_id      BIGSERIAL PRIMARY KEY,
  category_id  BIGINT REFERENCES forum_categories(category_id),
  web_user_id  BIGINT REFERENCES web_users(web_user_id) ON DELETE SET NULL,
  title        VARCHAR(200) NOT NULL,
  content      TEXT         NOT NULL,
  is_anonymous BOOLEAN DEFAULT FALSE,
  like_count   INT     DEFAULT 0,
  comment_count INT    DEFAULT 0,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── 論壇留言表（支援巢狀）─────────────────────────────────────
CREATE TABLE IF NOT EXISTS forum_comments (
  comment_id        BIGSERIAL PRIMARY KEY,
  post_id           BIGINT REFERENCES forum_posts(post_id) ON DELETE CASCADE,
  web_user_id       BIGINT REFERENCES web_users(web_user_id) ON DELETE SET NULL,
  parent_comment_id BIGINT REFERENCES forum_comments(comment_id),
  content           TEXT    NOT NULL,
  is_anonymous      BOOLEAN DEFAULT FALSE,
  like_count        INT     DEFAULT 0,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── 按讚記錄表 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_likes (
  post_id     BIGINT REFERENCES forum_posts(post_id) ON DELETE CASCADE,
  web_user_id BIGINT REFERENCES web_users(web_user_id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, web_user_id)
);

CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id  BIGINT REFERENCES forum_comments(comment_id) ON DELETE CASCADE,
  web_user_id BIGINT REFERENCES web_users(web_user_id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (comment_id, web_user_id)
);

-- ============================================================
-- 預設資料
-- ============================================================

-- 論壇板塊預設值
INSERT INTO forum_categories (name, description, icon, sort_order) VALUES
  ('補助討論', '育兒津貼、托育補助、生育獎勵金討論', '💰', 1),
  ('寶寶健康', '疫苗、健檢、發燒就醫、早療分享',     '🏥', 2),
  ('托育分享', '保母、托嬰中心、幼兒園選擇心得',     '🏠', 3),
  ('新手問答', '新手爸媽提問、過來人經驗分享',       '❓', 4),
  ('生活日常', '育兒生活、好物推薦、情感支持',       '🌱', 5)
ON CONFLICT DO NOTHING;

-- 里程碑預設值（疫苗 + 補助提醒）
INSERT INTO milestones (label, trigger_type, trigger_value, notify_days_before, message_template, category, priority) VALUES
  ('B型肝炎疫苗 第1劑',                'age_days',   0,  0, '{nickname} 出生24小時內，請確認已在醫院施打B型肝炎疫苗第1劑！', 'vaccine', 5),
  ('卡介苗（BCG）接種',                'age_days',   7,  3, '🔔 {nickname} 快滿1週了，記得安排卡介苗接種喔！', 'vaccine', 5),
  ('B型肝炎疫苗 第2劑',                'age_months', 1,  5, '🔔 {nickname} 快滿1個月！記得安排B型肝炎疫苗第2劑。', 'vaccine', 5),
  ('五合一 + 肺炎鏈球菌 第1劑',        'age_months', 2,  7, '🔔 {nickname} 快滿2個月！需接種五合一第1劑和肺炎鏈球菌第1劑，請預約小兒科。', 'vaccine', 5),
  ('五合一 + 肺炎鏈球菌 第2劑',        'age_months', 4,  7, '🔔 {nickname} 快滿4個月！記得接種五合一第2劑和肺炎鏈球菌第2劑。', 'vaccine', 5),
  ('B肝第3劑 + 五合一第3劑 + 流感疫苗', 'age_months', 6,  7, '🔔 {nickname} 快滿6個月！需接種B肝第3劑、五合一第3劑，並可開始接種流感疫苗。', 'vaccine', 5),
  ('水痘 + MMR + 日本腦炎第1劑',       'age_months', 12, 7, '🔔 {nickname} 快滿1歲！需接種水痘、MMR、日本腦炎，並安排1歲健兒門診。', 'vaccine', 5),
  ('育兒津貼申請提醒',                 'age_days',   30, 0, '💰 {nickname} 已滿1個月！記得申請育兒津貼（第1胎每月5,000元），可至戶籍地公所或線上社福通申請。', 'subsidy', 4),
  ('台北市生育獎勵金截止提醒',          'age_days',   55, 0, '⚠️ {nickname} 出生即將滿60天！台北市生育獎勵金（第1胎4萬元）申請截止日快到了，請至戶政事務所辦理！', 'subsidy', 5),
  ('2歲轉銜：準備幼兒園入學',           'age_months', 23, 14, '📋 {nickname} 快滿2歲！育兒津貼將停止。可申請準公共托育延長補助至3歲，或開始準備幼兒園報名。', 'subsidy', 3)
ON CONFLICT (trigger_type, trigger_value, label) DO NOTHING;
