-- ════════════════════════════════════════════════════════════════
-- Phase 5 Migration：整合組員個人化推薦引擎所需的 Schema 擴充
-- 執行方式：Supabase Dashboard → SQL Editor → 貼入執行
-- ════════════════════════════════════════════════════════════════

-- ── 1. 擴充 users 表：就業狀況、特殊身分、偏好主題 ─────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS parental_employment  TEXT DEFAULT NULL,
    -- both_working / single_working / not_working
  ADD COLUMN IF NOT EXISTS special_status       TEXT DEFAULT NULL,
    -- 逗號分隔：low_income,single_parent,...
  ADD COLUMN IF NOT EXISTS preferred_categories JSONB DEFAULT '[]';
    -- ["medical","subsidy","daycare","activity"]

COMMENT ON COLUMN users.parental_employment  IS '父母就業狀況：both_working / single_working / not_working';
COMMENT ON COLUMN users.special_status       IS '家庭特殊身分（逗號分隔）：low_income, single_parent, ...';
COMMENT ON COLUMN users.preferred_categories IS '偏好主題（JSON 陣列）：medical / subsidy / daycare / activity';

-- ── 2. 建立 children 表（一個帳號對應多位孩子）────────────────────
CREATE TABLE IF NOT EXISTS children (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT,                          -- 孩子暱稱（選填）
  birth_date     DATE         NOT NULL,          -- 出生日期
  age_months     INT          GENERATED ALWAYS AS (
                   EXTRACT(YEAR FROM AGE(birth_date)) * 12 +
                   EXTRACT(MONTH FROM AGE(birth_date))
                 ) STORED,                       -- 月齡（自動計算）
  gender         TEXT         CHECK (gender IN ('male','female',NULL)),
  birth_order    INT          NOT NULL DEFAULT 1 CHECK (birth_order >= 1),
                                                 -- 第幾胎
  special_status TEXT         DEFAULT NULL,      -- 孩子特殊身分（逗號分隔）
  is_active      BOOLEAN      DEFAULT TRUE,      -- 是否為主要查詢孩子
  created_at     TIMESTAMPTZ  DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  DEFAULT NOW()
);

COMMENT ON TABLE  children                    IS '孩子資料（一 user 對多 children）';
COMMENT ON COLUMN children.age_months         IS '月齡（由 birth_date 自動計算，不需前端傳入）';
COMMENT ON COLUMN children.birth_order        IS '第幾胎：1 / 2 / 3 / 4以上';
COMMENT ON COLUMN children.special_status     IS '孩子特殊身分（逗號分隔）：premature,disability,...';

-- 自動更新 updated_at
CREATE OR REPLACE FUNCTION update_children_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_children_updated_at ON children;
CREATE TRIGGER trg_children_updated_at
  BEFORE UPDATE ON children
  FOR EACH ROW EXECUTE FUNCTION update_children_updated_at();

-- ── 3. 建立 policy_click_events 表（點擊追蹤）────────────────────
CREATE TABLE IF NOT EXISTS policy_click_events (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
  child_id    UUID         REFERENCES children(id) ON DELETE SET NULL,
  policy_id   TEXT         NOT NULL,   -- wiki 文件 slug / policy_documents.id
  category    TEXT,                    -- medical / subsidy / daycare / activity
  priority    TEXT,                    -- high / medium / low（點擊當下的推薦層級）
  clicked_at  TIMESTAMPTZ  DEFAULT NOW()
);

COMMENT ON TABLE policy_click_events IS '使用者對推薦政策的點擊行為，用於個人化偏好學習';

-- ── 4. Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_children_user_id        ON children(user_id);
CREATE INDEX IF NOT EXISTS idx_children_age_months     ON children(age_months);
CREATE INDEX IF NOT EXISTS idx_click_events_user       ON policy_click_events(user_id);
CREATE INDEX IF NOT EXISTS idx_click_events_child      ON policy_click_events(child_id);
CREATE INDEX IF NOT EXISTS idx_click_events_policy     ON policy_click_events(policy_id);
CREATE INDEX IF NOT EXISTS idx_click_events_category   ON policy_click_events(category);
CREATE INDEX IF NOT EXISTS idx_click_events_clicked_at ON policy_click_events(clicked_at DESC);

-- ── 5. RLS（Row Level Security）─────────────────────────────────
ALTER TABLE children             ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_click_events  ENABLE ROW LEVEL SECURITY;

-- children：只能存取自己的孩子（後端用 service_role 繞過 RLS）
CREATE POLICY "children_own" ON children
  FOR ALL USING (auth.uid()::text = user_id::text);

-- policy_click_events：只能存取自己的點擊
CREATE POLICY "click_events_own" ON policy_click_events
  FOR ALL USING (auth.uid()::text = user_id::text);
