-- ============================================================
-- seed_caregivers.sql
-- 保母媒合平台 Demo 種子資料（模擬政府登記合法保母）
-- 執行方式：Supabase SQL Editor → 貼上執行
-- ============================================================

-- 先清除舊的 gov source demo 資料
DELETE FROM caregivers WHERE source = 'gov';

INSERT INTO caregivers
  (source, source_url, source_id, title, description, caregiver_type,
   region, district, price_range, contact, tags, is_verified, is_active, posted_at)
VALUES

-- ── 台北市 ──────────────────────────────────────────────────────────────────
('gov','https://ncwisweb.sfaa.gov.tw/home/nanny','GOV-TPE-001',
 '林美慧 保母（居家托育）',
 '服務類型：居家托育｜托育時段：全日（07:00–18:00）｜學歷：幼保科｜目前收托：2 人｜所屬系統：台北市居家托育服務中心',
 'babysitter','台北市','中山區','22,000–25,000 元/月','02-2567-XXXX',
 ARRAY['居家托育','全日托','已登記','有技術士證'],TRUE,TRUE,NOW()-INTERVAL '10 days'),

('gov','https://ncwisweb.sfaa.gov.tw/home/nanny','GOV-TPE-002',
 '王淑芬 保母（居家托育）',
 '服務類型：居家托育｜托育時段：半日（07:00–13:00）｜學歷：托育人員訓練結業｜目前收托：1 人｜所屬系統：台北市居家托育服務中心',
 'babysitter','台北市','大安區','12,000–15,000 元/月','02-2733-XXXX',
 ARRAY['居家托育','半日托','已登記'],TRUE,TRUE,NOW()-INTERVAL '20 days'),

('gov','https://ncwisweb.sfaa.gov.tw/home/nanny','GOV-TPE-003',
 '陳雅婷 保母（居家托育）',
 '服務類型：居家托育｜托育時段：全日（07:00–18:00）｜學歷：幼兒教育系｜目前收托：3 人｜所屬系統：台北市居家托育服務中心',
 'babysitter','台北市','內湖區','22,000–26,000 元/月','02-2792-XXXX',
 ARRAY['居家托育','全日托','已登記','有技術士證','大學幼教系畢'],TRUE,TRUE,NOW()-INTERVAL '5 days'),

('gov','https://ncwisweb.sfaa.gov.tw/home/nanny','GOV-TPE-004',
 '張素珍 保母（居家托育）',
 '服務類型：居家托育｜托育時段：全日（08:00–18:00）｜學歷：高中｜目前收托：2 人｜所屬系統：台北市居家托育服務中心',
 'babysitter','台北市','信義區','20,000–23,000 元/月','02-2723-XXXX',
 ARRAY['居家托育','全日托','已登記'],TRUE,TRUE,NOW()-INTERVAL '30 days'),

('gov','https://ncwisweb.sfaa.gov.tw/home/nanny','GOV-TPE-005',
 '吳佳儀 保母（居家托育）',
 '服務類型：居家托育｜托育時段：全日（07:30–17:30）｜學歷：幼保科｜目前收托：1 人｜所屬系統：台北市居家托育服務中心',
 'babysitter','台北市','文山區','20,000–22,000 元/月','02-2934-XXXX',
 ARRAY['居家托育','全日托','已登記','有技術士證'],TRUE,TRUE,NOW()-INTERVAL '8 days'),

('gov','https://ncwisweb.sfaa.gov.tw/home/nanny','GOV-TPE-006',
 '劉秀蘭 保母（居家托育）',
 '服務類型：居家托育｜托育時段：半日（08:00–12:00）｜學歷：托育人員訓練結業｜目前收托：2 人｜所屬系統：台北市居家托育服務中心',
 'babysitter','台北市','士林區','11,000–13,000 元/月','02-2885-XXXX',
 ARRAY['居家托育','半日托','已登記'],TRUE,TRUE,NOW()-INTERVAL '15 days'),

