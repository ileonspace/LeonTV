# 贡献指南 / Contributing

欢迎贡献！无论是报告 Bug、提出建议还是提交代码，都非常感谢。

## 报告问题

请通过 [GitHub Issues](../../issues) 提交，并包含：

- 问题描述
- 复现步骤
- 预期行为 vs 实际行为
- 截图（如有）
- 运行环境（浏览器、操作系统）

## 提交代码

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/your-feature`
3. 提交变更：`git commit -m "feat: add your feature"`
4. 推送到分支：`git push origin feature/your-feature`
5. 提交 Pull Request

### 提交规范

使用 [约定式提交](https://www.conventionalcommits.org/zh-hans/)：

- `feat:` 新功能
- `fix:` 修复 Bug
- `docs:` 文档
- `style:` 格式调整
- `refactor:` 重构
- `perf:` 性能优化
- `test:` 测试
- `chore:` 构建/工具

### 安全

- **绝不要**在代码中包含明文密码、API 密钥或个人信息
- 所有认证信息使用 Cloudflare 环境变量
- 提交前检查 `grep -rn "YOUR_PASSWORD" index.html` 确保无遗漏

## 行为准则

- 尊重他人
- 建设性讨论
- 保持专业

---

> 本项目为技术学习目的，请勿用于侵权或商业用途。
