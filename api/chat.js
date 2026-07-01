/**
 * POST /api/chat
 * Body: { message, session_id?, city? }
 *
 * Proxy → AnythingLLM workspace chat API
 * 支援的環境變數（擇一即可）：
 *   ANYTHINGLLM_ENDPOINT  — 完整 URL（優先使用）
 *   ANYTHINGLLM_BASE_URL  — 若 ENDPOINT 未設定，用此值當 endpoint
 * API Key：ANYTHINGLLM_API_KEY
 */

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { message, session_id, city, history = [] } = req.body || {};
  if (!message?.trim()) return res.status(400).json({ error: '請提供問題內容' });

  // 支援兩種 env var 命名
  const endpoint = process.env.ANYTHINGLLM_ENDPOINT || process.env.ANYTHINGLLM_BASE_URL;
  const apiKey   = process.env.ANYTHINGLLM_API_KEY;

  if (!endpoint || !apiKey) {
    console.error('[chat] env vars missing. ENDPOINT:', !!endpoint, 'KEY:', !!apiKey);
    return res.status(503).json({ error: 'AI 服務未設定' });
  }

  // 正確的 AnythingLLM workspace chat endpoint
  // 若 env var 只有 base URL（如 https://xxx.com），自動補上路徑
  let chatUrl = endpoint;
  if (!chatUrl.includes('/workspace/') && !chatUrl.endsWith('/chat')) {
    chatUrl = `${chatUrl.replace(/\/$/, '')}/api/v1/workspace/my-workspace/chat`;
  }

  // 將前端送來的對話歷史組成 context，讓 LLM 記得上下文
  const historyLines = history
    .slice(-8) // 最近 4 輪對話（user + assistant 各一條）
    .map(h => h.role === 'user' ? `使用者：${h.content}` : `育兒小幫手：${h.content}`)
    .join('\n');

  const parts = [];
  if (city) parts.push(`[使用者縣市：${city}]`);
  if (historyLines) parts.push(`[對話記錄]\n${historyLines}\n[/對話記錄]`);
  parts.push(`使用者：${message}`);
  const prompt = parts.join('\n\n');

  try {
    const upstream = await fetch(chatUrl, {
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

    const rawText = await upstream.text();
    console.log('[chat] upstream status:', upstream.status);
    console.log('[chat] upstream body:', rawText.slice(0, 500));

    if (!upstream.ok) {
      return res.status(502).json({ error: `AnythingLLM 回應異常 (${upstream.status})`, detail: rawText.slice(0, 200) });
    }

    let data = {};
    try { data = JSON.parse(rawText); } catch(e) {
      return res.status(502).json({ error: 'AnythingLLM 回傳非 JSON', raw: rawText.slice(0, 200) });
    }

    // AnythingLLM v1.x 標準欄位：textResponse
    // 部分版本可能用 text、response、answer
    const reply = data.textResponse || data.text || data.response || data.answer || null;

    if (!reply) {
      // 把完整回傳印出來幫助 debug
      console.error('[chat] empty reply. Full data keys:', Object.keys(data));
      console.error('[chat] data.type:', data.type, 'data.error:', data.error);
      return res.status(200).json({
        reply: data.error || '（AI 暫無回覆，請確認 AnythingLLM workspace 已設定正確的 LLM 模型）',
        sources: []
      });
    }

    const sources = (data.sources || []).map(s => ({
      title: s.title || s.metadata?.title || '',
      url:   s.url   || s.metadata?.url   || '',
    }));

    return res.status(200).json({ reply, sources });

  } catch (err) {
    console.error('[chat] fetch error:', err.message);
    return res.status(500).json({ error: '無法連接 AnythingLLM：' + err.message });
  }
};
