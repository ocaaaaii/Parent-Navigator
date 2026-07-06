-- ============================================================
-- seed_click_events.sql
-- 為 policy_click_events 補種 Demo 點擊資料
-- 目標比例：補助(subsidy) > 醫療(medical) > 托育(daycare) > 親子(activity)
-- 執行方式：貼入 Supabase SQL Editor → Run
-- ============================================================

-- 先刪除舊的 seed 資料（避免重複；如不想刪除請移除這段）
DELETE FROM policy_click_events WHERE user_id IS NULL;

-- ── 各類別 policy_id 池 ────────────────────────────────────
-- 補助福利 (subsidy)：目標 ~400 筆
INSERT INTO policy_click_events (user_id, child_id, policy_id, category, priority, clicked_at)
SELECT
  NULL,
  NULL,
  policy_id,
  'subsidy',
  priority,
  NOW() - (random() * INTERVAL '45 days')
FROM (
  VALUES
    ('subsidy-育兒津貼申請', 'high'),
    ('subsidy-台北市生育獎勵金', 'high'),
    ('subsidy-育嬰留職停薪', 'high'),
    ('subsidy-托育補助計畫', 'high'),
    ('subsidy-兒童醫療補助', 'medium'),
    ('subsidy-育兒家庭喘息服務', 'medium'),
    ('subsidy-低收入戶兒少補助', 'medium'),
    ('subsidy-特殊境遇家庭扶助', 'medium'),
    ('subsidy-兒少未來教育帳戶', 'low'),
    ('subsidy-好孕2U專車補助', 'low')
) AS t(policy_id, priority),
generate_series(1, 40) AS s  -- 10 種 × 40 次 = 400 筆
;

-- ── 醫療保健 (medical)：目標 ~290 筆 ──────────────────────────
INSERT INTO policy_click_events (user_id, child_id, policy_id, category, priority, clicked_at)
SELECT
  NULL,
  NULL,
  policy_id,
  'medical',
  priority,
  NOW() - (random() * INTERVAL '45 days')
FROM (
  VALUES
    ('medical-公費疫苗時程', 'high'),
    ('medical-兒童預防保健', 'high'),
    ('medical-新生兒篩檢', 'high'),
    ('medical-孕婦產檢補助', 'high'),
    ('medical-兒童口腔保健', 'medium'),
    ('medical-自費疫苗加碼補助', 'medium'),
    ('medical-孕產婦心理健康', 'medium')
) AS t(policy_id, priority),
generate_series(1, 41) AS s  -- 7 種 × 41 次 ≈ 287 筆
;

-- ── 托育服務 (daycare)：目標 ~190 筆 ──────────────────────────
INSERT INTO policy_click_events (user_id, child_id, policy_id, category, priority, clicked_at)
SELECT
  NULL,
  NULL,
  policy_id,
  'daycare',
  priority,
  NOW() - (random() * INTERVAL '45 days')
FROM (
  VALUES
    ('daycare-公共托育服務', 'high'),
    ('daycare-保母媒合補助', 'high'),
    ('daycare-居家托育登記', 'medium'),
    ('daycare-托嬰中心評鑑', 'medium'),
    ('daycare-臨時托育服務', 'low')
) AS t(policy_id, priority),
generate_series(1, 38) AS s  -- 5 種 × 38 次 = 190 筆
;

-- ── 親子活動 (activity)：目標 ~90 筆 ──────────────────────────
INSERT INTO policy_click_events (user_id, child_id, policy_id, category, priority, clicked_at)
SELECT
  NULL,
  NULL,
  policy_id,
  'activity',
  priority,
  NOW() - (random() * INTERVAL '45 days')
FROM (
  VALUES
    ('activity-親子館活動', 'medium'),
    ('activity-兒童圖書館', 'medium'),
    ('activity-育兒親子共讀', 'low'),
    ('activity-兒童樂園優惠', 'low'),
    ('activity-親子活動補助', 'low')
) AS t(policy_id, priority),
generate_series(1, 18) AS s  -- 5 種 × 18 次 = 90 筆
;

-- ── 驗證結果 ──────────────────────────────────────────────────
SELECT
  category,
  COUNT(*) AS 筆數,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) AS 百分比
FROM policy_click_events
WHERE user_id IS NULL
GROUP BY category
ORDER BY 筆數 DESC;
