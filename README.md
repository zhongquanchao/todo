<div align="center">

<img src="docs/images/banner.svg" alt="TODO · 悬浮待办" width="100%" />

# TODO · 悬浮待办

**常驻桌面、始终置顶的悬浮待办应用，macOS / Windows 通用。**

数据纯本地存储，不联网、无广告、无登录。

</div>

---

## 简介

TODO 以悬浮球形态常驻桌面，用于快速记录和查看待办。所有数据保存在本机 `localStorage`，不上传、不依赖网络。

<div align="center">
<img src="docs/images/widget.svg" alt="界面预览" width="330" />
</div>

## 功能

### 视图与组织

- 四种视图：收件箱、今天、未来三天、项目，分别统计未完成数量
- 项目支持新建、切换、归档、删除；项目内待办全部完成后自动归档，出现新未完成时自动恢复

### 快速录入

- 自然语言解析：输入「明天 15:00 提交方案」自动识别日期与时间；「大赛发榜 #创意大赛」自动归入对应项目
- 全局快捷键唤起并聚焦输入框：macOS `⌘⇧Space` / Windows `Ctrl+Shift+Space`

### 待办管理

- 完成、删除（二次确认）、编辑标题 / 描述 / 项目 / 进行中 / 跟进日期
- 可选提醒时间，到点发送系统通知

### 窗口

- 悬浮球：收起后以玻璃球形态常驻，显示当前视图未完成数；可拖至任意显示器，点击球体从当前位置锚点展开
- 始终置顶、半透明（透明度可调）、深浅主题、边缘缩放、尺寸预设
- 托盘 / 菜单栏常驻，支持鼠标穿透、显示 / 隐藏、退出

### 数据

- 一键导出 / 导入 JSON 备份
- 开机自启（可在设置中开关）

## 安装

从 [Releases](../../releases) 下载对应平台安装包：

| 平台 | 安装包 | 适用 |
|------|--------|------|
| macOS (Apple Silicon) | `TODO_1.0.2_aarch64.dmg` | M 系列芯片 |
| macOS (Intel) | `TODO_1.0.2_x64.dmg` | Intel 芯片 |
| Windows | `TODO_1.0.2_x64-setup.exe` | Windows 10/11 64 位 |

### 首次运行被系统拦截

应用未签名（未购买代码签名证书），首次运行可能被系统安全机制拦截。

macOS（提示「已损坏」或「无法验证开发者」）：
- 右键点击「应用程序」中的 TODO → 打开 → 再次点击「打开」；或
- 在终端执行：

  ```bash
  sudo xattr -dr com.apple.quarantine "/Applications/TODO.app"
  ```

Windows（SmartScreen 提示）：
- 点击「更多信息」→「仍要运行」。

### 从旧版「悬浮待办」升级

新版应用名为 `TODO.app`，与旧版「悬浮待办.app」内部标识一致，数据自动共享，旧待办无损保留。安装新版并确认数据完整后，可手动删除旧版。

## 构建

```bash
# 环境要求：Node.js 22.22+（推荐 24.x）、Rust
git clone https://github.com/zhongquanchao/todo.git
cd todo
npm install
npm run dev      # 开发模式（热重载）
npm run build    # 构建当前平台安装包
```

发布安装包由 GitHub Actions 在推送 `v*` tag 时自动构建（macOS aarch64/x64 + Windows），配置见 [`.github/workflows/release.yml`](.github/workflows/release.yml)。

## 技术栈

- 框架：[Tauri 2](https://tauri.app)（Rust 后端 + 系统 WebView 前端）
- 前端：原生 HTML / CSS / JavaScript
- 存储：本地 `localStorage`
- 测试：`tests/` 下 Node 单元测试，覆盖时间 / 项目解析、视图计数、数据迁移、展开定位等核心逻辑

```
todo/
├─ src/                  # 前端
├─ src-tauri/            # Rust 后端与打包配置
├─ tests/                # 单元测试
├─ .github/workflows/    # 跨平台自动构建
└─ legacy-macos-swift/   # 早期 macOS 原生 Swift 版（存档）
```

## 贡献

欢迎提交 issue 和 pull request，详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

- Bug 报告与功能建议：在 [Issues](../../issues) 提交
- 代码贡献：Fork 后提交 pull request，合并前需维护者 review 通过

## 许可证

[MIT](LICENSE) © 2026 钟全超 (zhongquanchao)
