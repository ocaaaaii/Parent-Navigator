/**
 * run-scraper.js — 本地爬蟲，直接寫入 Supabase
 *
 * 使用方式：
 *   node run-scraper.js          ← 爬全部
 *   node run-scraper.js ptt
 *   node run-scraper.js babyhome
 *   node run-scraper.js mobile01
 */

const https = require('https');
const http  = require('http');

const SUPABASE_URL = 'https://yunwvsdayqsvyrzuloom.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1bnd2c2RheXFzdnlyenVsb29tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Mjg3NzI1NywiZXhwIjoyMDk4NDUzMjU3fQ.MiIv75GMHiFiSMbRwdH7slRauqAjdZMTtjCISPS51wI';

// ── HTTP 工具 ─────────────────────────────────────────────────────
function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-TW,zh;q=0.9',
        ...options.headers,
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, options).then(resolve).catch(reject);
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function supabaseUpsert(items) {
  if (!items.length) return 0;
  // 分批寫入（每批 20 筆），用 upsert（需 caregivers 表有 UNIQUE(source, source_id)）
  const BATCH = 20;
  let total = 0;
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    const body  = JSON.stringify(batch);
    const wrote = await new Promise((resolve) => {
      const urlObj = new URL(`${SUPABASE_URL}/rest/v1/caregivers`);
      const req = https.request({
        hostname: urlObj.hostname,
        path:     `${urlObj.pathname}?on_conflict=source,source_id`,
        method:   'POST',
        headers: {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(body),
          'Authorization':  `Bearer ${SERVICE_KEY}`,
          'apikey':         SERVICE_KEY,
          'Prefer':         'resolution=merge-duplicates,return=minimal',
        },
      }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(batch.length);
          } else {
            console.error(`  [Supabase error] batch ${i/BATCH+1}:`, res.statusCode, d.slice(0, 200));
            resolve(0);
          }
        });
      });
      req.on('error', (e) => { console.error('  [Supabase req error]', e.message); resolve(0); });
      req.write(body);
      req.end();
    });
    total += wrote;
    process.stdout.write(`\r  寫入進度：${Math.min(i + BATCH, items.length)}/${items.length} 筆`);
  }
  console.log('');
  return total;
}

