import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(__dirname, "../src/styles.css"), "utf8");

function blockOf(selector) {
  const idx = css.indexOf(selector + " {");
  if (idx < 0) return "";
  let depth = 0;
  let i = idx + selector.length;
  for (; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  return css.slice(idx, i + 1);
}

test("滚动保证: 待办列表可纵向滚动（.list）", () => {
  const b = blockOf(".list");
  assert.match(b, /overflow-y:\s*auto/, ".list 应有纵向滚动");
  assert.match(b, /min-height:\s*0/, ".list 应有 min-height:0 以便在 flex 容器中收缩");
});

test("滚动保证: 项目列表可纵向滚动（.proj-list）", () => {
  const b = blockOf(".proj-list");
  assert.match(b, /overflow-y:\s*auto/);
  assert.match(b, /min-height:\s*0/);
});

test("滚动保证: 应用容器为纵向 flex 且可收缩（#app）", () => {
  const b = blockOf("#app");
  assert.match(b, /flex-direction:\s*column/, "#app 纵向排列");
  assert.match(b, /min-height:\s*0/, "#app 允许子列表收缩以触发滚动");
});

test("悬浮球: 球体样式存在且中心按钮可点（.ball / .ball-core）", () => {
  const ball = blockOf(".ball");
  const core = blockOf(".ball-core");
  assert.match(ball, /border-radius:\s*50%/, "球体为圆形");
  assert.match(core, /cursor:\s*pointer/, "中心水滴可点击展开");
});
