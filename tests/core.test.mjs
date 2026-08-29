import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseTime,
  parseProject,
  parseQuickInput,
  defaultDueForView,
  toDateStr,
  addDays,
  migrateState,
  normalizeProjects,
  ensureProjects,
  autoArchiveProjects,
  reconcileProjects,
  viewItems,
  incompleteCountForView,
  countForView,
  projectCount,
  computeExpandPosition,
  stableSort,
} from "../src/core.js";

const NOW = new Date(2026, 7, 29); // 2026-8-29（周六）
const TODAY = toDateStr(NOW); // "2026-8-29"
const TOMORROW = addDays(TODAY, 1);
const DAY_AFTER = addDays(TODAY, 2);
const LATER = addDays(TODAY, 3);

function mkItem(over = {}) {
  return {
    id: over.id || "id-" + Math.random(),
    title: over.title || "事项",
    detail: "",
    time: over.time || null,
    completed: !!over.completed,
    notified: false,
    createdAt: Date.now(),
    due: over.due === undefined ? null : over.due,
    project: over.project || null,
    doing: !!over.doing,
    followUp: over.followUp || null,
  };
}

/* ---------------- 时间解析（保留原有规则） ---------------- */

test("parseTime: 冒号时间", () => {
  assert.equal(parseTime("15:00 开会").time, "15:00");
  assert.equal(parseTime("9:05").time, "09:05");
  assert.equal(parseTime("23:59").time, "23:59");
  assert.equal(parseTime("25:99").time, "23:59"); // 越界夹紧
});

test("parseTime: 中文口语时间", () => {
  assert.equal(parseTime("下午3点半").time, "15:30");
  assert.equal(parseTime("晚上8点30").time, "20:30");
  assert.equal(parseTime("9点").time, "09:00");
  assert.equal(parseTime("凌晨12点").time, "00:00");
  assert.equal(parseTime("早上8点").time, "08:00");
  assert.equal(parseTime("中午12点").time, "12:00");
});

/* ---------------- 项目解析 ---------------- */

test("parseProject: 大赛发榜 #创意大赛 归入项目", () => {
  const r = parseProject("大赛发榜 #创意大赛");
  assert.equal(r.title, "大赛发榜");
  assert.equal(r.project, "创意大赛");
});

test("parseProject: 无 # 时不产生项目", () => {
  const r = parseProject("整理收件箱");
  assert.equal(r.title, "整理收件箱");
  assert.equal(r.project, null);
});

test("parseProject: 项目名到空格/标点截止", () => {
  assert.equal(parseProject("写方案 #工作 重点").project, "工作");
  assert.equal(parseProject("买牛奶 #生活。").project, "生活");
});

/* ---------------- 快速输入（日期+时间+项目 组合） ---------------- */

test("parseQuickInput: 日期前缀保留原语义", () => {
  assert.equal(parseQuickInput("今天 写周报", null, NOW).due, TODAY);
  assert.equal(parseQuickInput("明天 写方案", null, NOW).due, TOMORROW);
  assert.equal(parseQuickInput("后天 复盘", null, NOW).due, DAY_AFTER);
  assert.equal(parseQuickInput("大后天 交付", null, NOW).due, LATER);
});

test("parseQuickInput: 明天 15:00 开会 → 日期+时间+标题", () => {
  const r = parseQuickInput("明天 15:00 开会", null, NOW);
  assert.equal(r.due, TOMORROW);
  assert.equal(r.time, "15:00");
  assert.equal(r.title, "开会");
});

test("parseQuickInput: 默认落点按视图", () => {
  assert.equal(parseQuickInput("记一笔", defaultDueForView("inbox", NOW), NOW).due, null);
  assert.equal(parseQuickInput("记一笔", defaultDueForView("today", NOW), NOW).due, TODAY);
  assert.equal(parseQuickInput("记一笔", defaultDueForView("next3", NOW), NOW).due, TOMORROW);
});

test("parseQuickInput: 大赛发榜 #创意大赛 → 标题+项目，无日期进收件箱", () => {
  const r = parseQuickInput("大赛发榜 #创意大赛", null, NOW);
  assert.equal(r.title, "大赛发榜");
  assert.equal(r.project, "创意大赛");
  assert.equal(r.due, null);
});

test("parseQuickInput: 日期 + 项目组合", () => {
  const r = parseQuickInput("明天 提交方案 #工作", null, NOW);
  assert.equal(r.due, TOMORROW);
  assert.equal(r.project, "工作");
  assert.equal(r.title, "提交方案");
});

/* ---------------- 数据迁移（保留旧数据） ---------------- */

