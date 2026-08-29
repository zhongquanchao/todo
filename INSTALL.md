# TODO · 安装 / 升级 / 卸载说明

> TODO 是「悬浮待办」的升级版。应用内标识（bundle identifier）保持不变，因此**旧版待办数据会自动保留**，升级后无需手动迁移。

## 一、全新安装

1. 打开 `TODO_x.x.x_aarch64.dmg`（Apple 芯片）或 `TODO_x.x.x_x64.dmg`（Intel）。
2. 把 `TODO.app` 拖入「应用程序」。
3. 首次打开若提示「已损坏 / 无法验证开发者」（未签名应用），任选其一：
   - 右键 `TODO.app` → 打开 → 再点「打开」；
   - 或终端执行：`sudo xattr -dr com.apple.quarantine "/Applications/TODO.app"`。

## 二、从旧版「悬浮待办」升级

旧版应用名为 `悬浮待办.app`（v0.3.1），新版为 `TODO.app`。两者应用名不同、互不覆盖，会**并存**；由于内部标识一致，数据自动共享、无缝衔接。

升级步骤：
1. 先彻底退出正在运行的旧版「悬浮待办」（菜单栏图标 → 退出）。
2. 安装新版 `TODO.app`（见上文）。
3. 打开 `TODO.app`，确认旧待办都在（收件箱/今天/未来三天/项目视图里）。
4. 确认无误后，再手动删除旧版，**只删这一个**：
   ```bash
   sudo rm -rf "/Applications/悬浮待办.app"
   ```
   ⚠️ 只删除 `/Applications/悬浮待办.app`，不要删除其他任何应用或文件。

## 三、升级到更新的 TODO 版本（同名覆盖）

当 `TODO.app` 已有旧版本、要覆盖安装新版时，遵循「先清旧、再装新」：

1. 彻底退出正在运行的 `TODO.app`（菜单栏图标 → 退出）。
2. 打开新的 dmg，把 `TODO.app` 拖入「应用程序」，选择**替换/覆盖**。
3. 若打开仍提示「已损坏」：
   ```bash
   sudo xattr -dr com.apple.quarantine "/Applications/TODO.app"
   ```
   然后右键 → 打开 → 再点一次「打开」。

> 未签名应用每次重新下载的新版本都可能重新带上隔离标记，重复上面第 3 步即可。

## 四、卸载 TODO

```bash
sudo rm -rf "/Applications/TODO.app"
```

- 待办数据存在应用本地（WebView localStorage），卸载后不再保留；如需保留，请先在「设置 → 导出备份」导出 JSON。
- 卸载只影响 `TODO.app`，不会触碰其它应用。

## 五、数据备份 / 恢复

- 导出：`TODO` 面板 → 设置（齿轮）→ 导出备份，得到 `todo-backup.json`。
- 导入：设置 → 导入备份 → 选择 JSON 文件。
- 数据纯本地存储、不联网。
