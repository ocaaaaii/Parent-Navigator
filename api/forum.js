/**
 * api/forum.js — 論壇 CRUD API
 *
 * GET  /api/forum?type=posts[&category=subsidy]     → 貼文列表
 * GET  /api/forum?type=post&id=UUID                 → 單篇 + 留言
 * GET  /api/forum?type=my_posts&user_id=UUID        → 我的貼文
 * GET  /api/forum?type=my_likes&user_id=UUID        → 我按讚的貼文
 * GET  /api/forum?type=my_comments&user_id=UUID     → 我的留言
 * POST /api/forum {action:'post', title, content, category}   Bearer auth
 * POST /api/forum {action:'comment', post_id, content}        Bearer auth
 * POST /api/forum {action:'like', post_id}                    Bearer auth (toggle)
 */

const jwt = require('jsonwebtoken');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET   = process.env.JWT_SECRET;

const HEADERS = {
  'Content-Type':  'application/json',
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'apikey':        SERVICE_KEY,
};

// ── Supabase REST helpers ─────────────────────────────────────────────────────

async function dbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: HEADERS });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`DB GET failed (${r.status}): ${err}`);
  }
  return r.json();
}

async function dbPost(table, data) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...HEADERS, 'Prefer': 'return=representation' },
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`DB POST failed (${r.status}): ${err}`);
  }
  return r.json();
}

async function dbDelete(table, query) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers: HEADERS,
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`DB DELETE failed (${r.status}): ${err}`);
  }
  return r.status;
}

async function dbPatch(table, query, data) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: { ...HEADERS, 'Prefer': 'return=minimal' },
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`DB PATCH failed (${r.status}): ${err}`);
  }
}

// ── JWT auth helper ───────────────────────────────────────────────────────────

