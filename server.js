// LeonTV v4.0 Golden — 本地开发服务器 | 2026-06-21 完美标准版
const express = require('express');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 解析 JSON body
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// ==================== 站点配置（启动时自动加载） ====================
let sites = [];

function loadSitesFromFile() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'sites.json'), 'utf8');
    const siteList = JSON.parse(raw);
    sites = siteList
      .filter(s => s.api && typeof s.api === 'string')
      .map(normalizeSite);
    console.log(`📡 自动加载 ${sites.length} 个站点`);
    return sites.length;
  } catch (e) {
    console.log('⚠️  未找到 sites.json，请手动导入站点');
    return 0;
  }
}
loadSitesFromFile();

// ==================== 静态文件服务 ====================
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
}));

app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== 工具函数 ====================
const SITE_TIMEOUT = 6000;

function normalizeSite(s) {
  // 保留 ?url= / ?format= 等关键参数，只去掉 ?ac=list 这种
  var cleanApi = s.api.replace(/[\?&]ac=list(?=&|$)/, '').replace(/[\?&]ac=detail(?=&|$)/, '');
  return {
    key: s.key || s.api.replace(/https?:\/\//, '').replace(/\/.*/, ''),
    name: s.name || s.key || '未命名站点',
    api: cleanApi
  };
}

function fetchJSON(apiUrl, timeout = SITE_TIMEOUT, _redirects = 0) {
  if(_redirects > 5) return Promise.reject(new Error('重定向过多'));
  return new Promise((resolve, reject) => {
    const urlObj = new URL(apiUrl);
    const client = urlObj.protocol === 'https:' ? https : http;

    const req = client.get(apiUrl, { timeout }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, apiUrl).href;
        fetchJSON(redirectUrl, timeout, _redirects + 1).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('JSON解析失败'));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('请求超时'));
    });
  });
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

// ==================== 搜索单站点（带计时） ====================
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
    return {
      site: site.name,
      key: site.key,
      results: [],
      total: 0,
      responseTime: Date.now() - startTime,
      error: err.message
    };
  }
}

// ==================== API 路由 ====================

// URL文本代理（绕过CORS，返回原始文本）
app.get('/api/fetch', async (req, res) => {
  const url = req.query.url;
  if(!url) return res.json({ code: 0, msg: '缺少url参数' });
  try{
    const text = await new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      client.get(url, {timeout:15000}, r => {
        if(r.statusCode >= 300 && r.statusCode < 400 && r.headers.location){
          const redir = new URL(r.headers.location, url).href;
          const c2 = redir.startsWith('https') ? https : http;
          c2.get(redir, {timeout:15000}, r2 => {
            let d=''; r2.on('data',c=>d+=c); r2.on('end',()=>resolve(d));
          }).on('error',reject);
          return;
        }
        let d=''; r.on('data',c=>d+=c); r.on('end',()=>resolve(d));
      }).on('error',reject);
    });
    res.json({ code: 1, data: text });
  }catch(e){
    res.json({ code: 0, msg: e.message });
  }
});