('gov','https://ncwisweb.sfaa.gov.tw/home/nanny','GOV-TPE-007',
 '蔡明珠 保母（居家托育）',
 '服務類型：居家托育｜托育時段：全日（07:00–18:00）｜學歷：幼教系｜目前收托：3 人｜所屬系統：台北市居家托育服務中心',
 'babysitter','台北市','中正區','23,000–27,000 元/月','02-2391-XXXX',
 ARRAY['居家托育','全日托','已登記','有技術士證','大學幼教系畢'],TRUE,TRUE,NOW()-INTERVAL '3 days'),

('gov','https://ncwisweb.sfaa.gov.tw/home/nanny','GOV-TPE-008',
 '鄭淑娟 保母（居家托育）',
 '服務類型：居家托育｜托育時段：臨時托育｜學歷：高中｜目前收托：0 人｜所屬系統：台北市居家托育服務中心',
 'babysitter','台北市','北投區','200–250 元/時','02-2893-XXXX',
 ARRAY['居家托育','臨時托','已登記'],TRUE,TRUE,NOW()-INTERVAL '45 days'),

-- ── 新北市 ──────────────────────────────────────────────────────────────────
('gov','https://ncwisweb.sfaa.gov.tw/home/nanny','GOV-NTP-001',
 '許雅玲 保母（居家托育）',
 '服務類型：居家托育｜托育時段：全日（07:30–18:00）｜學歷：幼保科｜目前收托：2 人｜所屬系統：新北市居家托育服務中心',
 'babysitter','新北市','板橋區','21,000–24,000 元/月','02-2253-XXXX',
 ARRAY['居家托育','全日托','已登記','有技術士證'],TRUE,TRUE,NOW()-INTERVAL '7 days'),

('gov','https://ncwisweb.sfaa.gov.tw/home/nanny','GOV-NTP-002',
 '黃淑惠 保母（居家托育）',
 '服務類型：居家托育｜托育時段：全日（08:00–18:00）｜學歷：托育人員訓練結業｜目前收托：3 人｜所屬系統：新北市居家托育服務中心',
 'babysitter','新北市','三重區','20,000–22,000 元/月','02-2977-XXXX',
 ARRAY['居家托育','全日托','已登記'],TRUE,TRUE,NOW()-INTERVAL '12 days'),

('gov','https://ncwisweb.sfaa.gov.tw/home/nanny','GOV-NTP-003',
 '楊美麗 保母（居家托育）',
 '服務類型：居家托育｜托育時段：半日（07:00–13:00）｜學歷：幼兒保育系｜目前收托：1 人｜所屬系統：新北市居家托育服務中心',
 'babysitter','新北市','新莊區','12,000–14,000 元/月','02-2908-XXXX',
 ARRAY['居家托育','半日托','已登記','有技術士證'],TRUE,TRUE,NOW()-INTERVAL '22 days'),

('gov','https://ncwisweb.sfaa.gov.tw/home/nanny','GOV-NTP-004',
 '林秀琴 保母（居家托育）',
 '服務類型：居家托育｜托育時段：全日（07:00–18:00）｜學歷：高中｜目前收托：2 人｜所屬系統：新北市居家托育服務中心',
 'babysitter','新北市','中和區','20,000–23,000 元/月','02-2248-XXXX',
 ARRAY['居家托育','全日托','已登記'],TRUE,TRUE,NOW()-INTERVAL '18 days'),

('gov','https://ncwisweb.sfaa.gov.tw/home/nanny','GOV-NTP-005',
 '謝麗華 保母（居家托育）',
 '服務類型：居家托育｜托育時段：全日（08:00–17:30）｜學歷：幼教系｜目前收托：2 人｜所屬系統：新北市居家托育服務中心',
 'babysitter','新北市','永和區','22,000–25,000 元/月','02-2942-XXXX',
 ARRAY['居家托育','全日托','已登記','有技術士證','大學幼教系畢'],TRUE,TRUE,NOW()-INTERVAL '6 days'),

