-- ════════════════════════════════════════════════════════════════════════════
-- 育兒導航全攻略 — Supabase PostgreSQL Schema
-- 執行方式：Supabase Dashboard → SQL Editor → 貼上執行
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. 使用者主表 ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone                     TEXT UNIQUE NOT NULL,
  password_hash             TEXT NOT NULL,
  user_nickname             TEXT,                         -- 家長姓名
  baby_name                 TEXT,                         -- 寶寶暱稱
  baby_birthday_or_due_date DATE,                         -- 生日或預產期
  baby_gender               TEXT CHECK (baby_gender IN ('male','female','unknown')) DEFAULT 'unknown',
  region                    TEXT,                         -- 居住縣市
  interests                 JSONB DEFAULT '[]',           -- 主題偏好清單（有序陣列）
  onboarding_state          TEXT DEFAULT 'pending'        -- pending / completed
                              CHECK (onboarding_state IN ('pending','completed')),
  line_user_id              TEXT UNIQUE,                  -- LINE Bot 連結後填入
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

-- updated_at 自動更新 trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 2. OTP 驗證碼暫存表 ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_codes (
  phone       TEXT PRIMARY KEY,
  code        TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  verified    BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 自動清除過期 OTP（每小時執行，需在 Supabase Cron 設定）
-- SELECT cron.schedule('clean-otp', '0 * * * *',
--   $$DELETE FROM otp_codes WHERE expires_at < NOW()$$);

-- ── 3. 登入失敗次數（防暴力破解）─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS login_attempts (
  phone         TEXT PRIMARY KEY,
  count         INTEGER DEFAULT 0,
  blocked_until TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. 論壇文章 ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS forum_posts (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  category    TEXT DEFAULT 'general',       -- general / medical / subsidy / education
  tags        TEXT[] DEFAULT '{}',
  likes       INTEGER DEFAULT 0,
  views       INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER forum_posts_updated_at
  BEFORE UPDATE ON forum_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 5. 論壇留言 ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS forum_comments (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id     UUID REFERENCES forum_posts(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  content     TEXT NOT NULL,
  likes       INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 6. Row Level Security (RLS) ───────────────────────────────────────────────
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_codes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_posts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_comments ENABLE ROW LEVEL SECURITY;

-- Service role（後端 API）可操作所有資料
-- 前端直接存取時使用 anon key，僅允許讀取論壇
CREATE POLICY "Service role full access - users"
  ON users FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access - otp"
  ON otp_codes FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access - attempts"
  ON login_attempts FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Anyone can read forum posts"
  ON forum_posts FOR SELECT USING (TRUE);

CREATE POLICY "Service role manage forum posts"
  ON forum_posts FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Anyone can read forum comments"
  ON forum_comments FOR SELECT USING (TRUE);

CREATE POLICY "Service role manage forum comments"
  ON forum_comments FOR ALL USING (auth.role() = 'service_role');

-- ── 7. 索引 ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_phone          ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_line_user_id   ON users(line_user_id);
CREATE INDEX IF NOT EXISTS idx_forum_posts_category ON forum_posts(category);
CREATE INDEX IF NOT EXISTS idx_forum_posts_created  ON forum_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_comments_post  ON forum_comments(post_id);
