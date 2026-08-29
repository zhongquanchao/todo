# 在 Mac 上构建 TODO 安装包

> 本机（Windows）无法构建 macOS `.dmg`，需在 Mac 上执行。以下为一次性搭环境 + 构建的完整步骤。

## 第一步：把源码传到 Mac

项目目录：`C:\Users\14288\Desktop\floating-todo-main`

任选一种方式把**源码**传到 Mac（U 盘 / AirDrop / 网盘 / scp 均可）。

⚠️ 不要传 `node_modules/` 和 `src-tauri/target/`（体积大、且是平台相关产物）。如果之前在这台 Windows 上跑过 `npm install` 生成了 `node_modules`，先删掉再传：

```bash
# Windows 上，传之前清理
rm -rf node_modules src-tauri/target
```

同一局域网可用 scp：
```bash
# 在 Windows 的终端里（或 Mac 反向拉取）
scp -r "C:\Users\14288\Desktop\floating-todo-main" 你的Mac用户名@你的Mac地址:~/
```

## 第二步：Mac 上一次性安装前置

```bash
# 1) Xcode 命令行工具（提供 C 编译器，构建 Rust 必需；若已装过会提示已存在）
xcode-select --install

# 2) Rust（若没有）
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# 装完执行，让当前 shell 能识别 cargo：
source "$HOME/.cargo/env"

# 3) Node 18+（若没有；有 Homebrew 的话最简单）
brew install node
```

## 第三步：构建

```bash
cd ~/floating-todo-main
chmod +x build-mac.sh

./build-mac.sh            # 构建当前 Mac 架构（Apple 芯片→aarch64，Intel→x86_64）
# 或：
./build-mac.sh --all      # 同时出两种架构的 dmg
```

等价手动命令（不用脚本时）：
```bash
cd ~/floating-todo-main
npm install
npm run build             # tauri build，默认当前架构
```

## 第四步：拿到产物

```bash
ls src-tauri/target/release/bundle/dmg/
# 或（--all 时）
ls src-tauri/target/*/release/bundle/dmg/
```

得到的 `TODO_x.x.x_aarch64.dmg` / `TODO_x.x.x_x64.dmg` 就是安装包。

## 第五步：安装

把 dmg 打开 → 拖 `TODO.app` 到「应用程序」。首次打开若提示「已损坏 / 无法验证开发者」（未签名应用）：

- 右键 `TODO.app` → 打开 → 再点「打开」；或
- `sudo xattr -dr com.apple.quarantine "/Applications/TODO.app"`

详见 [INSTALL.md](./INSTALL.md)（含从旧版「悬浮待办」升级、覆盖安装同名版本、卸载等）。

## 常见问题

- **报 `cargo`/`rustc` 找不到**：先 `source "$HOME/.cargo/env"`，或重开一个终端。
- **报缺少 C 编译器 / `cc`**：执行 `xcode-select --install` 后重试。
- **首次构建很慢**：Rust 要编译几百个依赖 crate，正常（几分钟到十几分钟），耐心等。
- **想同时出两种架构**：用 `./build-mac.sh --all`（会多花一倍编译时间）。
