/**
 * POST /api/send-otp
 * Body: { phone: "0912345678" }
 *
 * 支援兩種 SMS 提供商，由環境變數 SMS_PROVIDER 決定：
 *   "twilio"  → 國際通用，需 TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER
 *   "every8d" → 台灣每日簡訊，需 EVERY8D_UID / EVERY8D_PWD
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY   // 使用 service role key（繞過 RLS）
);

// ── 速率限制：同一支手機 60 秒內只能發一次 ──────────────────────────────────
async function checkRateLimit(phone) {
  const { data } = await supabase
    .from('otp_codes')
    .select('created_at')
    .eq('phone', phone)
    .single();

  if (data) {
    const elapsed = (Date.now() - new Date(data.created_at).getTime()) / 1000;
    if (elapsed < 60) return { limited: true, wait: Math.ceil(60 - elapsed) };
  }
  return { limited: false };
}

// ── 產生 6 位數 OTP 並存入 Supabase ──────────────────────────────────────────
async function storeOtp(phone) {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 分鐘

  await supabase
    .from('otp_codes')
    .upsert({ phone, code, expires_at, verified: false, created_at: new Date().toISOString() });

  return code;
}

// ── Twilio 發送 ───────────────────────────────────────────────────────────────
async function sendViaTwilio(phone, code) {
  const twilio = require('twilio');
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const to = `+886${phone.slice(1)}`; // 0912... → +886912...

  await client.messages.create({
    body: `【育兒導航】您的驗證碼為 ${code}，10 分鐘內有效。請勿分享此驗證碼。`,
    from: process.env.TWILIO_PHONE_NUMBER,
    to,
  });
}

// ── 每日簡訊 (Every8D) 發送 ──────────────────────────────────────────────────
async function sendViaEvery8D(phone, code) {
  const https = require('https');
  const querystring = require('querystring');

  const params = querystring.stringify({
    UID:      process.env.EVERY8D_UID,
    PWD:      process.env.EVERY8D_PWD,
    MSG:      `【育兒導航】驗證碼：${code}，10分鐘內有效，請勿分享。`,
    DEST:     `886${phone.slice(1)}`, // 0912... → 886912...
    SENDTIME: '',
    RETRYTIME: '',
  });

  await new Promise((resolve, reject) => {
    const req = https.request(
      `https://api.every8d.com/API21/HTTP/sendSMS.ashx?${params}`,
      { method: 'GET' },
      (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          // 每日簡訊回傳正值代表成功（扣點數）
          const credit = parseFloat(body.split(',')[1]);
          if (isNaN(credit) || credit < 0) reject(new Error(`Every8D error: ${body}`));
          else resolve(body);
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// ── 主處理器 ──────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone } = req.body || {};

  // 驗證格式
  if (!phone || !/^09\d{8}$/.test(phone)) {
    return res.status(400).json({ error: '請輸入有效的台灣手機號碼（格式：09XXXXXXXX）' });
  }

  // 速率限制
  const rate = await checkRateLimit(phone);
  if (rate.limited) {
    return res.status(429).json({ error: `請等待 ${rate.wait} 秒後再重新發送` });
  }

  try {
    // ⚠️ DEMO MODE：固定驗證碼 123456，不發送真實簡訊
    // 正式上線前將 DEMO_MODE 環境變數移除，並設定 SMS_PROVIDER
    const isDemoMode = process.env.DEMO_MODE === 'true' || !process.env.SMS_PROVIDER;

    if (isDemoMode) {
      // Demo 模式：直接把固定碼 123456 存入 Supabase，跳過 SMS
      await supabase
        .from('otp_codes')
        .upsert({ phone, code: '123456', expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), verified: false, created_at: new Date().toISOString() });

      return res.status(200).json({ success: true, message: '【Demo 模式】驗證碼為 123456' });
    }

    const code = await storeOtp(phone);
    const provider = process.env.SMS_PROVIDER;

    if (provider === 'every8d') {
      await sendViaEvery8D(phone, code);
    } else {
      await sendViaTwilio(phone, code);
    }

    return res.status(200).json({ success: true, message: '驗證碼已發送' });
  } catch (err) {
    console.error('[send-otp] SMS error:', err.message);
    return res.status(500).json({ error: '簡訊發送失敗，請稍後再試' });
  }
};
