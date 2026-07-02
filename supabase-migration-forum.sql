-- ════════════════════════════════════════════════════════════════
-- Forum Migration：建立按讚表 + 多孩子種子 + 論壇貼文/留言/讚
-- 執行方式：Supabase Dashboard → SQL Editor → 貼入執行
-- ════════════════════════════════════════════════════════════════

-- ── 1. 建立 forum_post_likes 表 ──────────────────────────────────
CREATE TABLE IF NOT EXISTS forum_post_likes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id    UUID        NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, post_id)
);
ALTER TABLE forum_post_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manage forum likes"
  ON forum_post_likes FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Anyone can read forum likes"
  ON forum_post_likes FOR SELECT USING (TRUE);

-- ── 2. 建立 forum_comment_likes 表 ───────────────────────────────
CREATE TABLE IF NOT EXISTS forum_comment_likes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment_id UUID        NOT NULL REFERENCES forum_comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, comment_id)
);
ALTER TABLE forum_comment_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manage comment likes"
  ON forum_comment_likes FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Anyone can read comment likes"
  ON forum_comment_likes FOR SELECT USING (TRUE);

-- ── 3. forum_posts.category 加入 'daycare' / 'life' 類型 ─────────
-- (原本沒有 CHECK CONSTRAINT 所以不需要 ALTER，直接 INSERT 即可)

-- ── 4. 為現有用戶新增第二/三個孩子（多孩子情境）───────────────────
-- u11 = 0912001011 楊佳慧（新北市，全部主題）→ 加第二胎 2歲女寶
INSERT INTO children (user_id, name, birth_date, gender, birth_order, special_status, is_active)
VALUES (
  (SELECT id FROM users WHERE phone='0912001011'),
  '小菲', '2024-06-01', 'female', 2, NULL, false
);

-- u22 = 0912001022 許志豪（台中市，全部主題）→ 加第二胎 14個月男寶
INSERT INTO children (user_id, name, birth_date, gender, birth_order, special_status, is_active)
VALUES (
  (SELECT id FROM users WHERE phone='0912001022'),
  '小宇', '2025-05-10', 'male', 2, NULL, false
);

-- u28 = 0912001028 余建志（高雄市，第二胎送托）→ 補老大 3歲男寶
INSERT INTO children (user_id, name, birth_date, gender, birth_order, special_status, is_active)
VALUES (
  (SELECT id FROM users WHERE phone='0912001028'),
  '小凱', '2023-03-15', 'male', 1, NULL, false
);

-- u40 = 0912001040 許建國（台南市，第三胎）→ 補老大 4歲女寶 + 老二 2歲男寶
INSERT INTO children (user_id, name, birth_date, gender, birth_order, special_status, is_active)
VALUES
  ((SELECT id FROM users WHERE phone='0912001040'), '小恩', '2022-01-10', 'female', 1, NULL, false),
  ((SELECT id FROM users WHERE phone='0912001040'), '小翔', '2023-09-20', 'male',   2, NULL, false);

-- u62 = 0912001062 陳建宏（新北市，全部主題）→ 加第二胎 18個月女寶
INSERT INTO children (user_id, name, birth_date, gender, birth_order, special_status, is_active)
VALUES (
  (SELECT id FROM users WHERE phone='0912001062'),
  '小澄', '2025-01-05', 'female', 2, NULL, false
);

-- u73 = 0912001073 王淑芳（台北市，全部主題）→ 加第二胎 22個月男寶
INSERT INTO children (user_id, name, birth_date, gender, birth_order, special_status, is_active)
VALUES (
  (SELECT id FROM users WHERE phone='0912001073'),
  '小岳', '2024-09-12', 'male', 2, NULL, false
);