// ── 輔助函式 ──────────────────────────────────────────────────────
const CAREGIVER_KW = /保母|家教|褓姆|托嬰|月嫂|月子|居家托育|找保|徵保|求保|托育|奶嘴|看護/;
const TAIWAN_REGIONS = [
  '台北市','臺北市','新北市','基隆市','桃園市','新竹市','新竹縣','苗栗縣',
  '台中市','臺中市','彰化縣','南投縣','雲林縣','嘉義市','嘉義縣',
  '台南市','臺南市','高雄市','屏東縣','宜蘭縣','花蓮縣','台東縣','臺東縣',
  '澎湖縣','金門縣','連江縣',
  '內湖','士林','北投','文山','信義','大安','中山','松山','南港','萬華','大同','中正',
  '板橋','三重','新莊','中和','永和','新店','蘆洲','土城','樹林','淡水',
];
function extractRegion(text) {
  for (const r of TAIWAN_REGIONS) {
    if (text.includes(r)) return r.replace('臺', '台');
  }
  return null;
}
function extractTags(text) {
  const tags = [];
  if (/到府|到宅/.test(text))       tags.push('到府服務');
  if (/英文|英語/.test(text))       tags.push('英語教學');
  if (/數學|理化|自然/.test(text))  tags.push('學科家教');
  if (/證照|執照|合格/.test(text))  tags.push('持有證照');
  if (/新生兒|月子|月嫂/.test(text))tags.push('新生兒照護');
  if (/夜間|夜班/.test(text))       tags.push('夜間服務');
  if (/課後|寒暑假/.test(text))     tags.push('課後輔導');
  if (/雙語|英語|英文/.test(text))  tags.push('雙語');
  return tags;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ════════════════════════════════════════════════════════
// 1. PTT BabyMother（修正版：split 解析）
// ════════════════════════════════════════════════════════
async function scrapePtt() {
  console.log('\n[PTT] 開始爬取 BabyMother 板...');
  const items = [];

  // 抓最新 5 頁（index.html = 最新；index-1 = 前一頁，從 "上頁" 連結推算）
  const urls = [
    'https://www.ptt.cc/bbs/BabyMother/index.html',
    // 往前抓 4 頁（index 號碼從最新頁的 "上頁" 動態取得，這裡先抓固定幾頁）
    'https://www.ptt.cc/bbs/BabyMother/index7870.html',
    'https://www.ptt.cc/bbs/BabyMother/index7869.html',
    'https://www.ptt.cc/bbs/BabyMother/index7868.html',
    'https://www.ptt.cc/bbs/BabyMother/index7867.html',
  ];

  for (let i = 0; i < urls.length; i++) {
    try {
      const { body, status } = await fetchUrl(urls[i], { headers: { Cookie: 'over18=1' } });
      if (status !== 200) { console.log(`  page ${i+1}: HTTP ${status}`); continue; }

      // 取得真實上一頁編號（從第一頁的 "上頁" 連結）
      if (i === 0) {
        const prevMatch = /href="\/bbs\/BabyMother\/index(\d+)\.html">[^<]*上頁/.exec(body);
        if (prevMatch) {
          const latestIdx = parseInt(prevMatch[1]);
          urls[1] = `https://www.ptt.cc/bbs/BabyMother/index${latestIdx}.html`;
          urls[2] = `https://www.ptt.cc/bbs/BabyMother/index${latestIdx - 1}.html`;
          urls[3] = `https://www.ptt.cc/bbs/BabyMother/index${latestIdx - 2}.html`;
          urls[4] = `https://www.ptt.cc/bbs/BabyMother/index${latestIdx - 3}.html`;
        }
      }

      // ⭐ split 解析（不用 regex 跨 div）
      const entries = body.split('<div class="r-ent">').slice(1);
      let pageFound = 0;

      for (const entry of entries) {
        // 標題連結
        const linkM = /href="(\/bbs\/BabyMother\/M\.[^"]+)"[^>]*>([^<]+)<\/a>/.exec(entry);
        if (!linkM) continue;
        const path  = linkM[1];
        const title = linkM[2].trim();

        // 過濾：符合關鍵字，且不是刪除文（title 以 ( 開頭）
        if (!CAREGIVER_KW.test(title)) continue;
        if (title.startsWith('(')) continue;

        // 日期
        const dateM = /class="date">\s*([^<]+)</.exec(entry);
        const dateStr = dateM ? dateM[1].trim() : '';
        const year  = new Date().getFullYear();
        const posted = dateStr
          ? new Date(`${year}/${dateStr.replace(/\s/g, '')}`).toISOString()
          : new Date().toISOString();

        items.push({
          source:         'ptt',
          source_id:      path.replace('/bbs/BabyMother/', '').replace('.html', ''),
          source_url:     `https://www.ptt.cc${path}`,
          title,
          description:    null,
          caregiver_type: /家教|補習/.test(title) ? 'tutor'
                        : /月嫂|月子/.test(title) ? 'nanny'
                        : 'babysitter',
          region:         extractRegion(title),
          posted_at:      posted,
          tags:           extractTags(title),
          is_active:      true,
        });
        pageFound++;
      }
      console.log(`  第 ${i+1} 頁（${urls[i].split('/').pop()}）：找到 ${pageFound} 筆，累計 ${items.length} 筆`);
    } catch (err) {
      console.error(`  第 ${i+1} 頁錯誤：`, err.message);
    }
    await sleep(600);
  }
  return items;
}

// ════════════════════════════════════════════════════════
// 2. PTT 搜尋：直接搜「保母」關鍵字（補充更多結果）
// ════════════════════════════════════════════════════════
async function scrapePttSearch(keyword) {
  const items = [];
  const url = `https://www.ptt.cc/bbs/BabyMother/search?q=${encodeURIComponent(keyword)}`;
  try {
    const { body, status } = await fetchUrl(url, { headers: { Cookie: 'over18=1' } });
    if (status !== 200) { console.log(`  PTT search ${keyword}: HTTP ${status}`); return []; }

    const entries = body.split('<div class="r-ent">').slice(1);
    for (const entry of entries) {
      const linkM = /href="(\/bbs\/BabyMother\/M\.[^"]+)"[^>]*>([^<]+)<\/a>/.exec(entry);
      if (!linkM) continue;
      const title = linkM[2].trim();
      if (title.startsWith('(')) continue;
      const dateM = /class="date">\s*([^<]+)</.exec(entry);
      const year  = new Date().getFullYear();
      const posted = dateM
        ? new Date(`${year}/${dateM[1].trim().replace(/\s/g, '')}`).toISOString()
        : new Date().toISOString();
      items.push({
        source:         'ptt',
        source_id:      linkM[1].replace('/bbs/BabyMother/', '').replace('.html', ''),
        source_url:     `https://www.ptt.cc${linkM[1]}`,
        title,
        description:    null,
        caregiver_type: /家教/.test(title) ? 'tutor' : /月嫂|月子/.test(title) ? 'nanny' : 'babysitter',
        region:         extractRegion(title),
        posted_at:      posted,
        tags:           extractTags(title),
        is_active:      true,
      });
    }
    console.log(`  PTT 搜尋「${keyword}」：找到 ${items.length} 筆`);
  } catch (err) {
    console.error(`  PTT search error:`, err.message);
  }
  return items;
}

