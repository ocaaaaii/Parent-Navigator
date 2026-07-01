/**
 * api/caregivers.js — 保母/家教 API（合併三支）
 *
 * GET  /api/caregivers?region=&type=&keyword=&page=&limit=  → 查詢列表
 * POST /api/caregivers                                       → 自行刊登
 * POST /api/caregivers  (header: x-scraper-secret)          → 觸發爬蟲
 */

const { createClient } = require('@supabase/supabase-js');
const jwt              = require('jsonwebtoken');
const https            = require('https');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ════════════════════════════════════════════════════════════
// 工具
// ════════════════════════════════════════════════════════════
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

const TAIWAN_REGIONS = [
  '台北市','臺北市','新北市','基隆市','桃園市','新竹市','新竹縣',
  '苗栗縣','台中市','臺中市','彰化縣','南投縣','雲林縣','嘉義市',
  '嘉義縣','台南市','臺南市','高雄市','屏東縣','宜蘭縣','花蓮縣',
  '台東縣','臺東縣','澎湖縣','金門縣','連江縣'
];
function extractRegion(text) {
  for (const r of TAIWAN_REGIONS) {
    if (text.includes(r)) return r.replace('臺', '台');
  }
  return null;
}
function extractTags(text) {
  const tags = [];
  if (/到府|到宅/.test(text)) tags.push('到府服務');
  if (/英文|英語/.test(text)) tags.push('英語教學');
  if (/數學/.test(text))      tags.push('數學');
  if (/證照|執照/.test(text)) tags.push('持有證照');
  if (/新生兒|月子/.test(text)) tags.push('新生兒');
  if (/夜間|夜班/.test(text)) tags.push('夜間服務');
  return tags;
}
function parseDate(str) {
  if (!str) return new Date().toISOString();
  const parsed = new Date(`${new Date().getFullYear()}/${str.trim()}`);
  return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}
async function upsertItems(items) {
  if (!items.length) return 0;
  const { error, count } = await supabase
    .from('caregivers')
    .upsert(items, { onConflict: 'source,source_id', ignoreDuplicates: false });
  if (error) console.error('[upsert] error:', error);
  return count || items.length;
}

// ════════════════════════════════════════════════════════════
// 爬蟲
// ════════════════════════════════════════════════════════════
async function scrapePtt() {
  const items = [];
  try {
    const { body } = await fetchUrl('https://www.ptt.cc/bbs/BabyMother/index.html', {
      headers: { Cookie: 'over18=1' }
    });
    const entryPattern = /<div class="r-ent">([\s\S]*?)<\/div>\s*<\/div>/g;
    const titlePattern  = /href="(\/bbs\/BabyMother\/[^"]+)">([^<]+)<\/a>/;
    const datePattern   = /class="date">\s*([^<]+)\s*</;
    let match;
    while ((match = entryPattern.exec(body)) !== null) {
      const block = match[1];
      const titleM = titlePattern.exec(block);
      const dateM  = datePattern.exec(block);
      if (!titleM) continue;
      const path  = titleM[1];
      const title = titleM[2].trim();
      if (!/保母|家教|褓姆|托嬰|找保|徵保|求保/.test(title)) continue;
      items.push({
        source:         'ptt',
        source_id:      path.replace('/bbs/BabyMother/', '').replace('.html', ''),
        source_url:     `https://www.ptt.cc${path}`,
        title,
        description:    null,
        caregiver_type: title.includes('家教') ? 'tutor' : 'babysitter',
        region:         extractRegion(title),
        posted_at:      parseDate(dateM ? dateM[1].trim() : ''),
        tags:           extractTags(title)
      });
    }
  } catch (err) { console.error('[scrape-ptt]', err.message); }
  return items;
}

async function scrapeDcard() {
  const items = [];
  try {
    const { body } = await fetchUrl(
      'https://www.dcard.tw/_api/forums/parent/posts?popular=false&limit=30',
      { headers: { Accept: 'application/json' } }
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
  } catch (err) { console.error('[scrape-dcard]', err.message); }
  return items;
}

async function scrape1111() {
  const items = [];
  try {
    const { body } = await fetchUrl('https://baby.1111.com.tw/media_main.asp?cat=C01', {
      headers: { Referer: 'https://baby.1111.com.tw/' }
    });
    const cardPattern = /class="info_box">([\s\S]*?)<\/div>\s*<\/div>/g;
    const namePattern = /class="title"[^>]*>([^<]+)/;
    const regionPat   = /class="area"[^>]*>([^<]+)/;
    const pricePat    = /class="salary"[^>]*>([^<]+)/;
    const linkPat     = /href="([^"]+)"[^>]*class="[^"]*title/;
    let m;
    while ((m = cardPattern.exec(body)) !== null) {
      const block = m[1];
      const nameM  = namePattern.exec(block);
      if (!nameM) continue;
      const title   = nameM[1].trim();
      const regM    = regionPat.exec(block);
      const priceM  = pricePat.exec(block);
      const linkM   = linkPat.exec(block);
      items.push({
        source:         '1111',
        source_id:      (linkM ? linkM[1] : null) || title,
        source_url:     linkM ? `https://baby.1111.com.tw${linkM[1]}` : 'https://baby.1111.com.tw',
        title,
        description:    null,
        caregiver_type: 'babysitter',
        region:         regM ? regM[1].trim().replace(/工作地點[：:]?/, '') : extractRegion(title),
        price_range:    priceM ? priceM[1].trim() : null,
        posted_at:      new Date().toISOString(),
        tags:           ['1111保母網']
      });
    }
  } catch (err) { console.error('[scrape-1111]', err.message); }
  return items;
}

