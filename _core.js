// LeonTV 搜索核心 — 平台无关，供 Cloudflare/Vercel/Netlify 共用
// 环境变量: LOGIN_PASSWORD, TMDB_API_KEY (通过 getEnv 抽象)

const SITE_TIMEOUT = 6000;
const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG_BASE = 'https://image.tmdb.org';

// ========== 工具函数 ==========

function normalizeSite(s) {
  var cleanApi = s.api.replace(/[\?&]ac=list(?=&|$)/, '').replace(/[\?&]ac=detail(?=&|$)/, '');
  return {
    key: s.key || s.api.replace(/https?:\/\//, '').replace(/\/.*/, ''),
    name: s.name || s.key || '未命名站点',
    api: cleanApi
  };
}

async function fetchJSON(apiUrl, timeout = SITE_TIMEOUT) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(apiUrl, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'LeonTV/4.5' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

function parsePlayUrls(playUrlStr) {
  if (!playUrlStr || typeof playUrlStr !== 'string') return [];
  const urls = [];
  const parts = playUrlStr.split('#');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const dollarIdx = trimmed.indexOf('$');
    if (dollarIdx === -1) {
      if (trimmed.startsWith('http')) urls.push({ label: '播放', url: trimmed });
    } else {
      const label = trimmed.substring(0, dollarIdx).trim();
      const urlPart = trimmed.substring(dollarIdx + 1).trim();
      const episodes = urlPart.split(/[\n]|\$\$/);
      for (const ep of episodes) {
        const epTrimmed = ep.trim();
        if (!epTrimmed) continue;
        const epDollar = epTrimmed.indexOf('$');
        if (epDollar !== -1 && !epTrimmed.startsWith('http')) {
          const epLabel = label + ' ' + epTrimmed.substring(0, epDollar).trim();
          const epUrl = epTrimmed.substring(epDollar + 1).trim();
          if (epUrl.startsWith('http')) urls.push({ label: epLabel, url: epUrl });
        } else if (epTrimmed.startsWith('http')) urls.push({ label, url: epTrimmed });
      }
    }
  }
  return urls;
}

async function searchSite(site, keyword) {
  const encodedWd = encodeURIComponent(keyword);
  const apiUrl = `${site.api}?ac=detail&wd=${encodedWd}`;
  const startTime = Date.now();
  try {
    const data = await fetchJSON(apiUrl);
    if (data.code !== 1 || !data.list || data.list.length === 0) {
      return { site: site.name, key: site.key, results: [], total: 0, responseTime: Date.now() - startTime };
    }
    const responseTime = Date.now() - startTime;
    const results = data.list.map(item => ({
      vod_id: item.vod_id, vod_name: item.vod_name || '', vod_pic: item.vod_pic || '',
      vod_remarks: item.vod_remarks || '', vod_year: item.vod_year || '',
      vod_area: item.vod_area || '', vod_actor: item.vod_actor || '',
      vod_director: item.vod_director || '',
      vod_content: (item.vod_content || '').replace(/<[^>]*>/g, '').substring(0, 200),
      type_name: item.type_name || '', play_urls: parsePlayUrls(item.vod_play_url)
    }));
    return { site: site.name, key: site.key, results, total: results.length, responseTime };
  } catch (err) {
    return { site: site.name, key: site.key, results: [], total: 0, responseTime: Date.now() - startTime, error: err.message };
  }
}

// ========== 处理函数 (接收 getEnv, 返回 Response) ==========

async function handleSearch({ keyword, sites, getEnv }) {
  if (!keyword) return json({ type: 'done', completed: 0, total: 0, success: 0, fail: 0, totalTime: 0, totalMovies: 0, error: '请输入搜索关键词' });
  if (!sites || sites.length === 0) return json({ type: 'done', completed: 0, total: 0, success: 0, fail: 0, totalTime: 0, totalMovies: 0, error: '请先加载站点配置' });

  const searchStart = Date.now();
  const total = sites.length;
  let completed = 0;

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const promises = sites.map(async (site) => {
    const result = await searchSite(site, keyword);
    completed++;
    writer.write(encoder.encode(JSON.stringify({ type: 'result', completed, total, data: result }) + '\n'));
    return result;
  });

  Promise.all(promises).then(async (allResults) => {
    const successSites = allResults.filter(r => !r.error).length;
    const failSites = allResults.filter(r => r.error).length;
    const totalTime = Date.now() - searchStart;
    const totalMovies = allResults.reduce((sum, r) => sum + r.total, 0);
    writer.write(encoder.encode(JSON.stringify({ type: 'done', completed: total, total, success: successSites, fail: failSites, totalTime, totalMovies }) + '\n'));
    try { await writer.close(); } catch {}
  }).catch(async (err) => {
    try { await writer.abort(err); } catch {}
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no', 'Access-Control-Allow-Origin': '*' }
  });
}

async function handleDetail({ key, ids, sites, getEnv }) {
  const site = sites.find(s => s.key === key);
  if (!site) return json({ code: 0, msg: '站点不存在' });
  try {
    const apiUrl = `${site.api}?ac=detail&ids=${ids}`;
    const data = await fetchJSON(apiUrl);
    if (data.code === 1 && data.list && data.list[0]) {
      const item = data.list[0];
      return json({ code: 1, data: {
        vod_id: item.vod_id, vod_name: item.vod_name || '', vod_pic: item.vod_pic || '',
        vod_remarks: item.vod_remarks || '', vod_year: item.vod_year || '',
        vod_area: item.vod_area || '', vod_actor: item.vod_actor || '',
        vod_director: item.vod_director || '',
        vod_content: (item.vod_content || '').replace(/<[^>]*>/g, '').substring(0, 500),
        type_name: item.type_name || '', play_urls: parsePlayUrls(item.vod_play_url)
      }});
    }
    return json({ code: 0, msg: '影片不存在' });
  } catch (err) { return json({ code: 0, msg: err.message }); }
}

async function handleTMDBProxy({ path, queryParams, getEnv }) {
  const apiKey = getEnv('TMDB_API_KEY') || '';
  const tmdbPath = path.replace('/api/tmdb', '');
  let targetUrl;
  if (tmdbPath.startsWith('/image/')) {
    targetUrl = TMDB_IMG_BASE + tmdbPath;
  } else {
    if (!apiKey) return json({ success: false, status_message: 'TMDB API Key 未配置' });
    queryParams.push('api_key=' + apiKey);
    targetUrl = TMDB_API_BASE + tmdbPath + '?' + queryParams.join('&');
  }
  try {
    const res = await fetch(targetUrl, { headers: { 'User-Agent': 'LeonTV/4.5' } });
    const contentType = res.headers.get('Content-Type') || '';
    if (contentType.includes('image/')) {
      return new Response(res.body, { headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=604800', 'Access-Control-Allow-Origin': '*' } });
    }
    if (!res.ok) { const text = await res.text(); return json({ success: false, status_code: res.status, status_message: text.substring(0, 200) }); }
    const data = await res.json();
    return json(data);
  } catch (e) { return json({ success: false, status_message: '代理请求失败: ' + e.message }); }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Access-Control-Allow-Origin': '*' }
  });
}

// ========== 模块级状态 (warm instance) ==========
let sites = [];

function getSites() { return sites; }
function setSites(s) { sites = s; }
function normalizeSites(raw) {
  let arr = [];
  if (Array.isArray(raw)) arr = raw;
  else if (raw.sites && Array.isArray(raw.sites)) arr = raw.sites;
  else if (raw.api_site) {
    if (Array.isArray(raw.api_site)) arr = raw.api_site;
    else arr = Object.keys(raw.api_site).map(k => raw.api_site[k]);
  }
  else if (raw.data && Array.isArray(raw.data)) arr = raw.data;
  else if (raw.api) arr = [raw];
  return arr.filter(s => s.api && typeof s.api === 'string').map(normalizeSite);
}

module.exports = { handleSearch, handleDetail, handleTMDBProxy, getSites, setSites, normalizeSites, normalizeSite, json };
