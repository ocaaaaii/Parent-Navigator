/**
 * GET /api/recommendations?user_id=X&child_id=Y&mode=personal|cohort|platform
 *
 * 評分引擎 v2 — 動態權重 + 百分位優先層級
 *
 * 架構（對應投影片）：
 *   1. 四大主題分類（topic → category）
 *   2. 三維評分：benefit_score / eligibility / urgency
 *   3. 四項過濾：city_match / special_status_match / employment_match / age_range
 *   4. 動態權重：點擊紀錄 → 偏好 → 全站預設（完全資料驅動）
 *   5. 百分位優先層級：top 20% high / 中 50% medium / 後 30% low
 */

// ════════════════════════════════════════════════════════════════
// 政策目錄（Policy Catalog）
// ════════════════════════════════════════════════════════════════

const POLICIES = [
  // ── 醫療保健 ──────────────────────────────────────────────────
  {
    id: 'newborn',
    title: '新生兒照護全指南（疫苗・健檢・日常照護）',
    topic: 'vaccine',
    category: 'medical',
    base_benefit: 85,
    city: '全國',
    age_min_months: 0,
    age_max_months: 36,
    special_status: null,
    employment: null,
    birth_order_max: null,
    urgency_triggers: [0, 2, 4, 6, 12],   // 月齡里程碑（月）
    reason_tmpl: '寶寶{age}需完成公費疫苗接種，建議提前預約！',
  },
  {
    id: 'preventive-health',
    title: '兒童預防保健服務（7 次免費健檢）',
    topic: 'health_check',
    category: 'medical',
    base_benefit: 80,
    city: '全國',
    age_min_months: 0,
    age_max_months: 84,
    special_status: null,
    employment: null,
    birth_order_max: null,
    urgency_triggers: [1, 4, 10, 18, 30, 48, 66],
    reason_tmpl: '寶寶{age}可免費安排兒童健康檢查，健保給付免部分負擔',
  },
  {
    id: 'child-medical',
    title: '台北市兒童醫療補助',
    topic: 'health_check',
    category: 'medical',
    base_benefit: 75,
    city: '台北市',
    age_min_months: 0,
    age_max_months: 72,
    special_status: null,
    employment: null,
    birth_order_max: null,
    urgency_triggers: [],
    reason_tmpl: '台北市設籍兒童可補助急診、住院費用，孩子{age}符合資格',
  },

  // ── 補助福利 ──────────────────────────────────────────────────
  {
    id: 'birth-bonus',
    title: '台北市生育獎勵金',
    topic: 'subsidy',
    category: 'subsidy',
    base_benefit: 90,
    city: '台北市',
    age_min_months: 0,
    age_max_months: 3,   // 出生後 60 天申請，放寬至 3 個月
    special_status: null,
    employment: null,
    birth_order_max: null,
    urgency_triggers: [0],
    reason_tmpl: '寶寶{age}，台北市生育獎勵金申請截止 60 天，請盡快辦理！',
  },
  {
    id: 'subsidy-apply',
    title: '育兒津貼（未送托家庭，每月最高 5,000 元）',
    topic: 'subsidy',
    category: 'subsidy',
    base_benefit: 88,
    city: '全國',
    age_min_months: 0,
    age_max_months: 24,
    special_status: null,
    employment: ['employed', 'self_employed', null],   // 非全職照顧者
    birth_order_max: null,
    urgency_triggers: [],
    reason_tmpl: '孩子{age}，未送托家庭每月可領 5,000 元育兒津貼',
  },
  {
    id: 'parental-leave',
    title: '育嬰留職停薪津貼（薪資 80%，最長 6 個月）',
    topic: 'subsidy',
    category: 'subsidy',
    base_benefit: 92,
    city: '全國',
    age_min_months: 0,
    age_max_months: 36,
    special_status: null,
    employment: ['employed'],
    birth_order_max: null,
    urgency_triggers: [],
    reason_tmpl: '符合就業保險條件，可申請育嬰留停，領薪資 80%',
  },
  {
    id: 'parental-leave-update',
    title: '育嬰假新制 2024 說明（爸爸強制 7 天 + 共同育嬰假）',
    topic: 'gov_resource',
    category: 'subsidy',
    base_benefit: 70,
    city: '全國',
    age_min_months: 0,
    age_max_months: 36,
    special_status: null,
    employment: ['employed'],
    birth_order_max: null,
    urgency_triggers: [],
    reason_tmpl: '新制育嬰假上路，雙親可同時申請，提升共同育兒',
  },
  {
    id: 'paternity-leave',
    title: '陪產假 / 陪產檢假（7 天，薪資照給）',
    topic: 'subsidy',
    category: 'subsidy',
    base_benefit: 78,
    city: '全國',
    age_min_months: 0,
    age_max_months: 2,
    special_status: null,
    employment: ['employed'],
    birth_order_max: null,
    urgency_triggers: [0],
    reason_tmpl: '孩子{age}，爸爸可申請 7 天陪產假，薪水照領',
  },
  {
    id: 'subsidy-compare',
    title: '各縣市育兒補助懶人包比較（2024 最新）',
    topic: 'gov_resource',
    category: 'subsidy',
    base_benefit: 65,
    city: '全國',
    age_min_months: 0,
    age_max_months: 72,
    special_status: null,
    employment: null,
    birth_order_max: null,
    urgency_triggers: [],
    reason_tmpl: '整合全台各縣市補助金額比較，幫你找到最划算方案',
  },

  // ── 托育服務 ──────────────────────────────────────────────────
  {
    id: 'daycare-guide',
    title: '公托申請指南（候補登記 + 時程說明）',
    topic: 'childcare',
    category: 'daycare',
    base_benefit: 82,
    city: '全國',
    age_min_months: 0,
    age_max_months: 24,
    special_status: null,
    employment: null,
    birth_order_max: null,
    urgency_triggers: [0, 3],
    reason_tmpl: '公托名額稀少，孩子{age}建議立即登記候補！',
  },

  // ── 親子教育活動 ──────────────────────────────────────────────
  {
    id: 'preschool-edu',
    title: '幼兒園公共化補助（私立每月最高補助 3,000 元）',
    topic: 'parenting',
    category: 'activity',
    base_benefit: 72,
    city: '全國',
    age_min_months: 36,
    age_max_months: 72,
    special_status: null,
    employment: null,
    birth_order_max: null,
    urgency_triggers: [36, 48],
    reason_tmpl: '孩子{age}即將進入幼幼班階段，把握幼兒園補助！',
  },
  {
    id: 'parenting-course',
    title: '親子課程 / 早期療育活動資源整合',
    topic: 'announcement',
    category: 'activity',
    base_benefit: 58,
    city: '全國',
    age_min_months: 0,
    age_max_months: 72,
    special_status: null,
    employment: null,
    birth_order_max: null,
    urgency_triggers: [],
    reason_tmpl: '各縣市家庭教育中心提供免費親子課程，適合{age}寶寶',
  },
];