test("migrateState: 旧 itemsByDay 三段式无损升级", () => {
  const raw = {
    selectedDay: "today",
    itemsByDay: {
      today: [{ id: "1", title: "今天的事", time: "10:00", completed: false }],
      tomorrow: [{ id: "2", title: "明天的事", completed: true }],
      dayAfterTomorrow: [{ id: "3", title: "后天的事" }],
    },
    recurringItems: [{ id: "r1", title: "喝水", completed: false }],
    settings: { opacity: 0.5 },
    memo: { text: "备忘" },
  };
  const s = migrateState(raw, NOW);
  assert.equal(s.items.length, 3);
  const byTitle = Object.fromEntries(s.items.map((i) => [i.title, i]));
  assert.equal(byTitle["今天的事"].due, TODAY);
  assert.equal(byTitle["今天的事"].time, "10:00");
  assert.equal(byTitle["明天的事"].due, TOMORROW);
  assert.equal(byTitle["明天的事"].completed, true);
  assert.equal(byTitle["后天的事"].due, DAY_AFTER);
  assert.equal(s.recurringItems[0].title, "喝水");
  assert.equal(s.settings.opacity, 0.5);
  assert.equal(s.memo.text, "备忘");
});

test("migrateState: selectedDay → 新视图", () => {
  assert.equal(migrateState({ selectedDay: "today" }, NOW).view, "today");
  assert.equal(migrateState({ selectedDay: "tomorrow" }, NOW).view, "next3");
  assert.equal(migrateState({ selectedDay: "dayAfterTomorrow" }, NOW).view, "next3");
});

test("migrateState: 已是新版则原样保留 items", () => {
  const s = migrateState({ version: 2, items: [mkItem({ due: null })], view: "today" }, NOW);
  assert.equal(s.items.length, 1);
  assert.equal(s.view, "today");
});

test("migrateState: 每天常驻保留 streak 与 lastDone（连胜/跨天重置依赖）", () => {
  const s = migrateState(
    {
      recurringItems: [{ id: "r1", title: "喝水", completed: true, streak: 7, lastDone: "2026-8-29" }],
    },
    NOW
  );
  assert.equal(s.recurringItems[0].title, "喝水");
  assert.equal(s.recurringItems[0].streak, 7);
  assert.equal(s.recurringItems[0].lastDone, "2026-8-29");
});

/* ---------------- 项目清理 ---------------- */

test("autoArchiveProjects: 全部完成 → 归档", () => {
  const projects = normalizeProjects([{ name: "创意大赛" }]);
  const items = [mkItem({ project: "创意大赛", completed: true })];
  const out = autoArchiveProjects(projects, items);
  assert.equal(out[0].archived, true);
});

test("autoArchiveProjects: 空项目不归档", () => {
  const projects = normalizeProjects([{ name: "空项目" }]);
  const out = autoArchiveProjects(projects, []);
  assert.equal(out[0].archived, false);
});

test("autoArchiveProjects: 有未完成不归档", () => {
  const projects = normalizeProjects([{ name: "X" }]);
  const items = [
    mkItem({ project: "X", completed: true }),
    mkItem({ project: "X", completed: false }),
  ];
  const out = autoArchiveProjects(projects, items);
  assert.equal(out[0].archived, false);
});

test("autoArchiveProjects: 已归档保持归档", () => {
  const projects = normalizeProjects([{ name: "Y", archived: true }]);
  const out = autoArchiveProjects(projects, [mkItem({ project: "Y", completed: false })]);
  assert.equal(out[0].archived, true);
});

test("ensureProjects: #标签 创建的项目补进列表", () => {
  const projects = ensureProjects([], [mkItem({ project: "创意大赛" })]);
  assert.equal(projects.length, 1);
  assert.equal(projects[0].name, "创意大赛");
  assert.equal(projects[0].archived, false);
});

test("reconcileProjects: 归档项目出现新未完成 → 自动恢复", () => {
  const projects = normalizeProjects([{ name: "创意大赛", archived: true }]);
  const items = [mkItem({ project: "创意大赛", completed: false })];
  const out = reconcileProjects(projects, items);
  assert.equal(out[0].archived, false);
});

test("reconcileProjects: 全完成后自动归档", () => {
  const projects = normalizeProjects([{ name: "创意大赛", archived: false }]);
  const items = [mkItem({ project: "创意大赛", completed: true })];
  const out = reconcileProjects(projects, items);
  assert.equal(out[0].archived, true);
});

/* ---------------- 视图过滤与计数 ---------------- */

test("viewItems: 收件箱=无日期", () => {
  const items = [
    mkItem({ due: null, title: "a" }),
    mkItem({ due: TODAY, title: "b" }),
  ];
  assert.deepEqual(viewItems(items, "inbox", TODAY).map((i) => i.title), ["a"]);
});

test("viewItems: 今天含过期顺延", () => {
  const items = [
    mkItem({ due: TODAY, title: "今天" }),
    mkItem({ due: addDays(TODAY, -1), title: "过期未完成" }),
    mkItem({ due: TOMORROW, title: "明天" }),
  ];
  assert.deepEqual(
    viewItems(items, "today", TODAY).map((i) => i.title),
    ["今天", "过期未完成"]
  );
});

