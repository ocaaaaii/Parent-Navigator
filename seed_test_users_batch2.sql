-- ════════════════════════════════════════════════════════════════
-- 測試假資料 Batch 2：70 筆 users + children（u31～u100）
-- 執行方式：Supabase Dashboard → SQL Editor → 貼入執行
-- 密碼統一為 Test1234
-- ════════════════════════════════════════════════════════════════

DO $$
DECLARE
  h TEXT := '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4RK8Z9uOm';

  u31 UUID := gen_random_uuid(); u32 UUID := gen_random_uuid();
  u33 UUID := gen_random_uuid(); u34 UUID := gen_random_uuid();
  u35 UUID := gen_random_uuid(); u36 UUID := gen_random_uuid();
  u37 UUID := gen_random_uuid(); u38 UUID := gen_random_uuid();
  u39 UUID := gen_random_uuid(); u40 UUID := gen_random_uuid();
  u41 UUID := gen_random_uuid(); u42 UUID := gen_random_uuid();
  u43 UUID := gen_random_uuid(); u44 UUID := gen_random_uuid();
  u45 UUID := gen_random_uuid(); u46 UUID := gen_random_uuid();
  u47 UUID := gen_random_uuid(); u48 UUID := gen_random_uuid();
  u49 UUID := gen_random_uuid(); u50 UUID := gen_random_uuid();
  u51 UUID := gen_random_uuid(); u52 UUID := gen_random_uuid();
  u53 UUID := gen_random_uuid(); u54 UUID := gen_random_uuid();
  u55 UUID := gen_random_uuid(); u56 UUID := gen_random_uuid();
  u57 UUID := gen_random_uuid(); u58 UUID := gen_random_uuid();
  u59 UUID := gen_random_uuid(); u60 UUID := gen_random_uuid();
  u61 UUID := gen_random_uuid(); u62 UUID := gen_random_uuid();
  u63 UUID := gen_random_uuid(); u64 UUID := gen_random_uuid();
  u65 UUID := gen_random_uuid(); u66 UUID := gen_random_uuid();
  u67 UUID := gen_random_uuid(); u68 UUID := gen_random_uuid();
  u69 UUID := gen_random_uuid(); u70 UUID := gen_random_uuid();
  u71 UUID := gen_random_uuid(); u72 UUID := gen_random_uuid();
  u73 UUID := gen_random_uuid(); u74 UUID := gen_random_uuid();
  u75 UUID := gen_random_uuid(); u76 UUID := gen_random_uuid();
  u77 UUID := gen_random_uuid(); u78 UUID := gen_random_uuid();
  u79 UUID := gen_random_uuid(); u80 UUID := gen_random_uuid();
  u81 UUID := gen_random_uuid(); u82 UUID := gen_random_uuid();
  u83 UUID := gen_random_uuid(); u84 UUID := gen_random_uuid();
  u85 UUID := gen_random_uuid(); u86 UUID := gen_random_uuid();
  u87 UUID := gen_random_uuid(); u88 UUID := gen_random_uuid();
  u89 UUID := gen_random_uuid(); u90 UUID := gen_random_uuid();
  u91 UUID := gen_random_uuid(); u92 UUID := gen_random_uuid();
  u93 UUID := gen_random_uuid(); u94 UUID := gen_random_uuid();
  u95 UUID := gen_random_uuid(); u96 UUID := gen_random_uuid();
  u97 UUID := gen_random_uuid(); u98 UUID := gen_random_uuid();
  u99 UUID := gen_random_uuid(); u100 UUID := gen_random_uuid();

BEGIN

-- ────────────────────────────────────────────────────────────────
-- INSERT users (u31～u100)
-- ────────────────────────────────────────────────────────────────
INSERT INTO users (id, phone, password_hash, user_nickname, region,
                   parental_employment, special_status, preferred_categories,
                   onboarding_state, created_at)
VALUES

-- 31 雙薪 / 基隆市 / 無特殊 / 醫療+補助
(u31,'0912001031',h,'林佳穎','基隆市','both_working',NULL,
 '["medical","subsidy"]','completed', NOW() - INTERVAL '60 days'),