-- ── 5. 種子論壇貼文（20 篇，跨五個分類）──────────────────────────
DO $$
DECLARE
  p01 UUID := gen_random_uuid(); p02 UUID := gen_random_uuid();
  p03 UUID := gen_random_uuid(); p04 UUID := gen_random_uuid();
  p05 UUID := gen_random_uuid(); p06 UUID := gen_random_uuid();
  p07 UUID := gen_random_uuid(); p08 UUID := gen_random_uuid();
  p09 UUID := gen_random_uuid(); p10 UUID := gen_random_uuid();
  p11 UUID := gen_random_uuid(); p12 UUID := gen_random_uuid();
  p13 UUID := gen_random_uuid(); p14 UUID := gen_random_uuid();
  p15 UUID := gen_random_uuid(); p16 UUID := gen_random_uuid();
  p17 UUID := gen_random_uuid(); p18 UUID := gen_random_uuid();
  p19 UUID := gen_random_uuid(); p20 UUID := gen_random_uuid();

  -- 用手機號碼查 user ID
  uid01 UUID := (SELECT id FROM users WHERE phone='0912001001');
  uid02 UUID := (SELECT id FROM users WHERE phone='0912001002');
  uid03 UUID := (SELECT id FROM users WHERE phone='0912001003');
  uid04 UUID := (SELECT id FROM users WHERE phone='0912001004');
  uid05 UUID := (SELECT id FROM users WHERE phone='0912001005');
  uid06 UUID := (SELECT id FROM users WHERE phone='0912001006');
  uid07 UUID := (SELECT id FROM users WHERE phone='0912001007');
  uid08 UUID := (SELECT id FROM users WHERE phone='0912001008');
  uid09 UUID := (SELECT id FROM users WHERE phone='0912001009');
  uid10 UUID := (SELECT id FROM users WHERE phone='0912001010');
  uid11 UUID := (SELECT id FROM users WHERE phone='0912001011');
  uid12 UUID := (SELECT id FROM users WHERE phone='0912001012');
  uid13 UUID := (SELECT id FROM users WHERE phone='0912001013');
  uid14 UUID := (SELECT id FROM users WHERE phone='0912001014');
  uid15 UUID := (SELECT id FROM users WHERE phone='0912001015');
  uid16 UUID := (SELECT id FROM users WHERE phone='0912001016');
  uid17 UUID := (SELECT id FROM users WHERE phone='0912001017');
  uid18 UUID := (SELECT id FROM users WHERE phone='0912001018');
  uid20 UUID := (SELECT id FROM users WHERE phone='0912001020');
  uid22 UUID := (SELECT id FROM users WHERE phone='0912001022');

BEGIN

-- ── 論壇貼文 ──────────────────────────────────────────────────────
INSERT INTO forum_posts (id, user_id, title, content, category, likes, views, created_at)
VALUES

-- 補助討論 (subsidy)
(p01, uid04, '台北市生育獎勵金申請成功！分享流程給大家',
 '我剛申請到台北市第一胎的 4 萬元生育獎勵金，來分享一下流程！
 準備文件：戶口名簿、存摺封面、媽媽手冊（含出生頁）。
 出生後 60 天內到戶政事務所，或用台北市政府線上申辦，3 週內入帳。
 記得戶籍要設在台北市喔！有問題歡迎留言。',
 'subsidy', 23, 342, NOW() - INTERVAL '20 days'),

(p02, uid07, '中低收入戶可以領哪些育兒補助？整理給大家',
 '整理一下中低收入戶家庭可以申請的補助：
 1. 育兒津貼 5,000元/月（未送托）
 2. 台北市育兒補助加碼 1,000元/月
 3. 兒童醫療費用補助
 4. 低收入戶子女就讀公立托嬰補助
 5. 急難救助金（臨時需求）
 細節可以打 1957 詢問，非常親切！',
 'subsidy', 18, 267, NOW() - INTERVAL '18 days'),

(p03, uid05, '單親媽媽育兒津貼請領心得分享',
 '想跟各位單親媽媽分享，我一個人帶孩子，靠著育兒津貼 + 台北市加碼補助，
 每個月可以拿到約 6,000 元，壓力小很多。
 申請時記得帶離婚協議書或法院文件、戶口名簿、存摺，到戶政事務所辦理。
 如果沒有申請到，可以聯繫社工，他們會幫你一起整理資料！',
 'subsidy', 31, 489, NOW() - INTERVAL '15 days'),

(p04, uid13, '育兒津貼和托育補助怎麼選比較划算？',
 '請問大家，自己帶寶寶拿育兒津貼，還是送托拿托育補助，哪個比較划算？
 我算了一下：
 自己帶 → 5,000元/月（育兒津貼）
 送公托/準公共 → 補助後費用可能只要 3,000-6,000元
 如果媽媽或爸爸有工作的話，送托讓雙方都能上班，整體收入比較高。
 大家的選擇是？',
 'subsidy', 14, 198, NOW() - INTERVAL '12 days'),

