/**
 * POST /api/register
 * Header: Authorization: Bearer <phone_verified_token>
 * Body: {
 *   name, phone, password,
 *   baby_name, baby_birthday_or_due_date, baby_gender,
 *   region,
 *   interests: ["newborn","subsidy", ...]  // 按偏好順序排列
 * }
 * 回傳: { success: true, token: "<long-lived-jwt>", user: {...} }
 */

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── 驗證 phone_verified token ─────────────────────────────────────────────
  const authHeader = req.headers.authorization || '';
  const phoneToken = authHeader.replace('Bearer ', '').trim();

  if (!phoneToken) {
    return res.status(401).json({ error: '缺少手機驗證憑證，請先完成簡訊驗證' });
  }

  let verified;
  try {
    verified = jwt.verify(phoneToken, process.env.JWT_SECRET);
    if (verified.purpose !== 'phone_verified') throw new Error('invalid purpose');
  } catch {
    return res.status(401).json({ error: '手機驗證憑證無效或已逾時，請重新驗證' });
  }

  const {
    name, phone, password,
    baby_name, baby_birthday_or_due_date, baby_gender,
    region, interests = []
  } = req.body || {};

  // ── 基本驗證 ─────────────────────────────────────────────────────────────
  if (!name || !phone || !password) {
    return res.status(400).json({ error: '缺少必填欄位：姓名、手機、密碼' });
  }
  if (phone !== verified.phone) {
    return res.status(400).json({ error: '手機號碼與驗證不符' });
  }
  if (!/(?=.*[a-zA-Z])(?=.*\d).{8,}/.test(password)) {
    return res.status(400).json({ error: '密碼至少 8 位，需包含英文與數字' });
  }

  // ── 檢查手機是否已註冊 ───────────────────────────────────────────────────
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('phone', phone)
    .single();

  if (existing) {
    return res.status(409).json({ error: '此手機號碼已經註冊過了，請直接登入' });
  }

  // ── 雜湊密碼 ─────────────────────────────────────────────────────────────
  const password_hash = await bcrypt.hash(password, 12);

  // ── 寫入 Supabase users 表 ───────────────────────────────────────────────
  const { data: user, error: insertError } = await supabase
    .from('users')
    .insert({
      phone,
      password_hash,
      user_nickname: name,        // 家長姓名存為 user_nickname
      baby_name,
      baby_birthday_or_due_date,
      baby_gender: baby_gender || 'unknown',
      region,
      interests: JSON.stringify(interests), // JSONB 欄位
      onboarding_state: 'completed',
      line_user_id: null,         // LINE Bot 連結後再填
      created_at: new Date().toISOString(),
    })
    .select('id, phone, user_nickname, baby_name, baby_birthday_or_due_date, region, interests')
    .single();

  if (insertError) {
    console.error('[register] Supabase insert error:', insertError.message);
    return res.status(500).json({ error: '帳號建立失敗，請稍後再試' });
  }

  // ── 簽發長效 JWT（7 天）供後續登入使用 ───────────────────────────────────
  const token = jwt.sign(
    { userId: user.id, phone: user.phone, purpose: 'auth' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return res.status(201).json({
    success: true,
    token,
    user: {
      id:       user.id,
      name:     user.user_nickname,
      phone:    user.phone,
      baby:     user.baby_name,
      region:   user.region,
      interests: user.interests,
    }
  });
};
