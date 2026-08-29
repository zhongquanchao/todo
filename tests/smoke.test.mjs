import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

function setupDom() {
  const dom = new JSDOM(
    `<!doctype html><html lang="zh-CN" data-theme="system"><head></head><body>
      <div id="panel" class="panel"><div id="app"></div></div>
      <div class="resize n" data-dir="North"></div>
      <div class="resize s" data-dir="South"></div>
      <div class="resize e" data-dir="East"></div>
      <div class="resize w" data-dir="West"></div>
      <div class="resize ne" data-dir="NorthEast"></div>
      <div class="resize nw" data-dir="NorthWest"></div>
      <div class="resize se" data-dir="SouthEast"></div>
      <div class="resize sw" data-dir="SouthWest"></div>
    </body></html>`,
    { url: "http://localhost/", pretendToBeVisual: true }
  );
  global.window = dom.window;
  global.document = dom.window.document;
  global.localStorage = dom.window.localStorage;

  // 定时器设为 no-op，避免测试进程被 keep-alive
  global.setInterval = () => 0;
  global.clearInterval = () => {};
  global.setTimeout = () => 0;
  global.clearTimeout = () => {};

  dom.window.__TAURI__ = {
    window: {
      getCurrentWindow: () => ({
        startDragging: async () => {},
        startResizeDragging: async () => {},
        setSize: async () => {},
        setAlwaysOnTop: async () => {},
        setIgnoreCursorEvents: async () => {},
        hide: async () => {},
        show: async () => {},
        setFocus: async () => {},
      }),
      LogicalSize: class { constructor(w, h) { this.w = w; this.h = h; } },
    },
    core: { invoke: async () => null },
    event: { listen: async () => null, emit: async () => null },
    notification: {
      isPermissionGranted: async () => false,
      requestPermission: async () => "denied",
      sendNotification: async () => {},
    },
    autostart: { isEnabled: async () => false, enable: async () => {}, disable: async () => {} },
    opener: { openUrl: async () => {} },
  };
  return dom;
}

test("main.js 初始渲染：空状态下渲染头部、视图切换、输入框", async () => {
  const dom = setupDom();
  await import("../src/main.js");

  assert.ok(dom.window.document.querySelector(".header"), "应渲染头部");
  assert.ok(dom.window.document.querySelector(".view-picker"), "应渲染视图切换");
  assert.equal(
    dom.window.document.querySelectorAll(".view-seg").length,
    4,
    "四个视图：收件箱/今天/未来三天/项目"
  );
  assert.ok(dom.window.document.querySelector("#main-input"), "应渲染输入框");
});

test("main.js 渲染：预设含项目与待办的数据", async () => {
  const dom = setupDom();
  // 预置数据：收件箱两条、项目「创意大赛」一条已完成
  dom.window.localStorage.setItem(
    "floating-todo/snapshot",
    JSON.stringify({
      version: 2,
      view: "inbox",
      selectedProject: null,
      items: [
        { id: "1", title: "大赛发榜", due: null, project: "创意大赛", completed: false },
        { id: "2", title: "整理收件箱", due: null, project: null, completed: false },
        { id: "3", title: "旧的已完成", due: null, project: null, completed: true },
      ],
      recurringItems: [],
      projects: [{ id: "p1", name: "创意大赛", archived: false }],
      settings: { opacity: 0.78, appearance: "system", customBg: null, memoEnabled: false, clickThrough: false, alwaysOnTop: true },
      memo: { text: "", expanded: false },
      lastActiveDate: "2099-1-1",
    })
  );

  await import("../src/main.js?preset=1");

  const rows = dom.window.document.querySelectorAll(".row");
  assert.ok(rows.length >= 2, "应渲染待办行");
  // 项目徽标应出现（#创意大赛）
  assert.ok(
    [...dom.window.document.querySelectorAll(".meta-chip.tag")].some((n) => n.textContent.includes("创意大赛")),
    "应显示项目徽标"
  );
});