-- 寶寶健康 (medical)
(p05, uid01, '寶寶打五合一疫苗後發燒！大家有遇過嗎',
 '小橙打完五合一第一劑之後，當天晚上就開始發燒，量了 38.5 度。
 護士說是正常反應，但還是很緊張。給了退燒藥之後，隔天就好多了。
 分享幾個重點：
 - 38.5度以下觀察，38.5度以上可以用退燒藥
 - 不要捂太多被子
 - 如果超過 39.5度或持續超過 3 天，立刻去看醫生
 希望大家的寶寶都平安！',
 'medical', 42, 623, NOW() - INTERVAL '22 days'),

(p06, uid14, '早產兒寶寶的追蹤健檢分享',
 '我家小寶是 33 週早產，體重只有 1800g，現在 15 個月了，追蹤發展一切正常。
 分享幾個重點：
 1. 追蹤月齡要用「矯正月齡」（實際月齡 - 提前週數/4）
 2. 健保署早產兒追蹤補助：2 年內共 6 次免費追蹤
 3. 早療轉介：若發展落後，可申請早期療育
 4. 台北市早療補助最高每月 4,000 元
 早產兒媽媽們加油！',
 'medical', 38, 512, NOW() - INTERVAL '17 days'),

(p07, uid03, '新生兒黃疸！住院還是回家照光？',
 '我家小糰出生第 3 天黃疸指數 14，醫院建議住院照光。
 最後決定在醫院多待兩天，每天抽血監測，4 天後降到安全值。
 醫生說母乳性黃疸可能要到 1-2 個月才完全消退，但只要不超過 17 就繼續觀察。
 大家有什麼經驗嗎？',
 'medical', 27, 389, NOW() - INTERVAL '10 days'),

(p08, uid20, '孩子被診斷輕度發展遲緩，我們怎麼做？',
 '在 18 個月健兒門診被告知發展可能落後，當下心情很複雜。
 但是後來找了早療資源，現在進步很多！
 流程分享：
 1. 醫院拿到「發展遲緩聯單」
 2. 聯繫縣市早療通報轉介中心（免費）
 3. 排隊評估（台北市大約等 3-6 個月）
 4. 若確認，可申請早療補助費用
 不要等，越早介入效果越好！',
 'medical', 55, 734, NOW() - INTERVAL '8 days'),

-- 托育分享 (daycare)
(p09, uid06, '公托候補真的排這麼久嗎？桃園市實測',
 '我在桃園市候補公托，從寶寶出生就開始排，等了整整 8 個月才排到。
 心得：
 - 一定要一出生就去登記，不要等
 - 同時也要申請準公共保母，補助後一個月約 5,000-7,000 元
 - 私立托嬰的話一個月要 2-3 萬，差很多
 最後是準公共保母帶了 6 個月，後來才轉去公托。分享給大家！',
 'daycare', 29, 445, NOW() - INTERVAL '19 days'),

(p10, uid12, '分享我篩選托嬰中心的5個標準',
 '我們跑了 7 家托嬰中心才確定，分享我的篩選標準：
 1. 師生比：公立 1:5，準公共要求 1:6
 2. 監視器：家長可以用 App 即時查看最好
 3. 每日回報：有 LINE 群每天傳照片和狀況
 4. 飲食菜單：每週公告，可配合過敏
 5. 參觀時機：挑一個週四下午去（觀察最真實的狀態）
 最重要的是跟老師的感覺！',
 'daycare', 22, 311, NOW() - INTERVAL '14 days'),

(p11, uid16, '準公共保母 vs 公托托嬰中心，我的選擇',
 '我最終選擇了準公共保母，理由：
 ✅ 比公托更容易申請到（不用等那麼久）
 ✅ 師生比更好（1:1 或 1:2）
 ✅ 作息更彈性
 ❌ 但如果保母生病，臨時需要應急
 補助後費用：政府補助後，每月只要繳約 3,000-4,000 元
 已送托 4 個月，非常推！',
 'daycare', 17, 234, NOW() - INTERVAL '11 days'),

-- 新手問答 (general)
(p12, uid09, '第一次當媽媽，有哪些東西是買了用不到的？',
 '分享我買了但幾乎沒用到的東西：
 1. 奶瓶消毒鍋 - 用微波袋就夠了
 2. 哺乳枕 - 用一般枕頭替代
 3. 嬰兒床頭鈴 - 寶寶根本不看
 4. 昂貴的溢奶墊 - 一般版就好
 5. 過多的新生兒衣服 - 一個月就穿不下了
 反而必買的：好用的吸奶器、白噪音機、包巾！
 大家有什麼血淚教訓？',
 'general', 48, 671, NOW() - INTERVAL '21 days'),

