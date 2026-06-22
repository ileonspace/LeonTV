// LeonTV Vercel: /api/search 搜索API
const { handleSearch, setSites, normalizeSites } = require('../_core.js');

let _sites = [];

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  try {
    let keyword, searchSites = _sites;
    if (req.method === 'POST') {
      const body = req.body;
      keyword = (body.wd || '').trim();
      if (body.sites && Array.isArray(body.sites)) {
        searchSites = body.sites.filter(s => s.api).map(s => ({ key: s.key || s.api.replace(/https?:\/\//, '').replace(/\/.*/, ''), name: s.name || '未命名', api: s.api }));
      }
    } else {
      keyword = (req.query.wd || '').trim();
    }

    const response = await handleSearch({ keyword, sites: searchSites, getEnv: k => process.env[k] });
    const contentType = response.headers.get('Content-Type');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');

    if (contentType.includes('ndjson')) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value));
      }
      res.end();
    } else {
      const data = await response.json();
      res.status(response.status).json(data);
    }
  } catch (e) {
    res.status(500).json({ code: 0, msg: e.message });
  }
}
