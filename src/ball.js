/* TODO · 悬浮球逻辑
 * 显示「收起前当前视图」的未完成数；点击中心水滴以球当前位置为锚点展开面板。 */

import { countForView, migrateState } from "./core.js";

const TAURI = window.__TAURI__;
const appWindow = TAURI?.window?.getCurrentWindow?.();

const STORAGE_KEY = "floating-todo/snapshot";

function readState() {
  try {
    return migrateState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch (e) {
    return migrateState(null);
  }
}

function applyTheme() {
  const s = readState();
  document.documentElement.dataset.theme = s.settings.appearance || "system";
}

function refresh() {
  const s = readState();
  const n = countForView(s);
  const el = document.getElementById("count");
  if (el) {
    el.textContent = String(n);
    el.classList.toggle("zero", n === 0);
    el.classList.toggle("big", n > 99);
  }
  applyTheme();
}

function expand() {
  // 展开：Rust 端读取球当前位置 + 所在显示器，把主面板锚定过去并显示
  TAURI?.core?.invoke?.("expand_from_ball").catch(() => {});
}

document.getElementById("expand")?.addEventListener("click", (e) => {
  e.stopPropagation();
  expand();
});

// 手势拖动：按住球任意位置移动超过阈值则拖动窗口，短按中心则展开
const ballEl = document.getElementById("ball");
let pointerDown = null;

ballEl?.addEventListener("pointerdown", (e) => {
  pointerDown = { x: e.screenX, y: e.screenY };
});

ballEl?.addEventListener("pointermove", (e) => {
  if (!pointerDown) return;
  if (Math.abs(e.screenX - pointerDown.x) > 4 || Math.abs(e.screenY - pointerDown.y) > 4) {
    pointerDown = null;
    appWindow?.startDragging?.().catch(() => {});
  }
});

window.addEventListener("pointerup", () => { pointerDown = null; });
window.addEventListener("pointercancel", () => { pointerDown = null; });

// 主面板收起/数据变化时，通知球刷新计数
TAURI?.event?.listen?.("ball-update", refresh);
TAURI?.event?.listen?.("ball-count", (e) => {
  const n = e?.payload;
  const el = document.getElementById("count");
  if (el && typeof n === "number") {
    el.textContent = String(n);
    el.classList.toggle("zero", n === 0);
    el.classList.toggle("big", n > 99);
  }
});

// 球显示/获得焦点时刷新一次，保证计数是「当前视图」的最新值
window.addEventListener("focus", refresh);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refresh();
});

refresh();