(p13, uid11, '雙寶媽媽的每日時間表分享',
 '我有兩個孩子（2歲和8個月），一個人帶娃真的很累但也很有成就感。
 分享我的時間表：
 06:00 老大起床 → 吃早餐
 07:00 老二起床 → 餵奶換尿布
 09:00 帶出去散步
 11:30 老大吃午餐，老二喝奶午睡
 14:00 難得的靜謐時光（做家事 or 睡）
 16:30 接老大下課
 有雙寶的媽媽嗎？一起分享心得！',
 'general', 63, 891, NOW() - INTERVAL '16 days'),

(p14, uid18, '爸爸育兒心得：如何參與日常照顧',
 '我是爸爸，想分享我怎麼積極參與育兒的：
 1. 固定負責夜奶（輪流制）
 2. 週末帶孩子讓媽媽有自己的時間
 3. 學會幫寶寶洗澡（一開始超緊張）
 4. 主動查育兒資訊和補助
 5. 申請育嬰假 2 個月（強烈推薦）
 媽媽們，你們的另一半有幫忙嗎？
 爸爸們，一起站出來！',
 'general', 35, 502, NOW() - INTERVAL '9 days'),

-- 生活日常 (life)
(p15, uid15, '高雄親子館推薦！帶 1 歲寶寶去的心得',
 '昨天帶寶寶去高雄市的親子館，超棒的！
 去了鹽埕區的親子館，設備超好，有大型軟墊、玩具、圖書區。
 完全免費！週二到週日 09:00-17:00
 工作人員很親切，還有媽媽教室可以學習
 唯一缺點是假日人有點多，建議平日去
 附上地址：高雄市鹽埕區大勇路 1 號
 大家有推薦的親子場館嗎？',
 'life', 19, 287, NOW() - INTERVAL '13 days'),

(p16, uid08, '寶寶副食品推薦！從 6 個月到 1 歲的菜單',
 '分享我家寶寶副食品的進階歷程：
 6個月：米糊、南瓜泥、地瓜泥
 7個月：雞肉泥、蘋果泥、豆腐
 8個月：蒸蛋、香蕉、花椰菜
 9個月：粥 + 各種蔬菜丁
 10個月：軟飯 + 手指食物
 注意：蜂蜜、堅果、海鮮要 1 歲後
 全蛋可以在 7 個月後嘗試（從蛋黃開始）',
 'life', 41, 589, NOW() - INTERVAL '7 days'),

(p17, uid17, '原住民媽媽育兒津貼加碼！不知道的快去申請',
 '原住民家庭有額外的育兒補助，很多人不知道！
 1. 原住民族幼兒教育補助：3-5 歲公立免費，私立補助
 2. 台北市原住民族兒童醫療補助：就醫免部分負擔
 3. 原住民文化教育扶助
 這些申請時要附族籍證明。
 歡迎原住民媽媽們留言交流！',
 'life', 24, 356, NOW() - INTERVAL '6 days'),

(p18, uid02, '新北市公托候補小技巧分享',
 '分享幾個加速排到公托的小技巧（在新北市親身經歷）：
 1. 寶寶一出生就去登記，不要等滿月
 2. 多排幾個托嬰中心（可以同時排 3 個）
 3. 追蹤各托嬰中心的公告（有時有臨時名額）
 4. 低收入戶和身心障礙家庭有加分
 5. 平常也準備好準公共保母作為備案
 等了 10 個月才排到，但真的值得！',
 'life', 16, 221, NOW() - INTERVAL '4 days'),

(p19, uid10, '台北市特殊境遇家庭的支援資源整理',
 '我是特殊境遇家庭，整理了可以申請的資源：
 - 特殊境遇家庭扶助：每月約 6,000 至 14,000 元
 - 子女托育費用補助
 - 兒童生活扶助金（每個孩子約 2,700 元/月）
 - 申請方式：到各縣市社會局提出申請，附相關文件
 - 1957 社工專線：可以協助評估資格
 希望這些資訊對需要的家庭有幫助！',
 'life', 29, 398, NOW() - INTERVAL '2 days'),

(p20, uid22, '兩個孩子的爸爸分享：老大老二的育兒差異',
 '我有兩個孩子（老大 11 個月，老二剛出生）
 最大差異：
 1. 對老二沒那麼緊張了，很多事「隨便啦」
 2. 老大看到弟弟很好奇，但偶爾吃醋
 3. 準備兩倍的尿布、兩倍的奶粉費用
 4. 需要更有效率地分配時間
 但也有好的地方：老大的東西可以傳下去！
 雙寶家長們，你們都怎麼撐過來的？',
 'general', 52, 743, NOW() - INTERVAL '1 day');

