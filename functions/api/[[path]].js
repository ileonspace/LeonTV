// LeonTV v4.0 Golden — Cloudflare Pages Functions | 2026-06-21 完美标准版
// Fix: 无状态站点丢失 + TMDB 代理 URL 编码

// ==================== 认证 ====================
const AUTH_COOKIE = 'ltv_auth';
function getAuthPwd(env) { return env.LOGIN_PASSWORD || ''; }

function checkAuth(request, env) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(function(c) {
      var idx = c.indexOf('=');
      if (idx === -1) return [c.trim(), ''];
      return [c.substring(0, idx).trim(), decodeURIComponent(c.substring(idx + 1).trim())];
    })
  );
  return cookies[AUTH_COOKIE] === getAuthPwd(env);
}

// ==================== TMDB 代理配置 ====================
const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG_BASE = 'https://image.tmdb.org';

// ==================== 模块级状态 ====================
let sites = [];
const tvRelay = new Map(); // TV手机输入中转

// ==================== 工具函数 ====================
const SITE_TIMEOUT = 6000;

// 统一站点标准化 — 只在一处定义
function normalizeSite(s) {
  // 保留 ?url= / ?format= 等关键参数，只去掉 ?ac=list 这种
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
      headers: { 'User-Agent': 'LeonTV/3.4' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
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
      if (trimmed.startsWith('http')) {
        urls.push({ label: '播放', url: trimmed });
      }
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
          if (epUrl.startsWith('http')) {
            urls.push({ label: epLabel, url: epUrl });
          }
        } else if (epTrimmed.startsWith('http')) {
          urls.push({ label, url: epTrimmed });
        }
      }
    }
  }
  return urls;
}

// ==================== 单站点搜索 ====================
async function searchSite(site, keyword) {
  const encodedWd = encodeURIComponent(keyword);
  const apiUrl = `${site.api}?ac=detail&wd=${encodedWd}`;
  const startTime = Date.now();

  try {
    const data = await fetchJSON(apiUrl);
    if (data.code !== 1 || !data.list || data.list.length === 0) {
      return { site: site.name, key: site.key, results: [], total: 0,
               responseTime: Date.now() - startTime };
    }
    const responseTime = Date.now() - startTime;
    const results = data.list.map(item => ({
      vod_id: item.vod_id,
      vod_name: item.vod_name || '',
      vod_pic: item.vod_pic || '',
      vod_remarks: item.vod_remarks || '',
      vod_year: item.vod_year || '',
      vod_area: item.vod_area || '',
      vod_actor: item.vod_actor || '',
      vod_director: item.vod_director || '',
      vod_content: (item.vod_content || '').replace(/<[^>]*>/g, '').substring(0, 200),
      type_name: item.type_name || '',
      play_urls: parsePlayUrls(item.vod_play_url)
    }));
    return { site: site.name, key: site.key, results, total: results.length, responseTime };
  } catch (err) {
    return { site: site.name, key: site.key, results: [], total: 0,
             responseTime: Date.now() - startTime, error: err.message };
  }
}

// ==================== JSON 响应辅助 ====================
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// ==================== 路由处理 ====================

async function handleAPIFetch(url) {
  const targetUrl = url.searchParams.get('url');
  if (!targetUrl) return json({ code: 0, msg: '缺少url参数' });
  // 宽泛格式：不限制URL格式，由客户端 flexibleParseSites 负责解析验证
  // 安全：此端点需通过 checkAuth 认证，仅登录用户可调用
  try {
    const res = await fetch(targetUrl, { headers: { 'User-Agent': 'LeonTV/3.4' } });
    const text = await res.text();
    return json({ code: 1, data: text });
  } catch (e) {
    return json({ code: 0, msg: e.message });
  }
}

async function handleSitesList() {
  return json({
    code: 1,
    total: sites.length,
    data: sites.map(s => ({ key: s.key, name: s.name, api: s.api }))
  });
}

