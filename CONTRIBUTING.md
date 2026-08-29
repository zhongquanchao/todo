# 贡献指南

欢迎提交 issue 和 pull request。

## 提交 Issue

- Bug 报告：选择「Bug 报告」模板，尽量提供复现步骤、平台和版本信息
- 功能建议：选择「功能建议」模板，说明使用场景

## 提交 Pull Request

1. Fork 本仓库
2. 基于 `main` 创建分支：`git checkout -b feature/xxx`
3. 提交修改，确保 `npm test` 通过
4. 推送分支并创建 Pull Request

合并前需要维护者 review 通过（分支保护要求至少 1 个 approve）。

## 本地开发

```bash
# 环境要求：Node.js 22.22+（推荐 24.x）、Rust
npm install
npm run dev      # 开发模式（热重载）
npm test         # 运行单元测试
npm run build    # 构建当前平台安装包
```

## 代码结构

```
todo/
├─ src/                  # 前端（core.js 为纯逻辑，可单测）
├─ src-tauri/            # Rust 后端与打包配置
├─ tests/                # 单元测试
└─ .github/workflows/    # 跨平台自动构建
```
