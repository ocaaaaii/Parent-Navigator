-- ============================================================
-- fix_dead_urls.sql
-- 清除已下線網站的 source_url（避免前端出現 404 連結）
-- 執行方式：Supabase SQL Editor → 貼上執行
-- ============================================================

-- baby.1111.com.tw 已關站（ERR_NAME_NOT_RESOLVED）
UPDATE caregivers
SET source_url = NULL
WHERE source_url LIKE '%baby.1111.com.tw%';

-- 驗證結果
SELECT source, source_url, COUNT(*) AS 筆數
FROM caregivers
GROUP BY source, source_url
ORDER BY source;