async function handleSitesLoad(request) {
  let body;
  try { body = await request.json(); } catch {
    return json({ code: 0, msg: '无效的JSON请求体' });
  }
  const { url, json: jsonData } = body;
  let rawData;
  try {
    if (url) {
      const res = await fetch(url, { headers: { 'User-Agent': 'LeonTV/3.4' } });
      rawData = await res.json();
    } else if (jsonData) {
      rawData = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    } else {
      return json({ code: 0, msg: '请提供 url 或 json 参数' });
    }
    // 宽泛格式解析：支持 api_site / data / 单对象 等多种格式
    let siteList = [];
    if (Array.isArray(rawData)) { siteList = rawData; }
    else if (rawData.sites && Array.isArray(rawData.sites)) { siteList = rawData.sites; }
    else if (rawData.api_site) {
      // api_site: 数组 或 {domain: {name, api}} 对象
      if (Array.isArray(rawData.api_site)) { siteList = rawData.api_site; }
      else { siteList = Object.keys(rawData.api_site).map(function(k){ return rawData.api_site[k]; }); }
    }
    else if (rawData.data && Array.isArray(rawData.data)) { siteList = rawData.data; }
    else if (rawData.api && typeof rawData.api === 'string') { siteList = [rawData]; }
    else { return json({ code: 0, msg: 'JSON格式无效：需要站点数组或包含sites字段' }); }

    sites = siteList
      .filter(s => s.api && typeof s.api === 'string')
      .map(normalizeSite);

    return json({
      code: 1, msg: `成功加载 ${sites.length} 个站点`,
      total: sites.length,
      data: sites.map(s => ({ key: s.key, name: s.name }))
    });
  } catch (err) {
    return json({ code: 0, msg: '加载失败: ' + err.message });
  }
}