// ════════════════════════════════════════════════════════
// 3. PTT Gossiping / 其他 PTT 板（補充來源）
// ════════════════════════════════════════════════════════
async function scrapePttExtraBoards() {
  console.log('\n[PTT Extra] 爬取 childcare / babymother 搜尋更多頁...');
  const items = [];

  // 對 BabyMother 搜尋更多關鍵字 + 更多頁
  const searchKeywords = ['居家托育', '托嬰', '找保母', '徵保母', '保母推薦', '月嫂推薦'];
  for (const kw of searchKeywords) {
    try {
      const url = `https://www.ptt.cc/bbs/BabyMother/search?q=${encodeURIComponent(kw)}`;
      const { body, status } = await fetchUrl(url, { headers: { Cookie: 'over18=1' } });
      if (status !== 200) continue;
      const entries = body.split('<div class="r-ent">').slice(1);
      let found = 0;
      for (const entry of entries) {
        const linkM = /href="(\/bbs\/BabyMother\/M\.[^"]+)"[^>]*>([^<]+)<\/a>/.exec(entry);
        if (!linkM) continue;
        const title = linkM[2].trim();
        if (title.startsWith('(')) continue;
        const dateM  = /class="date">\s*([^<]+)</.exec(entry);
        const year   = new Date().getFullYear();
        const posted = dateM ? new Date(`${year}/${dateM[1].trim()}`).toISOString() : new Date().toISOString();
        items.push({
          source:         'ptt',
          source_id:      linkM[1].replace('/bbs/BabyMother/', '').replace('.html', ''),
          source_url:     `https://www.ptt.cc${linkM[1]}`,
          title,
          description:    null,
          caregiver_type: /家教/.test(title) ? 'tutor' : /月嫂|月子/.test(title) ? 'nanny' : 'babysitter',
          region:         extractRegion(title),
          posted_at:      posted,
          tags:           extractTags(title),
          is_active:      true,
        });
        found++;
      }
      console.log(`  搜尋「${kw}」：${found} 筆`);
    } catch (err) {
      console.error(`  PTT Extra search error (${kw}):`, err.message);
    }
    await sleep(400);
  }
  console.log(`  PTT Extra 共找到 ${items.length} 筆`);
  return items;
}

// ════════════════════════════════════════════════════════
// 主程式
// ════════════════════════════════════════════════════════
async function main() {
  const target = process.argv[2] || 'all';
  console.log(`\n====== 保母爬蟲啟動（target: ${target}）======`);
  let total = 0;

  // PTT 一般頁 + 搜尋補充
  if (target === 'all' || target === 'ptt') {
    const listItems = await scrapePtt();
    const searchItems = await Promise.all(['保母', '月嫂', '家教', '托嬰'].map(scrapePttSearch));
    const allPtt = [...listItems, ...searchItems.flat()];

    // 去重（同 source_id）
    const seen = new Set();
    const deduped = allPtt.filter(i => { if (seen.has(i.source_id)) return false; seen.add(i.source_id); return true; });
    console.log(`\n  PTT 去重後：${deduped.length} 筆`);

    if (deduped.length) {
      const count = await supabaseUpsert(deduped);
      console.log(`  ✅ PTT 寫入 Supabase：${count} 筆`);
      total += count;
    }
  }

  if (target === 'all' || target === 'extra') {
    const items = await scrapePttExtraBoards();
    const seen2 = new Set();
    const deduped2 = items.filter(i => { if (seen2.has(i.source_id)) return false; seen2.add(i.source_id); return true; });
    console.log(`  PTT Extra 去重後：${deduped2.length} 筆`);
    if (deduped2.length) {
      const count = await supabaseUpsert(deduped2);
      console.log(`  ✅ PTT Extra 寫入 Supabase：${count} 筆`);
      total += count;
    }
  }

  console.log(`\n====== 完成！共寫入 ${total} 筆 ======\n`);
}

main().catch(console.error);