-- ── 6. 論壇留言（每篇 2-4 則）────────────────────────────────────
INSERT INTO forum_comments (post_id, user_id, content, likes, created_at)
VALUES
-- p01 台北市生育獎勵金
(p01, uid01, '謝謝分享！請問網路申辦需要上傳什麼文件？', 3, NOW() - INTERVAL '19 days'),
(p01, uid04, '需要上傳戶口名簿、存摺封面和出生證明書的掃描檔，大概 3-5MB 以內。', 5, NOW() - INTERVAL '19 days'),
(p01, uid11, '我也剛申請到了！台北市的 3 萬沒到 2 週就入帳了，超快的！', 8, NOW() - INTERVAL '18 days'),

-- p02 中低收入戶補助
(p02, uid13, '請問中低收入戶的認定標準是什麼？我不確定我們家符不符合。', 2, NOW() - INTERVAL '17 days'),
(p02, uid07, '每個縣市略有不同，台北市大約是每人每月可支配所得 18,310 元以下，可以打 1957 詢問！', 6, NOW() - INTERVAL '17 days'),
(p02, uid05, '1957 真的很好用，幫我釐清了很多資格問題！', 4, NOW() - INTERVAL '16 days'),

-- p03 單親媽媽
(p03, uid09, '加油！我也是單親媽媽，育兒津貼真的很重要，撐過去就好了！', 12, NOW() - INTERVAL '14 days'),
(p03, uid17, '請問你的孩子多大？我家是 6 個月，正在考慮要不要送托，還是繼續領育兒津貼。', 3, NOW() - INTERVAL '13 days'),
(p03, uid05, '我家 8 個月，我選擇送準公共保母，因為我需要上班。補助後每月 3,500 元，比待在家領 5,000 更划算（因為我可以上班賺薪水）！', 9, NOW() - INTERVAL '13 days'),

-- p04 育兒津貼 vs 托育補助
(p04, uid02, '我算過了，雙薪家庭一定要送托，把爸媽的薪水算進去的話，托育補助那邊划算很多。', 7, NOW() - INTERVAL '11 days'),
(p04, uid06, '如果媽媽或爸爸是全職照顧，那育兒津貼就夠了，也不需要額外支出托育費。看家庭狀況決定！', 5, NOW() - INTERVAL '11 days'),

-- p05 疫苗發燒
(p05, uid03, '我家也是！打完有發燒，護士說是因為疫苗成分裡有鋁鹽，是正常免疫反應。', 8, NOW() - INTERVAL '21 days'),
(p05, uid20, '可以打疫苗前就先準備好兒童退燒藥（醫生開的那種），不然半夜要找藥很麻煩…', 15, NOW() - INTERVAL '20 days'),
(p05, uid08, '打完不要馬上離開診所，在旁邊等 30 分鐘，確認沒有立即反應再走。這是護士叮嚀的！', 11, NOW() - INTERVAL '20 days'),
(p05, uid01, '感謝大家的分享！這次打完 2 天後完全正常了，放心很多。', 6, NOW() - INTERVAL '19 days'),

-- p07 黃疸
(p07, uid04, '我家也是！最後選擇在醫院住 3 天，有照光機器比較有效率。', 6, NOW() - INTERVAL '9 days'),
(p07, uid01, '加強餵食（增加排便次數）也有助於黃疸代謝，醫生建議每 2-3 小時餵一次。', 9, NOW() - INTERVAL '9 days'),

-- p08 發展遲緩
(p08, uid14, '謝謝你的分享！我家也在等早療評估，等待期真的好煎熬。', 7, NOW() - INTERVAL '7 days'),
(p08, uid11, '早療真的要趁早！我家大寶延誤了 3 個月才去評估，現在想想應該更早行動。', 13, NOW() - INTERVAL '7 days'),
(p08, uid20, '0-6 歲是大腦發展黃金期，評估完之後介入效果明顯比較好！加油！', 10, NOW() - INTERVAL '6 days'),

-- p09 公托候補
(p09, uid12, '桃園市 8 個月！我台北市等了 11 個月才排到 😭 大家要有心理準備！', 14, NOW() - INTERVAL '18 days'),
(p09, uid16, '準公共保母真的是很好的替代方案，補助後費用差不多，而且更彈性！', 8, NOW() - INTERVAL '17 days'),

