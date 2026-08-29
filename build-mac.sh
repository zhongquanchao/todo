#!/usr/bin/env bash
# TODO · macOS 一键构建脚本
# 在一台 Mac 上运行，产出 TODO.dmg 安装包。
#
# 用法：
#   ./build-mac.sh           # 构建当前 Mac 架构的 dmg（Apple 芯片 → aarch64；Intel → x86_64）
#   ./build-mac.sh --all     # 分别构建 aarch64 与 x86_64 两种 dmg
#
# 前置（脚本会自动补齐 Rust 与前端依赖，其余需手动确认）：
#   - Node.js 18+
#   - Xcode Command Line Tools（首次构建或提示缺少编译器时执行：xcode-select --install）

set -euo pipefail
cd "$(dirname "$0")"

BUILD_ALL="${1:-}"

log() { printf '\033[1;32m[build]\033[0m %s\n' "$*"; }

# 1. 检查 Node
if ! command -v node >/dev/null 2>&1; then
  log "未检测到 Node.js，请先安装 Node 18+：https://nodejs.org/"
  exit 1
fi

# 2. 检查/安装 Rust
if ! command -v cargo >/dev/null 2>&1; then
  log "安装 Rust（rustup）..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  # shellcheck disable=SC1091
  source "$HOME/.cargo/env"
fi

# 3. 前端依赖
log "安装前端依赖..."
npm install

# 4. 构建目标
if [ "$BUILD_ALL" = "--all" ]; then
  rustup target add aarch64-apple-darwin x86_64-apple-darwin
  log "构建 Apple 芯片 (aarch64) dmg..."
  npm run tauri build -- --target aarch64-apple-darwin
  log "构建 Intel (x86_64) dmg..."
  npm run tauri build -- --target x86_64-apple-darwin
else
  log "构建当前架构 dmg..."
  npm run build
fi

log "完成。安装包位置："
ls -1 src-tauri/target/*/release/bundle/dmg/*.dmg 2>/dev/null || \
  ls -1 src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null || \
  log "（未找到 dmg，请检查上方构建日志）"