-- 32 單薪 / 台北市 / 無特殊 / 托育
(u32,'0912001032',h,'陳俊宏','台北市','single_working',NULL,
 '["daycare"]','completed', NOW() - INTERVAL '59 days'),

-- 33 全職照顧 / 新北市 / 低收入 / 補助+醫療
(u33,'0912001033',h,'王雅玲','新北市','not_working','low_income',
 '["subsidy","medical"]','completed', NOW() - INTERVAL '58 days'),

-- 34 雙薪 / 桃園市 / 無特殊 / 醫療+活動
(u34,'0912001034',h,'張志偉','桃園市','both_working',NULL,
 '["medical","activity"]','completed', NOW() - INTERVAL '57 days'),

-- 35 單薪 / 新竹市 / 單親 / 補助
(u35,'0912001035',h,'吳淑華','新竹市','single_working','single_parent',
 '["subsidy"]','completed', NOW() - INTERVAL '56 days'),

-- 36 全職照顧 / 台中市 / 無特殊 / 親子活動
(u36,'0912001036',h,'蔡明哲','台中市','not_working',NULL,
 '["activity","daycare"]','completed', NOW() - INTERVAL '55 days'),

-- 37 雙薪 / 彰化縣 / 無特殊 / 補助+托育
(u37,'0912001037',h,'黃美珍','彰化縣','both_working',NULL,
 '["subsidy","daycare"]','completed', NOW() - INTERVAL '54 days'),

-- 38 雙薪 / 雲林縣 / 無特殊 / 醫療
(u38,'0912001038',h,'劉志忠','雲林縣','both_working',NULL,
 '["medical"]','completed', NOW() - INTERVAL '53 days'),

-- 39 單薪 / 嘉義市 / 中低收入 / 補助+醫療
(u39,'0912001039',h,'鄭雅慧','嘉義市','single_working','middle_low_income',
 '["subsidy","medical"]','completed', NOW() - INTERVAL '52 days'),

-- 40 全職照顧 / 台南市 / 無特殊 / 全部主題
(u40,'0912001040',h,'許建國','台南市','not_working',NULL,
 '["medical","subsidy","daycare","activity"]','completed', NOW() - INTERVAL '51 days'),

-- 41 雙薪 / 高雄市 / 無特殊 / 醫療+補助
(u41,'0912001041',h,'謝秀蘭','高雄市','both_working',NULL,
 '["medical","subsidy"]','completed', NOW() - INTERVAL '50 days'),

-- 42 單薪 / 屏東縣 / 原住民族 / 補助
(u42,'0912001042',h,'柯志明','屏東縣','single_working','indigenous',
 '["subsidy"]','completed', NOW() - INTERVAL '49 days'),

-- 43 全職照顧 / 台東縣 / 原住民族 / 補助+醫療
(u43,'0912001043',h,'江淑貞','台東縣','not_working','indigenous',
 '["subsidy","medical"]','completed', NOW() - INTERVAL '48 days'),

-- 44 雙薪 / 花蓮縣 / 無特殊 / 醫療+活動
(u44,'0912001044',h,'余建仁','花蓮縣','both_working',NULL,
 '["medical","activity"]','completed', NOW() - INTERVAL '47 days'),

-- 45 雙薪 / 宜蘭縣 / 無特殊 / 托育+補助
(u45,'0912001045',h,'方宜珊','宜蘭縣','both_working',NULL,
 '["daycare","subsidy"]','completed', NOW() - INTERVAL '46 days'),

-- 46 單薪 / 澎湖縣 / 無特殊 / 補助
(u46,'0912001046',h,'鍾志豪','澎湖縣','single_working',NULL,
 '["subsidy"]','completed', NOW() - INTERVAL '45 days'),

-- 47 全職照顧 / 台北市 / 特殊境遇 / 補助+醫療
(u47,'0912001047',h,'吳雅芳','台北市','not_working','special_circumstances',
 '["subsidy","medical"]','completed', NOW() - INTERVAL '44 days'),

-- 48 雙薪 / 新北市 / 無特殊 / 托育+活動
(u48,'0912001048',h,'林建廷','新北市','both_working',NULL,
 '["daycare","activity"]','completed', NOW() - INTERVAL '43 days'),

