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
--
-- 注意：age_months 不使用 GENERATED ALWAYS AS
-- 原因：AGE() 依賴當下日期（STABLE），PostgreSQL generated column
--       只允許 IMMUTABLE 函式，故改為查詢時即時計算（見下方 function）。
--
CREATE TABLE IF NOT EXISTS children (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT,                          -- 孩子暱稱（選填）
  birth_date     DATE         NOT NULL,          -- 出生日期
  gender         TEXT         CHECK (gender IN ('male','female') OR gender IS NULL),
  birth_order    INT          NOT NULL DEFAULT 1 CHECK (birth_order >= 1),
                                                 -- 第幾胎
  special_status TEXT         DEFAULT NULL,      -- 孩子特殊身分（逗號分隔）
  is_active      BOOLEAN      DEFAULT TRUE,      -- 是否為主要查詢孩子
  created_at     TIMESTAMPTZ  DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  DEFAULT NOW()
);

COMMENT ON TABLE  children               IS '孩子資料（一 user 對多 children）';
COMMENT ON COLUMN children.birth_order   IS '第幾胎：1 / 2 / 3 / 4以上';
COMMENT ON COLUMN children.special_status IS '孩子特殊身分（逗號分隔）：premature,disability,...';

-- ── 3. 月齡計算 Function（取代 GENERATED COLUMN）─────────────────
--
-- 用法：SELECT get_age_months(birth_date) FROM children;
-- 組員評分引擎查詢時使用此 function 取得即時月齡。
--
CREATE OR REPLACE FUNCTION get_age_months(p_birth_date DATE)
RETURNS INT
LANGUAGE SQL
STABLE
AS $$
  SELECT (
    EXTRACT(YEAR  FROM AGE(CURRENT_DATE, p_birth_date)) * 12 +
    EXTRACT(MONTH FROM AGE(CURRENT_DATE, p_birth_date))
  )::INT;
$$;

-- 方便查詢的 View（含即時 age_months）
CREATE OR REPLACE VIEW children_with_age AS
  SELECT
    *,
    get_age_months(birth_date) AS age_months
  FROM children;

COMMENT ON VIEW children_with_age IS
  '含即時月齡的孩子資料檢視，age_months 每次查詢時動態計算';

-- ── 4. updated_at 自動更新 Trigger ────────────────────────────────
CREATE OR REPLACE FUNCTION update_children_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_children_updated_at ON children;
CREATE TRIGGER trg_children_updated_at
  BEFORE UPDATE ON children
  FOR EACH ROW EXECUTE FUNCTION update_children_updated_at();

-- ── 5. 建立 policy_click_events 表（點擊追蹤）────────────────────
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

-- ── 6. Indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_children_user_id        ON children(user_id);
CREATE INDEX IF NOT EXISTS idx_children_birth_date     ON children(birth_date);
CREATE INDEX IF NOT EXISTS idx_click_events_user       ON policy_click_events(user_id);
CREATE INDEX IF NOT EXISTS idx_click_events_child      ON policy_click_events(child_id);
CREATE INDEX IF NOT EXISTS idx_click_events_policy     ON policy_click_events(policy_id);
CREATE INDEX IF NOT EXISTS idx_click_events_category   ON policy_click_events(category);
CREATE INDEX IF NOT EXISTS idx_click_events_clicked_at ON policy_click_events(clicked_at DESC);

-- ── 7. RLS（Row Level Security）──────────────────────────────────
ALTER TABLE children             ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_click_events  ENABLE ROW LEVEL SECURITY;

-- children：只能存取自己的孩子（後端用 service_role 繞過 RLS）
CREATE POLICY "children_own" ON children
  FOR ALL USING (auth.uid()::text = user_id::text);

-- policy_click_events：只能存取自己的點擊
CREATE POLICY "click_events_own" ON policy_click_events
  FOR ALL USING (auth.uid()::text = user_id::text);

-- ── 完成確認 ──────────────────────────────────────────────────────
-- 執行後請確認以下查詢回傳正確結果：
--
--   SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_name = 'children';
--
--   SELECT get_age_months('2024-01-15'::DATE);  -- 應回傳約 17~18（視今天日期）
--
--   SELECT * FROM children_with_age LIMIT 1;
