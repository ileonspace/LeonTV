// LeonTV Vercel: /api/sites 站点管理
const { getSites, setSites, normalizeSites, json } = require('../_core.js');

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    const sites = getSites();
    return res.json({ code: 1, total: sites.length, data: sites.map(s => ({ key: s.key, name: s.name, api: s.api })) });
  }

  if (req.method === 'POST') {
    try {
      const { url, json: jsonData } = req.body;
      let rawData;
      if (url) {
        const resp = await fetch(url, { headers: { 'User-Agent': 'LeonTV/4.5' } });
        rawData = await resp.json();
      } else if (jsonData) {
        rawData = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      } else {
        return res.json({ code: 0, msg: '请提供 url 或 json 参数' });
      }
      const sites = normalizeSites(rawData);
      setSites(sites);
      return res.json({ code: 1, msg: `成功加载 ${sites.length} 个站点`, total: sites.length, data: sites.map(s => ({ key: s.key, name: s.name })) });
    } catch (err) {
      return res.json({ code: 0, msg: '加载失败: ' + err.message });
    }
  }

  res.status(405).json({ code: 0, msg: 'Method not allowed' });
}
