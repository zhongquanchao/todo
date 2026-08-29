/* TODO · 悬浮待办前端逻辑 (Tauri v2 + 原生 JS)
 * 视图模型：收件箱 / 今天 / 未来三天 / 项目。纯逻辑在 core.js。 */

import {
  toDateStr,
  addDays,
  dayDelta,
  yesterdayStr,
  nowHHMM,
  parseTime,
  parseQuickInput,
  defaultDueForView,
  migrateState,
  normalizeItem,
  reconcileProjects,
  viewItems,
  incompleteCountForView,
  stableSort,
  VIEW_ORDER,
  VIEW_TITLE,
  SIZE_PRESETS,
  uid,
} from "./core.js";

const TAURI = window.__TAURI__;
const appWindow = TAURI?.window?.getCurrentWindow?.();

const STORAGE_KEY = "floating-todo/snapshot";

async function openExternal(url) {
  try {
    if (TAURI?.opener?.openUrl) await TAURI.opener.openUrl(url);
    else await TAURI.core.invoke("plugin:opener|open_url", { url });
  } catch (e) {
    window.open(url, "_blank");
  }
}

/* ---------------- 状态 ---------------- */

function load() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch (e) {
    raw = null;
  }
  return migrateState(raw);
}

let state = load();

function save() {
  state.projects = reconcileProjects(state.projects, state.items);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ---------------- 业务操作 ---------------- */

function currentItems() {
  return viewItems(state.items, state.view, toDateStr(), state.selectedProject);
}

function addItem(title, due, project, time) {
  const t = String(title || "").trim();
  if (!t) return null;
  const it = normalizeItem({ title: t, due: due ?? null, project: project ?? null, time: time ?? null });
  state.items.unshift(it);
  save();
  return it;
}

function toggleItem(id) {
  const it = state.items.find((i) => i.id === id);
  if (!it) return;
  it.completed = !it.completed;
  save();
}

function deleteItem(id) {
  state.items = state.items.filter((i) => i.id !== id);
  save();
}

function updateItem(id, patch) {
  const it = state.items.find((i) => i.id === id);
  if (!it) return;
  if (patch.title !== undefined && String(patch.title).trim()) it.title = String(patch.title).trim();
  if (patch.detail !== undefined) it.detail = String(patch.detail).trim();
  if (patch.project !== undefined) it.project = patch.project ? String(patch.project).trim() : null;
  if (patch.doing !== undefined) it.doing = !!patch.doing;
  if (patch.followUp !== undefined) it.followUp = patch.followUp ? String(patch.followUp).trim() : null;
  save();
}

function moveItemDue(id, due) {
  const it = state.items.find((i) => i.id === id);
  if (!it) return;
  it.due = due; // null = 收件箱
  save();
}

/* ---- 项目 ---- */

function createProject(name) {
  const n = String(name || "").trim();
  if (!n) return null;
  if (state.projects.some((p) => p.name === n)) return null;
  state.projects.push({ id: uid(), name: n, archived: false });
  save();
  return n;
}

function renameProject(id, name) {
  const p = state.projects.find((x) => x.id === id);
  const n = String(name || "").trim();
  if (!p || !n) return;
  const old = p.name;
  p.name = n;
  state.items.forEach((it) => {
    if (it.project === old) it.project = n;
  });
  if (state.selectedProject === old) state.selectedProject = n;
  save();
}

function setProjectArchived(id, archived) {
  const p = state.projects.find((x) => x.id === id);
  if (!p) return;
  p.archived = archived;
  if (archived && state.selectedProject === p.name) state.selectedProject = null;
  save();
}

function deleteProject(id) {
  const p = state.projects.find((x) => x.id === id);
  if (!p) return;
  const name = p.name;
  // 删除项目：其下待办移回收件箱（project 置空），不删用户数据
  state.items.forEach((it) => {
    if (it.project === name) it.project = null;
  });
  state.projects = state.projects.filter((x) => x.id !== id);
  if (state.selectedProject === name) state.selectedProject = null;
  save();
}

/* ---- 每天常驻（保留旧逻辑） ---- */

function addRecurring(title, time = null) {
  const t = String(title || "").trim();
  if (!t) return;
  state.recurringItems.unshift({
    id: uid(), title: t, detail: "", time, completed: false, notified: false,
    streak: 0, lastDone: null, createdAt: Date.now(),
  });
  save();
}

function toggleRecurring(id) {
  const it = state.recurringItems.find((i) => i.id === id);
  if (!it) return;
  const today = toDateStr();
  if (!it.completed) {
    it.completed = true;
    it.notified = true;
    if (it.lastDone === today) {
      /* 今天已计入连胜 */
    } else if (it.lastDone === yesterdayStr()) {
      it.streak = (it.streak || 0) + 1;
    } else {
      it.streak = 1;
    }
    it.lastDone = today;
  } else {
    it.completed = false;
    if (it.lastDone === today) {
      it.streak = Math.max(0, (it.streak || 0) - 1);
      it.lastDone = it.streak > 0 ? yesterdayStr() : null;
    }
  }
  state.recurringItems = stableSort(state.recurringItems);
  save();
}

function deleteRecurring(id) {
  state.recurringItems = state.recurringItems.filter((i) => i.id !== id);
  save();
}

function pinAsRecurring(id) {
  const idx = state.items.findIndex((i) => i.id === id);
  if (idx < 0) return;
  const [it] = state.items.splice(idx, 1);
  state.recurringItems.unshift({ ...it, completed: false, streak: 0, lastDone: null });
  save();
}

function unpinRecurring(id) {
  const idx = state.recurringItems.findIndex((i) => i.id === id);
  if (idx < 0) return;
  const [it] = state.recurringItems.splice(idx, 1);
  state.items.unshift(normalizeItem({ ...it, due: toDateStr(), project: null }));
  save();
}

/* 跨天：每天常驻重置完成状态与连胜（普通待办已用绝对日期，无需滚动） */
function rollRecurringIfNeeded() {
  const today = toDateStr();
  if (state.lastActiveDate === today) return;
  const y = yesterdayStr();
  state.recurringItems = state.recurringItems.map((it) => {
    const reset = { ...it, completed: false, notified: false };
    if (it.lastDone !== y && it.lastDone !== today) reset.streak = 0;
    return reset;
  });
  state.lastActiveDate = today;
  save();
}

/* ---------------- 工具 ---------------- */

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
function linkify(s) {
  const escaped = esc(s);
  return escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a data-link="$1">$1</a>');
}
function dueLabel(due) {
  if (!due) return "";
  const delta = dayDelta(toDateStr(), due);
  if (delta === 0) return "今天";
  if (delta === 1) return "明天";
  if (delta === 2) return "后天";
  if (delta === 3) return "大后天";
  const [y, m, d] = String(due).split("-").map(Number);
  return `${m}月${d}日`;
}

const ICONS = {
  gear: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>',
  dots: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  arrowUp: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="8 12 12 8 16 12"/><line x1="12" y1="8" x2="12" y2="16"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
  note: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  expand: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>',
  pinOff: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="2" x2="22" y2="22"/><path d="M12 17v5"/><path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11"/><path d="M15 9.34V6h1a2 2 0 0 0 0-4H7.89"/></svg>',
  arrowRight: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
  clock: '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:2px"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
  download: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  upload: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  minimize: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="15 18 9 12 15 6"/></svg>',
  folder: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  tag: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
  flag: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
  archive: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
};

/* ---------------- 渲染 ---------------- */

const app = document.getElementById("app");
let compact = false;
let activeMenu = null;

function applyWindowChrome() {
  const root = document.documentElement;
  root.dataset.theme = state.settings.appearance;
  root.style.setProperty("--opacity", state.settings.opacity);
  if (state.settings.customBg) {
    root.style.setProperty("--panel-top", state.settings.customBg);
    root.style.setProperty("--panel-bottom", state.settings.customBg);
  } else {
    root.style.removeProperty("--panel-top");
    root.style.removeProperty("--panel-bottom");
  }
  if (appWindow) {
    appWindow.setAlwaysOnTop(!!state.settings.alwaysOnTop).catch(() => {});
    appWindow.setIgnoreCursorEvents(!!state.settings.clickThrough).catch(() => {});
  }
}

function rowHtml(it) {
  const chips = [];
  if (it.time) chips.push(`<span class="time-chip">${ICONS.clock}${it.time}</span>`);
  if (it.doing) chips.push(`<span class="doing-chip">${ICONS.play}进行中</span>`);
  const meta = [];
  if (it.project) meta.push(`<span class="meta-chip tag">${ICONS.tag}${esc(it.project)}</span>`);
  const dl = dueLabel(it.due);
  if (dl) meta.push(`<span class="meta-chip due">${dl}</span>`);
  if (it.followUp) meta.push(`<span class="meta-chip follow">${ICONS.flag}跟进 ${dueLabel(it.followUp) || it.followUp}</span>`);
  const metaHtml = meta.length ? `<div class="meta">${meta.join("")}</div>` : "";
  const detail = it.detail ? `<div class="detail">${linkify(it.detail)}</div>` : "";
  return `<div class="row ${it.completed ? "done" : ""}" data-row="${it.id}">
    <div class="check ${it.completed ? "on" : ""}" data-act="toggle" data-id="${it.id}">${it.completed ? ICONS.check : ""}</div>
    <div class="body" data-act="edit" data-id="${it.id}">
      <div class="title">${esc(it.title)}${chips.join("")}</div>
      ${metaHtml}${detail}
    </div>
    <div class="actions">
      <button class="icon-btn sm" data-act="menu" data-id="${it.id}" title="更多">${ICONS.dots}</button>
      <button class="icon-btn sm" data-act="del" data-id="${it.id}" title="删除">${ICONS.trash}</button>
    </div>
  </div>`;
}

function viewBadge(view) {
  return incompleteCountForView(state.items, view, toDateStr(), state.selectedProject);
}

function render() {
  rollRecurringIfNeeded();
  applyWindowChrome();

  const view = state.view;
  const today = toDateStr();
  const cnt = viewBadge(view);
  const list = currentItems();
  const showRecurring = view === "today" && state.recurringItems.length > 0;

  let html = "";

  // 头部
  const sub = cnt === 0 ? "已经清空" : `${VIEW_TITLE[view]}还有 ${cnt} 件事`;
  html += `<div class="header">
    <div class="titles"><h1>TODO</h1><p>${sub}</p></div>
    <div class="spacer"></div>
    <div class="count-pill ${cnt === 0 ? "zero" : ""}">${cnt}</div>
    <button class="icon-btn" data-act="collapse" title="收起为悬浮球">${ICONS.minimize}</button>
    <button class="icon-btn" data-act="settings" title="设置">${ICONS.gear}</button>
  </div>`;

  // 视图切换
  html += `<div class="view-picker">`;
  VIEW_ORDER.forEach((v) => {
    const n = incompleteCountForView(state.items, v, today, null);
    html += `<div class="view-seg ${view === v ? "sel" : ""}" data-act="view" data-view="${v}">
      <span class="t">${VIEW_TITLE[v]}</span><span class="b">${n}</span>
    </div>`;
  });
  html += `</div>`;

  if (showRecurring) {
    html += `<div class="recurring"><div class="head">
      <span class="ic">${ICONS.repeat}</span><span>每天</span><div class="spacer"></div>
      <button class="icon-btn sm" data-act="raddtoggle" title="添加每天常驻待办">${ICONS.plus}</button></div>`;
    state.recurringItems.forEach((it) => {
      const streakChip = it.streak > 0 ? `<span class="streak-chip" title="已连续 ${it.streak} 天">🔥${it.streak}</span>` : "";
      html += `<div class="row ${it.completed ? "done" : ""}">
        <div class="check ${it.completed ? "on" : ""}" data-act="rtoggle" data-id="${it.id}">${it.completed ? ICONS.check : ""}</div>
        <div class="body" data-act="redit" data-id="${it.id}"><div class="title">${esc(it.title)}${streakChip}</div></div>
        <div class="actions">
          <button class="icon-btn sm" data-act="unpin" data-id="${it.id}" title="取消每天">${ICONS.pinOff}</button>
          <button class="icon-btn sm" data-act="rdel" data-id="${it.id}" title="删除">${ICONS.trash}</button>
        </div>
      </div>`;
    });
    if (recurringComposerOpen) {
      html += `<div class="composer sm"><span class="ic">${ICONS.repeat}</span>
        <input id="recur-input" placeholder="添加每天常驻待办" value="${esc(recurDraft)}"/>
        <button class="send" data-act="raddsubmit">${ICONS.arrowUp}</button></div>`;
    }
    html += `</div>`;
  }

  // 项目视图：项目列表 or 项目详情
  if (view === "projects") {
    if (state.selectedProject) {
      const proj = state.projects.find((p) => p.name === state.selectedProject);
      const pid = proj ? proj.id : null;
      html += `<div class="proj-head">
        <button class="icon-btn" data-act="back" title="返回项目列表">${ICONS.back}</button>
        <div class="proj-name">${esc(state.selectedProject)}</div>
        <div class="spacer"></div>
        <button class="icon-btn" data-act="projmenu" data-id="${esc(pid || "")}" title="项目操作">${ICONS.dots}</button>
      </div>`;
    } else {
      const active = state.projects.filter((p) => !p.archived);
      const archived = state.projects.filter((p) => p.archived);
      html += `<div class="proj-list">`;
      if (active.length === 0 && archived.length === 0) {
        html += `<div class="empty"><div class="ic">${ICONS.folder}</div><div class="a">还没有项目</div><div class="b">输入「事项 #项目名」即可自动归类</div></div>`;
      }
      active.forEach((p) => {
        const n = state.items.filter((i) => i.project === p.name && !i.completed).length;
        html += `<div class="proj-row" data-act="openproj" data-name="${esc(p.name)}">
          <span class="ic">${ICONS.folder}</span><span class="name">${esc(p.name)}</span>
          <span class="badge-n">${n}</span>
          <button class="icon-btn sm" data-act="projmenu" data-id="${p.id}" title="项目操作">${ICONS.dots}</button>
        </div>`;
      });
      if (archived.length > 0) {
        html += `<div class="proj-archived-title">已归档</div>`;
        archived.forEach((p) => {
          html += `<div class="proj-row archived" data-act="projmenu" data-id="${p.id}">
            <span class="ic">${ICONS.archive}</span><span class="name">${esc(p.name)}</span>
            <span class="badge-n">恢复</span>
          </div>`;
        });
      }
      html += `</div>`;
      if (projectComposerOpen) {
        html += `<div class="composer sm"><span class="ic">${ICONS.folder}</span>
          <input id="proj-input" placeholder="新建项目名称" value="${esc(projectDraft)}"/>
          <button class="send" data-act="projadd">${ICONS.arrowUp}</button></div>`;
      }
      html += `<button class="add-proj" data-act="projaddtoggle">${ICONS.plus} 新建项目</button>`;
    }
  }

  // 待办列表
  if (view !== "projects" || state.selectedProject) {
    if (list.length === 0) {
      const emptyTxt =
        view === "inbox" ? "收件箱是空的" : view === "projects" ? "这个项目没有待办" : `${VIEW_TITLE[view]}没有待办`;
      const emptySub =
        view === "inbox" ? "输入「事项 #项目名」快速记录" : view === "projects" ? "在下方输入框添加" : "写下要推进的事";
      html += `<div class="empty"><div class="ic">${ICONS.note}</div><div class="a">${emptyTxt}</div><div class="b">${emptySub}</div></div>`;
    } else {
      html += `<div class="list">`;
      stableSort(list).forEach((it) => (html += rowHtml(it)));
      html += `</div>`;
    }
    if (list.some((i) => i.completed)) {
      html += `<div class="clear-bar"><button data-act="clear">${ICONS.trash}<span>清除已完成</span></button></div>`;
    }
  }

  // 输入框（项目列表视图不显示，避免混淆）
  if (!(view === "projects" && !state.selectedProject)) {
    const editing = composerEditId;
    const ph = editing
      ? "编辑待办标题"
      : view === "projects"
        ? `添加到 ${state.selectedProject}`
        : `添加${VIEW_TITLE[view]}待办`;
    html += `<div class="composer">
      <span class="ic">${editing ? ICONS.pencil : ICONS.plus}</span>
      <input id="main-input" placeholder="${ph}" value="${esc(draft)}"/>
      ${editing ? `<button class="icon-btn sm" data-act="canceledit">${ICONS.x}</button>` : ""}
      <button class="send ${draft.trim() ? "" : "off"}" data-act="submit">${ICONS.arrowUp}</button>
    </div>`;
  }

  // 备忘录
  if (state.settings.memoEnabled && view !== "projects") {
    html += `<div class="memo"><div class="head" data-act="memotoggle">
      <span class="ic">${ICONS.note}</span><span>全局备忘录</span><div class="spacer"></div>
      <span style="transform:rotate(${state.memo.expanded ? 180 : 0}deg);transition:.2s">${ICONS.chevron}</span></div>`;
    if (state.memo.expanded) {
      html += `<textarea id="memo-input" placeholder="记录临时想法、链接、会议号">${esc(state.memo.text)}</textarea>`;
    }
    html += `</div>`;
  }

  if (compact) {
    html += `<button class="icon-btn expand-btn" data-act="expand" title="放大">${ICONS.expand}</button>`;
  }

  app.innerHTML = html;

  const header = app.querySelector(".header");
  if (header) header.addEventListener("mousedown", onDragStart);

  if (focusMain) {
    const mi = document.getElementById("main-input");
    if (mi) { mi.focus(); mi.setSelectionRange(mi.value.length, mi.value.length); }
    focusMain = false;
  }
  if (focusRecur) {
    const ri = document.getElementById("recur-input");
    if (ri) ri.focus();
    focusRecur = false;
  }
  if (focusProj) {
    const pi = document.getElementById("proj-input");
    if (pi) pi.focus();
    focusProj = false;
  }
}

/* ---------------- 交互状态 ---------------- */

let draft = "";
let composerEditId = null;
let recurDraft = "";
let recurringComposerOpen = false;
let projectDraft = "";
let projectComposerOpen = false;
let focusMain = false;
let focusRecur = false;
let focusProj = false;

function onDragStart(e) {
  if (e.target.closest("button")) return;
  appWindow?.startDragging().catch(() => {});
}

/* 事件委托 */
app.addEventListener("click", (e) => {
  const link = e.target.closest("a[data-link]");
  if (link) { e.preventDefault(); openExternal(link.dataset.link); return; }

  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  const id = el.dataset.id;

  switch (act) {
    case "view": setView(el.dataset.view); break;
    case "openproj": state.selectedProject = el.dataset.name; save(); render(); break;
    case "back": state.selectedProject = null; save(); render(); break;
    case "projmenu": openProjectMenu(id, el); break;
    case "projaddtoggle": projectComposerOpen = !projectComposerOpen; focusProj = projectComposerOpen; render(); break;
    case "projadd": commitProject(); break;
    case "toggle": {
      const wasOpen = !state.items.find((i) => i.id === id)?.completed;
      toggleItem(id);
      if (wasOpen) celebrate(el);
      render();
      break;
    }
    case "rtoggle": {
      const wasOpen = !state.recurringItems.find((i) => i.id === id)?.completed;
      toggleRecurring(id);
      if (wasOpen) celebrate(el);
      render();
      break;
    }
    case "del": confirmDeleteItem(id); break;
    case "rdel": confirmDeleteRecurring(id); break;
    case "unpin": unpinRecurring(id); render(); break;
    case "clear": clearCompleted(); break;
    case "edit": startEdit(id); break;
    case "redit": startRecurEdit(id); break;
    case "submit": commitMain(); break;
    case "canceledit": cancelEdit(); break;
    case "raddtoggle": recurringComposerOpen = !recurringComposerOpen; focusRecur = recurringComposerOpen; render(); break;
    case "raddsubmit": commitRecur(); break;
    case "expand": expandWindow(); break;
    case "collapse": collapseToBall(); break;
    case "settings": openSettings(); break;
    case "memotoggle": state.memo.expanded = !state.memo.expanded; save(); render(); break;
    case "menu": openRowMenu(id, el); break;
  }
});

function setView(v) {
  if (!VIEW_ORDER.includes(v)) return;
  state.view = v;
  if (v !== "projects") state.selectedProject = null;
  save();
  render();
}

function clearCompleted() {
  const list = currentItems();
  const ids = new Set(list.filter((i) => i.completed).map((i) => i.id));
  state.items = state.items.filter((i) => !ids.has(i.id));
  save();
  render();
}

/* 输入框事件 */
app.addEventListener("input", (e) => {
  if (e.target.id === "main-input") {
    draft = e.target.value;
    const send = app.querySelector('[data-act="submit"]');
    if (send) send.classList.toggle("off", !draft.trim());
  } else if (e.target.id === "recur-input") {
    recurDraft = e.target.value;
  } else if (e.target.id === "proj-input") {
    projectDraft = e.target.value;
  } else if (e.target.id === "memo-input") {
    state.memo.text = e.target.value;
    save();
  }
});

app.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    if (e.target.id === "main-input") { e.preventDefault(); commitMain(); }
    else if (e.target.id === "recur-input") { e.preventDefault(); commitRecur(); }
    else if (e.target.id === "proj-input") { e.preventDefault(); commitProject(); }
  }
  if (e.key === "Escape" && e.target.id === "main-input") {
    if (composerEditId) cancelEdit();
    else { draft = ""; appWindow?.hide().catch(() => {}); }
  }
});

