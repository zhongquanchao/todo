<div align="center">

<img src="docs/images/banner.svg" alt="TODO · 悬浮待办" width="100%" />

# TODO · 悬浮待办

**常驻桌面、毛玻璃质感、始终置顶的悬浮待办应用**

macOS / Windows 通用 · 纯本地 · 不联网 · 无广告 · 无登录

</div>

---

## 这是什么

一个永远飘在桌面上、半透明、不打扰的小浮窗待办。写文档、开会、敲代码时，它静静停在角落，一眼看到接下来要做什么。所有数据只存在你自己的电脑里，不联网、不登录、不收集任何信息。

<div align="center">
<img src="docs/images/widget.svg" alt="界面预览" width="330" />
</div>

## 核心功能

- 🗂️ **四视图**：收件箱（无日期）/ 今天 / 未来三天（明天·后天·大后天）/ 项目，各自显示未完成数量。
- 🗣️ **自然语言输入**：直接输入「明天 15:00 提交方案」自动识别日期时间；「大赛发榜 #创意大赛」自动归入「创意大赛」项目。
- 🏷️ **项目**：新建 / 切换 / 归档 / 删除（删除时待办移回收件箱，不丢数据）；项目内待办全部完成自动归档，出现新未完成自动恢复。
- 🫧 **悬浮球**：点标题栏「－」收起为玻璃水滴小球，显示当前视图未完成数；可拖到任意显示器（含不同 DPI），点小球从其当前位置锚点展开面板。
- ✅ **工作流**：完成 / 删除（二次确认防误触）/ 编辑标题、描述、项目、进行中、跟进日期。
- ⌨️ **全局快捷键**：任意应用里按 `⌘⇧Space`（Windows 为 `Ctrl+Shift+Space`）唤起并聚焦输入框，打字回车继续手头的事。
- ⏰ **提醒**：可选时间 + 系统通知，到点提醒。
- 🎨 **外观**：始终置顶、半透明（透明度可调）、深浅主题、边缘缩放、尺寸预设一键调整。
- 🧭 **托盘 / 菜单栏**：不占任务栏 / 程序坞；可切换鼠标穿透、显示 / 隐藏、退出。
- 🚀 **开机自启**（可在设置里开关）。
- 💾 **数据**：纯本地存储；一键导出 / 导入 JSON 备份。

## 下载安装

前往 [**Releases**](../../releases) 下载对应平台安装包：

| 平台 | 安装包 | 说明 |
|------|--------|------|
| 🍎 macOS (Apple 芯片) | `TODO_1.0.0_aarch64.dmg` | M 系列芯片 |
| 🍎 macOS (Intel) | `TODO_1.0.0_x64.dmg` | Intel 芯片 |
| 🪟 Windows | `TODO_1.0.0_x64-setup.exe` | Win10/11 64 位 |

### 首次打开被系统拦截怎么办

本应用未购买付费签名证书，系统安全机制会拦截。**这不是病毒，是因为没签名。**

**macOS**（提示「已损坏」或「无法验证开发者」）：
- 在「应用程序」里找到 **TODO** → 右键 → 打开 → 再点一次「打开」；或
- 终端执行：
  ```bash
  sudo xattr -dr com.apple.quarantine "/Applications/TODO.app"
  ```

**Windows**（SmartScreen 蓝窗）：点「更多信息」→「仍要运行」。

### 从旧版「悬浮待办」升级

新版应用名为 `TODO.app`，与旧版「悬浮待办.app」内部标识一致、数据自动共享，**旧待办无损保留**。安装新版后打开确认数据都在，即可手动删除旧版「悬浮待办.app」。

## 从源码构建

```bash
# 前置：Node.js 18+、Rust（https://rustup.rs）
git clone https://github.com/zhongquanchao/todo.git
cd todo
npm install
npm run dev      # 开发模式（热重载）
npm run build    # 构建当前平台安装包
```

发布版安装包由 GitHub Actions 在打 `v*` tag 时自动构建（macOS aarch64/x64 + Windows），见 [`.github/workflows/release.yml`](.github/workflows/release.yml)。

## 技术栈

- **框架**：[Tauri 2](https://tauri.app)（Rust 后端 + 系统 WebView 前端）
- **前端**：原生 HTML / CSS / JavaScript，无打包步骤
- **持久化**：本地 `localStorage`（纯本地、不联网）
- **测试**：`tests/` 下 37 项 Node 单元测试

```
todo/
├─ src/                  # 前端（index.html / styles.css / main.js / core.js / ball.*）
├─ src-tauri/            # Rust 后端、窗口/托盘/快捷键、打包配置
├─ tests/                # 单元测试
├─ .github/workflows/    # 跨平台自动构建
└─ legacy-macos-swift/   # 早期 macOS 原生 Swift 版（存档参考）
```