// topic → category 對應（四大主題）
const TOPIC_TO_CATEGORY = {
  vaccine:       'medical',
  health_check:  'medical',
  subsidy:       'subsidy',
  social_welfare:'subsidy',
  gov_resource:  'subsidy',
  childcare:     'daycare',
  parenting:     'activity',
  announcement:  'activity',
};

// ════════════════════════════════════════════════════════════════
// Supabase REST 工具
// ════════════════════════════════════════════════════════════════

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

async function dbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY,
      'Content-Type': 'application/json',
    },
  });
  if (!r.ok) throw new Error(`DB ${r.status}: ${await r.text()}`);
  return r.json();
}

// ════════════════════════════════════════════════════════════════
// 評分引擎核心
// ════════════════════════════════════════════════════════════════

/** 計算孩子月齡 */
function childAgeMonths(birthDate) {
  if (!birthDate) return 6; // 預設 6 個月（沒資料時）
  const diff = Date.now() - new Date(birthDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 30.4));
}

/** 月齡文字描述 */
function ageLabel(months) {
  if (months < 1)  return '剛出生';
  if (months < 24) return `${months} 個月`;
  return `${Math.floor(months / 12)} 歲${months % 12 ? months % 12 + '個月' : ''}`;
}

/**
 * 動態權重計算
 * 三層優先序：點擊歷史 → 偏好設定 → 全站預設
 */