-- 49 單薪 / 台北市 / 新住民 / 補助+醫療
(u49,'0912001049',h,'陳依婷','台北市','single_working','new_resident',
 '["subsidy","medical"]','completed', NOW() - INTERVAL '42 days'),

-- 50 雙薪 / 桃園市 / 無特殊 / 全部主題
(u50,'0912001050',h,'張凱文','桃園市','both_working',NULL,
 '["medical","subsidy","daycare","activity"]','completed', NOW() - INTERVAL '41 days'),

-- 51 全職照顧 / 台中市 / 低收入+單親 / 補助
(u51,'0912001051',h,'李雅雯','台中市','not_working','low_income,single_parent',
 '["subsidy"]','completed', NOW() - INTERVAL '40 days'),

-- 52 雙薪 / 高雄市 / 無特殊 / 醫療+托育
(u52,'0912001052',h,'王俊傑','高雄市','both_working',NULL,
 '["medical","daycare"]','completed', NOW() - INTERVAL '39 days'),

-- 53 單薪 / 台南市 / 無特殊 / 補助+活動
(u53,'0912001053',h,'黃淑娟','台南市','single_working',NULL,
 '["subsidy","activity"]','completed', NOW() - INTERVAL '38 days'),

-- 54 全職照顧 / 新北市 / 無特殊 / 醫療
(u54,'0912001054',h,'蔡佳穎','新北市','not_working',NULL,
 '["medical"]','completed', NOW() - INTERVAL '37 days'),

-- 55 雙薪 / 台北市 / 受暴家庭 / 補助+醫療
(u55,'0912001055',h,'洪志遠','台北市','both_working','domestic_violence',
 '["subsidy","medical"]','completed', NOW() - INTERVAL '36 days'),

-- 56 單薪 / 桃園市 / 無特殊 / 托育
(u56,'0912001056',h,'鄭靜宜','桃園市','single_working',NULL,
 '["daycare"]','completed', NOW() - INTERVAL '35 days'),

-- 57 全職照顧 / 新竹縣 / 無特殊 / 活動+補助
(u57,'0912001057',h,'楊大偉','新竹縣','not_working',NULL,
 '["activity","subsidy"]','completed', NOW() - INTERVAL '34 days'),

-- 58 雙薪 / 台北市 / 無特殊 / 醫療+補助
(u58,'0912001058',h,'賴美芳','台北市','both_working',NULL,
 '["medical","subsidy"]','completed', NOW() - INTERVAL '33 days'),

-- 59 單薪 / 彰化縣 / 中低收入 / 補助
(u59,'0912001059',h,'許志強','彰化縣','single_working','middle_low_income',
 '["subsidy"]','completed', NOW() - INTERVAL '32 days'),

-- 60 雙薪 / 台中市 / 無特殊 / 醫療+活動
(u60,'0912001060',h,'曾雅婷','台中市','both_working',NULL,
 '["medical","activity"]','completed', NOW() - INTERVAL '31 days'),

-- 61 全職照顧 / 高雄市 / 隔代教養 / 補助
(u61,'0912001061',h,'林秀珍','高雄市','not_working','grandparent_care',
 '["subsidy"]','completed', NOW() - INTERVAL '30 days'),

-- 62 雙薪 / 新北市 / 無特殊 / 全部主題
(u62,'0912001062',h,'陳建宏','新北市','both_working',NULL,
 '["medical","subsidy","daycare","activity"]','completed', NOW() - INTERVAL '29 days'),

-- 63 單薪 / 台北市 / 無特殊 / 托育+活動
(u63,'0912001063',h,'吳雅琪','台北市','single_working',NULL,
 '["daycare","activity"]','completed', NOW() - INTERVAL '28 days'),

-- 64 全職照顧 / 嘉義縣 / 原住民族 / 補助+醫療
(u64,'0912001064',h,'張宗翰','嘉義縣','not_working','indigenous',
 '["subsidy","medical"]','completed', NOW() - INTERVAL '27 days'),

-- 65 雙薪 / 台北市 / 無特殊 / 醫療+補助
(u65,'0912001065',h,'黃珮瑜','台北市','both_working',NULL,
 '["medical","subsidy"]','completed', NOW() - INTERVAL '26 days'),

