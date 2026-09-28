/**
 * `Game` 实例的**真实表面**，从 `src/core/Game.js` 现读现推 —— 不抄名单。
 *
 * 为什么要这么一根杠：`95c0533`（2026-09-23）把 `CombatController` 从 `game.combat` 搬进
 * `game.player.combat`，`src/game/RestDialogue.js` 两处读数没跟着搬。字段读不到不报错，
 * 只给 `undefined`，于是六座营火点"休息"全部当场抛 TypeError；而测试里的假 `game` 自己写了
 * `combat: {...}`，所以整栋楼全绿（修 B63）。桩件与生产不同形 = 用户看得见的谎能活过测试文件。
 *
 * 三条来源：
 * 1. 构造期与生命周期里 `this.<字段> =`（任意缩进）；
 * 2. 类自己的方法 `  <名字>(`；
 * 3. 别的模块往实例上补挂的 `game.<字段> =`（`#assigns` 扫全仓）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/** 列出 `src` 下所有 `.js`（仓库相对路径，用 `/` 分隔，跨平台可比） */
export function srcFiles() {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith('.js')) out.push(path.relative(SRC, p).split(path.sep).join('/'));
    }
  })(SRC);
  return out.sort();
}

/** `Game` 实例上挂得出来的名字（字段 + 方法 + 外部补挂） */
export function gameSurface() {
  const gameSrc = read('core/Game.js');
  const names = new Set();
  for (const m of gameSrc.matchAll(/^\s+this\.([A-Za-z_]\w*)\s*=/gm)) names.add(m[1]);
  for (const m of gameSrc.matchAll(/^ {2}(?:async\s+|get\s+|set\s+)?([A-Za-z_]\w*)\s*\(/gm)) names.add(m[1]);
  for (const rel of srcFiles()) {
    if (rel === 'core/Game.js') continue;
    for (const m of read(rel).matchAll(/\bgame\s*\??\.\s*([A-Za-z_]\w*)\s*=[^=]/g)) names.add(m[1]);
  }
  return names;
}

/**
 * 一份源码文本里的每一处 `x.game.<字段>` / `x.game?.<字段>`（跳过整行注释）。
 * 出口收在这一层，是为了让"反向控制"能把造出来的坏源码喂进**同一把尺子**，而不是抄一遍正则。
 */
export function readsFromSource(text) {
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const t = line.trimStart();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
    for (const m of line.matchAll(/\b([A-Za-z_]\w*)\.game\s*\??\.\s*([A-Za-z_]\w*)/g)) {
      out.push({ reader: m[1], field: m[2], line: i + 1, text: t });
    }
  });
  return out;
}

/** 一个源文件里读到的每一处读数。单独出口这一条，是为了让"幻影为 0"能被分母证伪。 */
export function gameReads(rel) {
  return readsFromSource(read(rel));
}

/** `gameReads` 里 `surface` 没有的那些 —— 即"幻影读数"（读得到名字，拿不到值，且不报错） */
export function phantomGameReads(rel, surface) {
  return readsFromSource(read(rel)).filter((r) => !surface.has(r.field));
}