-- p12 用不到的東西
(p12, uid10, '完全同意！我家嬰兒床也買了但幾乎沒用，寶寶只想跟媽媽一起睡 😅', 18, NOW() - INTERVAL '20 days'),
(p12, uid15, '我最後悔的是買太多 0-1M 的衣服，寶寶穿了 3 週就穿不下了！', 21, NOW() - INTERVAL '20 days'),
(p12, uid18, '加碼：電動搖椅。寶寶完全不買帳，就愛被人抱著搖。', 16, NOW() - INTERVAL '19 days'),
(p12, uid09, '哈哈大家都有一樣的血淚教訓！不過我家的電動搖椅後來在孩子 3 個月之後終於派上用場了！', 9, NOW() - INTERVAL '18 days'),

-- p13 雙寶媽媽
(p13, uid22, '雙寶爸爸報到！我的做法是每週六由我負責帶兩個孩子出門，讓媽媽有半天自己的時間。', 22, NOW() - INTERVAL '15 days'),
(p13, uid06, '請問你怎麼讓老大接受老二的存在？我家老大最近有點吃醋的感覺…', 7, NOW() - INTERVAL '15 days'),
(p13, uid11, '我是讓老大參與照顧老二的工作，例如幫我拿尿布、唱歌給弟弟/妹妹聽，他們會有成就感！', 19, NOW() - INTERVAL '14 days'),

-- p16 副食品
(p16, uid02, '有個問題：花生類要什麼時候開始給？之前聽說很多說法。', 6, NOW() - INTERVAL '6 days'),
(p16, uid08, '最新研究建議 6 個月就可以少量引入，等太晚反而可能增加過敏風險。但如果家族有過敏史，先諮詢醫生！', 12, NOW() - INTERVAL '6 days'),

-- p20 兩個孩子的差異
(p20, uid11, '雙寶媽媽也在！老實說第一個月真的很崩潰，但現在看到兩個孩子玩在一起，覺得一切都值得！', 16, NOW() - INTERVAL '22 hours'),
(p20, uid13, '老大的東西傳給老二這點太真實了！省了好多錢 😂', 25, NOW() - INTERVAL '20 hours'),
(p20, uid22, '分享一個心得：老大 2 歲前就生老二，他不會記得以前是獨生子，轉換比較容易。等老大 3 歲之後才生，黏媽媽更厲害，吃醋更嚴重哈哈', 18, NOW() - INTERVAL '18 hours');

-- ── 7. 論壇按讚（forum_post_likes）──────────────────────────────
INSERT INTO forum_post_likes (user_id, post_id) VALUES
(uid01, p05), (uid01, p08), (uid01, p12), (uid01, p13),
(uid02, p01), (uid02, p03), (uid02, p09), (uid02, p16),
(uid03, p05), (uid03, p07), (uid03, p12),
(uid04, p01), (uid04, p03), (uid04, p08), (uid04, p13),
(uid05, p02), (uid05, p03), (uid05, p04), (uid05, p12),
(uid06, p09), (uid06, p10), (uid06, p11), (uid06, p15),
(uid07, p02), (uid07, p03), (uid07, p19),
(uid08, p05), (uid08, p16), (uid08, p17),
(uid09, p03), (uid09, p12), (uid09, p15),
(uid10, p02), (uid10, p08), (uid10, p19),
(uid11, p13), (uid11, p08), (uid11, p20),
(uid12, p09), (uid12, p10), (uid12, p11),
(uid13, p04), (uid13, p08), (uid13, p19),
(uid14, p06), (uid14, p08), (uid14, p05),
(uid15, p15), (uid15, p12), (uid15, p16),
(uid16, p11), (uid16, p09), (uid16, p04),
(uid17, p17), (uid17, p03), (uid17, p02),
(uid18, p14), (uid18, p12), (uid18, p16),
(uid20, p08), (uid20, p05), (uid20, p13),
(uid22, p20), (uid22, p13), (uid22, p04);

-- ── 8. 同步 forum_posts.likes 計數 ──────────────────────────────
UPDATE forum_posts p
SET likes = (SELECT COUNT(*) FROM forum_post_likes l WHERE l.post_id = p.id);

-- ── 9. 同步 forum_comments.likes 計數 ────────────────────────────
UPDATE forum_comments c
SET likes = (
  SELECT COUNT(*) FROM forum_comment_likes cl WHERE cl.comment_id = c.id
);

END $$;
