-- ════════════════════════════════════════════════════════════════
-- 測試假資料：30 筆 users + children（各自條件不同）
-- 執行方式：Supabase Dashboard → SQL Editor → 貼入執行
-- 密碼統一為 Test1234（hash 僅供測試，請勿用於正式環境）
-- ════════════════════════════════════════════════════════════════

-- 共用密碼 hash（原始密碼：Test1234）
-- $2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4RK8Z9uOm

DO $$
DECLARE
  -- 預設密碼 hash
  h TEXT := '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4RK8Z9uOm';

  -- user UUIDs
  u01 UUID := gen_random_uuid(); u02 UUID := gen_random_uuid();
  u03 UUID := gen_random_uuid(); u04 UUID := gen_random_uuid();
  u05 UUID := gen_random_uuid(); u06 UUID := gen_random_uuid();
  u07 UUID := gen_random_uuid(); u08 UUID := gen_random_uuid();
  u09 UUID := gen_random_uuid(); u10 UUID := gen_random_uuid();
  u11 UUID := gen_random_uuid(); u12 UUID := gen_random_uuid();
  u13 UUID := gen_random_uuid(); u14 UUID := gen_random_uuid();
  u15 UUID := gen_random_uuid(); u16 UUID := gen_random_uuid();
  u17 UUID := gen_random_uuid(); u18 UUID := gen_random_uuid();
  u19 UUID := gen_random_uuid(); u20 UUID := gen_random_uuid();
  u21 UUID := gen_random_uuid(); u22 UUID := gen_random_uuid();
  u23 UUID := gen_random_uuid(); u24 UUID := gen_random_uuid();
  u25 UUID := gen_random_uuid(); u26 UUID := gen_random_uuid();
  u27 UUID := gen_random_uuid(); u28 UUID := gen_random_uuid();
  u29 UUID := gen_random_uuid(); u30 UUID := gen_random_uuid();

BEGIN

-- ────────────────────────────────────────────────────────────────
-- INSERT users
-- ────────────────────────────────────────────────────────────────
INSERT INTO users (id, phone, password_hash, user_nickname, region,
                   parental_employment, special_status, preferred_categories,
                   onboarding_state, created_at)
VALUES

-- 01 雙薪 / 台北市 / 無特殊身分 / 醫療+補助
(u01,'0912001001',h,'陳小明','台北市','both_working',NULL,
 '["medical","subsidy"]','completed', NOW() - INTERVAL '30 days'),

-- 02 單薪 / 新北市 / 無特殊身分 / 補助+托育
(u02,'0912001002',h,'林美玲','新北市','single_working',NULL,
 '["subsidy","daycare"]','completed', NOW() - INTERVAL '28 days'),

-- 03 全職照顧 / 台中市 / 無特殊身分 / 醫療
(u03,'0912001003',h,'王大偉','台中市','not_working',NULL,
 '["medical"]','completed', NOW() - INTERVAL '26 days'),

-- 04 雙薪 / 台北市 / 低收入戶 / 補助+醫療
(u04,'0912001004',h,'張雅婷','台北市','both_working','low_income',
 '["subsidy","medical"]','completed', NOW() - INTERVAL '25 days'),

-- 05 單薪 / 新北市 / 單親家庭 / 補助
(u05,'0912001005',h,'劉靜雯','新北市','single_working','single_parent',
 '["subsidy"]','completed', NOW() - INTERVAL '24 days'),

-- 06 雙薪 / 桃園市 / 無特殊身分 / 托育+活動
(u06,'0912001006',h,'黃俊傑','桃園市','both_working',NULL,
 '["daycare","activity"]','completed', NOW() - INTERVAL '23 days'),

-- 07 全職照顧 / 台北市 / 中低收入戶 / 補助
(u07,'0912001007',h,'吳淑芬','台北市','not_working','middle_low_income',
 '["subsidy"]','completed', NOW() - INTERVAL '22 days'),

-- 08 雙薪 / 高雄市 / 無特殊身分 / 醫療+活動
(u08,'0912001008',h,'鄭建宏','高雄市','both_working',NULL,
 '["medical","activity"]','completed', NOW() - INTERVAL '21 days'),

-- 09 單薪 / 台南市 / 無特殊身分 / 補助
(u09,'0912001009',h,'許雅萍','台南市','single_working',NULL,
 '["subsidy"]','completed', NOW() - INTERVAL '20 days'),

-- 10 雙薪 / 台北市 / 特殊境遇家庭 / 補助+醫療
(u10,'0912001010',h,'蔡明宏','台北市','both_working','special_circumstances',
 '["subsidy","medical"]','completed', NOW() - INTERVAL '19 days'),

-- 11 全職照顧 / 新北市 / 無特殊身分 / 全部主題
(u11,'0912001011',h,'楊佳慧','新北市','not_working',NULL,
 '["medical","subsidy","daycare","activity"]','completed', NOW() - INTERVAL '18 days'),

