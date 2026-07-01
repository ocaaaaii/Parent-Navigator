/**
 * POST /api/reset-password
 * Header: Authorization: Bearer <phone_verified_token>  (purpose: 'phone_verified', 5 分鐘有效)
 * Body:   { password }
 *
 * 重設密碼：驗證 OTP token 後以新密碼 bcrypt hash 覆蓋原密碼
 */

const { createClient } = require('@supabase/supabase-js');
const bcrypt           = require('bcryptjs');
const jwt              = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin',  process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: '不支援此 HTTP 方法' });
  }

  try {
    // ── 1. 驗證 Authorization header ──────────────────────────────────────────
    const authHeader = req.headers['authorization'] || '';
    const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: '缺少驗證 Token，請先完成簡訊驗證' });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Token 無效或已過期，請重新發送驗證碼' });
    }

    if (payload.purpose !== 'phone_verified') {
      return res.status(401).json({ error: 'Token 用途不符' });
    }

    const phone = payload.phone;

    // ── 2. 驗證新密碼 ──────────────────────────────────────────────────────────
    const { password } = req.body || {};

    if (!password || password.length < 8) {
      return res.status(400).json({ error: '密碼至少 8 個字元' });
    }
    if (!/(?=.*[a-zA-Z])(?=.*\d)/.test(password)) {
      return res.status(400).json({ error: '密碼需包含英文字母與數字' });
    }

    // ── 3. 確認帳號存在 ────────────────────────────────────────────────────────
    const { data: user, error: fetchErr } = await supabase
      .from('users')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();

    if (fetchErr || !user) {
      return res.status(404).json({ error: '查無此帳號，請先完成註冊' });
    }

    // ── 4. Hash 新密碼並更新 ───────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash(password, 12);

    const { error: updateErr } = await supabase
      .from('users')
      .update({ password_hash: passwordHash })
      .eq('id', user.id);

    if (updateErr) {
      console.error('[reset-password] update error:', updateErr);
      return res.status(500).json({ error: '密碼更新失敗，請稍後再試' });
    }

    // ── 5. 清除該手機的登入失敗記錄（解鎖帳號）────────────────────────────────
    await supabase
      .from('login_attempts')
      .delete()
      .eq('phone', phone);

    return res.status(200).json({ message: '密碼已重設成功，請使用新密碼登入' });

  } catch (err) {
    console.error('[reset-password] unexpected error:', err);
    return res.status(500).json({ error: '伺服器錯誤，請稍後再試' });
  }
};
