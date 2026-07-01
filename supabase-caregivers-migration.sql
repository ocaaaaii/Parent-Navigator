-- ════════════════════════════════════════════════════════════════════════════
-- 育兒導航全攻略 — 保母/家教媒合資料表 Migration
-- 執行方式：Supabase Dashboard → SQL Editor → 貼上執行
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. 保母/家教媒合資料表 ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS caregivers (
  id            UUID    DEFAULT gen_random_uuid() PRIMARY KEY,

  -- 來源資訊
  source        TEXT    NOT NULL                 -- 'ptt' | 'dcard' | '1111' | 'gov' | 'facebook' | 'self'
                CHECK (source IN ('ptt','dcard','1111','gov','facebook','self')),
  source_url    TEXT,                            -- 原始貼文連結
  source_id     TEXT,                            -- 原始平台的 post ID（避免重複爬）

  -- 刊登內容
  title         TEXT    NOT NULL,                -- 標題 / 姓名
  description   TEXT,                            -- 自我介紹 / 貼文內容
  caregiver_type TEXT   NOT NULL DEFAULT 'babysitter'
                CHECK (caregiver_type IN ('babysitter','tutor','nanny','other')),
                                                 -- babysitter=保母 tutor=家教 nanny=到府褓姆
  region        TEXT,                            -- 服務地區（縣市）
  district      TEXT,                            -- 區域（更細，如中山區）
  price_range   TEXT,                            -- 月薪/時薪，如 "20,000–25,000元/月"
  contact       TEXT,                            -- 聯絡方式（電話/LINE）
  image_url     TEXT,                            -- 個人照或貼文圖片

  -- 標籤
  tags          TEXT[]  DEFAULT '{}',            -- 如 ["貓咪友善","可短租","電梯","有執照"]

  -- 自行刊登專用欄位（source='self' 時填）
  poster_user_id UUID   REFERENCES users(id) ON DELETE SET NULL,
  is_verified   BOOLEAN DEFAULT FALSE,           -- 管理員審核通過

  -- 狀態
  is_active     BOOLEAN DEFAULT TRUE,
  posted_at     TIMESTAMPTZ,                     -- 原始貼文時間
  scraped_at    TIMESTAMPTZ DEFAULT NOW(),       -- 爬取時間
  expires_at    TIMESTAMPTZ                      -- 下架時間（自行刊登可設定）
);

-- 避免同一篇貼文重複爬入
CREATE UNIQUE INDEX IF NOT EXISTS idx_caregivers_source_id
  ON caregivers (source, source_id)
  WHERE source_id IS NOT NULL;

-- 常用查詢索引
CREATE INDEX IF NOT EXISTS idx_caregivers_region   ON caregivers(region);
CREATE INDEX IF NOT EXISTS idx_caregivers_type     ON caregivers(caregiver_type);
CREATE INDEX IF NOT EXISTS idx_caregivers_source   ON caregivers(source);
CREATE INDEX IF NOT EXISTS idx_caregivers_active   ON caregivers(is_active, is_verified);
CREATE INDEX IF NOT EXISTS idx_caregivers_posted   ON caregivers(posted_at DESC);

-- ── 2. Row Level Security ──────────────────────────────────────────────────
ALTER TABLE caregivers ENABLE ROW LEVEL SECURITY;

-- 所有人可讀取已審核且有效的刊登
CREATE POLICY "Anyone can read active caregivers"
  ON caregivers FOR SELECT
  USING (is_active = TRUE AND (is_verified = TRUE OR source = 'self'));

-- 後端 service role 全權限
CREATE POLICY "Service role full access - caregivers"
  ON caregivers FOR ALL
  USING (auth.role() = 'service_role');

-- ── 3. 驗證筆數 ────────────────────────────────────────────────────────────
SELECT COUNT(*) AS caregivers_table_created FROM caregivers;
