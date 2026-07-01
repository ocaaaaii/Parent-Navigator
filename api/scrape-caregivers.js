/**
 * POST /api/scrape-caregivers
 * 爬取各平台保母/家教資訊並儲存至 Supabase caregivers 資料表
 *
 * 支援來源：
 *   - PTT BabyMother 板（axios + cheerio）
 *   - Dcard 親子版（unofficial JSON API）
 *   - 1111 保母網（axios + cheerio）
 *
 * ⚠️ Facebook 公開社團：
 *   Meta 禁止 Serverless 環境直接爬取。
 *   解決方案：在 Render / GCP 啟動 Puppeteer 長駐服務，
 *   呼叫後將結果 POST 到此 endpoint 的 /api/scrape-caregivers?source=facebook 即可儲存。
 *   （參見 DEPLOY.md 的 Facebook 爬蟲說明章節）
 *
 * 觸發方式：
 *   - Supabase Cron Job（每日凌晨 3 點）
 *   - 手動 POST /api/scrape-caregivers（需帶 SCRAPER_SECRET header）
 *   Body: { source: 'ptt' | 'dcard' | '1111' | 'facebook', items?: [...] }
 *     - 有帶 items 時直接存入（供外部 Puppeteer 服務使用）
 *     - 無帶 items 時自行爬取
 */

const { createClient } = require('@supabase/supabase-js');
const https = require('https');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── 工具：HTTP GET（不用 axios，Vercel 內建 https 即可）─────────────────────
function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ParentingNavigatorBot/1.0)',
        ...options.headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// ── PTT BabyMother 爬蟲 ────────────────────────────────────────────────────
async function scrapePtt() {
  const items = [];
  try {
    // PTT HTTPS 版，需帶 over18 cookie
    const { body } = await fetchUrl('https://www.ptt.cc/bbs/BabyMother/index.html', {
      headers: { Cookie: 'over18=1' }
    });

    // 解析文章列表（簡易 regex，避免引入 cheerio）
    const entryPattern = /<div class="r-ent">([\s\S]*?)<\/div>\s*<\/div>/g;
    const titlePattern  = /href="(\/bbs\/BabyMother\/[^"]+)">([^<]+)<\/a>/;
    const datePattern   = /class="date">\s*([^<]+)\s*</;

    let match;
    while ((match = entryPattern.exec(body)) !== null) {
      const block   = match[1];
      const titleM  = titlePattern.exec(block);
      const dateM   = datePattern.exec(block);
      if (!titleM) continue;

      const path  = titleM[1];
      const title = titleM[2].trim();
      const date  = dateM ? dateM[1].trim() : '';

      // 只取保母/家教相關文章
      if (!/保母|家教|褓姆|托嬰|找保|徵保|求保/.test(title)) continue;

      items.push({
        source:          'ptt',
        source_id:       path.replace('/bbs/BabyMother/', '').replace('.html', ''),
        source_url:      `https://www.ptt.cc${path}`,
        title,
        description:     null,
        caregiver_type:  title.includes('家教') ? 'tutor' : 'babysitter',
        region:          extractRegion(title),
        posted_at:       parseDate(date),
        tags:            extractTags(title)
      });
    }
  } catch (err) {
    console.error('[scrape-ptt] error:', err.message);
  }
  return items;
}

// ── Dcard 親子版 爬蟲（unofficial API）────────────────────────────────────
async function scrapeDcard() {
  const items = [];
  try {
    const { body } = await fetchUrl(
      'https://www.dcard.tw/_api/forums/parent/posts?popular=false&limit=30',
      { headers: { 'Accept': 'application/json' } }
    );
    const posts = JSON.parse(body);

    for (const post of posts) {
      const title = post.title || '';
      if (!/保母|家教|褓姆|托嬰|找保|徵保/.test(title + (post.excerpt || ''))) continue;

      items.push({
        source:         'dcard',
        source_id:      String(post.id),
        source_url:     `https://www.dcard.tw/f/parent/p/${post.id}`,
        title,
        description:    post.excerpt || null,
        caregiver_type: title.includes('家教') ? 'tutor' : 'babysitter',
        region:         extractRegion(title + ' ' + (post.excerpt || '')),
        posted_at:      post.createdAt || new Date().toISOString(),
        tags:           extractTags(title)
      });
    }
  } catch (err) {
    console.error('[scrape-dcard] error:', err.message);
  }
  return items;
}