-- 66 單薪 / 台南市 / 單親 / 補助
(u66,'0912001066',h,'劉昱廷','台南市','single_working','single_parent',
 '["subsidy"]','completed', NOW() - INTERVAL '25 days'),

-- 67 全職照顧 / 桃園市 / 無特殊 / 托育+補助
(u67,'0912001067',h,'蔡欣怡','桃園市','not_working',NULL,
 '["daycare","subsidy"]','completed', NOW() - INTERVAL '24 days'),

-- 68 雙薪 / 台北市 / 低收入 / 補助+醫療
(u68,'0912001068',h,'謝明達','台北市','both_working','low_income',
 '["subsidy","medical"]','completed', NOW() - INTERVAL '23 days'),

-- 69 單薪 / 苗栗縣 / 無特殊 / 補助
(u69,'0912001069',h,'江佩君','苗栗縣','single_working',NULL,
 '["subsidy"]','completed', NOW() - INTERVAL '22 days'),

-- 70 全職照顧 / 新北市 / 無特殊 / 醫療
(u70,'0912001070',h,'余志偉','新北市','not_working',NULL,
 '["medical"]','completed', NOW() - INTERVAL '21 days'),

-- 71 雙薪 / 台中市 / 新住民 / 補助+活動
(u71,'0912001071',h,'陳玉鳳','台中市','both_working','new_resident',
 '["subsidy","activity"]','completed', NOW() - INTERVAL '20 days'),

-- 72 單薪 / 高雄市 / 無特殊 / 醫療+托育
(u72,'0912001072',h,'林俊男','高雄市','single_working',NULL,
 '["medical","daycare"]','completed', NOW() - INTERVAL '19 days'),

-- 73 雙薪 / 台北市 / 無特殊 / 全部主題
(u73,'0912001073',h,'王淑芳','台北市','both_working',NULL,
 '["medical","subsidy","daycare","activity"]','completed', NOW() - INTERVAL '18 days'),

-- 74 全職照顧 / 花蓮縣 / 原住民族 / 補助
(u74,'0912001074',h,'楊志龍','花蓮縣','not_working','indigenous',
 '["subsidy"]','completed', NOW() - INTERVAL '17 days'),

-- 75 雙薪 / 新北市 / 無特殊 / 醫療+補助
(u75,'0912001075',h,'鄭佳宜','新北市','both_working',NULL,
 '["medical","subsidy"]','completed', NOW() - INTERVAL '16 days'),

-- 76 單薪 / 台北市 / 特殊境遇 / 補助+醫療
(u76,'0912001076',h,'吳宗賢','台北市','single_working','special_circumstances',
 '["subsidy","medical"]','completed', NOW() - INTERVAL '15 days'),

-- 77 全職照顧 / 桃園市 / 無特殊 / 親子活動
(u77,'0912001077',h,'蕭淑雅','桃園市','not_working',NULL,
 '["activity"]','completed', NOW() - INTERVAL '14 days'),

-- 78 雙薪 / 台中市 / 無特殊 / 補助+托育
(u78,'0912001078',h,'許明仁','台中市','both_working',NULL,
 '["subsidy","daycare"]','completed', NOW() - INTERVAL '13 days'),

-- 79 單薪 / 新北市 / 中低收入+單親 / 補助
(u79,'0912001079',h,'黃雅玲','新北市','single_working','middle_low_income,single_parent',
 '["subsidy"]','completed', NOW() - INTERVAL '12 days'),

-- 80 雙薪 / 台北市 / 無特殊 / 醫療
(u80,'0912001080',h,'張文雄','台北市','both_working',NULL,
 '["medical"]','completed', NOW() - INTERVAL '11 days'),

-- 81 全職照顧 / 高雄市 / 無特殊 / 補助+活動
(u81,'0912001081',h,'林美君','高雄市','not_working',NULL,
 '["subsidy","activity"]','completed', NOW() - INTERVAL '10 days'),

-- 82 雙薪 / 台南市 / 無特殊 / 醫療+托育
(u82,'0912001082',h,'陳志鴻','台南市','both_working',NULL,
 '["medical","daycare"]','completed', NOW() - INTERVAL '10 days'),

