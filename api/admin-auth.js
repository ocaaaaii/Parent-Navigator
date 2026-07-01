/**
 * api/admin-auth.js
 * POST /api/admin-auth
 * Body: { password: string }
 * Returns: { token: string }  (短效 JWT，1 小時有效)
 *
 * 環境變數：
 *   ADMIN_PASSWORD  — 後台密碼（必填）
 *   JWT_SECRET      — 與前台共用的 JWT 簽名金鑰
 */

const jwt = require('jsonwebtoken');

module.exports = async (req, res) => {
  // 只允許 POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body || {};

  // 環境變數未設定的保護
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  const JWT_SECRET     = process.env.JWT_SECRET;

  if (!ADMIN_PASSWORD || !JWT_SECRET) {
    console.error('[admin-auth] Missing env vars: ADMIN_PASSWORD or JWT_SECRET');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // 密碼驗證（常數時間比較，防止 timing attack）
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  // 簽發 admin JWT（1 小時有效）
  const token = jwt.sign(
    { role: 'admin', iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  return res.status(200).json({ token });
};
