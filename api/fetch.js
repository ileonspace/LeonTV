// LeonTV Vercel: /api/fetch URL代理
export default async function handler(req, res) {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.json({ code: 0, msg: '缺少url参数' });
  try {
    const resp = await fetch(targetUrl, { headers: { 'User-Agent': 'LeonTV/4.5' } });
    const text = await resp.text();
    res.json({ code: 1, data: text });
  } catch (e) {
    res.json({ code: 0, msg: e.message });
  }
}
