/**
 * POST /api/verify-otp
 * Body: { phone: "0912345678", code: "123456" }
 * 回傳: { success: true, token: "<short-lived-jwt>" }
 *
 * 驗證成功後回傳一個短效 JWT（5 分鐘），前端拿此 token 才能呼叫 /api/register。
 * 這樣即使前端被跳過，沒有 token 也無法直接呼叫 register。
 */

const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone, code } = req.body || {};

  if (!phone || !code) {
    return res.status(400).json({ error: '缺少必要參數' });
  }

  // 從 Supabase 取出 OTP 記錄
  const { data, error } = await supabase
    .from('otp_codes')
    .select('code, expires_at, verified')
    .eq('phone', phone)
    .single();

  if (error || !data) {
    return res.status(400).json({ error: '找不到驗證記錄，請重新發送驗證碼' });
  }

  // 已使用過
  if (data.verified) {
    return res.status(400).json({ error: '驗證碼已使用，請重新發送' });
  }

  // 逾時
  if (new Date() > new Date(data.expires_at)) {
    return res.status(400).json({ error: '驗證碼已逾時，請重新發送' });
  }

  // 比對
  if (data.code !== code.trim()) {
    return res.status(400).json({ error: '驗證碼錯誤，請重新輸入' });
  }

  // 標記為已使用
  await supabase
    .from('otp_codes')
    .update({ verified: true })
    .eq('phone', phone);

  // 簽發短效 JWT（5 分鐘），只供後續 register 步驟使用
  const token = jwt.sign(
    { phone, purpose: 'phone_verified' },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );

  return res.status(200).json({ success: true, token });
};