test("viewItems: 未来三天 = 明天/后天/大后天，不含今天", () => {
  const items = [
    mkItem({ due: TODAY, title: "今天(不含)" }),
    mkItem({ due: TOMORROW, title: "明天" }),
    mkItem({ due: DAY_AFTER, title: "后天" }),
    mkItem({ due: LATER, title: "大后天" }),
    mkItem({ due: addDays(TODAY, 4), title: "更远(不含)" }),
  ];
  const titles = viewItems(items, "next3", TODAY).map((i) => i.title);
  assert.deepEqual(titles, ["明天", "后天", "大后天"]);
});

test("滚动规则: 随 today 前进，明天的待办滚入今天", () => {
  const item = mkItem({ due: TOMORROW });
  assert.equal(viewItems([item], "next3", TODAY).length, 1);
  // 过一天后，同一绝对日期变成「今天」
  assert.equal(viewItems([item], "today", TOMORROW).length, 1);
  assert.equal(viewItems([item], "next3", TOMORROW).length, 0);
});

/* ---------------- 悬浮球计数 ---------------- */

test("countForView: 收件箱 2 个未完成 → 2", () => {
  const state = {
    view: "inbox",
    selectedProject: null,
    items: [mkItem({ due: null }), mkItem({ due: null }), mkItem({ due: null, completed: true })],
  };
  assert.equal(countForView(state, NOW), 2);
});

test("countForView: 未来三天 6 个未完成 → 6（不是今天数量）", () => {
  const state = {
    view: "next3",
    selectedProject: null,
    items: [
      // 今天有 1 个未完成，未来三天有 6 个未完成
      mkItem({ due: TODAY }),
      ...Array.from({ length: 6 }, () => mkItem({ due: TOMORROW })),
    ],
  };
  assert.equal(countForView(state, NOW), 6);
});

test("countForView: 项目视图显示选中项目数量", () => {
  const state = {
    view: "projects",
    selectedProject: "创意大赛",
    items: [
      mkItem({ project: "创意大赛" }),
      mkItem({ project: "创意大赛" }),
      mkItem({ project: "创意大赛", completed: true }),
      mkItem({ project: "其它" }),
    ],
  };
  assert.equal(countForView(state, NOW), 2);
  assert.equal(projectCount(state.items, "创意大赛"), 2);
});

test("countForView: 项目总览（未选中）计所有项目未完成总数", () => {
  const state = {
    view: "projects",
    selectedProject: null,
    items: [
      mkItem({ project: "创意大赛" }),
      mkItem({ project: "工作" }),
      mkItem({ project: "工作", completed: true }),
      mkItem({ due: null }), // 收件箱，不计入项目
    ],
  };
  assert.equal(countForView(state, NOW), 2);
});

/* ---------------- 展开定位（多显示器 / 锚点 / 夹紧） ---------------- */

test("computeExpandPosition: 锚定球中心", () => {
  const pos = computeExpandPosition(
    { x: 1000, y: 600 },
    { w: 56, h: 56 },
    { x: 0, y: 0, width: 1920, height: 1080 },
    { w: 340, h: 560 }
  );
  // 球中心 (1028, 628)，面板中心对齐 → (1028-170, 628-280)
  assert.equal(pos.x, 858);
  assert.equal(pos.y, 348);
});

test("computeExpandPosition: 贴近屏幕边缘时夹紧，不越界", () => {
  const pos = computeExpandPosition(
    { x: 1900, y: 1040 },
    { w: 56, h: 56 },
    { x: 0, y: 0, width: 1920, height: 1080 },
    { w: 340, h: 560 }
  );
  assert.ok(pos.x <= 1920 - 340 - 8);
  assert.ok(pos.y <= 1080 - 560 - 8);
  assert.ok(pos.x >= 8 && pos.y >= 8);
});

test("computeExpandPosition: 拖到扩展屏（负坐标/左屏）后仍在同屏可见", () => {
  const monitor = { x: -1920, y: 0, width: 1920, height: 1080 };
  const pos = computeExpandPosition(
    { x: -1000, y: 300 },
    { w: 56, h: 56 },
    monitor,
    { w: 340, h: 560 }
  );
  assert.ok(pos.x >= monitor.x + 8, "面板左边不越出左屏");
  assert.ok(pos.x + 340 <= monitor.x + monitor.width - 8 + 340, "面板在左屏内");
  assert.ok(pos.x < 0, "面板确实落在负坐标扩展屏");
});

test("computeExpandPosition: 面板比屏幕大时退化为贴边", () => {
  const pos = computeExpandPosition(
    { x: 0, y: 0 },
    { w: 56, h: 56 },
    { x: 0, y: 0, width: 300, height: 200 },
    { w: 340, h: 560 }
  );
  assert.equal(pos.x, 8);
  assert.equal(pos.y, 8);
});

/* ---------------- 排序稳定性 ---------------- */

test("stableSort: 未完成在前，已完成在后", () => {
  const items = [
    mkItem({ title: "a", completed: true }),
    mkItem({ title: "b" }),
    mkItem({ title: "c" }),
  ];
  assert.deepEqual(
    stableSort(items).map((i) => i.title),
    ["b", "c", "a"]
  );
});
