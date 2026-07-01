/**
 * POST /api/click
 * Body: { user_id, child_id, policy_id, category, priority }
 *
 * 記錄使用者對推薦政策的點擊行為，同時：
 * 1. 寫入本站 Supabase policy_click_events 表（供統計與個人化學習）
 * 2. 轉發給組員 Python 評分引擎（若 SCORING_ENGINE_URL 已設定）
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user_id, child_id, policy_id, category, priority } = req.body || {};
  if (!policy_id) return res.status(400).json({ error: '缺少 policy_id' });

  // ── 1. 寫入本站 Supabase ─────────────────────────────────────────────────
  const { error: dbErr } = await supabase
    .from('policy_click_events')
    .insert({
      user_id:    user_id  || null,
      child_id:   child_id || null,
      policy_id,
      category:   category || null,
      priority:   priority || null,
      clicked_at: new Date().toISOString(),
    });

  if (dbErr) {
    console.error('[click] Supabase insert error:', dbErr.message);
    // 不中斷流程，繼續嘗試轉發
  }

  // ── 2. 轉發給組員評分引擎（選用）────────────────────────────────────────
  const engineUrl = process.env.SCORING_ENGINE_URL;
  if (engineUrl) {
    try {
      await fetch(`${engineUrl.replace(/\/$/, '')}/api/events/click`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.SCORING_ENGINE_KEY
            ? { 'X-API-Key': process.env.SCORING_ENGINE_KEY }
            : {}),
        },
        body: JSON.stringify({ user_id, child_id, policy_id, category, priority }),
      });
    } catch (err) {
      // 引擎離線不影響主流程
      console.warn('[click] scoring engine forward failed:', err.message);
    }
  }

  return res.status(200).json({ success: true });
};
