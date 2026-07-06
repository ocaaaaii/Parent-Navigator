/**
 * scripts/scrape-gov-nanny.js
 *
 * 爬取衛福部社家署「托育媒合平台」合法保母資料
 * 目標：https://ncwisweb.sfaa.gov.tw/home/nanny
 *
 * 原理：用 Playwright 開啟真實瀏覽器，攔截 SPA 發出的 XHR/fetch 請求，
 *       取得後端 API endpoint 和 JSON 格式後，直接 loop 分頁抓資料。
 *
 * 使用方式：
 *   1. npm install playwright @supabase/supabase-js dotenv
 *   2. npx playwright install chromium
 *   3. 在根目錄建立 .env（或複製 .env.local），確認以下變數：
 *        SUPABASE_URL=...
 *        SUPABASE_SERVICE_KEY=... (service role key)
 *   4. node scripts/scrape-gov-nanny.js
 *
 * 注意：台北市代碼=63，可修改 TARGET_CITIES 抓取更多縣市
 */

require('dotenv').config();
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

// ── 設定 ────────────────────────────────────────────────────────────────────

// 縣市代碼對照（行政院標準代碼）
const CITY_CODES = {
  '台北市': '63', '新北市': '65', '桃園市': '68', '台中市': '66',
  '台南市': '67', '高雄市': '64', '基隆市': '10017', '新竹市': '10018',
  '嘉義市': '10020', '新竹縣': '10004', '苗栗縣': '10005', '彰化縣': '10007',
  '南投縣': '10008', '雲林縣': '10009', '嘉義縣': '10010', '屏東縣': '10013',
  '宜蘭縣': '10002', '花蓮縣': '10015', '台東縣': '10014', '澎湖縣': '10016',
  '金門縣': '09020', '連江縣': '09007',
};

// 要抓取的縣市（先從台北市開始測試，確認 OK 後再展開全國）
const TARGET_CITIES = ['台北市', '新北市', '桃園市'];
// const TARGET_CITIES = Object.keys(CITY_CODES); // 全國版

const PAGE_SIZE = 20;
const DELAY_MS  = 1500; // 每頁等待（ms），避免過度頻繁
const BASE_URL  = 'https://ncwisweb.sfaa.gov.tw';

// ── Supabase 初始化 ────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// ── 工具函式 ─────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** 從地址字串解析縣市 + 行政區 */
function parseAddress(addr = '') {
  const m = addr.match(/^(.{2,3}[縣市])(.{2,3}[鄉鎮市區])?/);
  return {
    region:   m?.[1] || addr.slice(0, 3) || '',
    district: m?.[2] || '',
  };
}

/** 把保母 JSON 轉換成 caregivers 資料表欄位 */
function mapNannyToCaregiver(item, cityName) {
  const addr = parseAddress(item.address || item.serviceAddress || '');
  const tags = [];

  if (item.nannyType || item.serviceType)  tags.push(item.nannyType || item.serviceType);
  if (item.serviceTime || item.timeSlot)   tags.push(item.serviceTime || item.timeSlot);
  if (item.certNo || item.registrationNo)  tags.push('已登記');
  if (item.techCertNo)                     tags.push('有技術士證');

  return {
    source:         'gov',
    source_url:     `${BASE_URL}/home/nanny`,
    source_id:      item.nannyNo || item.id || item.sn || String(item.seq),
    title:          (item.name || item.nannyName || '保母') + ' 女士／先生',
    description:    [
      item.serviceType  && `服務類型：${item.serviceType}`,
      item.serviceTime  && `托育時段：${item.serviceTime}`,
      item.eduDegree    && `學歷：${item.eduDegree}`,
      item.currentCount !== undefined && `目前收托：${item.currentCount} 人`,
      item.sysName      && `所屬系統：${item.sysName}`,
    ].filter(Boolean).join('｜'),
    caregiver_type: 'babysitter',
    region:         addr.region  || cityName,
    district:       addr.district,
    price_range:    item.price || item.fee || null,
    contact:        item.phone || item.tel || item.sysPhone || null,
    tags,
    is_verified:    true,   // 政府平台已登記 = 合法
    is_active:      true,
    posted_at:      null,
    scraped_at:     new Date().toISOString(),
  };
}