// 加载站点配置
app.post('/api/sites/load', async (req, res) => {
  const { url, json } = req.body;

  try {
    let rawData;

    if (url) {
      // 从 URL 获取 JSON
      const resp = await fetchJSON(url, 15000);
      rawData = resp;
    } else if (json) {
      // 直接解析 JSON
      if (typeof json === 'string') {
        rawData = JSON.parse(json);
      } else {
        rawData = json;
      }
    } else {
      return res.json({ code: 0, msg: '请提供 url 或 json 参数' });
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
    else { return res.json({ code: 0, msg: 'JSON格式无效：需要站点数组或包含sites字段' }); }

    // 验证并标准化
    sites = siteList
      .filter(s => s.api && typeof s.api === 'string')
      .map(normalizeSite);

    res.json({
      code: 1,
      msg: `成功加载 ${sites.length} 个站点`,
      total: sites.length,
      data: sites.map(s => ({ key: s.key, name: s.name }))
    });
  } catch (err) {
    res.json({ code: 0, msg: '加载失败: ' + err.message });
  }
});

// 获取站点列表
app.get('/api/sites', (req, res) => {
  res.json({
    code: 1,
    total: sites.length,
    data: sites.map(s => ({ key: s.key, name: s.name, api: s.api }))
  });
});

// 聚合搜索（NDJSON 流式推送，逐站点返回结果）— 支持 GET + POST
async function runSearch(keyword, searchSites, res) {
  const searchStart = Date.now();
  const total = searchSites.length;
  let completed = 0;

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const promises = searchSites.map(async (site) => {
    const result = await searchSite(site, keyword);
    completed++;
    res.write(JSON.stringify({ type: 'result', completed, total, data: result }) + '\n');
    return result;
  });

  const allResults = await Promise.all(promises);
  const successSites = allResults.filter(r => !r.error).length;
  const failSites = allResults.filter(r => r.error).length;
  const totalTime = Date.now() - searchStart;
  const totalMovies = allResults.reduce((sum, r) => sum + r.total, 0);

  res.write(JSON.stringify({
    type: 'done', completed: total, total,
    success: successSites, fail: failSites, totalTime, totalMovies
  }) + '\n');
  res.end();
}

app.get('/api/search', async (req, res) => {
  const keyword = (req.query.wd || '').trim();
  if (!keyword) return res.json({ code: 0, msg: '请输入搜索关键词', data: [] });
  if (sites.length === 0) return res.json({ code: 0, msg: '请先加载站点配置', data: [] });
  await runSearch(keyword, sites, res);
});

app.post('/api/search', async (req, res) => {
  const keyword = (req.body.wd || '').trim();
  if (!keyword) return res.json({ code: 0, msg: '请输入搜索关键词', data: [] });

  let searchSites = sites;
  if (req.body.sites && Array.isArray(req.body.sites)) {
    searchSites = req.body.sites
      .filter(s => s.api && typeof s.api === 'string')
      .map(normalizeSite);
  }
  if (searchSites.length === 0) return res.json({ code: 0, msg: '请先加载站点配置', data: [] });
  await runSearch(keyword, searchSites, res);
});

// 获取详情
app.get('/api/detail', async (req, res) => {
  const { key, ids } = req.query;
  if (!key || !ids) {
    return res.json({ code: 0, msg: '缺少参数' });
  }

  const site = sites.find(s => s.key === key);
  if (!site) {
    return res.json({ code: 0, msg: '站点不存在' });
  }

  try {
    const apiUrl = `${site.api}?ac=detail&ids=${ids}`;
    const data = await fetchJSON(apiUrl);

    if (data.code === 1 && data.list && data.list[0]) {
      const item = data.list[0];
      res.json({
        code: 1,
        data: {
          vod_id: item.vod_id,
          vod_name: item.vod_name || '',
          vod_pic: item.vod_pic || '',
          vod_remarks: item.vod_remarks || '',
          vod_year: item.vod_year || '',
          vod_area: item.vod_area || '',
          vod_actor: item.vod_actor || '',
          vod_director: item.vod_director || '',
          vod_content: (item.vod_content || '').replace(/<[^>]*>/g, '').substring(0, 500),
          type_name: item.type_name || '',
          play_urls: parsePlayUrls(item.vod_play_url)
        }
      });
    } else {
      res.json({ code: 0, msg: '影片不存在' });
    }
  } catch (err) {
    res.json({ code: 0, msg: err.message });
  }
});

// ==================== TV 版（服务端渲染，适配机顶盒） ====================
app.get('/tv', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(renderTVPage('', '', [], sites.length));
});