// ════════════════════════════════════════════════════════════
// Main Handler
// ════════════════════════════════════════════════════════════
const VALID_TYPES = ['babysitter', 'tutor', 'nanny', 'other'];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-scraper-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET：查詢列表 ─────────────────────────────────────────
  if (req.method === 'GET') {
    const { region, type, source, keyword, page = '1', limit = '12' } = req.query;
    const pageNum  = Math.max(1, parseInt(page)  || 1);
    const pageSize = Math.min(48, parseInt(limit) || 12);
    const offset   = (pageNum - 1) * pageSize;

    let query = supabase
      .from('caregivers')
      .select('*', { count: 'exact' })
      .eq('is_active', true)
      .order('posted_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (region)              query = query.eq('region', region);
    if (type)                query = query.eq('caregiver_type', type);
    if (source)              query = query.eq('source', source);
    if (keyword?.trim())     query = query.or(`title.ilike.%${keyword.trim()}%,description.ilike.%${keyword.trim()}%`);

    const { data, count, error } = await query;
    if (error) {
      console.error('[caregivers GET]', error);
      return res.status(500).json({ error: '查詢失敗，請稍後再試' });
    }
    return res.status(200).json({
      items:       data || [],
      total:       count || 0,
      page:        pageNum,
      page_size:   pageSize,
      total_pages: Math.ceil((count || 0) / pageSize)
    });
  }

  // ── POST ─────────────────────────────────────────────────
  if (req.method === 'POST') {
    const scraperSecret = req.headers['x-scraper-secret'];

    // ── 爬蟲觸發（帶 secret）──
    if (scraperSecret) {
      if (scraperSecret !== process.env.SCRAPER_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { source = 'all', items: externalItems } = req.body || {};

      if (externalItems && Array.isArray(externalItems)) {
        const count = await upsertItems(externalItems.map(i => ({ ...i, source })));
        return res.status(200).json({ source, upserted: count });
      }

      const results = {};
      if (source === 'ptt'   || source === 'all') results.ptt   = await upsertItems(await scrapePtt());
      if (source === 'dcard' || source === 'all') results.dcard = await upsertItems(await scrapeDcard());
      if (source === '1111'  || source === 'all') results['1111'] = await upsertItems(await scrape1111());
      if (source === 'facebook') {
        return res.status(400).json({ error: 'Facebook 爬蟲需外部 Puppeteer 服務，請帶 items 傳入。' });
      }
      return res.status(200).json({ success: true, results });
    }

    // ── 自行刊登 ──
    const {
      title, description, caregiver_type = 'babysitter',
      region, district, price_range, contact, image_url,
      tags = [], expires_days = 30
    } = req.body || {};

    if (!title || title.trim().length < 2) return res.status(400).json({ error: '請填寫標題（至少 2 字）' });
    if (!VALID_TYPES.includes(caregiver_type))    return res.status(400).json({ error: '刊登類型不符' });
    if (!region)                                  return res.status(400).json({ error: '請選擇服務縣市' });
    if (!contact)                                 return res.status(400).json({ error: '請填寫聯絡方式' });

    let posterUserId = null;
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (payload.purpose === 'auth') posterUserId = payload.userId;
      } catch { /* 匿名刊登 */ }
    }

    const days = Math.min(90, Math.max(7, parseInt(expires_days) || 30));
    const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

    const { data, error } = await supabase
      .from('caregivers')
      .insert({
        source: 'self', source_url: null,
        title: title.trim(),
        description: description ? description.trim() : null,
        caregiver_type, region,
        district:       district    || null,
        price_range:    price_range || null,
        contact,
        image_url:      image_url   || null,
        tags:           Array.isArray(tags) ? tags.slice(0, 10) : [],
        poster_user_id: posterUserId,
        is_verified:    false,
        is_active:      true,
        posted_at:      new Date().toISOString(),
        expires_at:     expiresAt
      })
      .select('id, title, region, expires_at')
      .single();

    if (error) {
      console.error('[caregivers POST]', error);
      return res.status(500).json({ error: '刊登失敗，請稍後再試' });
    }
    return res.status(201).json({ message: '刊登成功！審核通過後將顯示於平台。', caregiver: data });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