function commitMain() {
  const t = draft.trim();
  if (!t) return;
  if (composerEditId) {
    const it = state.items.find((i) => i.id === composerEditId);
    if (it) it.title = t;
    composerEditId = null;
    save();
  } else {
    const defaultDue = defaultDueForView(state.view);
    const { due, time, title, project } = parseQuickInput(t, defaultDue);
    let proj = project;
    if (state.view === "projects" && state.selectedProject) proj = state.selectedProject;
    if (!title) return;
    addItem(title, due, proj, time);
  }
  draft = "";
  focusMain = true;
  render();
}

function commitProject() {
  const name = projectDraft.trim();
  if (!name) return;
  createProject(name);
  projectDraft = "";
  projectComposerOpen = false;
  render();
}

function commitRecur() {
  const t = recurDraft.trim();
  if (!t) return;
  const parsed = parseTime(t);
  const time = parsed ? parsed.time : null;
  const title = parsed ? t.replace(parsed.match, " ").replace(/\s+/g, " ").trim() : t;
  if (title) addRecurring(title, time);
  recurDraft = "";
  focusRecur = true;
  render();
}

function startEdit(id) {
  const it = state.items.find((i) => i.id === id);
  if (!it) return;
  composerEditId = id;
  draft = it.title;
  focusMain = true;
  render();
}