-- 83 單薪 / 新竹市 / 無特殊 / 補助
(u83,'0912001083',h,'王詩涵','新竹市','single_working',NULL,
 '["subsidy"]','completed', NOW() - INTERVAL '9 days'),

-- 84 全職照顧 / 台北市 / 受暴家庭 / 補助+醫療
(u84,'0912001084',h,'蔡志豪','台北市','not_working','domestic_violence',
 '["subsidy","medical"]','completed', NOW() - INTERVAL '9 days'),

-- 85 雙薪 / 桃園市 / 無特殊 / 醫療+補助+托育
(u85,'0912001085',h,'劉佳蓉','桃園市','both_working',NULL,
 '["medical","subsidy","daycare"]','completed', NOW() - INTERVAL '8 days'),

-- 86 單薪 / 台中市 / 低收入 / 補助
(u86,'0912001086',h,'郭志偉','台中市','single_working','low_income',
 '["subsidy"]','completed', NOW() - INTERVAL '8 days'),

-- 87 全職照顧 / 新北市 / 無特殊 / 醫療+活動
(u87,'0912001087',h,'賴秀玉','新北市','not_working',NULL,
 '["medical","activity"]','completed', NOW() - INTERVAL '7 days'),

-- 88 雙薪 / 台北市 / 無特殊 / 全部主題
(u88,'0912001088',h,'謝建志','台北市','both_working',NULL,
 '["medical","subsidy","daycare","activity"]','completed', NOW() - INTERVAL '6 days'),

-- 89 單薪 / 高雄市 / 隔代教養 / 補助+醫療
(u89,'0912001089',h,'洪淑芬','高雄市','single_working','grandparent_care',
 '["subsidy","medical"]','completed', NOW() - INTERVAL '6 days'),

-- 90 雙薪 / 台南市 / 無特殊 / 托育+活動
(u90,'0912001090',h,'林宗憲','台南市','both_working',NULL,
 '["daycare","activity"]','completed', NOW() - INTERVAL '5 days'),

-- 91 全職照顧 / 台北市 / 中低收入 / 補助
(u91,'0912001091',h,'陳雅萍','台北市','not_working','middle_low_income',
 '["subsidy"]','completed', NOW() - INTERVAL '5 days'),

-- 92 雙薪 / 新北市 / 無特殊 / 醫療+補助
(u92,'0912001092',h,'吳志成','新北市','both_working',NULL,
 '["medical","subsidy"]','completed', NOW() - INTERVAL '4 days'),

-- 93 單薪 / 桃園市 / 新住民 / 補助+活動
(u93,'0912001093',h,'黃怡文','桃園市','single_working','new_resident',
 '["subsidy","activity"]','completed', NOW() - INTERVAL '4 days'),

-- 94 全職照顧 / 台中市 / 無特殊 / 醫療+托育
(u94,'0912001094',h,'張雅慧','台中市','not_working',NULL,
 '["medical","daycare"]','completed', NOW() - INTERVAL '3 days'),

-- 95 雙薪 / 台北市 / 無特殊 / 補助+活動
(u95,'0912001095',h,'蔡宗翰','台北市','both_working',NULL,
 '["subsidy","activity"]','completed', NOW() - INTERVAL '3 days'),

-- 96 單薪 / 高雄市 / 單親 / 補助+醫療
(u96,'0912001096',h,'林佳妮','高雄市','single_working','single_parent',
 '["subsidy","medical"]','completed', NOW() - INTERVAL '2 days'),

-- 97 全職照顧 / 台南市 / 無特殊 / 親子活動
(u97,'0912001097',h,'王志文','台南市','not_working',NULL,
 '["activity"]','completed', NOW() - INTERVAL '2 days'),

-- 98 雙薪 / 新北市 / 低收入 / 補助+托育
(u98,'0912001098',h,'陳淑惠','新北市','both_working','low_income',
 '["subsidy","daycare"]','completed', NOW() - INTERVAL '1 day'),

