# LeonTV

多源影视搜索聚合 — JSON 配置驱动，NDJSON 流式返回，一键部署

[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Pages-orange)](https://pages.cloudflare.com)
[![Vercel](https://img.shields.io/badge/Vercel-Deploy-black)](https://vercel.com)
[![Netlify](https://img.shields.io/badge/Netlify-Deploy-blue)](https://netlify.com)

> ⚠️ **重要声明**：本项目为技术学习项目，不存储任何影视内容，搜索结果来自第三方公开 API。

---

## 🚀 一键部署

| 平台 | 按钮 | 费用 |
|------|------|------|
| **Cloudflare Pages** | `wrangler pages deploy` | 免费 ✅ |
| **Vercel** | 关联 GitHub 即部署 | 免费 ✅ |
| **Netlify** | 关联 GitHub 即部署 | 免费 ✅ |

---

## ☁️ Cloudflare Pages（推荐）

当前线上部署方案，全球 330+ 节点 CDN。

```bash
npm install -g wrangler
wrangler login
wrangler pages deploy . --project-name=leontv
```

**环境变量**（Dashboard → Settings → Environment variables）：

| 变量 | 说明 | 必填 |
|------|------|:--:|
| `LOGIN_PASSWORD` | 页面访问密码 | ✅ |
| `TMDB_API_KEY` | TMDB API Key（海报/评分） | 可选 |

**关键文件**：
- `index.html` — 完整前端
- `functions/api/[[path]].js` — Cloudflare Functions 搜索 API
- `_routes.json` — API 路由规则

---

## ▲ Vercel

关联 GitHub 仓库，推送代码自动部署。

**关键文件**：
- `index.html` — 前端
- `api/search.js` — 搜索 API
- `api/sites.js` — 站点管理（GET + POST）
- `api/fetch.js` — URL 代理获取
- `vercel.json` — 路由 + CORS 配置

**环境变量**（Dashboard → Settings → Environment Variables）：

| 变量 | 说明 |
|------|------|
| `LOGIN_PASSWORD` | 访问密码 |
| `TMDB_API_KEY` | TMDB API Key（可选） |

---

## 🔷 Netlify

关联 GitHub 仓库，推送代码自动部署。

**关键文件**：
- `index.html` — 前端
- `netlify/functions/api.js` — 统一 API 入口
- `netlify.toml` — 路由 + CORS + 构建配置

**环境变量**（Dashboard → Site settings → Environment variables）：

| 变量 | 说明 |
|------|------|
| `LOGIN_PASSWORD` | 访问密码 |
| `TMDB_API_KEY` | TMDB API Key（可选） |

---

## 📦 项目结构

```
LeonTV/
├── index.html                       # 完整前端 (HTML+CSS+JS)
├── _core.js                         # 搜索核心逻辑（平台无关）
│
├── ☁️ Cloudflare
│   ├── functions/api/[[path]].js    # CF Functions 入口
│   └── _routes.json                 # CF 路由规则
│
├── ▲ Vercel
│   ├── api/search.js                # 搜索 API
│   ├── api/sites.js                 # 站点管理 API
│   ├── api/fetch.js                 # URL 代理
│   └── vercel.json                  # Vercel 配置
│
├── 🔷 Netlify
│   ├── netlify/functions/api.js     # 统一 API 入口
│   └── netlify.toml                 # Netlify 配置
│
├── public/index.html                # 本地开发副本
├── server.js                        # Node.js 本地开发服务器
├── package.json                     # 本地开发依赖
├── tmdb-worker.js                   # TMDB 代理 Worker（独立部署）
├── Dockerfile                       # Docker 部署
└── .gitignore
```

---

## 💻 本地开发

```bash
npm install
npm start                           # → http://localhost:3000
```

修改 `public/index.html` → 测试 → 同步到 `index.html`

---

## 📡 API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/search` | GET/POST | NDJSON 流式搜索 |
| `/api/sites` | GET | 获取站点列表 |
| `/api/sites/load` | POST | 加载站点配置 |
| `/api/fetch` | GET | 代理获取 JSON |
| `/api/detail` | GET | 获取影片详情 |
| `/api/tmdb/*` | GET | TMDB 代理 |

> 所有平台 API 路径一致，前端代码无需修改。

---

## 🔧 自定义

### 密码设置

Cloudflare：Dashboard 设置 `LOGIN_PASSWORD` 环境变量
Vercel/Netlify：同上，设置环境变量
本地开发：`server.js` 不启用认证

### 站点 JSON 格式

页面右上角 ⚡ → 粘贴 JSON URL → 加载。支持多种格式：

```json
[{"name":"站点名", "api":"https://..."}]
{"sites":[{"name":"站点名", "api":"https://..."}]}
{"api_site":{"domain":{"name":"站点名","api":"https://..."}}}
```

---

## 📄 License

MIT — 详见 [LICENSE](LICENSE)
