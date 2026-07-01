/**
 * GET /api/recommendations?user_id=X&child_id=Y&mode=personal|cohort|platform
 *
 * Vercel 代理 → 組員 Python 評分引擎
 * 環境變數：SCORING_ENGINE_URL（例如 https://my-scoring-engine.onrender.com）
 *
 * 若 SCORING_ENGINE_URL 未設定，回傳 Demo 假資料，供純前端展示使用。
 */

const DEMO_RECOMMENDATIONS = [
  {
    id: 'taipei-birth-bonus',
    title: '台北市生育獎勵金',
    category: 'subsidy',
    priority: 'high',
    reason: '符合台北市設籍條件；第 1 胎可領 4 萬元，出生後 60 天內申請',
    benefit_amount: 40000,
    benefit_type: 'one_time',
    deadline: null,
    url: 'https://www.gov.taipei',
  },
  {
    id: 'childcare-subsidy',
    title: '育兒津貼（未滿 2 歲）',
    category: 'subsidy',
    priority: 'high',
    reason: '孩子目前月齡符合資格，每月最高補助 3,000 元',
    benefit_amount: 3000,
    benefit_type: 'monthly',
    deadline: null,
    url: 'https://www.mohw.gov.tw',
  },
  {
    id: 'vaccine-schedule',
    title: '公費疫苗接種時程提醒',
    category: 'medical',
    priority: 'high',
    reason: '寶寶即將滿 2 個月，需接種 B 型肝炎、五合一等公費疫苗',
    benefit_amount: null,
    benefit_type: null,
    deadline: null,
    url: 'https://www.cdc.gov.tw',
  },
  {
    id: 'health-checkup',
    title: '兒童預防保健服務（7 次免費健檢）',
    category: 'medical',
    priority: 'medium',
    reason: '0~3 歲共 5 次免費兒童健康檢查，建議提前預約',
    benefit_amount: null,
    benefit_type: null,
    deadline: null,
    url: 'https://www.mohw.gov.tw',
  },
  {
    id: 'parental-leave',
    title: '育嬰留職停薪津貼',
    category: 'subsidy',
    priority: 'medium',
    reason: '符合就業保險投保條件，最高可領 6 個月薪資 80%',
    benefit_amount: null,
    benefit_type: null,
    deadline: null,
    url: 'https://www.bli.gov.tw',
  },
  {
    id: 'daycare-public',
    title: '台北市公托申請指南',
    category: 'daycare',
    priority: 'low',
    reason: '公托名額有限，建議提早了解申請時程',
    benefit_amount: null,
    benefit_type: null,
    deadline: null,
    url: 'https://www.gov.taipei',
  },
];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { user_id, child_id, mode = 'personal' } = req.query;
  if (!user_id || !child_id) {
    return res.status(400).json({ error: '缺少 user_id 或 child_id 參數' });
  }

  const engineUrl = process.env.SCORING_ENGINE_URL;

  // ── Demo 模式：評分引擎 URL 未設定時直接回傳假資料 ──────────────────────
  if (!engineUrl) {
    console.warn('[recommendations] SCORING_ENGINE_URL not set — returning demo data');
    return res.status(200).json({
      mode,
      demo: true,
      results: DEMO_RECOMMENDATIONS,
    });
  }

  // ── Proxy 模式：轉發給組員的 Python 評分引擎 ───────────────────────────────
  try {
    const upstream = await fetch(
      `${engineUrl.replace(/\/$/, '')}/api/recommendations/${user_id}/${child_id}?mode=${mode}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          // 若組員 API 需要 API Key 可加此 header
          ...(process.env.SCORING_ENGINE_KEY
            ? { 'X-API-Key': process.env.SCORING_ENGINE_KEY }
            : {}),
        },
      }
    );

    const rawText = await upstream.text();
    if (!upstream.ok) {
      console.error('[recommendations] upstream error:', upstream.status, rawText.slice(0, 200));
      return res.status(502).json({ error: `推薦引擎回應異常 (${upstream.status})` });
    }

    let data;
    try { data = JSON.parse(rawText); } catch {
      return res.status(502).json({ error: '推薦引擎回傳非 JSON' });
    }

    return res.status(200).json({ mode, demo: false, ...data });
  } catch (err) {
    console.error('[recommendations] fetch error:', err.message);
    // 引擎離線時自動降級為 demo 資料，不讓前端白屏
    return res.status(200).json({
      mode,
      demo: true,
      degraded: true,
      results: DEMO_RECOMMENDATIONS,
    });
  }
};