// ── 攔截 API 並找到真實 endpoint ─────────────────────────────────────────────

async function discoverApiEndpoint(page) {
  console.log('🔍 攔截 API endpoint...');
  let apiEndpoint = null;
  let capturedResponse = null;

  // 監聽所有 XHR / fetch 回應
  page.on('response', async (res) => {
    const url = res.url();
    const ct  = res.headers()['content-type'] || '';
    // 尋找包含 nanny / 保母相關的 JSON API
    if (ct.includes('application/json') &&
        (url.includes('nanny') || url.includes('nurse') || url.includes('caregiver') ||
         url.includes('query') || url.includes('search') || url.includes('list'))) {
      try {
        const body = await res.json();
        // 確認有保母資料結構（有 total 或 data 陣列）
        if (body && (body.total !== undefined || Array.isArray(body.data) || Array.isArray(body.list))) {
          if (!apiEndpoint) {
            apiEndpoint = url;
            capturedResponse = body;
            console.log(`✅ 找到 API：${url}`);
          }
        }
      } catch { /* ignore parse error */ }
    }
  });

  // 前往保母查詢頁（用 domcontentloaded 取代 networkidle，避免 SPA 無限等待）
  await page.goto(`${BASE_URL}/home/nanny`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // 等待頁面 JS 載入並發 API 請求
  await page.waitForTimeout(5000);

  // 嘗試點擊「查詢」或等待資料自動載入
  try {
    const searchBtn = await page.$('button:has-text("查詢"), button:has-text("搜尋"), input[type="submit"]');
    if (searchBtn) {
      await searchBtn.click();
      await page.waitForTimeout(3000);
    }
  } catch { /* ignore */ }

  await page.waitForTimeout(3000);
  return { apiEndpoint, capturedResponse };
}

// ── 直接呼叫 API 抓分頁資料 ─────────────────────────────────────────────────

async function fetchAllPages(page, apiUrl, cityCode, cityName) {
  const results = [];
  let pageNo = 1;
  let total  = Infinity;

  // 從原始 URL 解析出 base + params 的模式
  const urlObj = new URL(apiUrl);

  while (results.length < total) {
    // 構造分頁請求（嘗試常見的分頁參數）
    urlObj.searchParams.set('page',     String(pageNo));
    urlObj.searchParams.set('pageSize', String(PAGE_SIZE));
    urlObj.searchParams.set('pageNo',   String(pageNo));
    urlObj.searchParams.set('size',     String(PAGE_SIZE));
    if (cityCode) {
      urlObj.searchParams.set('cityCode', cityCode);
      urlObj.searchParams.set('city',     cityCode);
      urlObj.searchParams.set('countyId', cityCode);
    }

    console.log(`  📄 第 ${pageNo} 頁 (${cityName})...`);

    let data;
    try {
      // 用 page.evaluate 在瀏覽器內 fetch（帶上原有 cookie / headers）
      data = await page.evaluate(async (url) => {
        const res = await fetch(url, {
          credentials: 'include',
          headers: { 'Accept': 'application/json' },
        });
        return res.json();
      }, urlObj.toString());
    } catch (e) {
      console.warn(`    ⚠️  第 ${pageNo} 頁失敗：${e.message}`);
      break;
    }

    // 自動識別不同 API 的回應結構
    const items = data?.data  || data?.list  || data?.records ||
                  data?.rows  || data?.items || data?.content ||
                  (Array.isArray(data) ? data : []);

    if (total === Infinity) {
      total = data?.total ?? data?.totalCount ?? data?.totalElements ?? items.length;
      console.log(`  📊 ${cityName} 共 ${total} 筆`);
    }

    if (!items.length) break;

    items.forEach(item => results.push(mapNannyToCaregiver(item, cityName)));
    pageNo++;

    if (results.length >= total) break;
    await sleep(DELAY_MS);
  }

  return results;
}

// ── 備援：DOM 爬取（當攔截不到 API 時） ──────────────────────────────────────

async function scrapeByDom(page, cityName) {
  console.log(`  📄 改用 DOM 爬取 (${cityName})...`);
  const results = [];
  let pageNo = 1;

  while (true) {
    await page.waitForTimeout(2000);

    // 等待清單出現
    const rows = await page.$$('.nanny-list .item, .card-list .card, table tbody tr, [class*="nanny"], [class*="list-item"]');
    if (!rows.length) { console.log('    ℹ️  沒有找到清單元素，請確認頁面選擇器'); break; }

    for (const row of rows) {
      try {
        const text = await row.innerText();
        const lines = text.trim().split('\n').map(s => s.trim()).filter(Boolean);

        // 嘗試解析姓名、電話、地址
        const name    = lines[0] || '保母';
        const phone   = lines.find(l => /\d{2,4}-?\d{4,8}/.test(l)) || '';
        const address = lines.find(l => /[縣市鄉鎮區路街]/u.test(l)) || '';

        const { region, district } = parseAddress(address);
        results.push({
          source:        'gov',
          source_url:    page.url(),
          source_id:     `dom-${cityName}-p${pageNo}-${results.length}`,
          title:         name,
          description:   text.slice(0, 300),
          caregiver_type:'babysitter',
          region:        region || cityName,
          district,
          contact:       phone,
          tags:          ['已登記'],
          is_verified:   true,
          is_active:     true,
          scraped_at:    new Date().toISOString(),
        });
      } catch { /* skip */ }
    }

    // 嘗試點下一頁
    const nextBtn = await page.$('button:has-text("下一頁"), a:has-text("下一頁"), .pagination .next:not([disabled])');
    if (!nextBtn) break;
    await nextBtn.click();
    pageNo++;
    await sleep(DELAY_MS);
  }

  return results;
}

// ── 寫入 Supabase ─────────────────────────────────────────────────────────────

async function upsertToSupabase(records) {
  if (!records.length) return;

  // 分批寫入（Supabase 單次建議不超過 500）
  const BATCH = 200;
  let inserted = 0;

  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const { error } = await supabase
      .from('caregivers')
      .upsert(batch, {
        onConflict: 'source,source_id',
        ignoreDuplicates: false,      // 更新已存在的記錄
      });

    if (error) {
      console.error(`  ❌ Supabase 寫入錯誤：${error.message}`);
    } else {
      inserted += batch.length;
      console.log(`  ✅ 已寫入 ${inserted} / ${records.length} 筆`);
    }
    await sleep(500);
  }
}

