/**
 * seed_clicks.js — 模擬 30 個 seed user 登入並隨機點擊推薦文章
 *
 * 用法：
 *   node seed_clicks.js https://你的vercel網域.vercel.app
 *
 * 執行前確認 seed_test_users.sql 已匯入 Supabase。
 */

const BASE_URL = process.argv[2]?.replace(/\/$/, '');
if (!BASE_URL) {
  console.error('❌  請提供 Vercel 網址，例如：node seed_clicks.js https://xxx.vercel.app');
  process.exit(1);
}

// ── 設定 ──────────────────────────────────────────────────────────
const PASSWORD = 'Test1234';

// seed users: 0912001001 ~ 0912001030
const PHONES = Array.from({ length: 30 }, (_, i) =>
  `09120010${String(i + 1).padStart(2, '0')}`
);

// 對應 api/recommendations.js 裡的 demo 資料 id（也是 ARTICLES 的 key）
const POLICIES = [
  { id: 'birth-bonus',       category: 'subsidy',  priority: 'high'   },
  { id: 'subsidy-apply',     category: 'subsidy',  priority: 'high'   },
  { id: 'newborn',           category: 'medical',  priority: 'high'   },
  { id: 'preventive-health', category: 'medical',  priority: 'medium' },
  { id: 'parental-leave',    category: 'subsidy',  priority: 'medium' },
  { id: 'daycare-guide',     category: 'daycare',  priority: 'low'    },
  { id: 'child-medical',     category: 'medical',  priority: 'medium' },
  { id: 'preschool-edu',     category: 'education',priority: 'low'    },
  { id: 'parenting-course',  category: 'activity', priority: 'low'    },
  { id: 'paternity-leave',   category: 'subsidy',  priority: 'medium' },
];

// 每個 user 隨機點幾次（3~7次）
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pickRandom(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// ── HTTP helpers ───────────────────────────────────────────────────
async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

// ── 主流程 ────────────────────────────────────────────────────────
async function seedUser(phone) {
  // 1. 登入
  const { status, data } = await post('/api/login', { phone, password: PASSWORD });
  if (status !== 200 || !data.token) {
    console.log(`  ⚠️  ${phone} 登入失敗 (${status}): ${data.error || '未知錯誤'}`);
    return { clicks: 0 };
  }

  const token   = data.token;
  const userId  = data.user?.id;

  // 2. 取得第一個 child（若無則略過 child_id）
  let childId = null;
  try {
    const r = await fetch(`${BASE_URL}/api/recommendations?user_id=${userId}&child_id=demo&mode=personal`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const d = await r.json();
    // 推薦 API 不直接回傳 child，child_id 由 register 決定
    // 這裡用 demo-child 作為 placeholder，後台統計主要看 user_id
  } catch { /* 靜默 */ }

  // 3. 隨機點擊 3~7 篇文章
  const picks     = pickRandom(POLICIES, randInt(3, 7));
  let clickCount  = 0;

  for (const policy of picks) {
    // 模擬閱讀時間（0~2 秒延遲，避免同時爆量）
    await new Promise(r => setTimeout(r, randInt(0, 2000)));

    const { status: cs, data: cd } = await post('/api/click', {
      user_id:   userId,
      child_id:  childId,
      policy_id: policy.id,
      category:  policy.category,
      priority:  policy.priority,
    }, token);

    if (cs === 200 || cs === 201) {
      clickCount++;
      process.stdout.write('.');
    } else {
      process.stdout.write('x');
    }
  }

  return { clicks: clickCount };
}

async function main() {
  console.log(`\n🚀  開始對 ${BASE_URL} 注入點擊資料`);
  console.log(`📋  共 ${PHONES.length} 個 seed user，每人隨機點擊 3~7 篇\n`);

  let totalClicks = 0;
  let successUsers = 0;

  for (let i = 0; i < PHONES.length; i++) {
    const phone = PHONES[i];
    process.stdout.write(`[${String(i+1).padStart(2,'0')}] ${phone} → `);
    const { clicks } = await seedUser(phone);
    totalClicks += clicks;
    if (clicks > 0) successUsers++;
    console.log(` (${clicks} 次點擊)`);

    // 每 5 個 user 稍微暫停，避免 rate limit
    if ((i + 1) % 5 === 0 && i < PHONES.length - 1) {
      process.stdout.write('  ⏸  稍等 2 秒...\n');
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅  完成！成功用戶：${successUsers}/${PHONES.length}`);
  console.log(`📊  總點擊事件注入：${totalClicks} 筆`);
  console.log(`\n👉  現在可以登入後台 ${BASE_URL}/admin.html 查看統計數據`);
}

main().catch(err => {
  console.error('\n❌  執行失敗：', err.message);
  process.exit(1);
});
