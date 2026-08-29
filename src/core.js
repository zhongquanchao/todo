/* TODO · 核心纯逻辑（无 DOM 依赖）
 * 供 src/main.js / src/ball.js 与 Node 单元测试共用。
 * 数据模型见 defaultState()；旧版「今天/明天/后天」数据在 migrateState() 里无损升级。
 */

export function uid() {
  return (
    globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random())
  );
}

export const pad = (n) => String(n).padStart(2, "0");

/* 日期字符串统一为 "YYYY-M-D"（不补零，与旧数据 lastActiveDate 一致） */
export function toDateStr(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`;
}

export function parseDateStr(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(dateStr, n) {
  const dt = parseDateStr(dateStr);
  dt.setDate(dt.getDate() + n);
  return toDateStr(dt);
}

export function dayDelta(fromStr, toStr) {
  const a = parseDateStr(fromStr);
  const b = parseDateStr(toStr);
  return Math.round((b - a) / 86400000);
}

export function yesterdayStr(now = new Date()) {
  return addDays(toDateStr(now), -1);
}

export function nowHHMM(now = new Date()) {
  return pad(now.getHours()) + ":" + pad(now.getMinutes());
}

/* ---------------- 自然语言解析 ---------------- */

/* 从输入里解析时间，如 15:00 / 下午3点半 / 晚上8点30 / 9点。保留原有规则。 */
export function parseTime(s) {
  let m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) {
    return {
      time: pad(Math.min(23, +m[1])) + ":" + pad(Math.min(59, +m[2])),
      match: m[0],
    };
  }
  m = s.match(
    /(上午|早上|凌晨|下午|晚上|中午)?\s*(\d{1,2})\s*点\s*(半|\d{1,2})?\s*分?/
  );
  if (m && (m[1] || m[3] !== undefined || /点/.test(m[0]))) {
    let h = +m[2];
    let mm = 0;
    if (m[3] === "半") mm = 30;
    else if (m[3]) mm = Math.min(59, +m[3]);
    const p = m[1];
    if ((p === "下午" || p === "晚上") && h < 12) h += 12;
    if (p === "中午" && h < 12) h = 12;
    if ((p === "凌晨" || p === "早上" || p === "上午") && h === 12) h = 0;
    return { time: pad(Math.min(23, h)) + ":" + pad(mm), match: m[0] };
  }
  return null;
}

/* 解析 #项目名。返回 { title, project }。取第一个 #，项目名到空格/#/常见标点为止。 */
export function parseProject(text) {
  const m = text.match(/#([^\s#，。、,;；]+)/);
  if (m) {
    const title = text
      .replace(m[0], " ")
      .replace(/\s+/g, " ")
      .trim();
    return { title, project: m[1] };
  }
  return { title: text, project: null };
}

/* 视图定义 */
export const VIEW_ORDER = ["inbox", "today", "next3", "projects"];
export const VIEW_TITLE = {
  inbox: "收件箱",
  today: "今天",
  next3: "未来三天",
  projects: "项目",
};

/* 某视图下「无日期输入」的默认落点（绝对日期或 null=收件箱） */
export function defaultDueForView(view, now = new Date()) {
  const today = toDateStr(now);
  switch (view) {
    case "inbox":
      return null;
    case "today":
      return today;
    case "next3":
      return addDays(today, 1); // 明天
    case "projects":
    default:
      return null;
  }
}

/* 快速输入解析：日期前缀（今天/明天/后天/大后天）→ 时间 → 项目。
 * 返回 { due, time, title, project }，due 为绝对日期或 null。
 * defaultDue 为当前视图的默认落点。原有解析规则全部保留，仅新增 #项目 与大后天。 */
export function parseQuickInput(text, defaultDue, now = new Date()) {
  const today = toDateStr(now);
  let title = String(text == null ? "" : text).trim();
  let due = defaultDue;

  if (/^(今天|今日)/.test(title)) {
    due = today;
    title = title.replace(/^(今天|今日)\s*/, "");
  } else if (/^明天/.test(title)) {
    due = addDays(today, 1);
    title = title.replace(/^明天\s*/, "");
  } else if (/^后天/.test(title)) {
    due = addDays(today, 2);
    title = title.replace(/^后天\s*/, "");
  } else if (/^大后天/.test(title)) {
    due = addDays(today, 3);
    title = title.replace(/^大后天\s*/, "");
  }

  let time = null;
  const t = parseTime(title);
  if (t) {
    time = t.time;
    title = title.replace(t.match, " ").replace(/\s+/g, " ").trim();
  }

  const pp = parseProject(title);

  return { due, time, title: pp.title.trim(), project: pp.project };
}

/* ---------------- 数据模型 ---------------- */

export function defaultState() {
  return {
    version: 2,
    view: "inbox",
    selectedProject: null,
    items: [], // 普通待办（扁平，含 due/project/doing/followUp）
    recurringItems: [], // 每天常驻（保留旧逻辑）
    projects: [], // [{id,name,archived}]
    settings: {
      alwaysOnTop: true,
      opacity: 0.78,
      appearance: "system",
      customBg: null,
      memoEnabled: false,
      clickThrough: false,
    },
    memo: { text: "", expanded: false },
    lastActiveDate: toDateStr(),
  };
}

export function normalizeItem(it) {
  return {
    id: it.id || uid(),
    title: it.title || "",
    detail: it.detail || "",
    time: it.time || null,
    completed: !!it.completed,
    notified: !!it.notified,
    createdAt: it.createdAt || Date.now(),
    due: it.due || null,
    project: it.project || null,
    doing: !!it.doing,
    followUp: it.followUp || null,
  };
}

/* 每天常驻待办：额外保留 streak / lastDone（连胜与跨天重置依赖这两个字段） */
export function normalizeRecurringItem(it) {
  const base = normalizeItem(it);
  return {
    ...base,
    streak: typeof it.streak === "number" ? it.streak : 0,
    lastDone: it.lastDone || null,
  };
}

export function normalizeProjects(list) {
  const seen = new Set();
  const out = [];
  for (const p of list || []) {
    if (p == null) continue;
    const name = typeof p === "string" ? p : p.name || p.title || "";
    const nameTrim = String(name).trim();
    if (!nameTrim || seen.has(nameTrim)) continue;
    seen.add(nameTrim);
    out.push({
      id: typeof p === "object" && p.id ? p.id : uid(),
      name: nameTrim,
      archived: !!(p && p.archived),
    });
  }
  return out;
}

/* 把 items 里出现的 #项目名 补齐到 projects（避免 #标签 建了项目却不出现在项目列表） */
export function ensureProjects(projects, items) {
  const out = normalizeProjects(projects);
  const names = new Set(out.map((p) => p.name));
  for (const it of items) {
    if (it.project && !names.has(it.project)) {
      names.add(it.project);
      out.push({ id: uid(), name: it.project, archived: false });
    }
  }
  return out;
}

/* 项目自动清理：某项目（未归档）下有至少一条待办且全部完成 → 自动归档。空项目不归档。 */
export function autoArchiveProjects(projects, items) {
  return projects.map((p) => {
    if (p.archived) return p;
    const projItems = items.filter((i) => i.project === p.name);
    if (projItems.length > 0 && projItems.every((i) => i.completed)) {
      return { ...p, archived: true };
    }
    return p;
  });
}

/* 项目状态调和：先补齐 #标签 项目，再对已归档项目做「有未完成→恢复」，最后做「全完成→归档」。 */
export function reconcileProjects(projects, items) {
  let out = ensureProjects(projects, items);
  out = out.map((p) => {
    if (!p.archived) return p;
    const projItems = items.filter((i) => i.project === p.name);
    if (projItems.some((i) => !i.completed)) return { ...p, archived: false };
    return p;
  });
  out = autoArchiveProjects(out, items);
  return out;
}

/* 旧数据（itemsByDay 三段式）无损升级到新扁平模型。 */
export function migrateState(raw, now = new Date()) {
  const base = defaultState();
  if (!raw || typeof raw !== "object") return base;
  const today = toDateStr(now);

  const s = { ...base, ...raw };
  s.settings = { ...base.settings, ...(raw.settings || {}) };
  s.memo = { ...base.memo, ...(raw.memo || {}) };
  s.lastActiveDate = raw.lastActiveDate || today;

  let items = [];
  if (Array.isArray(raw.items)) {
    items = raw.items.map(normalizeItem);
  } else if (raw.itemsByDay && typeof raw.itemsByDay === "object") {
    const dueMap = {
      today,
      tomorrow: addDays(today, 1),
      dayAfterTomorrow: addDays(today, 2),
    };
    for (const [bucket, list] of Object.entries(raw.itemsByDay)) {
      const due = dueMap[bucket] || today;
      for (const it of list || []) {
        items.push(normalizeItem({ ...it, due }));
      }
    }
  }
  s.items = items;
  s.recurringItems = (raw.recurringItems || []).map(normalizeRecurringItem);
  s.projects = normalizeProjects(raw.projects || []);
  s.projects = ensureProjects(s.projects, s.items);

  // 旧 selectedDay → 新视图
  if (raw.selectedDay === "today") s.view = "today";
  else if (raw.selectedDay === "tomorrow" || raw.selectedDay === "dayAfterTomorrow")
    s.view = "next3";
  if (!VIEW_ORDER.includes(s.view)) s.view = "inbox";
  s.selectedProject = raw.selectedProject || null;
  s.version = 2;
  return s;
}

/* ---------------- 视图过滤与计数 ---------------- */

export function stableSort(arr) {
  return [
    ...arr.filter((i) => !i.completed),
    ...arr.filter((i) => i.completed),
  ];
}

export function viewItems(items, view, today, selectedProject) {
  const tomorrow = addDays(today, 1);
  const later = addDays(today, 3); // 大后天
  switch (view) {
    case "inbox":
      return items.filter((i) => !i.due);
    case "today":
      // 今天 + 过期未完成顺延（沿用旧「顺延到今天」习惯，显示层实现）
      return items.filter((i) => i.due && i.due <= today);
    case "next3":
      // 未来三天 = 明天 / 后天 / 大后天
      return items.filter((i) => i.due && i.due >= tomorrow && i.due <= later);
    case "projects":
      return selectedProject
        ? items.filter((i) => i.project === selectedProject)
        : [];
    default:
      return items.filter((i) => !i.due);
  }
}

export function incompleteCountForView(items, view, today, selectedProject) {
  // 项目总览（未选中具体项目）：计所有项目下未完成总数
  if (view === "projects" && !selectedProject) {
    return items.filter((i) => i.project && !i.completed).length;
  }
  return viewItems(items, view, today, selectedProject).filter(
    (i) => !i.completed
  ).length;
}

/* 悬浮球显示的数字：收起前当前视图的未完成数。 */
export function countForView(state, now = new Date()) {
  return incompleteCountForView(
    state.items,
    state.view,
    toDateStr(now),
    state.selectedProject
  );
}

export function projectCount(items, projectName) {
  return items.filter((i) => i.project === projectName && !i.completed).length;
}

/* ---------------- 展开定位（多显示器 / DPI / 锚点） ---------------- */

/* 以悬浮球当前位置为锚点展开面板：面板中心对齐球中心，并夹紧到球所在显示器可见区域内。
 * 所有坐标均为逻辑坐标（Tauri 已处理不同 DPI 缩放）。 */
export function computeExpandPosition(ballPos, ballSize, monitorFrame, panelSize) {
  const margin = 8;
  const bw = ballSize.w || 0;
  const bh = ballSize.h || 0;
  const centerX = ballPos.x + bw / 2;
  const centerY = ballPos.y + bh / 2;

  let x = centerX - panelSize.w / 2;
  let y = centerY - panelSize.h / 2;

  const minX = monitorFrame.x + margin;
  const maxX = monitorFrame.x + monitorFrame.width - panelSize.w - margin;
  const minY = monitorFrame.y + margin;
  const maxY = monitorFrame.y + monitorFrame.height - panelSize.h - margin;

  x = Math.max(minX, Math.min(x, maxX));
  y = Math.max(minY, Math.min(y, maxY));
  return { x, y };
}

/* 面板尺寸预设（用于展开/尺寸快捷设置） */
export const SIZE_PRESETS = [
  { name: "小", w: 300, h: 420 },
  { name: "中", w: 340, h: 560 },
  { name: "大", w: 400, h: 640 },
];