-- 12 雙薪 / 桃園市 / 無特殊身分 / 托育+活動
(u12,'0912001012',h,'謝志成','桃園市','both_working',NULL,
 '["daycare","activity"]','completed', NOW() - INTERVAL '17 days'),

-- 13 單薪 / 台中市 / 低收入+單親 / 補助
(u13,'0912001013',h,'洪秀珠','台中市','single_working','low_income,single_parent',
 '["subsidy"]','completed', NOW() - INTERVAL '16 days'),

-- 14 雙薪 / 台北市 / 無特殊身分 / 醫療（孩子早產兒）
(u14,'0912001014',h,'林志遠','台北市','both_working',NULL,
 '["medical"]','completed', NOW() - INTERVAL '15 days'),

-- 15 全職照顧 / 高雄市 / 無特殊身分 / 親子活動
(u15,'0912001015',h,'陳美惠','高雄市','not_working',NULL,
 '["activity"]','completed', NOW() - INTERVAL '14 days'),

-- 16 雙薪 / 新竹市 / 無特殊身分 / 補助+托育
(u16,'0912001016',h,'賴俊賢','新竹市','both_working',NULL,
 '["subsidy","daycare"]','completed', NOW() - INTERVAL '13 days'),

-- 17 單薪 / 台北市 / 原住民族 / 補助
(u17,'0912001017',h,'高雅婷','台北市','single_working','indigenous',
 '["subsidy"]','completed', NOW() - INTERVAL '12 days'),

-- 18 雙薪 / 宜蘭縣 / 無特殊身分 / 醫療+活動
(u18,'0912001018',h,'吳家豪','宜蘭縣','both_working',NULL,
 '["medical","activity"]','completed', NOW() - INTERVAL '11 days'),

-- 19 全職照顧 / 台南市 / 隔代教養 / 補助
(u19,'0912001019',h,'林秋月','台南市','not_working','grandparent_care',
 '["subsidy"]','completed', NOW() - INTERVAL '10 days'),

-- 20 雙薪 / 台北市 / 無特殊身分 / 醫療+補助（孩子身心障礙）
(u20,'0912001020',h,'張育誠','台北市','both_working',NULL,
 '["medical","subsidy"]','completed', NOW() - INTERVAL '9 days'),

-- 21 單薪 / 桃園市 / 新住民子女 / 補助+活動
(u21,'0912001021',h,'陳淑芬','桃園市','single_working','new_resident',
 '["subsidy","activity"]','completed', NOW() - INTERVAL '8 days'),

-- 22 雙薪 / 台中市 / 無特殊身分 / 全部主題
(u22,'0912001022',h,'許志豪','台中市','both_working',NULL,
 '["medical","subsidy","daycare","activity"]','completed', NOW() - INTERVAL '7 days'),

-- 23 全職照顧 / 新北市 / 中低收入戶 / 補助+醫療
(u23,'0912001023',h,'蘇雅文','新北市','not_working','middle_low_income',
 '["subsidy","medical"]','completed', NOW() - INTERVAL '7 days'),

-- 24 雙薪 / 台北市 / 無特殊身分 / 醫療
(u24,'0912001024',h,'莊佳玲','台北市','both_working',NULL,
 '["medical"]','completed', NOW() - INTERVAL '6 days'),

-- 25 單薪 / 彰化縣 / 無特殊身分 / 補助
(u25,'0912001025',h,'郭明達','彰化縣','single_working',NULL,
 '["subsidy"]','completed', NOW() - INTERVAL '6 days'),

-- 26 雙薪 / 台北市 / 受暴家庭 / 補助+醫療
(u26,'0912001026',h,'黃怡君','台北市','both_working','domestic_violence',
 '["subsidy","medical"]','completed', NOW() - INTERVAL '5 days'),

-- 27 全職照顧 / 台南市 / 無特殊身分 / 親子活動
(u27,'0912001027',h,'方宜真','台南市','not_working',NULL,
 '["activity"]','completed', NOW() - INTERVAL '5 days'),

-- 28 雙薪 / 高雄市 / 無特殊身分 / 托育（第二胎）
(u28,'0912001028',h,'余建志','高雄市','both_working',NULL,
 '["daycare","subsidy"]','completed', NOW() - INTERVAL '4 days'),

-- 29 單薪 / 台北市 / 特殊境遇家庭 / 補助
(u29,'0912001029',h,'江淑慧','台北市','single_working','special_circumstances',
 '["subsidy"]','completed', NOW() - INTERVAL '3 days'),

-- 30 雙薪 / 新竹縣 / 無特殊身分 / 醫療+補助（第三胎）
(u30,'0912001030',h,'徐志明','新竹縣','both_working',NULL,
 '["medical","subsidy"]','completed', NOW() - INTERVAL '2 days');