-- 99 單薪 / 台北市 / 無特殊 / 醫療+補助+活動
(u99,'0912001099',h,'許建明','台北市','single_working',NULL,
 '["medical","subsidy","activity"]','completed', NOW() - INTERVAL '1 day'),

-- 100 雙薪 / 桃園市 / 特殊境遇 / 補助+醫療
(u100,'0912001100',h,'蕭志龍','桃園市','both_working','special_circumstances',
 '["subsidy","medical"]','completed', NOW());

-- ────────────────────────────────────────────────────────────────
-- INSERT children (u31～u100)
-- ────────────────────────────────────────────────────────────────
INSERT INTO children (user_id, name, birth_date, gender, birth_order, special_status, is_active)
VALUES
-- u31 女 2個月 第一胎
(u31,'小晴','2026-05-01','female',1,NULL,true),
-- u32 男 5個月 第一胎
(u32,'小諾','2026-02-01','male',1,NULL,true),
-- u33 女 10個月 第一胎 早產兒
(u33,'小蓓','2025-09-01','female',1,'premature',true),
-- u34 男 1個月 第一胎
(u34,'小恩','2026-06-01','male',1,NULL,true),
-- u35 女 18個月 第一胎
(u35,'小安','2025-01-01','female',1,NULL,true),
-- u36 男 7個月 第二胎
(u36,'小翔','2025-12-01','male',2,NULL,true),
-- u37 女 3個月 第一胎
(u37,'小葉','2026-04-10','female',1,NULL,true),
-- u38 男 14個月 第一胎
(u38,'小勛','2025-05-01','male',1,NULL,true),
-- u39 女 20個月 第一胎
(u39,'小寧','2024-11-01','female',1,NULL,true),
-- u40 男 6個月 第三胎
(u40,'小瑞','2026-01-01','male',3,NULL,true),
-- u41 女 4個月 第一胎
(u41,'小恬','2026-03-01','female',1,NULL,true),
-- u42 男 22個月 第一胎
(u42,'小承','2024-09-01','male',1,NULL,true),
-- u43 女 8個月 第二胎
(u43,'小柔','2025-11-15','female',2,NULL,true),
-- u44 男 2個月 第一胎
(u44,'小昕','2026-05-10','male',1,NULL,true),
-- u45 女 12個月 第一胎
(u45,'小悅','2025-07-01','female',1,NULL,true),
-- u46 男 16個月 第一胎
(u46,'小均','2025-03-01','male',1,NULL,true),
-- u47 女 新生兒 第一胎
(u47,'小璿','2026-06-15','female',1,NULL,true),
-- u48 男 9個月 第二胎
(u48,'小峻','2025-10-01','male',2,NULL,true),
-- u49 女 5個月 第一胎
(u49,'小甜','2026-02-15','female',1,NULL,true),
-- u50 男 11個月 第一胎
(u50,'小博','2025-08-01','male',1,NULL,true),
-- u51 女 24個月 第一胎
(u51,'小嫻','2024-07-01','female',1,NULL,true),
-- u52 男 3個月 第二胎
(u52,'小強','2026-04-20','male',2,NULL,true),
-- u53 女 15個月 第一胎
(u53,'小涵','2025-04-15','female',1,NULL,true),
-- u54 男 7個月 第一胎 低出生體重
(u54,'小康','2025-12-10','male',1,'low_birth_weight',true),
-- u55 女 2個月 第一胎
(u55,'小希','2026-05-20','female',1,NULL,true),
-- u56 男 19個月 第一胎
(u56,'小楷','2024-12-01','male',1,NULL,true),
-- u57 女 6個月 第二胎
(u57,'小琦','2026-01-10','female',2,NULL,true),
-- u58 男 新生兒 第一胎
(u58,'小霖','2026-06-20','male',1,NULL,true),
-- u59 女 23個月 第一胎
(u59,'小妍','2024-08-01','female',1,NULL,true),
-- u60 男 4個月 第三胎
(u60,'小翊','2026-03-15','male',3,NULL,true),
-- u61 女 13個月 第一胎
(u61,'小薇','2025-06-01','female',1,NULL,true),
-- u62 男 1個月 第一胎
(u62,'小聿','2026-06-10','male',1,NULL,true),
-- u63 女 8個月 第一胎
(u63,'小萱','2025-11-01','female',1,NULL,true),
-- u64 男 17個月 第一胎 發展遲緩
(u64,'小哲','2025-02-01','male',1,'developmental_delay',true),
-- u65 女 3個月 第一胎
(u65,'小琳','2026-04-05','female',1,NULL,true),
-- u66 男 21個月 第一胎
(u66,'小宸','2024-10-01','male',1,NULL,true),
-- u67 女 5個月 第二胎
(u67,'小芯','2026-02-20','female',2,NULL,true),
-- u68 男 10個月 第一胎
(u68,'小皓','2025-09-15','male',1,NULL,true),
-- u69 女 14個月 第一胎
(u69,'小蓉','2025-05-15','female',1,NULL,true),
-- u70 男 6個月 第一胎 早產兒
(u70,'小禾','2026-01-20','male',1,'premature',true),
-- u71 女 2個月 第一胎
(u71,'小穎','2026-05-15','female',1,NULL,true),
-- u72 男 11個月 第二胎
(u72,'小爵','2025-08-15','male',2,NULL,true),
-- u73 女 4個月 第一胎
(u73,'小歆','2026-03-10','female',1,NULL,true),
-- u74 男 18個月 第一胎
(u74,'小嵐','2025-01-15','male',1,NULL,true),
-- u75 女 7個月 第一胎
(u75,'小語','2025-12-15','female',1,NULL,true),
-- u76 男 新生兒 第一胎
(u76,'小祐','2026-06-25','male',1,NULL,true),
-- u77 女 16個月 第一胎
(u77,'小鈺','2025-03-15','female',1,NULL,true),
-- u78 男 3個月 第二胎
(u78,'小騰','2026-04-15','male',2,NULL,true),
-- u79 女 20個月 第一胎
(u79,'小筠','2024-11-15','female',1,NULL,true),
-- u80 男 1個月 第一胎
(u80,'小齊','2026-06-05','male',1,NULL,true),
-- u81 女 9個月 第一胎
(u81,'小瑜','2025-10-15','female',1,NULL,true),
-- u82 男 5個月 第三胎
(u82,'小毅','2026-02-10','male',3,NULL,true),
-- u83 女 12個月 第一胎
(u83,'小璃','2025-07-15','female',1,NULL,true),
-- u84 男 15個月 第一胎
(u84,'小彥','2025-04-20','male',1,NULL,true),
-- u85 女 2個月 第二胎
(u85,'小蕾','2026-05-25','female',2,NULL,true),
-- u86 男 22個月 第一胎
(u86,'小鈞','2024-09-15','male',1,NULL,true),
-- u87 女 6個月 第一胎 身心障礙
(u87,'小諦','2026-01-15','female',1,'disability',true),
-- u88 男 4個月 第一胎
(u88,'小晨','2026-03-20','male',1,NULL,true),
-- u89 女 17個月 第一胎
(u89,'小蓁','2025-02-15','female',1,NULL,true),
-- u90 男 8個月 第一胎
(u90,'小允','2025-11-20','male',1,NULL,true),
-- u91 女 新生兒 第一胎
(u91,'小漾','2026-07-01','female',1,NULL,true),
-- u92 男 11個月 第一胎
(u92,'小澤','2025-08-20','male',1,NULL,true),
-- u93 女 3個月 第一胎
(u93,'小媛','2026-04-25','female',1,NULL,true),
-- u94 男 13個月 第二胎
(u94,'小騫','2025-06-15','male',2,NULL,true),
-- u95 女 7個月 第一胎
(u95,'小雲','2025-12-20','female',1,NULL,true),
-- u96 男 19個月 第一胎
(u96,'小宥','2024-12-15','male',1,NULL,true),
-- u97 女 5個月 第一胎
(u97,'小卉','2026-02-25','female',1,NULL,true),
-- u98 男 10個月 第一胎 早產兒
(u98,'小晟','2025-09-20','male',1,'premature',true),
-- u99 女 2個月 第一胎
(u99,'小喬','2026-05-28','female',1,NULL,true),
-- u100 男 6個月 第二胎
(u100,'小恆','2026-01-25','male',2,NULL,true);

END $$;