function calcDynamicWeights(clickCounts, preferredCategories, ageMonths) {
  // 1. 依點擊次數算各 topic 的偏好強度
  const topicStrength = {};
  for (const [topic, cnt] of Object.entries(clickCounts)) {
    topicStrength[topic] = Math.min(cnt, 20); // 上限 20，避免單一 topic 過度主導
  }

  // 2. 使用者有哪些類別偏好（從 preferred_categories 補強）
  const prefBonus = {};
  for (const cat of (preferredCategories || [])) {
    prefBonus[cat] = (prefBonus[cat] || 0) + 3;
  }

  // 3. 依孩子月齡自動調整底層緊迫性權重
  // 新生兒：urgency 最高（疫苗/健檢密集）；大孩子：benefit 權重升高
  let baseUrgencyW, baseBenefitW, baseEligW;
  if (ageMonths < 6) {
    baseUrgencyW = 0.40; baseBenefitW = 0.40; baseEligW = 0.20;
  } else if (ageMonths < 24) {
    baseUrgencyW = 0.30; baseBenefitW = 0.45; baseEligW = 0.25;
  } else {
    baseUrgencyW = 0.20; baseBenefitW = 0.50; baseEligW = 0.30;
  }

  // 4. 若有點擊歷史，用點擊比例微調權重
  const totalClicks = Object.values(topicStrength).reduce((a, b) => a + b, 0);
  if (totalClicks >= 5) {
    // 點擊醫療 topic 多 → urgency 權重提升
    const medicalClicks = (topicStrength.vaccine || 0) + (topicStrength.health_check || 0);
    const subsidyClicks = (topicStrength.subsidy || 0) + (topicStrength.social_welfare || 0) + (topicStrength.gov_resource || 0);
    const medicalRatio  = medicalClicks / totalClicks;
    const subsidyRatio  = subsidyClicks / totalClicks;

    baseUrgencyW = Math.max(0.10, Math.min(0.55, baseUrgencyW + medicalRatio * 0.20));
    baseBenefitW = Math.max(0.25, Math.min(0.65, baseBenefitW + subsidyRatio * 0.15));
    baseEligW    = Math.max(0.10, 1 - baseUrgencyW - baseBenefitW);
  }

  // 正規化確保合計 = 1.00
  const total = baseUrgencyW + baseBenefitW + baseEligW;
  return {
    w_benefit:     parseFloat((baseBenefitW / total).toFixed(3)),
    w_eligibility: parseFloat((baseEligW    / total).toFixed(3)),
    w_urgency:     parseFloat((baseUrgencyW / total).toFixed(3)),
  };
}

/**
 * 計算 eligibility（0-100）
 * 評估使用者對該政策的符合程度
 */