function startRecurEdit(id) {
  const it = state.recurringItems.find((i) => i.id === id);
  if (!it) return;
  recurringComposerOpen = true;
  recurDraft = it.title;
  focusRecur = true;
  render();
}

function cancelEdit() {
  composerEditId = null;
  draft = "";
  focusMain = true;
  render();
}

/* ---------------- 删除确认（避免误触） ---------------- */

function confirmAction({ title, message, confirmLabel = "删除" }, onConfirm) {
  const overlay = document.createElement("div");
  overlay.className = "overlay confirm-overlay";
  overlay.innerHTML = `<div class="confirm">
    <div class="c-title">${esc(title)}</div>
    <div class="c-msg">${esc(message)}</div>
    <div class="c-actions">
      <button class="link-btn" data-c="cancel">取消</button>
      <button class="c-danger" data-c="ok">${esc(confirmLabel)}</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-c]");
    if (!b) return;
    overlay.remove();
    if (b.dataset.c === "ok") onConfirm();
  });
}

function confirmDeleteItem(id) {
  const it = state.items.find((i) => i.id === id);
  if (!it) return;
  confirmAction(
    { title: "删除待办", message: `「${it.title}」将被删除，不可恢复。`, confirmLabel: "删除" },
    () => { deleteItem(id); render(); }
  );
}

function confirmDeleteRecurring(id) {
  const it = state.recurringItems.find((i) => i.id === id);
  if (!it) return;
  confirmAction(
    { title: "删除常驻待办", message: `「${it.title}」将被删除。`, confirmLabel: "删除" },
    () => { deleteRecurring(id); render(); }
  );
}

/* ---------------- 行浮层菜单 ---------------- */

function closeMenu() {
  document.querySelector(".menu")?.remove();
  document.querySelector(".menu-mask")?.remove();
}

function openRowMenu(id, anchorEl) {
  closeMenu();
  const it = state.items.find((i) => i.id === id);
  if (!it) return;

  const mask = document.createElement("div");
  mask.className = "menu-mask";
  mask.style.cssText = "position:absolute;inset:0;z-index:55";
  mask.addEventListener("click", closeMenu);
  document.body.appendChild(mask);

  const menu = document.createElement("div");
  menu.className = "menu";
  const moveItems = [
    ["收件箱", null],
    ["今天", toDateStr()],
    ["明天", addDays(toDateStr(), 1)],
    ["后天", addDays(toDateStr(), 2)],
    ["大后天", addDays(toDateStr(), 3)],
  ];
  menu.innerHTML =
    `<button data-m="edit">${ICONS.pencil}<span>编辑标题</span></button>` +
    `<button data-m="detail">${ICONS.note}<span>详情 / 跟进</span></button>` +
    `<button data-m="pin">${ICONS.repeat}<span>设为每天</span></button>` +
    `<div class="sep"></div>` +
    `<div class="menu-label">移动到</div>` +
    moveItems.map(([label, due]) =>
      `<button data-m="move" data-due="${due === null ? "__inbox__" : due}">${ICONS.arrowRight}<span>${label}</span></button>`
    ).join("") +
    `<div class="sep"></div>` +
    `<button class="danger" data-m="del">${ICONS.trash}<span>删除</span></button>`;
  document.body.appendChild(menu);

  const r = anchorEl.getBoundingClientRect();
  const mw = 170, mh = menu.offsetHeight;
  let left = Math.min(r.right - mw, window.innerWidth - mw - 8);
  left = Math.max(8, left);
  let top = r.bottom + 6;
  if (top + mh > window.innerHeight - 8) top = r.top - mh - 6;
  menu.style.left = left + "px";
  menu.style.top = top + "px";

  menu.addEventListener("click", (e) => {
    const b = e.target.closest("[data-m]");
    if (!b) return;
    const m = b.dataset.m;
    closeMenu();
    if (m === "edit") startEdit(id);
    else if (m === "detail") openDetailEditor(id);
    else if (m === "pin") { pinAsRecurring(id); render(); }
    else if (m === "move") {
      const due = b.dataset.due === "__inbox__" ? null : b.dataset.due;
      moveItemDue(id, due);
      render();
    } else if (m === "del") {
      confirmDeleteItem(id);
    }
  });
}

/* ---------------- 详情编辑器（标题/描述/项目/进行中/跟进日期） ---------------- */

function openDetailEditor(id) {
  const it = state.items.find((i) => i.id === id);
  if (!it) return;
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `<div class="settings" style="margin-top:32px;gap:12px">
    <h2>待办详情</h2>
    <div><div style="font-size:11px;color:var(--text-secondary);margin-bottom:5px">标题</div>
    <div class="composer sm"><input id="de-title" value="${esc(it.title)}"/></div></div>
    <div><div style="font-size:11px;color:var(--text-secondary);margin-bottom:5px">描述</div>
    <div class="memo"><textarea id="de-detail" style="border-top:none">${esc(it.detail)}</textarea></div></div>
    <div><div style="font-size:11px;color:var(--text-secondary);margin-bottom:5px">项目（留空=无项目）</div>
    <div class="composer sm"><input id="de-project" value="${esc(it.project || "")}" placeholder="项目名"/></div></div>
    <div class="set-row"><span>进行中</span><div class="switch ${it.doing ? "on" : ""}" id="de-doing"></div></div>
    <div><div style="font-size:11px;color:var(--text-secondary);margin-bottom:5px">跟进日期（YYYY-M-D，留空清除）</div>
    <div class="composer sm"><input id="de-follow" value="${esc(it.followUp || "")}" placeholder="如 ${toDateStr()}"/></div></div>
    <div class="set-row"><button class="link-btn" data-de="cancel">取消</button>
    <button class="link-btn" style="color:var(--accent);font-weight:600" data-de="save">保存</button></div>
  </div>`;
  document.body.appendChild(overlay);

  let doing = it.doing;
  overlay.querySelector("#de-doing").addEventListener("click", () => {
    doing = !doing;
    overlay.querySelector("#de-doing").classList.toggle("on", doing);
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) { overlay.remove(); return; }
    const b = e.target.closest("[data-de]");
    if (!b) return;
    if (b.dataset.de === "cancel") overlay.remove();
    else {
      updateItem(id, {
        title: overlay.querySelector("#de-title").value,
        detail: overlay.querySelector("#de-detail").value,
        project: overlay.querySelector("#de-project").value,
        doing,
        followUp: overlay.querySelector("#de-follow").value,
      });
      overlay.remove();
      render();
    }
  });
  overlay.querySelector("#de-title")?.focus();
}

/* ---------------- 项目菜单 ---------------- */

function openProjectMenu(pid, anchorEl) {
  closeMenu();
  const p = state.projects.find((x) => x.id === pid);
  if (!p) return;

  const mask = document.createElement("div");
  mask.className = "menu-mask";
  mask.style.cssText = "position:absolute;inset:0;z-index:55";
  mask.addEventListener("click", closeMenu);
  document.body.appendChild(mask);

  const menu = document.createElement("div");
  menu.className = "menu";
  menu.innerHTML =
    `<button data-pm="rename">${ICONS.pencil}<span>重命名</span></button>` +
    (p.archived
      ? `<button data-pm="unarchive">${ICONS.archive}<span>恢复项目</span></button>`
      : `<button data-pm="archive">${ICONS.archive}<span>归档项目</span></button>`) +
    `<div class="sep"></div>` +
    `<button class="danger" data-pm="del">${ICONS.trash}<span>删除项目</span></button>`;
  document.body.appendChild(menu);

  const r = anchorEl.getBoundingClientRect();
  const mw = 150, mh = menu.offsetHeight;
  let left = Math.min(r.right - mw, window.innerWidth - mw - 8);
  left = Math.max(8, left);
  let top = r.bottom + 6;
  if (top + mh > window.innerHeight - 8) top = r.top - mh - 6;
  menu.style.left = left + "px";
  menu.style.top = top + "px";

  menu.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pm]");
    if (!b) return;
    const pm = b.dataset.pm;
    closeMenu();
    if (pm === "rename") openProjectRename(pid);
    else if (pm === "archive") { setProjectArchived(pid, true); render(); }
    else if (pm === "unarchive") { setProjectArchived(pid, false); render(); }
    else if (pm === "del") {
      confirmAction(
        { title: "删除项目", message: `「${p.name}」将被删除，其下待办会移回收件箱（数据不丢）。`, confirmLabel: "删除" },
        () => { deleteProject(pid); render(); }
      );
    }
  });
}

function openProjectRename(pid) {
  const p = state.projects.find((x) => x.id === pid);
  if (!p) return;
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `<div class="settings" style="margin-top:120px;gap:12px">
    <h2>重命名项目</h2>
    <div class="composer sm"><input id="pr-name" value="${esc(p.name)}"/></div>
    <div class="set-row"><button class="link-btn" data-pr="cancel">取消</button>
    <button class="link-btn" style="color:var(--accent);font-weight:600" data-pr="save">保存</button></div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) { overlay.remove(); return; }
    const b = e.target.closest("[data-pr]");
    if (!b) return;
    if (b.dataset.pr === "cancel") overlay.remove();
    else {
      renameProject(pid, overlay.querySelector("#pr-name").value);
      overlay.remove();
      render();
    }
  });
  overlay.querySelector("#pr-name")?.focus();
}

