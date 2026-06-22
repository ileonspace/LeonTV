// LeonTV Netlify: /api/* 统一入口
const { handleSearch, handleDetail, handleTMDBProxy, getSites, setSites, normalizeSites } = require('../../_core.js');

exports.handler = async (event, context) => {
  const path = event.path;
  const method = event.httpMethod;
  const getEnv = k => process.env[k];

  if (method === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }

  try {
    // /api/search
    if (path === '/api/search') {
      let keyword, searchSites = getSites();
      if (method === 'POST') {
        const body = JSON.parse(event.body || '{}');
        keyword = (body.wd || '').trim();
        if (body.sites && Array.isArray(body.sites)) {
          searchSites = body.sites.filter(s => s.api).map(s => ({ key: s.key || s.api.replace(/https?:\/\//, '').replace(/\/.*/, ''), name: s.name || '未命名', api: s.api }));
        }
      } else {
        keyword = (event.queryStringParameters?.wd || '').trim();
      }
      const response = await handleSearch({ keyword, sites: searchSites, getEnv });
      const body = await response.text();
      return { statusCode: response.status, headers: { 'Content-Type': 'application/x-ndjson', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' }, body };
    }

    // /api/sites
    if (path === '/api/sites' && method === 'GET') {
      const sites = getSites();
      return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code: 1, total: sites.length, data: sites.map(s => ({ key: s.key, name: s.name, api: s.api })) }) };
    }

    // /api/sites/load
    if (path === '/api/sites/load' && method === 'POST') {
      const { url, json: jsonData } = JSON.parse(event.body || '{}');
      let rawData;
      if (url) { const resp = await fetch(url, { headers: { 'User-Agent': 'LeonTV/4.5' } }); rawData = await resp.json(); }
      else if (jsonData) { rawData = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData; }
      else { return { statusCode: 400, body: JSON.stringify({ code: 0, msg: '请提供 url 或 json 参数' }) }; }
      const sites = normalizeSites(rawData);
      setSites(sites);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code: 1, msg: `成功加载 ${sites.length} 个站点`, total: sites.length, data: sites.map(s => ({ key: s.key, name: s.name })) }) };
    }

    // /api/fetch
    if (path === '/api/fetch' && method === 'GET') {
      const targetUrl = event.queryStringParameters?.url;
      if (!targetUrl) return { statusCode: 400, body: JSON.stringify({ code: 0, msg: '缺少url参数' }) };
      const resp = await fetch(targetUrl, { headers: { 'User-Agent': 'LeonTV/4.5' } });
      const text = await resp.text();
      return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ code: 1, data: text }) };
    }

    // /api/detail
    if (path === '/api/detail' && method === 'GET') {
      const key = event.queryStringParameters?.key;
      const ids = event.queryStringParameters?.ids;
      if (!key || !ids) return { statusCode: 400, body: JSON.stringify({ code: 0, msg: '缺少参数' }) };
      const response = await handleDetail({ key, ids, sites: getSites(), getEnv });
      const data = await response.json();
      return { statusCode: response.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(data) };
    }

    // /api/tmdb/*
    if (path.startsWith('/api/tmdb/') && method === 'GET') {
      const queryParams = [];
      const rawQs = event.rawQuery || '';
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
      const response = await handleTMDBProxy({ path, queryParams, getEnv });
      if (response.headers.get('Content-Type')?.includes('image/')) {
        const buf = await response.arrayBuffer();
        return { statusCode: 200, headers: { 'Content-Type': response.headers.get('Content-Type'), 'Cache-Control': 'public, max-age=604800', 'Access-Control-Allow-Origin': '*' }, body: Buffer.from(buf).toString('base64'), isBase64Encoded: true };
      }
      const data = await response.json();
      return { statusCode: response.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(data) };
    }

    return { statusCode: 404, body: JSON.stringify({ code: 0, msg: '未知API路径' }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ code: 0, msg: '服务器错误: ' + err.message }) };
  }
};
