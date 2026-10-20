/**
 * 普查：`src/` 里还有哪些**玩家会看到的**裸中文。
 *
 * 口径（刻意收窄，避免把"注释里的中文"也算进来）：
 * - 注释（`//` 与 `/* *\/`）里的中文不算 —— 那是给开发者看的
 * - `src/content/strings.*.js`（双表本身）不算 —— 那是文案真源
 * - 只看**字符串字面量**（`'...'` / `"..."` / 模板串）
 * - 排除纯 ASCII / 纯数字 / 键名形状（`^[a-z0-9_]+$`）
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

const ROOT = path.resolve('src');
const 排除文件 = new Set(['content/strings.zh.js', 'content/strings.en.js']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

/** 只把**注释**替换成等长空白；字符串内容原样保留 */
function 掩注释(src) {
  const out = src.split('');
  let i = 0;
  const n = src.length;
  let state = 'code';
  let quote = '';
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (state === 'code') {
      if (c === '/' && d === '/') { state = 'line'; out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
      if (c === '/' && d === '*') { state = 'block'; out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
      if (c === "'" || c === '"' || c === '`') { state = 'str'; quote = c; i += 1; continue; }
      i += 1; continue;
    }
    if (state === 'line') {
      if (c === '\n') { state = 'code'; } else { out[i] = ' '; }
      i += 1; continue;
    }
    if (state === 'block') {
      if (c === '*' && d === '/') { out[i] = ' '; out[i + 1] = ' '; i += 2; state = 'code'; continue; }
      if (c !== '\n') out[i] = ' ';
      i += 1; continue;
    }
    if (state === 'str') {
      if (c === '\\') { i += 2; continue; }
      if (c === quote) { state = 'code'; i += 1; continue; }
      i += 1; continue;
    }
  }
  return out.join('');
}

/** 抽出所有字符串字面量的内容 */
function 取字符串(src) {
  const out = [];
  const re = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g;
  let m;
  while ((m = re.exec(src))) {
    const 行 = src.slice(0, m.index).split('\n').length;
    out.push({ 内容: m[2], 行 });
  }
  return out;
}

const 有汉字 = /[一-鿿]/;
const 汇总 = [];

for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (排除文件.has(rel)) continue;
  const src = readFileSync(file, 'utf8');
  const 骨架 = 掩注释(src);
  for (const { 内容, 行 } of 取字符串(骨架)) {
    if (!有汉字.test(内容)) continue;
    if (/^[a-z0-9_]+$/.test(内容)) continue;  // 键名形状
    汇总.push({ 文件: rel, 行, 内容: 内容.replace(/\s+/g, ' ').slice(0, 70) });
  }
}

const 按文件 = new Map();
for (const 项 of 汇总) {
  if (!按文件.has(项.文件)) 按文件.set(项.文件, []);
  按文件.get(项.文件).push(项);
}

console.log(`裸中文字符串字面量：${汇总.length} 处，散在 ${按文件.size} 个文件\n`);
const 排序 = [...按文件.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [文件, 项列表] of 排序) {
  console.log(`${文件}  (${项列表.length})`);
  for (const 项 of 项列表.slice(0, 8)) {
    console.log(`   ${项.行}: ${项.内容}`);
  }
  if (项列表.length > 8) console.log(`   … 还有 ${项列表.length - 8} 处`);
  console.log('');
}