-- ── 桃園市 ──────────────────────────────────────────────────────────────────
('gov','https://ncwisweb.sfaa.gov.tw/home/nanny','GOV-TYN-001',
 '方淑芳 保母（居家托育）',
 '服務類型：居家托育｜托育時段：全日（07:30–17:30）｜學歷：幼保科｜目前收托：2 人｜所屬系統：桃園市居家托育服務中心',
 'babysitter','桃園市','桃園區','19,000–22,000 元/月','03-3561-XXXX',
 ARRAY['居家托育','全日托','已登記','有技術士證'],TRUE,TRUE,NOW()-INTERVAL '9 days'),

('gov','https://ncwisweb.sfaa.gov.tw/home/nanny','GOV-TYN-002',
 '洪美英 保母（居家托育）',
 '服務類型：居家托育｜托育時段：全日（08:00–18:00）｜學歷：托育人員訓練結業｜目前收托：1 人｜所屬系統：桃園市居家托育服務中心',
 'babysitter','桃園市','中壢區','19,000–21,000 元/月','03-4258-XXXX',
 ARRAY['居家托育','全日托','已登記'],TRUE,TRUE,NOW()-INTERVAL '25 days'),

('gov','https://ncwisweb.sfaa.gov.tw/home/nanny','GOV-TYN-003',
 '葉素梅 保母（居家托育）',
 '服務類型：居家托育｜托育時段：半日（07:00–12:00）｜學歷：幼兒保育系｜目前收托：2 人｜所屬系統：桃園市居家托育服務中心',
 'babysitter','桃園市','八德區','10,000–12,000 元/月','03-3685-XXXX',
 ARRAY['居家托育','半日托','已登記','有技術士證'],TRUE,TRUE,NOW()-INTERVAL '14 days'),

-- ── 台中市 ──────────────────────────────────────────────────────────────────
('gov','https://ncwisweb.sfaa.gov.tw/home/nanny','GOV-TCH-001',
 '盧淑貞 保母（居家托育）',
 '服務類型：居家托育｜托育時段：全日（07:00–18:00）｜學歷：幼保科｜目前收托：3 人｜所屬系統：台中市居家托育服務中心',
 'babysitter','台中市','西屯區','20,000–23,000 元/月','04-2463-XXXX',
 ARRAY['居家托育','全日托','已登記','有技術士證'],TRUE,TRUE,NOW()-INTERVAL '11 days'),

('gov','https://ncwisweb.sfaa.gov.tw/home/nanny','GOV-TCH-002',
 '李寶珠 保母（居家托育）',
 '服務類型：居家托育｜托育時段：全日（08:00–17:00）｜學歷：高中｜目前收托：2 人｜所屬系統：台中市居家托育服務中心',
 'babysitter','台中市','北屯區','18,000–21,000 元/月','04-2235-XXXX',
 ARRAY['居家托育','全日托','已登記'],TRUE,TRUE,NOW()-INTERVAL '35 days'),

-- ── 高雄市 ──────────────────────────────────────────────────────────────────
('gov','https://ncwisweb.sfaa.gov.tw/home/nanny','GOV-KHH-001',
 '蘇雅惠 保母（居家托育）',
 '服務類型：居家托育｜托育時段：全日（07:30–18:00）｜學歷：幼兒教育系｜目前收托：2 人｜所屬系統：高雄市居家托育服務中心',
 'babysitter','高雄市','三民區','19,000–22,000 元/月','07-3862-XXXX',
 ARRAY['居家托育','全日托','已登記','有技術士證','大學幼教系畢'],TRUE,TRUE,NOW()-INTERVAL '4 days'),

('gov','https://ncwisweb.sfaa.gov.tw/home/nanny','GOV-KHH-002',
 '鍾淑萍 保母（居家托育）',
 '服務類型：居家托育｜托育時段：半日（08:00–12:00）｜學歷：托育人員訓練結業｜目前收托：1 人｜所屬系統：高雄市居家托育服務中心',
 'babysitter','高雄市','鳳山區','10,000–12,000 元/月','07-7668-XXXX',
 ARRAY['居家托育','半日托','已登記'],TRUE,TRUE,NOW()-INTERVAL '28 days');

-- ── 驗證結果 ───────────────────────────────────────────────────────────────
SELECT region, COUNT(*) AS 筆數
FROM caregivers
WHERE source = 'gov'
GROUP BY region
ORDER BY 筆數 DESC;
