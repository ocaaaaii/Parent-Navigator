/**
 * POST /api/register
 * Body: {
 *   // users 表
 *   name, phone, password, region,
 *   parental_employment,           // both_working / single_working / not_working
 *   special_status,                // 逗號分隔家庭特殊身分
 *   preferred_categories,          // ["medical","subsidy","daycare","activity"]
 *   // children 表
 *   baby_name, birth_date, gender,
 *   birth_order,                   // 1~4（4代表4胎以上）
 *   child_special_status,          // 逗號分隔孩子特殊身分
 * }
 * 回傳: { success: true, token: "<jwt>", user: {...} }
 */

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');

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

  // ── 解構請求 body ─────────────────────────────────────────────────────────
  const {
    // users
    name, phone, password, region,
    parental_employment  = null,
    special_status       = null,   // 家庭特殊身分（逗號分隔）
    preferred_categories = [],
    // children
    baby_name            = null,
    birth_date,
    gender               = null,
    birth_order          = 1,
    child_special_status = null,   // 孩子特殊身分（逗號分隔）
  } = req.body || {};

  // ── 基本驗證 ─────────────────────────────────────────────────────────────
  if (!name || !phone || !password) {
    return res.status(400).json({ error: '缺少必填欄位：姓名、手機、密碼' });
  }
  if (!/(?=.*[a-zA-Z])(?=.*\d).{8,}/.test(password)) {
    return res.status(400).json({ error: '密碼至少 8 位，需包含英文與數字' });
  }
  if (!birth_date) {
    return res.status(400).json({ error: '缺少寶寶出生日期' });
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

  // ── 寫入 users 表 ────────────────────────────────────────────────────────
  const { data: user, error: userErr } = await supabase
    .from('users')
    .insert({
      phone,
      password_hash,
      user_nickname:        name,
      region:               region || null,
      parental_employment:  parental_employment || null,
      special_status:       special_status || null,
      preferred_categories: preferred_categories,   // JSONB
      onboarding_state:     'completed',
      line_user_id:         null,
      created_at:           new Date().toISOString(),
    })
    .select('id, phone, user_nickname, region, preferred_categories')
    .single();

  if (userErr) {
    console.error('[register] users insert error:', userErr.message);
    return res.status(500).json({ error: '帳號建立失敗：' + userErr.message });
  }

  // ── 寫入 children 表 ─────────────────────────────────────────────────────
  const { error: childErr } = await supabase
    .from('children')
    .insert({
      user_id:        user.id,
      name:           baby_name || null,
      birth_date:     birth_date,
      gender:         gender && gender !== 'unknown' ? gender : null,
      birth_order:    Math.min(Math.max(parseInt(birth_order) || 1, 1), 9),
      special_status: child_special_status || null,
      is_active:      true,
    });

  if (childErr) {
    console.error('[register] children insert error:', childErr.message);
    // users 已寫入；children 失敗不回滾，但回報警告
    // （可後續由使用者重新填寫）
    return res.status(207).json({
      success: true,
      warning: '帳號建立成功，但孩子資料寫入失敗：' + childErr.message,
      token:   jwt.sign(
        { userId: user.id, phone: user.phone, purpose: 'auth' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      ),
    });
  }

  // ── 簽發 JWT（7 天）─────────────────────────────────────────────────────
  const token = jwt.sign(
    { userId: user.id, phone: user.phone, purpose: 'auth' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return res.status(201).json({
    success: true,
    token,
    user: {
      id:                  user.id,
      name:                user.user_nickname,
      phone:               user.phone,
      baby_name:           baby_name,
      region:              user.region,
      preferred_categories: user.preferred_categories,
    },
  });
};