app.post('/tv', async (req, res) => {
  const keyword = (req.body.wd || '').trim();
  if (!keyword) return res.redirect('/tv');

  const startTime = Date.now();
  const promises = sites.map(s => searchSite(s, keyword));
  const all = await Promise.all(promises);
  const success = all.filter(r => !r.error).length;
  const fail = all.filter(r => r.error).length;
  const totalTime = Date.now() - startTime;

  // 合并结果
  const map = new Map();
  all.forEach(src => {
    if (!src.results) return;
    src.results.forEach(m => {
      const k = (m.vod_name||'').replace(/\s+/g,'').toLowerCase();
      if (!map.has(k)) map.set(k, { vod_name: m.vod_name, vod_pic: m.vod_pic, vod_year: m.vod_year, vod_remarks: m.vod_remarks, play_urls: [] });
      if (m.play_urls) map.get(k).play_urls.push(...m.play_urls);
    });
  });

  const movies = Array.from(map.values());
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(renderTVPage(keyword,
    `${success}站点成功 ${fail}失败 ${totalTime}ms ${movies.length}部`,
    movies, sites.length));
});

function renderTVPage(kw, status, movies, total) {
  const h = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LeonTV</title><style>
*{margin:0;padding:0}body{background:#0a0a0f;color:#e0e0e0;font-family:Arial,sans-serif;margin:0;padding:12px}
.top{background:#111;padding:14px;border-radius:6px;margin-bottom:14px}
.logo{font-size:24px;font-weight:bold;color:#FF8C00}
.logo span{color:#0066CC}
form{margin-top:10px}
input{width:70%;padding:10px;font-size:16px;border:1px solid #333;border-radius:4px;background:#1a1a2e;color:#fff}
button{padding:10px 20px;font-size:16px;background:#0066CC;color:#fff;border:none;border-radius:4px;margin-left:6px;cursor:pointer}
.status{color:#888;font-size:13px;margin-top:8px}
.card{background:#111;border-radius:6px;padding:12px;margin-bottom:10px}
.title{font-size:18px;font-weight:bold;color:#fff;margin-bottom:4px}
.meta{font-size:13px;color:#888;margin-bottom:6px}
.ep-row{display:block;margin-top:6px}
.ep-btn{display:inline-block;padding:8px 14px;margin:3px;background:#1a1a2e;color:#ccc;text-decoration:none;border-radius:4px;font-size:14px;border:1px solid #333}
.ep-btn:hover,.ep-btn:focus{background:#0066CC;color:#fff;outline:none}
.empty{padding:60px;text-align:center;color:#555;font-size:16px}
.bottom{text-align:center;color:#444;font-size:11px;padding:20px;margin-top:20px}
</style></head><body><div class="top">
<div class="logo">📺 Leon<span>TV</span> · ${total}个源</div>
<form method="post" action="/tv"><input name="wd" value="${h(kw)}" placeholder="输入影片名..." autofocus><button>搜索</button></form>
<div class="status">${h(status)}</div></div>`;

  if (movies.length === 0) html += `<div class="empty">🔍 输入影片名开始搜索</div>`;
  else movies.forEach(m => {
    html += `<div class="card"><div class="title">${h(m.vod_name)}</div>`;
    if (m.vod_year || m.vod_remarks) html += `<div class="meta">${h(m.vod_year||'')} ${h(m.vod_remarks||'')}</div>`;
    html += `<div class="ep-row">`;
    const seen = new Set();
    (m.play_urls||[]).forEach(p => {
      if (!p.url || seen.has(p.label)) return;
      seen.add(p.label);
      html += `<a class="ep-btn" href="${h(p.url)}">${h(p.label||'播放')}</a>`;
    });
    html += `</div></div>`;
  });

  html += `<div class="bottom">数据来源于公开API接口，仅供技术学习 · LeonTV</div></body></html>`;
  return html;
}

// ==================== 启动服务器 ====================
function startServer(port) {
  const srv = app.listen(port, () => {
    console.log(`🎬 多源电影搜索已启动: http://localhost:${port}`);
    console.log(`📡 当前已加载 ${sites.length} 个站点`);
    console.log(`⚙️  加载站点: POST /api/sites/load`);
    console.log(`🔍 搜索API: GET /api/search?wd=关键词`);
  });

  srv.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️  端口 ${port} 被占用，尝试 ${port + 1}...`);
      srv.close();
      startServer(port + 1);
    } else {
      throw err;
    }
  });
}

startServer(PORT);
