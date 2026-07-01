/**
 * POST /api/chat
 * Body: { message, session_id?, city?, history? }
 *
 * 作為前端到 AnythingLLM 的 Proxy，讓 API Key 不暴露在瀏覽器端。
 * 所需環境變數：
 *   ANYTHINGLLM_ENDPOINT  — 完整 chat endpoint，例如：
 *     https://xxxx.trycloudflare.com/api/v1/workspace/my-workspace/chat
 *   ANYTHINGLLM_API_KEY   — Bearer token
 */

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { message, session_id, city } = req.body || {};
  if (!message?.trim()) return res.status(400).json({ error: '請提供問題內容' });

  const endpoint = process.env.ANYTHINGLLM_ENDPOINT;
  const apiKey   = process.env.ANYTHINGLLM_API_KEY;

  // 若環境變數未設定，直接回 503，前端 catch 後會走 demoReply()
  if (!endpoint || !apiKey) {
    return res.status(503).json({ error: 'AI 服務未設定，請聯繫管理員' });
  }

  try {
    // 將縣市資訊附加到問題開頭，讓 RAG 可依縣市篩選知識庫
    const prompt = city ? `[使用者縣市：${city}]\n\n${message}` : message;

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        message:   prompt,
        mode:      'chat',
        sessionId: session_id || 'web-default',
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      console.error('[chat] upstream error:', upstream.status, errText);
      return res.status(502).json({ error: `AnythingLLM 回應異常 (${upstream.status})` });
    }

    const data  = await upstream.json();
    // AnythingLLM 回傳欄位：textResponse（v1.x 標準）
    const reply = data.textResponse || data.text || data.response || '（無回覆）';
    const sources = (data.sources || []).map(s => ({
      title: s.title   || s.metadata?.title || '',
      url:   s.url     || s.metadata?.url   || '',
      chunk: s.chunk   || '',
    }));

    return res.status(200).json({ reply, sources });

  } catch (err) {
    console.error('[chat] error:', err.message);
    return res.status(500).json({ error: '無法連接 AI 服務' });
  }
};
