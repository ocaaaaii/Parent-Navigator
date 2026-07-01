/**
 * POST /api/login
 * Body: { phone: "0912345678", password: "MyPass1234" }
 * 回傳: { success: true, token: "<jwt>", user: {...} }
 */

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// 防暴力破解：記錄連續失敗次數（存 Supabase，也可改用 Vercel KV）
async function checkLoginAttempts(phone) {
  const { data } = await supabase
    .from('login_attempts')
    .select('count, blocked_until')
    .eq('phone', phone)
    .single();

  if (!data) return { blocked: false };
  if (data.blocked_until && new Date() < new Date(data.blocked_until)) {
    const mins = Math.ceil((new Date(data.blocked_until) - Date.now()) / 60000);
    return { blocked: true, mins };
  }
  return { blocked: false, count: data.count };
}

async function recordFailedAttempt(phone) {
  const { data } = await supabase
    .from('login_attempts')
    .select('count')
    .eq('phone', phone)
    .single();

  const count = (data?.count || 0) + 1;
  const blocked_until = count >= 5
    ? new Date(Date.now() + 15 * 60 * 1000).toISOString() // 封鎖 15 分鐘
    : null;

  await supabase
    .from('login_attempts')
    .upsert({ phone, count, blocked_until, updated_at: new Date().toISOString() });
}

async function clearLoginAttempts(phone) {
  await supabase.from('login_attempts').delete().eq('phone', phone);
}

// ── 主處理器 ──────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone, password } = req.body || {};

  if (!phone || !password) {
    return res.status(400).json({ error: '請輸入手機號碼與密碼' });
  }
  if (!/^09\d{8}$/.test(phone)) {
    return res.status(400).json({ error: '手機號碼格式不正確' });
  }

  // 檢查是否被封鎖
  const attempt = await checkLoginAttempts(phone);
  if (attempt.blocked) {
    return res.status(429).json({ error: `登入嘗試次數過多，請 ${attempt.mins} 分鐘後再試` });
  }

  // 查詢使用者
  const { data: user, error } = await supabase
    .from('users')
    .select('id, phone, password_hash, user_nickname, baby_name, baby_birthday_or_due_date, region, interests, onboarding_state')
    .eq('phone', phone)
    .single();

  if (error || !user) {
    await recordFailedAttempt(phone);
    return res.status(401).json({ error: '手機號碼或密碼錯誤' });
  }

  // 比對密碼
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    await recordFailedAttempt(phone);
    const remaining = 5 - ((attempt.count || 0) + 1);
    return res.status(401).json({
      error: remaining > 0
        ? `手機號碼或密碼錯誤（還可嘗試 ${remaining} 次）`
        : '手機號碼或密碼錯誤'
    });
  }

  // 登入成功，清除失敗記錄
  await clearLoginAttempts(phone);

  // 簽發 JWT（7 天）
  const token = jwt.sign(
    { userId: user.id, phone: user.phone, purpose: 'auth' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return res.status(200).json({
    success: true,
    token,
    user: {
      id:               user.id,
      name:             user.user_nickname,
      phone:            user.phone,
      baby:             user.baby_name,
      babyBirthday:     user.baby_birthday_or_due_date,
      region:           user.region,
      interests:        user.interests,
      onboarding_state: user.onboarding_state,
    }
  });
};
