/**
 * api/admin.js  — 後台管理 API（合併 admin-auth + admin-stats）
 *
 * POST /api/admin          → 密碼驗證，回傳 admin JWT
 * GET  /api/admin?type=... → 統計查詢（需 Authorization: Bearer <admin_jwt>）
 *
 * 環境變數：
 *   ADMIN_PASSWORD        — 後台密碼
 *   JWT_SECRET            — JWT 簽名金鑰
 *   SUPABASE_URL          — Supabase 專案 URL
 *   SUPABASE_SERVICE_KEY  — Service Role Key
 */

const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

// ── Admin JWT 驗證 ────────────────────────────────────────────
function verifyAdminToken(authHeader, secret) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(authHeader.slice(7), secret);
    return decoded.role === 'admin' ? decoded : null;
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ════════════════════════════════════════════════════════════
  // POST → 密碼驗證 / 登入
  // ════════════════════════════════════════════════════════════
  if (req.method === 'POST') {
    const { password } = req.body || {};
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
    const JWT_SECRET     = process.env.JWT_SECRET;

    if (!ADMIN_PASSWORD || !JWT_SECRET) {
      return res.status(500).json({ error: 'Server configuration error' });
    }
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const token = jwt.sign(
      { role: 'admin', iat: Math.floor(Date.now() / 1000) },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    return res.status(200).json({ token });
  }

  // ════════════════════════════════════════════════════════════
  // GET → 統計查詢（需 admin JWT）
  // ════════════════════════════════════════════════════════════
  if (req.method === 'GET') {
    const admin = verifyAdminToken(req.headers.authorization, process.env.JWT_SECRET);
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const { type, user_id } = req.query;

    try {
      switch (type) {

        // ── KPI 總覽 ───────────────────────────────────────────
        case 'overview': {
          const now      = new Date();
          const weekAgo  = new Date(now - 7  * 86400000).toISOString();
          const monthAgo = new Date(now - 30 * 86400000).toISOString();

          const [
            { count: totalUsers },
            { count: totalClicks },
            { count: newUsersWeek },
            { count: clicksMonth },
          ] = await Promise.all([
            supabase.from('users').select('*', { count: 'exact', head: true }),
            supabase.from('policy_click_events').select('*', { count: 'exact', head: true }),
            supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
            supabase.from('policy_click_events').select('*', { count: 'exact', head: true }).gte('clicked_at', monthAgo),
          ]);

          return res.status(200).json({
            total_users:    totalUsers  ?? 0,
            total_clicks:   totalClicks ?? 0,
            new_users_week: newUsersWeek ?? 0,
            clicks_month:   clicksMonth ?? 0,
          });
        }

        // ── 主題點擊排行 ───────────────────────────────────────
        case 'topic_rank': {
          const { data, error } = await supabase
            .from('policy_click_events')
            .select('policy_id, category');
          if (error) throw error;

          const rankMap = {};
          (data || []).forEach(row => {
            const k = row.policy_id;
            if (!k) return;
            if (!rankMap[k]) rankMap[k] = { policy_id: k, category: row.category, count: 0 };
            rankMap[k].count++;
          });

          const ranked = Object.values(rankMap).sort((a, b) => b.count - a.count).slice(0, 15);
          return res.status(200).json({ items: ranked });
        }

        // ── 四大分類分布 ───────────────────────────────────────
        case 'category_dist': {
          const { data, error } = await supabase
            .from('policy_click_events').select('category');
          if (error) throw error;

          const dist = { medical: 0, subsidy: 0, daycare: 0, activity: 0 };
          (data || []).forEach(r => {
            if (r.category && r.category in dist) dist[r.category]++;
          });
          return res.status(200).json({ distribution: dist });
        }

        // ── 14 天點擊趨勢 ──────────────────────────────────────
        case 'click_trend': {
          const since = new Date(Date.now() - 14 * 86400000).toISOString();
          const { data, error } = await supabase
            .from('policy_click_events')
            .select('clicked_at, category')
            .gte('clicked_at', since)
            .order('clicked_at', { ascending: true });
          if (error) throw error;

          const trendMap = {};
          (data || []).forEach(row => {
            const day = row.clicked_at.slice(0, 10);
            if (!trendMap[day]) trendMap[day] = { date: day, total: 0, medical: 0, subsidy: 0, daycare: 0, activity: 0 };
            trendMap[day].total++;
            if (row.category && row.category in trendMap[day]) trendMap[day][row.category]++;
          });

          return res.status(200).json({
            trend: Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date))
          });
        }

        // ── 用戶列表 ───────────────────────────────────────────
        case 'users': {
          const { data: users, error: uErr } = await supabase
            .from('users')
            .select('id, user_nickname, region, parental_employment, special_status, preferred_categories, created_at')
            .order('created_at', { ascending: false })
            .limit(200);
          if (uErr) throw uErr;

          const { data: clicks } = await supabase
            .from('policy_click_events').select('user_id');

          const clickCount = {};
          (clicks || []).forEach(c => { clickCount[c.user_id] = (clickCount[c.user_id] || 0) + 1; });

          return res.status(200).json({
            users: (users || []).map(u => ({ ...u, click_count: clickCount[u.id] || 0 }))
          });
        }

        // ── 單一用戶點擊詳情 ───────────────────────────────────
        case 'user_clicks': {
          if (!user_id) return res.status(400).json({ error: 'user_id required' });
          const { data, error } = await supabase
            .from('policy_click_events')
            .select('policy_id, category, priority, clicked_at')
            .eq('user_id', user_id)
            .order('clicked_at', { ascending: false })
            .limit(100);
          if (error) throw error;
          return res.status(200).json({ clicks: data || [] });
        }

        // ── 論壇貼文 ───────────────────────────────────────────
        case 'forum_posts': {
          const { data, error } = await supabase
            .from('forum_posts')
            .select('id, title, category, user_id, created_at, views, likes')
            .order('created_at', { ascending: false })
            .limit(50);
          if (error) throw error;
          // 欄位 alias：前端 admin.html 讀 view_count / like_count
          const posts = (data || []).map(p => ({
            ...p,
            view_count: p.views ?? 0,
            like_count: p.likes ?? 0,
          }));
          return res.status(200).json({ posts });
        }

        default:
          return res.status(400).json({ error: `Unknown type: ${type}` });
      }
    } catch (err) {
      console.error('[admin] Error:', err);
      return res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
