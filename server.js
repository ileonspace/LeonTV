// LeonTV v1.0 — 本地开发服务器 | 
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

// URL文本代理（仅用于获取站点JSON配置，防止开放代理滥用）
app.get('/api/fetch', async (req, res) => {
  const url = req.query.url;
  if(!url) return res.json({ code: 0, msg: '缺少url参数' });
  // 安全限制：只允许获取 JSON 配置（必须包含 api 或 sites 特征）
  if(!url.match(/\.json|api\.php|provide\/vod|tvbox|api_site/i)){
    return res.json({ code: 0, msg: '仅支持获取站点JSON配置文件' });
  }
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

    // 提取站点数组
    let siteList = [];
    if (Array.isArray(rawData)) {
      siteList = rawData;
    } else if (rawData.sites && Array.isArray(rawData.sites)) {
      siteList = rawData.sites;
    } else {
      return res.json({ code: 0, msg: 'JSON格式无效：需要站点数组或包含sites字段' });
    }

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
