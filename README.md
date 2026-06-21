# LeonTV

多源影视搜索聚合 — JSON 配置驱动，NDJSON 流式返回结果。

![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Cloudflare%20Pages-orange)

> ⚠️ **重要声明**  
> 本项目为**技术学习项目**，不存储任何影视内容，搜索结果来自第三方公开API。  
> 使用者须遵守当地法律法规，**开发者不承担任何责任**。  
> 详见 **[DISCLAIMER.md](DISCLAIMER.md)**（中英双语免责声明）

## 功能特性

- 🔍 **多源聚合搜索**，NDJSON 流式推送，首结果秒出
- 🎬 **剧集去重 + 多线路自动切换**（高清优先，失败降级）
- 📺 **11个预设分类**：热门电影、正在播出、高分神作、动作、喜剧、科幻、恐怖、纪录片、漫威、DC、星球大战等
- ⭐ **TMDB 评分/海报/简介**自动补全
- 🌙 **暗色主题 + 影院模式**
- 📱 **移动端完美适配**
- 🧩 **宽泛JSON导入**：支持多种站点配置格式，自动识别
- 📼 **观影记录**：自动保存进度，点击续播
- ⚡ **超时优化**：6秒快速失败，不卡搜索

## 快速开始

### 方式 A：GitHub + Cloudflare Pages（推荐）

#### 1. Fork 本仓库

点击右上角 **Fork** → 创建你自己的副本

#### 2. 连接 Cloudflare Pages

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Workers & Pages → Pages → **连接到 Git**
3. 授权并选择你 Fork 的仓库
4. 构建设置：

| 设置 | 值 |
|------|-----|
| 框架预设 | **None** |
| 构建命令 | 留空 |
| 输出目录 | 留空 |

5. 点击 **保存并部署** — 首次部署约 1-2 分钟

以后每次 `git push`，Cloudflare 自动构建部署。

---

### 方式 B：直接部署（无需 GitHub）

#### 1. 克隆仓库

```bash
git clone https://github.com/你的用户名/leontv.git
cd leontv
```

#### 2. 安装 Wrangler

```bash
npm install -g wrangler

# 登录 Cloudflare 账号
wrangler login
```

#### 3. 创建 Pages 项目

```bash
wrangler pages project create leontv
```

#### 4. 部署

```bash
# 同步文件
cp public/index.html index.html

# 部署到 Cloudflare Pages
wrangler pages deploy . --project-name=leontv --commit-dirty=true

# 或使用 npm 脚本
npm run deploy
```

以后每次修改代码后，重复步骤 4 即可。

---

### 3. 导入站点配置

部署完成后打开你的 Pages 域名（`https://xxx.pages.dev`）：

1. 页面提示输入密码，默认密码：**`digital`**
2. 点击右上角 ⚡ → 输入站点 JSON 地址或粘贴配置
3. 支持格式：JSON 数组、域名 Key 对象、YAML、纯 URL 列表

站点配置 JSON 格式示例：
```json
[{"name":"示例站点","api":"https://example.com/api.php/provide/vod"}]
```

或包含更多字段：
```json
{"example.com":{"name":"示例资源","api":"https://example.com/api.php/provide/vod"}}
```

> 导入支持 JSON 数组、域名 Key 对象、YAML、纯 URL 列表等多种格式

### 4. （可选）部署 TMDB Worker

分类浏览和海报功能需要 TMDB API。部署 `tmdb-worker.js`：

```bash
# 1. 获取 TMDB API Key
#    https://www.themoviedb.org/settings/api （免费注册）

# 2. 部署 Worker
wrangler deploy tmdb-worker.js

# 3. 配置环境变量
#    Cloudflare Dashboard → Workers → tmdb → Settings → Variables
#    TMDB_API_KEY = 你的Key

# 4. 修改 index.html 中的 TMDB 地址指向你的 Worker
#    搜索 var TMDB = 'https://your-tmdb-worker.workers.dev' 并替换
```

如果暂时不配 TMDB，搜索和播放功能不受影响，只是没有评分和分类浏览。

## 本地开发

```bash
# 安装依赖
npm install

# 启动本地服务器
npm start
# → http://localhost:3000
```

> 注意：本地开发修改 `public/index.html`，部署前执行 `cp public/index.html index.html`

## 自定义域名

Cloudflare Dashboard → Pages → 你的项目 → **自定义域** → 添加你的域名

## 项目结构

```
├── index.html                 # 前端主文件（部署入口）
├── functions/
│   └── api/
│       └── [[path]].js        # 搜索 API
├── server.js                  # 本地开发服务器
├── tmdb-worker.js             # TMDB API 代理（可选）
├── package.json
├── wrangler.toml
├── LICENSE
└── README.md
```

## 技术栈

- 前端: Vanilla JS, ReadableStream, HLS.js
- 后端: Cloudflare Functions / Node.js + Express
- 数据: JSON 配置文件（用户自行导入） + TMDB

## 安全说明

> ⚠️ 部署前请务必修改默认设置

| 位置 | 需要修改 | 说明 |
|------|---------|------|
| `index.html` 登录密码 | `digital` → 你的密码 | 搜索 `if(v==='digital')` |
| `functions/api/[[path]].js` | `digital` → 你的密码 | 第6行 `AUTH_PWD` |
| `tmdb-worker.js` | 修改代码中的 `digital` | 第15行回退值 |
| TMDB 请求密码 | `?pwd=digital` → 你的密码 | index.html 第~900行 |

> 密码通过 URL 查询参数传输，建议仅在内网或可信环境使用。

## 常见问题

**Q: 搜索没结果？**
A: 检查是否已导入站点配置（右上角 ⚡），确认站点 JSON 包含可用的 `api` 字段。

**Q: 分类页空白？**
A: 需要部署 TMDB Worker 并配置 API Key。

**Q: 如何修改默认密码？**
A: 搜索 `digital` 在 `index.html` 中替换为你的密码。

**Q: 如何增加/修改站点？**
A: 准备新的站点 JSON，通过设置面板 URL 或粘贴导入，自动保存到浏览器。

## 免责声明

> ⚠️ **请先阅读 [DISCLAIMER.md](DISCLAIMER.md)（完整中英双语免责声明）**

本项目为 MIT 协议开源的技术学习项目：
- **不存储**任何影视资源文件
- **不提供**下载、破解、付费内容绕过功能  
- 所有内容来自使用者自行导入的**第三方 API 接口**
- 开发者**不承担**任何使用者行为导致的法律责任
- 请遵守当地法律法规，**24小时内删除**相关数据

## License

MIT — 详见 [LICENSE](LICENSE)

