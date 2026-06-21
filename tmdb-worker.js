// TMDB API 代理 Worker
// 部署域名: your-tmdb-worker.workers.dev
// 部署命令: wrangler deploy
//
// 环境变量（Cloudflare Dashboard → Workers → tmdb → Settings → Variables）:
//   TMDB_API_KEY = 你的 TMDB API Key (从 https://www.themoviedb.org/settings/api 获取)
//   PASSWORD     = digital

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ===== 密码验证 =====
    const pwd = url.searchParams.get('pwd');
    if (pwd !== (env.PASSWORD || 'digital')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    url.searchParams.delete('pwd');

    const pathname = url.pathname;

    // ===== 图片代理（解决中国区 TMDB 图片无法访问） =====
    if (pathname.startsWith('/image/')) {
      const imageUrl = 'https://image.tmdb.org' + pathname;
      try {
        const imageResp = await fetch(imageUrl, {
          headers: { 'User-Agent': 'LeonTV/1.0' }
        });
        if (!imageResp.ok) {
          return new Response(null, { status: imageResp.status });
        }

        // 流式转发图片，保留原始Content-Type，添加长缓存
        const headers = new Headers();
        const contentType = imageResp.headers.get('Content-Type') || 'image/jpeg';
        headers.set('Content-Type', contentType);
        headers.set('Cache-Control', 'public, max-age=604800, immutable');
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('CDN-Cache-Control', 'public, max-age=2592000');

        return new Response(imageResp.body, {
          status: 200,
          headers
        });
      } catch (e) {
        return new Response(null, { status: 502 });
      }
    }

    // ===== API 请求 → api.themoviedb.org/3 =====
    const apiUrl = 'https://api.themoviedb.org/3' + pathname + url.search;
    const apiKey = env.TMDB_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'TMDB_API_KEY not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
          'User-Agent': 'LeonTV/1.0'
        }
      });

      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'public, max-age=300'
      };

      return new Response(response.body, {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Upstream unavailable' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