// ── 主程式 ────────────────────────────────────────────────────────────────────

(async () => {
  console.log('🚀 衛福部保母資料爬蟲啟動\n');

  if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.error('❌ 請確認 .env 已設定 SUPABASE_URL 和 SUPABASE_SERVICE_KEY');
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: false,   // 設 false 可以看到瀏覽器操作過程，debug 完後改 true
    slowMo: 200,
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    locale: 'zh-TW',
  });
  const page = await context.newPage();

  // Step 1：前往頁面，攔截 API endpoint
  const { apiEndpoint } = await discoverApiEndpoint(page);

  let grandTotal = 0;

  for (const cityName of TARGET_CITIES) {
    const cityCode = CITY_CODES[cityName];
    console.log(`\n🏙️  處理：${cityName} (code: ${cityCode})`);

    let records = [];

    if (apiEndpoint) {
      // 直接呼叫 API（快，有結構）
      records = await fetchAllPages(page, apiEndpoint, cityCode, cityName);
    } else {
      // 備援：DOM 爬取（需要先在頁面上選取縣市）
      console.log('  ⚠️  未攔截到 API，改用 DOM 方式');
      try {
        // 嘗試選縣市下拉
        const select = await page.$('select[name*="city"], select[name*="county"], select#city, select#county');
        if (select) {
          await select.selectOption({ value: cityCode });
          const searchBtn = await page.$('button:has-text("查詢"), button[type="submit"]');
          if (searchBtn) await searchBtn.click();
          await sleep(2000);
        }
      } catch { /* ignore */ }
      records = await scrapeByDom(page, cityName);
    }

    console.log(`  🗂️  ${cityName} 共爬取 ${records.length} 筆`);

    // 寫入 Supabase
    await upsertToSupabase(records);
    grandTotal += records.length;

    await sleep(DELAY_MS * 2); // 縣市之間多等一下
  }

  await browser.close();
  console.log(`\n🎉 完成！共處理 ${grandTotal} 筆保母資料`);
  console.log('💡 提示：若 is_verified=true 的資料顯示在前端，需確認 caregivers RLS policy 允許 gov source');
})();