function getUserFromAuth(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// ── 取得用戶暱稱（batch lookup）───────────────────────────────────────────────

async function enrichUserNames(rows, idField = 'user_id') {
  const ids = [...new Set(rows.map(r => r[idField]).filter(Boolean))];
  if (!ids.length) return rows;

  // PostgREST or() 語法：id.eq.uuid（點號分隔，不是等號）
  const query = ids.map(id => `id.eq.${id}`).join(',');
  const users = await dbGet(`users?or=(${query})&select=id,user_nickname`);
  const map = {};
  users.forEach(u => { map[u.id] = u.user_nickname || '育兒朋友'; });

  return rows.map(r => ({ ...r, user_name: map[r[idField]] || '育兒朋友' }));
}

// ── Main handler ──────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ── GET ──────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { type, id, category, user_id, page = '1' } = req.query;
      const limit  = 20;
      const offset = (parseInt(page, 10) - 1) * limit;

      // 貼文列表
      if (type === 'posts') {
        let qs = `forum_posts?select=id,title,content,category,likes,views,created_at,user_id&order=created_at.desc&limit=${limit}&offset=${offset}`;
        if (category && category !== 'all') qs += `&category=eq.${category}`;

        const posts = await dbGet(qs);
        const enriched = await enrichUserNames(posts);
        return res.json({ ok: true, posts: enriched });
      }

      // 單篇貼文 + 留言
      if (type === 'post' && id) {
        // 增加 views
        await dbPatch('forum_posts', `id=eq.${id}`, { views: { increment: 1 } })
          .catch(() => {}); // views increment 可能需要 RPC，失敗不影響

        const [postArr, comments] = await Promise.all([
          dbGet(`forum_posts?id=eq.${id}&select=*`),
          dbGet(`forum_comments?post_id=eq.${id}&select=*&order=created_at.asc`),
        ]);
        if (!postArr.length) return res.status(404).json({ ok: false, error: '貼文不存在' });

        const [postEnriched, commentsEnriched] = await Promise.all([
          enrichUserNames(postArr),
          enrichUserNames(comments),
        ]);
        return res.json({ ok: true, post: postEnriched[0], comments: commentsEnriched });
      }

      // 我的貼文
      if (type === 'my_posts' && user_id) {
        const posts = await dbGet(`forum_posts?user_id=eq.${user_id}&select=id,title,category,likes,views,created_at&order=created_at.desc&limit=50`);
        return res.json({ ok: true, posts });
      }

      // 我按讚的貼文
      if (type === 'my_likes' && user_id) {
        const likes = await dbGet(`forum_post_likes?user_id=eq.${user_id}&select=post_id,created_at&order=created_at.desc&limit=50`);
        if (!likes.length) return res.json({ ok: true, posts: [] });

        const postIds = likes.map(l => `id.eq.${l.post_id}`).join(',');
        const posts   = await dbGet(`forum_posts?or=(${postIds})&select=id,title,category,likes,views,created_at&order=created_at.desc`);
        return res.json({ ok: true, posts });
      }

      // 我的留言
      if (type === 'my_comments' && user_id) {
        const comments = await dbGet(`forum_comments?user_id=eq.${user_id}&select=id,post_id,content,likes,created_at&order=created_at.desc&limit=50`);
        // 也把 post title 補進來
        if (comments.length) {
          const postIds = [...new Set(comments.map(c => c.post_id))];
          const qs = postIds.map(pid => `id.eq.${pid}`).join(',');
          const posts = await dbGet(`forum_posts?or=(${qs})&select=id,title`);
          const titleMap = {};
          posts.forEach(p => { titleMap[p.id] = p.title; });
          return res.json({ ok: true, comments: comments.map(c => ({ ...c, post_title: titleMap[c.post_id] || '貼文' })) });
        }
        return res.json({ ok: true, comments });
      }

      return res.status(400).json({ ok: false, error: '無效的 type 參數' });
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const user = getUserFromAuth(req);
      if (!user) return res.status(401).json({ ok: false, error: '請先登入' });

      const { action, title, content, category, post_id } = req.body || {};

      // 發表貼文
      if (action === 'post') {
        if (!title?.trim() || !content?.trim()) {
          return res.status(400).json({ ok: false, error: '標題和內容不能為空' });
        }
        const result = await dbPost('forum_posts', {
          user_id:  user.userId,
          title:    title.trim(),
          content:  content.trim(),
          category: category || 'general',
          likes:    0,
          views:    0,
        });
        return res.json({ ok: true, post: result[0] || result });
      }

      // 發表留言
      if (action === 'comment') {
        if (!post_id || !content?.trim()) {
          return res.status(400).json({ ok: false, error: '缺少 post_id 或內容' });
        }
        const result = await dbPost('forum_comments', {
          post_id,
          user_id: user.userId,
          content: content.trim(),
          likes:   0,
        });
        return res.json({ ok: true, comment: result[0] || result });
      }

      // 按讚 / 收回讚（toggle）
      if (action === 'like') {
        if (!post_id) return res.status(400).json({ ok: false, error: '缺少 post_id' });

        const existing = await dbGet(`forum_post_likes?user_id=eq.${user.userId}&post_id=eq.${post_id}&select=id`);

        if (existing.length > 0) {
          // 收回讚
          await dbDelete('forum_post_likes', `user_id=eq.${user.userId}&post_id=eq.${post_id}`);
          // 更新讚數
          const postArr = await dbGet(`forum_posts?id=eq.${post_id}&select=likes`);
          const currentLikes = postArr[0]?.likes || 1;
          await dbPatch('forum_posts', `id=eq.${post_id}`, { likes: Math.max(0, currentLikes - 1) });
          return res.json({ ok: true, liked: false });
        } else {
          // 按讚
          await dbPost('forum_post_likes', { user_id: user.userId, post_id });
          // 更新讚數
          const postArr = await dbGet(`forum_posts?id=eq.${post_id}&select=likes`);
          const currentLikes = postArr[0]?.likes || 0;
          await dbPatch('forum_posts', `id=eq.${post_id}`, { likes: currentLikes + 1 });
          return res.json({ ok: true, liked: true });
        }
      }

      return res.status(400).json({ ok: false, error: '無效的 action' });
    }

    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  } catch (err) {
    console.error('[forum] error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