/* ---------------- 设置面板 ---------------- */

function openSettings() {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  const s = state.settings;
  const bgHex = s.customBg ? rgbToHex(s.customBg) : "#dceaff";
  const sizeButtons = SIZE_PRESETS.map((p) =>
    `<button class="size-btn" data-size="${p.w}x${p.h}">${p.name} ${p.w}×${p.h}</button>`
  ).join("");
  overlay.innerHTML = `<div class="settings">
    <h2>设置</h2>
    <div><div style="font-size:12px;font-weight:500;margin-bottom:6px">窗口尺寸</div>
    <div class="size-row">${sizeButtons}</div></div>
    <div class="set-row"><span>始终置顶</span><div class="switch ${s.alwaysOnTop ? "on" : ""}" data-s="alwaysOnTop"></div></div>
    <div class="set-row"><span>鼠标穿透（点击落到下层）</span><div class="switch ${s.clickThrough ? "on" : ""}" data-s="clickThrough"></div></div>
    <div class="set-row"><span>开机自启动</span><div class="switch" id="autostart-sw" data-s="autostart"></div></div>
    <div class="set-row"><span>开启备忘录</span><div class="switch ${s.memoEnabled ? "on" : ""}" data-s="memoEnabled"></div></div>
    <div>
      <div style="font-size:13px;font-weight:500;margin-bottom:6px">外观</div>
      <div class="seg-control">
        <button class="${s.appearance === "system" ? "on" : ""}" data-ap="system">跟随系统</button>
        <button class="${s.appearance === "light" ? "on" : ""}" data-ap="light">浅色</button>
        <button class="${s.appearance === "dark" ? "on" : ""}" data-ap="dark">深色</button>
      </div>
    </div>
    <div class="set-row"><span>背景色</span>
      <div style="display:flex;align-items:center;gap:8px">
        <input type="color" id="bg-color" value="${bgHex}"/>
        <button class="link-btn" data-s="resetBg" ${s.customBg ? "" : 'style="opacity:.45"'}>恢复默认</button>
      </div>
    </div>
    <div>
      <div class="set-row"><span>透明度</span><span style="color:var(--text-secondary)">${Math.round(s.opacity * 100)}%</span></div>
      <input type="range" id="op-range" min="0.2" max="0.95" step="0.01" value="${s.opacity}"/>
    </div>
    <div class="set-row" style="gap:8px">
      <button class="data-btn" data-s="export">${ICONS.download}<span>导出备份</span></button>
      <button class="data-btn" data-s="import">${ICONS.upload}<span>导入备份</span></button>
    </div>
    <div style="font-size:11px;color:var(--text-secondary);line-height:1.6">
      💡 全局快捷键 <b>${navigator.platform.includes("Mac") ? "⌘⇧Space" : "Ctrl+Shift+Space"}</b> 唤起并聚焦输入。<br>
      ⏰ 输入「明天 15:00 开会」自动识别日期时间；「事项 #项目」自动归类。<br>
      🫧 点标题栏「－」收起为悬浮球，点球恢复。
    </div>
    <div class="set-row" style="justify-content:flex-end"><button class="link-btn" data-s="close">完成</button></div>
  </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) { overlay.remove(); return; }
    const size = e.target.closest("[data-size]");
    if (size) {
      const [w, h] = size.dataset.size.split("x").map(Number);
      if (appWindow && TAURI?.window?.LogicalSize)
        appWindow.setSize(new TAURI.window.LogicalSize(w, h)).catch(() => {});
      return;
    }
    const sw = e.target.closest("[data-s]");
    if (sw) {
      const key = sw.dataset.s;
      if (key === "alwaysOnTop") { state.settings.alwaysOnTop = !state.settings.alwaysOnTop; sw.classList.toggle("on"); }
      else if (key === "memoEnabled") {
        state.settings.memoEnabled = !state.settings.memoEnabled;
        if (state.settings.memoEnabled) state.memo.expanded = true;
        sw.classList.toggle("on");
      }
      else if (key === "resetBg") { state.settings.customBg = null; overlay.remove(); save(); render(); openSettings(); return; }
      else if (key === "clickThrough") {
        state.settings.clickThrough = !state.settings.clickThrough;
        sw.classList.toggle("on");
        save();
        if (state.settings.clickThrough) overlay.remove();
        applyWindowChrome();
        return;
      }
      else if (key === "autostart") { toggleAutostart(sw); return; }
      else if (key === "export") { exportBackup(); return; }
      else if (key === "import") { importBackup(overlay); return; }
      else if (key === "close") { overlay.remove(); }
      save(); applyWindowChrome(); render();
    }
    const ap = e.target.closest("[data-ap]");
    if (ap) {
      state.settings.appearance = ap.dataset.ap;
      overlay.querySelectorAll("[data-ap]").forEach((b) => b.classList.toggle("on", b === ap));
      save(); applyWindowChrome();
    }
  });
  overlay.querySelector("#op-range").addEventListener("input", (e) => {
    state.settings.opacity = parseFloat(e.target.value);
    e.target.previousElementSibling.querySelector("span:last-child").textContent = Math.round(state.settings.opacity * 100) + "%";
    applyWindowChrome(); save();
  });
  overlay.querySelector("#bg-color").addEventListener("input", (e) => {
    state.settings.customBg = hexToRgb(e.target.value);
    applyWindowChrome(); save();
  });
  (async () => {
    try {
      const on = await TAURI?.autostart?.isEnabled();
      overlay.querySelector("#autostart-sw")?.classList.toggle("on", !!on);
    } catch (e) {}
  })();
}

async function toggleAutostart(sw) {
  try {
    const on = await TAURI.autostart.isEnabled();
    if (on) await TAURI.autostart.disable();
    else await TAURI.autostart.enable();
    sw.classList.toggle("on", !on);
  } catch (e) {}
}

async function exportBackup() {
  try {
    await TAURI.core.invoke("export_data", { json: JSON.stringify(state, null, 2) });
  } catch (e) {}
}

async function importBackup(overlay) {
  try {
    const content = await TAURI.core.invoke("import_data");
    if (!content) return;
    const parsed = JSON.parse(content);
    state = migrateState(parsed);
    save();
    overlay?.remove();
    applyWindowChrome();
    render();
  } catch (e) {}
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
function rgbToHex(rgb) {
  const [r, g, b] = rgb.split(",").map((x) => parseInt(x.trim()));
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/* ---------------- 完成撒花 ---------------- */

const CONFETTI_COLORS = ["#1573ff", "#29ab56", "#ffb020", "#ff5d8f", "#7c5cff"];
function celebrate(anchorEl) {
  const r = anchorEl.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  for (let i = 0; i < 14; i++) {
    const p = document.createElement("div");
    p.className = "confetti";
    p.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    p.style.left = cx + "px";
    p.style.top = cy + "px";
    const ang = (Math.PI * 2 * i) / 14 + Math.random() * 0.6;
    const dist = 26 + Math.random() * 30;
    p.style.setProperty("--dx", Math.cos(ang) * dist + "px");
    p.style.setProperty("--dy", (Math.sin(ang) * dist - 18) + "px");
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 700);
  }
}

/* ---------------- 提醒 ---------------- */

async function ensureNotifyPermission() {
  try {
    const n = TAURI?.notification;
    if (!n) return false;
    let granted = await n.isPermissionGranted();
    if (!granted) granted = (await n.requestPermission()) === "granted";
    return granted;
  } catch (e) {
    return false;
  }
}

async function checkReminders() {
  const now = nowHHMM();
  const due = [];
  let changed = false;
  const scan = (it) => {
    if (it.time && !it.completed && !it.notified && it.time <= now) {
      it.notified = true;
      due.push(it);
      changed = true;
    }
  };
  state.items.forEach(scan);
  state.recurringItems.forEach(scan);
  if (changed) save();
  if (due.length) {
    const ok = await ensureNotifyPermission();
    if (ok) {
      due.forEach((it) =>
        TAURI.notification.sendNotification({
          title: "TODO · 到点提醒",
          body: `${it.time}　${it.title}`,
        })
      );
    }
  }
}

/* ---------------- 窗口尺寸 / 收起 ---------------- */

function expandWindow() {
  if (!appWindow || !TAURI?.window?.LogicalSize) return;
  appWindow.setSize(new TAURI.window.LogicalSize(340, 560)).catch(() => {});
}

function collapseToBall() {
  save();
  try { TAURI?.event?.emit?.("ball-update", null); } catch (e) {}
  TAURI?.core?.invoke?.("collapse_to_ball").catch(() => {});
}

document.querySelectorAll(".resize").forEach((h) => {
  h.addEventListener("mousedown", (e) => {
    e.preventDefault();
    appWindow?.startResizeDragging(h.dataset.dir).catch(() => {});
  });
});

function updateCompact() {
  const w = window.innerWidth, hh = window.innerHeight;
  const c = w < 300 || hh < 280;
  if (c !== compact) { compact = c; document.documentElement.classList.toggle("compact", c); render(); }
  else { document.documentElement.classList.toggle("compact", c); }
}
window.addEventListener("resize", updateCompact);

/* ---------------- 全局快捷键 / 事件 ---------------- */

TAURI?.event?.listen?.("quick-capture", () => {
  closeMenu();
  document.querySelector(".overlay")?.remove();
  if (compact) expandWindow();
  focusMain = true;
  render();
  setTimeout(() => {
    const mi = document.getElementById("main-input");
    if (mi) { mi.focus(); mi.select(); }
  }, 60);
});

TAURI?.event?.listen?.("toggle-passthrough", () => {
  state.settings.clickThrough = !state.settings.clickThrough;
  save();
  applyWindowChrome();
});

// 从悬浮球展开后，刷新视图与计数
TAURI?.event?.listen?.("panel-shown", () => {
  render();
});

/* ---------------- 启动 ---------------- */

updateCompact();
render();
applyWindowChrome();

setInterval(() => render(), 5 * 60 * 1000);
setInterval(checkReminders, 30 * 1000);
checkReminders();
