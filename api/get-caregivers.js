/**
 * GET /api/get-caregivers
 * Query params:
 *   region        - 縣市，如 "台北市"（可留空 = 全國）
 *   type          - babysitter | tutor | nanny | other（可留空 = 全部）
 *   source        - ptt | dcard | 1111 | gov | facebook | self（可留空 = 全部）
 *   keyword       - 關鍵字搜尋 title / description
 *   page          - 頁碼，預設 1
 *   limit         - 每頁筆數，預設 12，最大 48
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const PAGE_SIZE = 12;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: '不支援此 HTTP 方法' });

  try {
    const { region, type, source, keyword, page = '1', limit = '12' } = req.query;

    const pageNum  = Math.max(1, parseInt(page)  || 1);
    const pageSize = Math.min(48, parseInt(limit) || PAGE_SIZE);
    const offset   = (pageNum - 1) * pageSize;

    // ── 組合查詢 ────────────────────────────────────────────────────────────
    let query = supabase
      .from('caregivers')
      .select('*', { count: 'exact' })
      .eq('is_active', true)
      .order('posted_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (region)  query = query.eq('region', region);
    if (type)    query = query.eq('caregiver_type', type);
    if (source)  query = query.eq('source', source);

    // 關鍵字：搜尋 title 或 description
    if (keyword && keyword.trim()) {
      query = query.or(`title.ilike.%${keyword.trim()}%,description.ilike.%${keyword.trim()}%`);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error('[get-caregivers] query error:', error);
      return res.status(500).json({ error: '查詢失敗，請稍後再試' });
    }

    return res.status(200).json({
      items:      data || [],
      total:      count || 0,
      page:       pageNum,
      page_size:  pageSize,
      total_pages: Math.ceil((count || 0) / pageSize)
    });

  } catch (err) {
    console.error('[get-caregivers] unexpected error:', err);
    return res.status(500).json({ error: '伺服器錯誤，請稍後再試' });
  }
};
