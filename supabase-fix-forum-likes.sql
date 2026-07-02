-- ════════════════════════════════════════════════════════════════
-- Forum Fix：修正分類 + 讚數 x3 + 補充留言 x2
-- 執行方式：Supabase Dashboard → SQL Editor → 貼入執行
-- ════════════════════════════════════════════════════════════════

-- ── 1. 修正分類錯誤（補助類被歸到生活日常）───────────────────────

-- 育兒津貼加碼、特殊境遇 → 補助討論
UPDATE forum_posts SET category = 'subsidy'
WHERE title LIKE '%津貼加碼%'
   OR title LIKE '%特殊境遇%'
   OR title LIKE '%生育獎勵%'
   OR title LIKE '%育兒津貼%'
   OR title LIKE '%托育補助%'
   OR title LIKE '%補助懶人包%'
   OR title LIKE '%中低收入%'
   OR title LIKE '%單親%';

-- 公托候補、托嬰 → 托育分享
UPDATE forum_posts SET category = 'daycare'
WHERE title LIKE '%公托候補%'
   OR title LIKE '%托嬰中心%'
   OR title LIKE '%準公共保母%'
   OR title LIKE '%抽籤%';

-- 副食品、親子館、日常 → 生活日常
UPDATE forum_posts SET category = 'life'
WHERE title LIKE '%副食品%'
   OR title LIKE '%親子館%'
   OR title LIKE '%菜單%';

-- 疫苗、發燒、早產兒、黃疸、發展遲緩 → 寶寶健康
UPDATE forum_posts SET category = 'medical'
WHERE title LIKE '%疫苗%'
   OR title LIKE '%B肝%'
   OR title LIKE '%發燒%'
   OR title LIKE '%黃疸%'
   OR title LIKE '%早產%'
   OR title LIKE '%發展遲緩%';

-- 爸爸育兒、雙寶、時間表、血淚 → 新手問答
UPDATE forum_posts SET category = 'general'
WHERE title LIKE '%血淚%'
   OR title LIKE '%用不到%'
   OR title LIKE '%時間表%'
   OR title LIKE '%爸爸%'
   OR title LIKE '%雙寶%'
   OR title LIKE '%兩個孩子%';

-- ── 2. 讚數 ×3（所有貼文）──────────────────────────────────────
UPDATE forum_posts SET likes = likes * 3 WHERE likes > 0;
-- 補讚 0 的帖子至少 1～5
UPDATE forum_posts SET likes = floor(random() * 5 + 1)::int WHERE likes = 0;

-- ── 3. 同時補充更多 forum_post_likes 紀錄（讓個人頁「我的讚」有資料）
-- 先確保 forum_post_likes 表存在
CREATE TABLE IF NOT EXISTS forum_post_likes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id    UUID        NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, post_id)
);

-- 讓更多 seed user 對所有貼文按讚（ON CONFLICT DO NOTHING 避免重複）
INSERT INTO forum_post_likes (user_id, post_id)
SELECT u.id, p.id
FROM
  (SELECT id FROM users WHERE phone IN (
    '0912001001','0912001002','0912001003','0912001004','0912001005',
    '0912001006','0912001007','0912001008','0912001009','0912001010',
    '0912001011','0912001012','0912001013','0912001014','0912001015',
    '0912001016','0912001017','0912001018','0912001019','0912001020'
  )) u
  CROSS JOIN (SELECT id FROM forum_posts ORDER BY likes DESC LIMIT 10) p
-- 讓每個用戶只對熱門前10篇各按讚，模擬真實分布
WHERE random() > 0.4   -- 約60%的機率按讚
ON CONFLICT (user_id, post_id) DO NOTHING;

-- ── 4. 補充更多留言（現有留言 ×2 倍效果，補插入新留言）──────────
DO $$
DECLARE
  uid01 UUID := (SELECT id FROM users WHERE phone='0912001001');
  uid03 UUID := (SELECT id FROM users WHERE phone='0912001003');
  uid06 UUID := (SELECT id FROM users WHERE phone='0912001006');
  uid08 UUID := (SELECT id FROM users WHERE phone='0912001008');
  uid09 UUID := (SELECT id FROM users WHERE phone='0912001009');
  uid10 UUID := (SELECT id FROM users WHERE phone='0912001010');
  uid12 UUID := (SELECT id FROM users WHERE phone='0912001012');
  uid15 UUID := (SELECT id FROM users WHERE phone='0912001015');
  uid16 UUID := (SELECT id FROM users WHERE phone='0912001016');
  uid18 UUID := (SELECT id FROM users WHERE phone='0912001018');
  uid19 UUID := (SELECT id FROM users WHERE phone='0912001019');
  uid20 UUID := (SELECT id FROM users WHERE phone='0912001020');
BEGIN

-- 補充留言到熱門貼文
-- （取得每篇貼文 ID 後插入留言，用 WITH 避免重複）
INSERT INTO forum_comments (post_id, user_id, content, likes, created_at)
SELECT p.id, v.uid, v.content, floor(random()*8)::int, NOW() - (random() * INTERVAL '20 days')
FROM forum_posts p
CROSS JOIN (VALUES
  (uid06, '我也有同樣的問題，謝謝分享！'),
  (uid08, '這個資訊超實用，已截圖保存！'),
  (uid09, '請問你們都是怎麼查詢的？'),
  (uid10, '感謝！我家也在處理同樣的事情'),
  (uid12, '台北市的話還有額外加碼，大家記得查看'),
  (uid15, '這篇要分享給我的媽媽群！'),
  (uid16, '說的太對了，完全是我的日常經歷'),
  (uid18, '請問有沒有相關的 FB 社團推薦？'),
  (uid19, '太感謝了！申請成功後來回報'),
  (uid20, '我們家也遇到一樣的狀況，最後靠這個方法解決')
) v(uid, content)
WHERE p.likes > 5  -- 只補充熱門貼文的留言
  AND random() > 0.6  -- 隨機插入避免太整齊
  AND v.uid IS NOT NULL;

END $$;

-- ── 5. 再次同步 forum_posts.likes 計數 ──────────────────────────
UPDATE forum_posts p
SET likes = (
  (SELECT COUNT(*) FROM forum_post_likes l WHERE l.post_id = p.id) * 3
  + floor(random() * 10 + 5)::int  -- 加一些匿名讚讓數字更自然
);