// 🔧 核心修复：支持 GET + POST 搜索，POST 携带站点避免无状态丢失
async function handleSearch(url, request) {
  let keyword;
  let searchSites = sites; // 默认使用模块级状态

  if (request.method === 'POST') {
    // 前端 POST 方式：携带站点，彻底解决无状态问题
    let body;
    try { body = await request.json(); } catch { return json({ code: 0, msg: '无效请求' }); }
    keyword = (body.wd || '').trim();
    if (body.sites && Array.isArray(body.sites)) {
      searchSites = body.sites.filter(s => s.api && typeof s.api === 'string').map(normalizeSite);
    }
  } else {
    keyword = (url.searchParams.get('wd') || '').trim();
  }

  if (!keyword) {
    const msg = JSON.stringify({ type: 'done', completed: 0, total: 0, success: 0, fail: 0, totalTime: 0, totalMovies: 0, error: '请输入搜索关键词' }) + '\n';
    return new Response(msg, { headers: { 'Content-Type': 'application/x-ndjson', 'Access-Control-Allow-Origin': '*' } });
  }
  if (searchSites.length === 0) {
    const msg = JSON.stringify({ type: 'done', completed: 0, total: 0, success: 0, fail: 0, totalTime: 0, totalMovies: 0, error: '请先加载站点配置' }) + '\n';
    return new Response(msg, { headers: { 'Content-Type': 'application/x-ndjson', 'Access-Control-Allow-Origin': '*' } });
  }

  const searchStart = Date.now();
  const total = searchSites.length;
  let completed = 0;

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const promises = searchSites.map(async (site) => {
    const result = await searchSite(site, keyword);
    completed++;
    writer.write(encoder.encode(JSON.stringify({
      type: 'result', completed, total, data: result
    }) + '\n'));
    return result;
  });

  Promise.all(promises).then(async (allResults) => {
    const successSites = allResults.filter(r => !r.error).length;
    const failSites = allResults.filter(r => r.error).length;
    const totalTime = Date.now() - searchStart;
    const totalMovies = allResults.reduce((sum, r) => sum + r.total, 0);
    writer.write(encoder.encode(JSON.stringify({
      type: 'done', completed: total, total,
      success: successSites, fail: failSites, totalTime, totalMovies
    }) + '\n'));
    try { await writer.close(); } catch {}
  }).catch(async (err) => {
    try { await writer.abort(err); } catch {}
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

async function handleDetail(url) {
  const key = url.searchParams.get('key');
  const ids = url.searchParams.get('ids');
  if (!key || !ids) return json({ code: 0, msg: '缺少参数' });

  const site = sites.find(s => s.key === key);
  if (!site) return json({ code: 0, msg: '站点不存在' });

  try {
    const apiUrl = `${site.api}?ac=detail&ids=${ids}`;
    const data = await fetchJSON(apiUrl);
    if (data.code === 1 && data.list && data.list[0]) {
      const item = data.list[0];
      return json({ code: 1, data: {
        vod_id: item.vod_id, vod_name: item.vod_name || '',
        vod_pic: item.vod_pic || '', vod_remarks: item.vod_remarks || '',
        vod_year: item.vod_year || '', vod_area: item.vod_area || '',
        vod_actor: item.vod_actor || '', vod_director: item.vod_director || '',
        vod_content: (item.vod_content || '').replace(/<[^>]*>/g, '').substring(0, 500),
        type_name: item.type_name || '',
        play_urls: parsePlayUrls(item.vod_play_url)
      }});
    }
    return json({ code: 0, msg: '影片不存在' });
  } catch (err) {
    return json({ code: 0, msg: err.message });
  }
}

// 🔧 核心修复：TMDB 代理 — 修复 URL 编码问题
async function handleTMDBProxy(url, env) {
  const apiKey = env.TMDB_API_KEY || '';
  const tmdbPath = url.pathname.replace('/api/tmdb', '');

  // 手动构造 query string，避免 URLSearchParams 编码问题
  const rawQs = url.search.startsWith('?') ? url.search.substring(1) : url.search;
  const queryParams = [];
  if (rawQs) {
    for (const part of rawQs.split('&')) {
      const eq = part.indexOf('=');
      if (eq > 0) {
        const k = decodeURIComponent(part.substring(0, eq));
        const v = decodeURIComponent(part.substring(eq + 1));
        if (k !== 'pwd') queryParams.push(k + '=' + encodeURIComponent(v));
      }
    }
  }

  let targetUrl;
  if (tmdbPath.startsWith('/image/')) {
    targetUrl = TMDB_IMG_BASE + tmdbPath;
  } else {
    if (!apiKey) {
      return json({ success: false, status_message: 'TMDB API Key 未配置，请在 Cloudflare Dashboard 设置环境变量 TMDB_API_KEY' });
    }
    queryParams.push('api_key=' + apiKey);
    targetUrl = TMDB_API_BASE + tmdbPath + '?' + queryParams.join('&');
  }

  try {
    const res = await fetch(targetUrl, {
      headers: { 'User-Agent': 'LeonTV/3.4' }
    });
    const contentType = res.headers.get('Content-Type') || '';

    if (contentType.includes('image/')) {
      return new Response(res.body, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=604800',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    if (!res.ok) {
      const text = await res.text();
      return json({ success: false, status_code: res.status, status_message: text.substring(0, 200) });
    }

    const data = await res.json();
    return json(data);
  } catch (e) {
    return json({ success: false, status_message: '代理请求失败: ' + e.message });
  }
}

// ==================== 主入口 ====================
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  // TV手机输入中继跳过认证
  if (path !== '/api/tv/relay' && !checkAuth(request, env)) {
    return json({ code: -1, msg: '未授权访问，请先登录' }, 401);
  }

  try {
    if (path === '/api/fetch' && request.method === 'GET') {
      return handleAPIFetch(url);
    }
    if (path === '/api/sites' && request.method === 'GET') {
      return handleSitesList();
    }
    if (path === '/api/sites/load' && request.method === 'POST') {
      return handleSitesLoad(request);
    }
    // 🔧 支持 GET + POST 搜索
    if (path === '/api/search' && (request.method === 'GET' || request.method === 'POST')) {
      return handleSearch(url, request);
    }
    if (path === '/api/detail' && request.method === 'GET') {
      return handleDetail(url);
    }
    // TV手机输入中转
    if (path === '/api/tv/relay') {
      if (request.method === 'POST') {
        try {
          var b = await request.json();
          if (b.key && b.q) { tvRelay.set(String(b.key), String(b.q)); return json({ code: 1 }); }
        } catch (e) {}
        return json({ code: 0 }, 400);
      }
      var key = url.searchParams.get('key');
      var val = key ? tvRelay.get(key) : null;
      if (val) { tvRelay.delete(key); return json({ code: 1, q: val }); }
      return json({ code: 0 });
    }
    if (path.startsWith('/api/tmdb/') && request.method === 'GET') {
      return handleTMDBProxy(url, env);
    }
    return json({ code: 0, msg: '未知API路径' }, 404);
  } catch (err) {
    return json({ code: 0, msg: '服务器错误: ' + err.message }, 500);
  }
}
