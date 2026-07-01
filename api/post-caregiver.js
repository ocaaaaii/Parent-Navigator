/**
 * POST /api/post-caregiver
 * 保母/家教自行刊登（591 同款做法）
 *
 * Body: {
 *   title, description, caregiver_type,
 *   region, district, price_range,
 *   contact, image_url, tags[], expires_days
 * }
 *
 * 可選：Header Authorization: Bearer <pn_token>（登入用戶自動帶入 user_id）
 */

const { createClient } = require('@supabase/supabase-js');
const jwt              = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const VALID_TYPES = ['babysitter', 'tutor', 'nanny', 'other'];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '不支援此 HTTP 方法' });

  try {
    const {
      title, description, caregiver_type = 'babysitter',
      region, district, price_range,
      contact, image_url,
      tags = [],
      expires_days = 30
    } = req.body || {};

    // ── 必填欄位驗證 ────────────────────────────────────────────────────────
    if (!title || title.trim().length < 2) {
      return res.status(400).json({ error: '請填寫標題（至少 2 字）' });
    }
    if (!VALID_TYPES.includes(caregiver_type)) {
      return res.status(400).json({ error: '刊登類型不符' });
    }
    if (!region) {
      return res.status(400).json({ error: '請選擇服務縣市' });
    }
    if (!contact) {
      return res.status(400).json({ error: '請填寫聯絡方式' });
    }

    // ── 若有帶 JWT，解析 user_id（非必填）──────────────────────────────────
    let posterUserId = null;
    const authHeader = req.headers['authorization'] || '';
    const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (payload.purpose === 'auth') posterUserId = payload.userId;
      } catch { /* 無效 token 就跳過，允許匿名刊登 */ }
    }

    // ── 計算下架時間 ────────────────────────────────────────────────────────
    const days = Math.min(90, Math.max(7, parseInt(expires_days) || 30));
    const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

    // ── 寫入 Supabase ───────────────────────────────────────────────────────
    const { data, error } = await supabase
      .from('caregivers')
      .insert({
        source:          'self',
        source_url:      null,
        title:           title.trim(),
        description:     description ? description.trim() : null,
        caregiver_type,
        region,
        district:        district || null,
        price_range:     price_range || null,
        contact,
        image_url:       image_url || null,
        tags:            Array.isArray(tags) ? tags.slice(0, 10) : [],
        poster_user_id:  posterUserId,
        is_verified:     false,   // 需管理員審核
        is_active:       true,
        posted_at:       new Date().toISOString(),
        expires_at:      expiresAt
      })
      .select('id, title, region, expires_at')
      .single();

    if (error) {
      console.error('[post-caregiver] insert error:', error);
      return res.status(500).json({ error: '刊登失敗，請稍後再試' });
    }

    return res.status(201).json({
      message: '刊登成功！審核通過後將顯示於平台。',
      caregiver: data
    });

  } catch (err) {
    console.error('[post-caregiver] unexpected error:', err);
    return res.status(500).json({ error: '伺服器錯誤，請稍後再試' });
  }
};