function scoreEligibility(policy, user, ageMonths) {
  let score = 60; // 基礎分（大多數政策全國通用）

  // 縣市匹配
  if (policy.city !== '全國') {
    if (!user.region || !user.region.startsWith(policy.city.slice(0, 3))) return 0; // 直接過濾
    score += 25;
  } else {
    score += 10; // 全國通用加分
  }

  // 就業狀態匹配
  if (policy.employment && policy.employment.length > 0) {
    const matches = policy.employment.includes(user.parental_employment)
      || policy.employment.includes(null);
    if (!matches) return 0; // 就業狀態不符，直接過濾
    score += 15;
  }

  // 特殊身分匹配
  if (policy.special_status) {
    const userStatus = (user.special_status || '').split(',').map(s => s.trim());
    const hasMatch = policy.special_status.some(s => userStatus.includes(s));
    if (!hasMatch) score -= 20;
    else score += 20;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * 計算 urgency（0-100）
 * 孩子月齡與政策里程碑的接近程度
 */
function scoreUrgency(policy, ageMonths) {
  // 年齡範圍之外
  if (ageMonths < policy.age_min_months || ageMonths > policy.age_max_months) {
    return 0;
  }

  // 沒有里程碑觸發點 → 基礎緊迫 30
  if (!policy.urgency_triggers || policy.urgency_triggers.length === 0) {
    // 越接近 age_max_months 截止越緊迫
    const remainPct = 1 - (ageMonths - policy.age_min_months) /
                          (policy.age_max_months - policy.age_min_months + 1);
    return Math.round(25 + remainPct * 30);
  }

  // 找最近的里程碑
  let minDist = Infinity;
  for (const trigger of policy.urgency_triggers) {
    const dist = Math.abs(ageMonths - trigger);
    if (dist < minDist) minDist = dist;
  }

  // 距離 0 個月 → 100，距離 6 個月 → 40，超過 12 個月 → 10
  if (minDist === 0) return 100;
  if (minDist <= 1)  return 90;
  if (minDist <= 2)  return 75;
  if (minDist <= 4)  return 60;
  if (minDist <= 6)  return 45;
  if (minDist <= 12) return 30;
  return 15;
}

/**
 * 依點擊紀錄計算各 topic 點擊次數
 */
function buildClickCounts(clickEvents) {
  const counts = {};
  for (const ev of clickEvents) {
    const topic = ev.category || 'subsidy'; // policy_click_events.category
    counts[topic] = (counts[topic] || 0) + 1;
  }
  return counts;
}

/**
 * 依分數陣列計算百分位並賦予 priority
 * top 20% → high, 中 50% → medium, 後 30% → low
 */
function assignPriorities(scored) {
  if (!scored.length) return [];
  const sorted = [...scored].sort((a, b) => b.final_score - a.final_score);
  const n = sorted.length;
  return sorted.map((item, idx) => {
    const pct = (idx / n) * 100;
    const priority = pct < 20 ? 'high' : pct < 70 ? 'medium' : 'low';
    return { ...item, priority };
  });
}

// ════════════════════════════════════════════════════════════════
// 主 Handler
// ════════════════════════════════════════════════════════════════

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

  const { user_id, child_id, mode = 'personal' } = req.query;
  if (!user_id || !child_id) {
    return res.status(400).json({ error: '缺少 user_id 或 child_id 參數' });
  }

  // ── 若有外部評分引擎，優先使用（保持向下相容）──────────────────
  const engineUrl = process.env.SCORING_ENGINE_URL;
  if (engineUrl) {
    try {
      const upstream = await fetch(
        `${engineUrl.replace(/\/$/, '')}/api/recommendations/${user_id}/${child_id}?mode=${mode}`,
        { headers: process.env.SCORING_ENGINE_KEY ? { 'X-API-Key': process.env.SCORING_ENGINE_KEY } : {} }
      );
      if (upstream.ok) {
        const data = await upstream.json();
        return res.status(200).json({ mode, demo: false, ...data });
      }
    } catch {}
    // 引擎離線 → 繼續用內建引擎
  }

  try {
    // ── 1. 拉取使用者資料 ──────────────────────────────────────
    const [users, children, clickEvents] = await Promise.all([
      dbGet(`users?id=eq.${user_id}&select=id,region,parental_employment,special_status,preferred_categories&limit=1`),
      dbGet(`children?id=eq.${child_id}&select=id,birth_date,gender,birth_order,special_status&limit=1`),
      dbGet(`policy_click_events?user_id=eq.${user_id}&select=category,policy_id,clicked_at&order=clicked_at.desc&limit=200`),
    ]);

    if (!users.length) return res.status(404).json({ error: '找不到使用者' });
    if (!children.length) return res.status(404).json({ error: '找不到孩子資料' });

    const user  = users[0];
    const child = children[0];

    // ── 2. 計算孩子月齡 ────────────────────────────────────────
    const ageMonths = childAgeMonths(child.birth_date);

    // ── 3. 動態權重 ────────────────────────────────────────────
    const clickCounts = buildClickCounts(clickEvents);
    const weights     = calcDynamicWeights(
      clickCounts,
      user.preferred_categories || [],
      ageMonths
    );

    // ── 4. 政策篩選 + 評分 ─────────────────────────────────────
    const scored = [];

    for (const policy of POLICIES) {
      // 年齡範圍過濾
      if (ageMonths < policy.age_min_months || ageMonths > policy.age_max_months) continue;

      // 計算三維分數
      const eligibility  = scoreEligibility(policy, user, ageMonths);
      if (eligibility === 0) continue; // eligibility = 0 代表被過濾掉

      const urgency      = scoreUrgency(policy, ageMonths);
      const benefit      = policy.base_benefit;

      // 加權合計
      const final_score  = parseFloat((
        weights.w_benefit     * benefit     +
        weights.w_eligibility * eligibility +
        weights.w_urgency     * urgency
      ).toFixed(2));

      // 產生推薦理由
      const age        = ageLabel(ageMonths);
      const reason     = (policy.reason_tmpl || '').replace('{age}', age);

      scored.push({
        id:           policy.id,
        title:        policy.title,
        category:     policy.category,
        url:          null,
        // 評分明細（可供前端 debug / 後台展示）
        scores: { benefit, eligibility, urgency, final_score },
        reason,
      });
    }

    // ── 5. 百分位優先層級 ─────────────────────────────────────
    const results = assignPriorities(scored);

    // ── 6. 加入 birth_order_match 旗標 ────────────────────────
    const birthOrder = child.birth_order || 1;
    const enriched   = results.map(r => ({
      ...r,
      birth_order_match: birthOrder >= 2 ? 'multi_child' : 'first_child',
    }));

    return res.status(200).json({
      mode,
      demo: false,
      engine: 'built-in-v2',
      meta: {
        age_months:    ageMonths,
        age_label:     ageLabel(ageMonths),
        weights,
        click_counts:  clickCounts,
        total_policies: enriched.length,
      },
      results: enriched,
    });

  } catch (err) {
    console.error('[recommendations] engine error:', err.message);

    // 降級：回傳 demo 假資料，不讓前端白屏
    return res.status(200).json({
      mode,
      demo: true,
      degraded: true,
      engine: 'fallback',
      results: POLICIES.slice(0, 6).map((p, i) => ({
        id:       p.id,
        title:    p.title,
        category: p.category,
        priority: i < 2 ? 'high' : i < 5 ? 'medium' : 'low',
        reason:   `推薦引擎暫時離線，顯示預設推薦`,
        url:      null,
      })),
    });
  }
};
