/**
 * api/admin-stats.js
 * GET /api/admin-stats?type=<type>
 *
 * type 可選值：
 *   overview      — KPI 總覽（用戶數、點擊數、本週新增）
 *   topic_rank    — 主題點擊排行（最熱門主題）
 *   category_dist — 四大類分布（圓餅 / 柱狀）
 *   click_trend   — 過去 14 天每日點擊趨勢
 *   users         — 用戶列表（含點擊次數）
 *   user_clicks   — 單一用戶點擊詳情，需額外 query param: user_id
 *   forum_posts   — 論壇貼文活動
 *
 * Header: Authorization: Bearer <admin_jwt>
 *
 * 環境變數：
 *   SUPABASE_URL        — Supabase 專案 URL
 *   SUPABASE_SERVICE_KEY — Service Role Key（繞過 RLS）
 *   JWT_SECRET          — 與 admin-auth.js 共用
 */

const jwt         = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

// ── 驗證 admin JWT ────────────────────────────────────────────
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
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Auth 驗證 ──
  const admin = verifyAdminToken(
    req.headers.authorization,
    process.env.JWT_SECRET
  );
  if (!admin) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ── Supabase 客戶端 ──
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const { type, user_id } = req.query;

  try {
    switch (type) {

      // ── KPI 總覽 ─────────────────────────────────────────────
      case 'overview': {
        const now        = new Date();
        const weekAgo    = new Date(now - 7 * 86400000).toISOString();
        const monthAgo   = new Date(now - 30 * 86400000).toISOString();

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
          total_users: totalUsers ?? 0,
          total_clicks: totalClicks ?? 0,
          new_users_week: newUsersWeek ?? 0,
          clicks_month: clicksMonth ?? 0,
        });
      }

      // ── 主題點擊排行（最熱門主題） ───────────────────────────
      case 'topic_rank': {
        const { data, error } = await supabase
          .from('policy_click_events')
          .select('policy_id, category, count:policy_id')
          .not('policy_id', 'is', null);

        if (error) throw error;

        // 在 JS 端做 group by policy_id
        const rankMap = {};
        (data || []).forEach(row => {
          const key = row.policy_id;
          if (!rankMap[key]) {
            rankMap[key] = { policy_id: key, category: row.category, count: 0 };
          }
          rankMap[key].count++;
        });

        const ranked = Object.values(rankMap)
          .sort((a, b) => b.count - a.count)
          .slice(0, 15);

        return res.status(200).json({ items: ranked });
      }

      // ── 四大分類分布 ─────────────────────────────────────────
      case 'category_dist': {
        const { data, error } = await supabase
          .from('policy_click_events')
          .select('category');

        if (error) throw error;

        const dist = { medical: 0, subsidy: 0, daycare: 0, activity: 0 };
        (data || []).forEach(row => {
          if (row.category && dist.hasOwnProperty(row.category)) {
            dist[row.category]++;
          }
        });

        return res.status(200).json({ distribution: dist });
      }

      // ── 過去 14 天每日點擊趨勢 ──────────────────────────────
      case 'click_trend': {
        const since = new Date(Date.now() - 14 * 86400000).toISOString();

        const { data, error } = await supabase
          .from('policy_click_events')
          .select('clicked_at, category')
          .gte('clicked_at', since)
          .order('clicked_at', { ascending: true });

        if (error) throw error;

        // 按日期 group
        const trendMap = {};
        (data || []).forEach(row => {
          const day = row.clicked_at.slice(0, 10); // YYYY-MM-DD
          if (!trendMap[day]) trendMap[day] = { date: day, total: 0, medical: 0, subsidy: 0, daycare: 0, activity: 0 };
          trendMap[day].total++;
          if (row.category && trendMap[day].hasOwnProperty(row.category)) {
            trendMap[day][row.category]++;
          }
        });

        const trend = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));
        return res.status(200).json({ trend });
      }

      // ── 用戶列表（含點擊次數） ───────────────────────────────
      case 'users': {
        // 撈 users 基本資料
        const { data: users, error: uErr } = await supabase
          .from('users')
          .select('id, user_nickname, region, parental_employment, special_status, preferred_categories, created_at')
          .order('created_at', { ascending: false })
          .limit(200);

        if (uErr) throw uErr;

        // 撈各 user 的點擊次數
        const { data: clicks, error: cErr } = await supabase
          .from('policy_click_events')
          .select('user_id');

        if (cErr) throw cErr;

        const clickCount = {};
        (clicks || []).forEach(c => {
          clickCount[c.user_id] = (clickCount[c.user_id] || 0) + 1;
        });

        const enriched = (users || []).map(u => ({
          ...u,
          click_count: clickCount[u.id] || 0,
        }));

        return res.status(200).json({ users: enriched });
      }

      // ── 單一用戶點擊詳情 ─────────────────────────────────────
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

      // ── 論壇貼文活動 ─────────────────────────────────────────
      case 'forum_posts': {
        const { data, error } = await supabase
          .from('forum_posts')
          .select('id, title, category, author_id, created_at, view_count, like_count')
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;
        return res.status(200).json({ posts: data || [] });
      }

      default:
        return res.status(400).json({ error: `Unknown type: ${type}` });
    }
  } catch (err) {
    console.error('[admin-stats] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
