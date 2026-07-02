/**
 * seed_clicks_direct.js — 直接寫入 Supabase，不依賴 Vercel API
 *
 * 用法：
 *   node seed_clicks_direct.js <SUPABASE_URL> <SUPABASE_SERVICE_KEY>
 *
 * 例如：
 *   node seed_clicks_direct.js https://xxxx.supabase.co eyJhbGci...
 *
 * SUPABASE_SERVICE_KEY 在 Supabase Dashboard → Project Settings → API → service_role
 */

const SUPABASE_URL = process.argv[2];
const SERVICE_KEY  = process.argv[3];

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('用法：node seed_clicks_direct.js <SUPABASE_URL> <SERVICE_KEY>');
  process.exit(1);
}

const HEADERS = {
  'Content-Type':  'application/json',
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'apikey':        SERVICE_KEY,
  'Prefer':        'return=minimal',
};

// 點擊資料（對應 ARTICLES 的 key）
const POLICIES = [
  { id: 'birth-bonus',        category: 'subsidy',   priority: 'high'   },
  { id: 'subsidy-apply',      category: 'subsidy',   priority: 'high'   },
  { id: 'newborn',            category: 'medical',   priority: 'high'   },
  { id: 'preventive-health',  category: 'medical',   priority: 'medium' },
  { id: 'parental-leave',     category: 'subsidy',   priority: 'medium' },
  { id: 'daycare-guide',      category: 'daycare',   priority: 'low'    },
  { id: 'child-medical',      category: 'medical',   priority: 'medium' },
  { id: 'preschool-edu',      category: 'education', priority: 'low'    },
  { id: 'parenting-course',   category: 'activity',  priority: 'low'    },
  { id: 'paternity-leave',    category: 'subsidy',   priority: 'medium' },
  { id: 'subsidy-compare',    category: 'subsidy',   priority: 'medium' },
  { id: 'parental-leave-update', category: 'subsidy', priority: 'medium' },
];

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pickRandom(arr, n) { return [...arr].sort(() => Math.random() - 0.5).slice(0, n); }

// ── Supabase REST helpers ─────────────────────────────────────────
async function supabaseGet(table, query = '') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, { headers: HEADERS });
  if (!r.ok) throw new Error(`GET ${table} failed: ${r.status}`);
  return r.json();
}

async function supabaseInsert(table, rows) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(rows),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`INSERT ${table} failed: ${r.status} ${err}`);
  }
}

// ── 主流程 ────────────────────────────────────────────────────────
async function main() {
  console.log('\n🔗  連線至 Supabase:', SUPABASE_URL);

  // 1. 取得所有 users
  const users = await supabaseGet('users', '?select=id,phone,user_nickname&order=created_at.asc');
  console.log(`👤  找到 ${users.length} 個用戶\n`);

  if (users.length === 0) {
    console.error('❌  users 表是空的！請先在 Supabase 執行 seed_test_users.sql');
    process.exit(1);
  }

  // 2. 取得每個 user 的第一個孩子
  const children = await supabaseGet('children', '?select=id,user_id&order=created_at.asc');
  const childMap = {};
  children.forEach(c => { if (!childMap[c.user_id]) childMap[c.user_id] = c.id; });

  let totalClicks = 0;
  const allEvents = [];

  for (const user of users) {
    const childId = childMap[user.id] || null;
    // 每個 user 分 2~4 個不同「使用情境」，每次情境點 3~6 篇
    const sessions = randInt(2, 4);
    let userClicks = 0;

    for (let s = 0; s < sessions; s++) {
      const picks = pickRandom(POLICIES, randInt(3, 6));
      // 每個 session 在過去 30 天內的某個隨機時間點
      const sessionBase = new Date(Date.now() - randInt(0, 30 * 24 * 60 * 60 * 1000));

      picks.forEach((p, i) => {
        const clickedAt = new Date(sessionBase);
        clickedAt.setMinutes(clickedAt.getMinutes() + i * randInt(2, 15));
        allEvents.push({
          user_id:   user.id,
          child_id:  childId,
          policy_id: p.id,
          category:  p.category,
          priority:  p.priority,
          clicked_at: clickedAt.toISOString(),
        });
        userClicks++;
      });
    }

    process.stdout.write(`  ${user.phone || user.id.slice(0,8)} → ${userClicks} 筆\n`);
    totalClicks += userClicks;
  }

  // 3. 批次寫入（分批避免過大）
  console.log(`\n📝  寫入 ${allEvents.length} 筆點擊事件到 policy_click_events...`);

  const BATCH = 50;
  for (let i = 0; i < allEvents.length; i += BATCH) {
    await supabaseInsert('policy_click_events', allEvents.slice(i, i + BATCH));
    process.stdout.write('.');
  }

  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅  完成！共寫入 ${totalClicks} 筆點擊事件`);
  console.log(`👉  登入後台 admin.html 查看統計數據`);
}

main().catch(err => {
  console.error('\n❌  錯誤：', err.message);
  process.exit(1);
});