// ── 1111 保母網 爬蟲 ───────────────────────────────────────────────────────
async function scrape1111() {
  const items = [];
  try {
    const { body } = await fetchUrl(
      'https://baby.1111.com.tw/media_main.asp?cat=C01',
      { headers: { 'Referer': 'https://baby.1111.com.tw/' } }
    );

    // 解析刊登卡片（1111 為 server-side rendered）
    const cardPattern = /class="info_box">([\s\S]*?)<\/div>\s*<\/div>/g;
    const namePattern = /class="title"[^>]*>([^<]+)/;
    const regionPat   = /class="area"[^>]*>([^<]+)/;
    const pricePat    = /class="salary"[^>]*>([^<]+)/;
    const linkPat     = /href="([^"]+)"[^>]*class="[^"]*title/;

    let m;
    while ((m = cardPattern.exec(body)) !== null) {
      const block  = m[1];
      const nameM  = namePattern.exec(block);
      const regM   = regionPat.exec(block);
      const priceM = pricePat.exec(block);
      const linkM  = linkPat.exec(block);
      if (!nameM) continue;

      const title  = nameM[1].trim();
      const region = regM   ? regM[1].trim().replace(/工作地點[：:]?/, '') : null;
      const price  = priceM ? priceM[1].trim() : null;
      const path   = linkM  ? linkM[1] : null;

      items.push({
        source:         '1111',
        source_id:      path || title,
        source_url:     path ? `https://baby.1111.com.tw${path}` : 'https://baby.1111.com.tw',
        title,
        description:    null,
        caregiver_type: 'babysitter',
        region:         region || extractRegion(title),
        price_range:    price,
        posted_at:      new Date().toISOString(),
        tags:           ['1111保母網']
      });
    }
  } catch (err) {
    console.error('[scrape-1111] error:', err.message);
  }
  return items;
}

// ── 工具函式 ───────────────────────────────────────────────────────────────
const TAIWAN_REGIONS = [
  '台北市','臺北市','新北市','基隆市','桃園市','新竹市','新竹縣',
  '苗栗縣','台中市','臺中市','彰化縣','南投縣','雲林縣','嘉義市',
  '嘉義縣','台南市','臺南市','高雄市','屏東縣','宜蘭縣','花蓮縣',
  '台東縣','臺東縣','澎湖縣','金門縣','連江縣'
];
function extractRegion(text) {
  for (const r of TAIWAN_REGIONS) {
    if (text.includes(r)) return r.replace('臺','台');
  }
  return null;
}
function extractTags(text) {
  const tags = [];
  if (/到府|到宅/.test(text)) tags.push('到府服務');
  if (/英文|英語/.test(text)) tags.push('英語教學');
  if (/數學/.test(text)) tags.push('數學');
  if (/證照|執照/.test(text)) tags.push('持有證照');
  if (/新生兒|月子/.test(text)) tags.push('新生兒');
  if (/夜間|夜班/.test(text)) tags.push('夜間服務');
  return tags;
}
function parseDate(str) {
  if (!str) return new Date().toISOString();
  const year = new Date().getFullYear();
  const parsed = new Date(`${year}/${str.trim()}`);
  return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

// ── 批次 upsert 至 Supabase ────────────────────────────────────────────────
async function upsertItems(items) {
  if (!items.length) return 0;
  const { error, count } = await supabase
    .from('caregivers')
    .upsert(items, {
      onConflict:    'source,source_id',
      ignoreDuplicates: false
    });
  if (error) console.error('[upsert] error:', error);
  return count || items.length;
}

// ── 主 Handler ─────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-scraper-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 安全驗證（防止他人任意觸發爬蟲）
  const secret = req.headers['x-scraper-secret'];
  if (secret !== process.env.SCRAPER_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { source = 'all', items: externalItems } = req.body || {};
  const results = {};

  try {
    // 若外部服務（Puppeteer/Facebook 爬蟲）直接帶 items 進來，直接 upsert
    if (externalItems && Array.isArray(externalItems)) {
      const count = await upsertItems(externalItems.map(i => ({ ...i, source })));
      return res.status(200).json({ source, upserted: count });
    }

    // 自行爬取各平台
    if (source === 'ptt' || source === 'all') {
      const pttItems = await scrapePtt();
      results.ptt = await upsertItems(pttItems);
    }
    if (source === 'dcard' || source === 'all') {
      const dcardItems = await scrapeDcard();
      results.dcard = await upsertItems(dcardItems);
    }
    if (source === '1111' || source === 'all') {
      const items1111 = await scrape1111();
      results['1111'] = await upsertItems(items1111);
    }
    if (source === 'facebook') {
      return res.status(400).json({
        error: 'Facebook 爬蟲需使用外部 Puppeteer 服務，請帶 items 參數傳入資料。'
      });
    }

    return res.status(200).json({ success: true, results });

  } catch (err) {
    console.error('[scrape-caregivers] unexpected error:', err);
    return res.status(500).json({ error: '爬蟲失敗，請稍後再試' });
  }
};
