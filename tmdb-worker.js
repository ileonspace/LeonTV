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

    // ===== 判断请求类型 =====
    const pathname = url.pathname;

    // 图片请求 → image.tmdb.org
    if (pathname.startsWith('/image/')) {
      const imageUrl = 'https://image.tmdb.org' + pathname;
      return fetch(imageUrl, { cf: { cacheTtl: 86400 } }); // 缓存24小时
    }

    // API 请求 → api.themoviedb.org/3
    const apiUrl = 'https://api.themoviedb.org/3' + pathname + url.search;
    const apiKey = env.TMDB_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'TMDB_API_KEY not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    // 透传响应
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Cache-Control': 'public, max-age=300'
    };

    return new Response(response.body, {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};