-- ────────────────────────────────────────────────────────────────
-- INSERT children
-- ────────────────────────────────────────────────────────────────
INSERT INTO children (user_id, name, birth_date, gender, birth_order, special_status, is_active)
VALUES

-- u01 男寶 3個月 第一胎 無特殊
(u01, '小橙', '2026-04-01', 'male',   1, NULL, true),

-- u02 女寶 8個月 第一胎 無特殊
(u02, '小米', '2025-11-01', 'female', 1, NULL, true),

-- u03 男寶 新生兒 第一胎 無特殊
(u03, '小糰', '2026-06-20', 'male',   1, NULL, true),

-- u04 女寶 15個月 第一胎 無特殊
(u04, '小珊', '2025-04-01', 'female', 1, NULL, true),

-- u05 男寶 24個月 第一胎 無特殊
(u05, '小宇', '2024-07-01', 'male',   1, NULL, true),

-- u06 女寶 18個月 第一胎 無特殊
(u06, '小柚', '2025-01-01', 'female', 1, NULL, true),

-- u07 男寶 6個月 第一胎 無特殊
(u07, '小胖', '2026-01-01', 'male',   1, NULL, true),

-- u08 女寶 24個月 第一胎 無特殊
(u08, '小葉', '2024-07-01', 'female', 1, NULL, true),

-- u09 男寶 36個月 第一胎 無特殊
(u09, '小凱', '2023-07-01', 'male',   1, NULL, true),

-- u10 男寶 1個月 第一胎 無特殊
(u10, '小新', '2026-06-01', 'male',   1, NULL, true),

-- u11 女寶 48個月 第二胎 無特殊（含兄姊）
(u11, '小甜', '2022-07-01', 'female', 2, NULL, true),

-- u12 男寶 30個月 第一胎 無特殊
(u12, '小翔', '2024-01-01', 'male',   1, NULL, true),

-- u13 女寶 10個月 第一胎 無特殊
(u13, '小芸', '2025-09-01', 'female', 1, NULL, true),

-- u14 男寶 2個月 第一胎 早產兒
(u14, '小安', '2026-05-01', 'male',   1, 'premature', true),

-- u15 女寶 42個月 第一胎 無特殊
(u15, '小晴', '2023-01-01', 'female', 1, NULL, true),

-- u16 男寶 12個月 第一胎 無特殊
(u16, '小諾', '2025-07-01', 'male',   1, NULL, true),

-- u17 女寶 20個月 第一胎 無特殊
(u17, '小蓮', '2024-11-01', 'female', 1, NULL, true),

-- u18 男寶 60個月 第一胎 無特殊
(u18, '小毅', '2021-07-01', 'male',   1, NULL, true),

-- u19 女寶 8個月 第一胎 無特殊
(u19, '小花', '2025-11-01', 'female', 1, NULL, true),

-- u20 男寶 14個月 第一胎 身心障礙
(u20, '小勇', '2025-05-01', 'male',   1, 'disability', true),

-- u21 女寶 26個月 第一胎 無特殊
(u21, '小恩', '2024-05-01', 'female', 1, NULL, true),

-- u22 男寶 5個月 第一胎 低出生體重兒
(u22, '小寶', '2026-02-01', 'male',   1, 'low_birth_weight', true),

-- u23 女寶 32個月 第一胎 無特殊
(u23, '小妍', '2023-11-01', 'female', 1, NULL, true),

-- u24 男寶 7個月 第一胎 無特殊
(u24, '小虎', '2025-12-01', 'male',   1, NULL, true),

-- u25 女寶 16個月 第一胎 無特殊
(u25, '小月', '2025-03-01', 'female', 1, NULL, true),

-- u26 男寶 22個月 第一胎 無特殊
(u26, '小傑', '2024-09-01', 'male',   1, NULL, true),

-- u27 女寶 54個月 第一胎 發展遲緩
(u27, '小語', '2021-01-01', 'female', 1, 'developmental_delay', true),

-- u28 男寶 11個月 第二胎 無特殊
(u28, '小恆', '2025-08-01', 'male',   2, NULL, true),

-- u29 女寶 4個月 第一胎 無特殊
(u29, '小苗', '2026-03-01', 'female', 1, NULL, true),

-- u30 男寶 9個月 第三胎 無特殊
(u30, '小龍', '2025-10-01', 'male',   3, NULL, true);

END $$;

-- ── 確認資料 ──────────────────────────────────────────────────────
-- 執行後用以下 query 驗證：
--
-- SELECT u.user_nickname, u.region, u.parental_employment,
--        u.special_status, u.preferred_categories,
--        c.name AS baby, c.birth_date,
--        get_age_months(c.birth_date) AS age_months,
--        c.birth_order, c.special_status AS child_status
-- FROM users u
-- JOIN children c ON c.user_id = u.id
-- WHERE u.phone LIKE '09120010%'
-- ORDER BY c.birth_date DESC;
