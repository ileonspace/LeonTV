# 安全策略 / Security Policy

## 报告漏洞

如果发现安全漏洞，请**不要**提交公开 Issue。

请通过 GitHub 的 [私密漏洞报告](https://github.com/ileonspace/LeonTV/security/advisories/new) 提交，我们将尽快响应。

## 安全实践

本项目遵循以下安全原则：

- ✅ 所有认证信息通过 Cloudflare 环境变量管理
- ✅ 公开代码中不含明文密码、API 密钥或个人数据
- ✅ 服务端验证（非客户端）确保 API 安全
- ✅ 对用户输入进行转义防止 XSS
- ✅ `/api/fetch` 端点限制仅获取 JSON 配置

## 部署安全

部署前请确保：

1. 设置 `LOGIN_PASSWORD` 环境变量
2. 使用随机生成的复杂密码
3. TMDB Worker 设置 `PASSWORD` 环境变量
4. 不在公开仓库中包含 `sites.json`

## 已支持的版本

| 版本 | 支持状态 |
|------|---------|
| v1.0 | ✅ 活跃支持 |

---

> 本项目为技术学习目的，请勿用于侵权或商业用途。
