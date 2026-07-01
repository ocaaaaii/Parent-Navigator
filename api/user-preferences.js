/**
 * GET  /api/user-preferences?user_id=X
 *   → 取得使用者偏好主題 + 孩子清單（從 Supabase 直接查）
 *
 * PUT  /api/user-preferences
 *   Body: { user_id, preferred_categories: ["medical","subsidy",...] }
 *   → 更新 users.preferred_categories，並轉發給組員評分引擎
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET：取得使用者偏好 ─────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: '缺少 user_id' });

    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id, user_nickname, region, parental_employment, special_status, preferred_categories')
      .eq('id', user_id)
      .single();

    if (userErr || !user) {
      return res.status(404).json({ error: '找不到使用者' });
    }

    // 同時撈孩子資料
    const { data: children } = await supabase
      .from('children')
      .select('id, name, birth_date, age_months, gender, birth_order, special_status, is_active')
      .eq('user_id', user_id)
      .order('created_at', { ascending: true });

    return res.status(200).json({
      user: {
        id:                  user.id,
        name:                user.user_nickname,
        region:              user.region,
        parental_employment: user.parental_employment,
        special_status:      user.special_status,
        preferred_categories: user.preferred_categories || [],
      },
      children: children || [],
    });
  }

  // ── PUT：更新偏好主題 ────────────────────────────────────────────────────
  if (req.method === 'PUT') {
    const { user_id, preferred_categories } = req.body || {};
    if (!user_id) return res.status(400).json({ error: '缺少 user_id' });

    const VALID = ['medical', 'subsidy', 'daycare', 'activity'];
    const cats = (preferred_categories || []).filter(c => VALID.includes(c));

    const { error: updateErr } = await supabase
      .from('users')
      .update({ preferred_categories: cats })
      .eq('id', user_id);

    if (updateErr) {
      return res.status(500).json({ error: '更新失敗：' + updateErr.message });
    }

    // 轉發給組員評分引擎（PUT /api/users/{user_id}/preferences）
    const engineUrl = process.env.SCORING_ENGINE_URL;
    if (engineUrl) {
      try {
        await fetch(`${engineUrl.replace(/\/$/, '')}/api/users/${user_id}/preferences`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.SCORING_ENGINE_KEY
              ? { 'X-API-Key': process.env.SCORING_ENGINE_KEY }
              : {}),
          },
          body: JSON.stringify({ preferred_categories: cats }),
        });
      } catch (err) {
        console.warn('[user-preferences] engine forward failed:', err.message);
      }
    }

    return res.status(200).json({ success: true, preferred_categories: cats });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
