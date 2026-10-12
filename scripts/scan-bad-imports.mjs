// 静态扫描：找出 import 了"目标模块没有导出"的名字（沉默坏链）。
// 不执行任何模块（避免 DOM/副作用），纯正则抽取 import/export。
// 用法：node scripts/scan-bad-imports.mjs [srcDir]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, 'src');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

// 抽取一个模块的命名/默认/命名空间导出名字集合。
function getExports(src) {
  const names = new Set();
  let hasStar = false;
  let hasDefault = false;
  // export function/const/let/var/class NAME
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+class\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  // export { a, b as c }
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    const body = m[1];
    if (/from\s*['"]/.test(body)) {
      // re-export：无法静态知道远端名字，标记 star 以放行
      hasStar = true;
    } else {
      for (const part of body.split(',')) {
        const seg = part.trim();
        if (!seg) continue;
        const as = seg.split(/\s+as\s+/);
        names.add((as[1] || as[0]).trim());
      }
    }
  }
  // export * from '...' / export * as ns from
  if (/export\s+\*\s+from/.test(src) || /export\s+\*\s+as/.test(src)) hasStar = true;
  if (/export\s+default/.test(src)) hasDefault = true;
  return { names, hasStar, hasDefault };
}

// 抽取一个文件的 import 语句：返回 [{ names:[{orig,as}], def:bool, ns:bool, spec, line }]
function getImports(src) {
  const imports = [];
  const lines = src.split('\n');
  // 支持跨行 import（粗略：把整段 import ... from '...' 视为一行）
  for (const m of src.matchAll(/import\s+([^;]*?)\s+from\s*['"]([^'"]+)['"]/gs)) {
    const clause = m[1];
    const spec = m[2];
    const line = src.slice(0, m.index).split('\n').length;
    const entry = { names: [], def: false, ns: false, spec, line };
    // 默认导入
    const defM = clause.match(/^([A-Za-z0-9_$]+)\s*(,|\s*\{|$)/);
    if (defM && !clause.trimStart().startsWith('{') && !clause.trimStart().startsWith('*')) {
      entry.def = true;
    }
    // 命名空间
    if (/\*\s+as\s+[A-Za-z0-9_$]+/.test(clause)) entry.ns = true;
    // 命名导入 { a, b as c }
    const brace = clause.match(/\{([^}]*)\}/);
    if (brace) {
      for (const part of brace[1].split(',')) {
        const seg = part.trim();
        if (!seg) continue;
        const as = seg.split(/\s+as\s+/);
        entry.names.push({ orig: as[0].trim(), as: (as[1] || as[0]).trim() });
      }
    }
    imports.push(entry);
  }
  return imports;
}

function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.')) return null; // 跳过裸模块（node_modules）
  let p = resolve(dirname(fromFile), spec);
  // 规范化 .js 后缀
  if (!p.endsWith('.js')) p += '.js';
  return p;
}

const files = walk(SRC);
const cache = new Map();
function loadExports(p) {
  if (cache.has(p)) return cache.get(p);
  let ex;
  try {
    ex = getExports(readFileSync(p, 'utf8'));
  } catch {
    ex = { names: new Set(), hasStar: true, hasDefault: true, missing: true };
  }
  cache.set(p, ex);
  return ex;
}

let problems = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const imports = getImports(src);
  for (const imp of imports) {
    const target = resolveSpec(f, imp.spec);
    if (!target) continue;
    const ex = loadExports(target);
    if (ex.missing) {
      // 目标文件本身读不到（可能后缀不对/不存在）——单独报，不算"未导出名"
      console.log(`MISSING-FILE  ${f.replace(ROOT + '/', '')}:${imp.line}  from '${imp.spec}'`);
      problems++;
      continue;
    }
    if (ex.hasStar) continue; // 有 re-export/export*，放行（无法静态判定）
    for (const n of imp.names) {
      if (!ex.names.has(n.orig)) {
        console.log(`BAD-IMPORT  ${f.replace(ROOT + '/', '')}:${imp.line}  import '${n.orig}' from '${imp.spec}' (not exported)`);
        problems++;
      }
    }
    if (imp.def && !ex.hasDefault) {
      console.log(`BAD-IMPORT  ${f.replace(ROOT + '/', '')}:${imp.line}  default import from '${imp.spec}' (no default export)`);
      problems++;
    }
  }
}
console.log(`\n扫描 ${files.length} 个文件，发现问题 ${problems} 处。`);
process.exit(problems > 0 ? 1 : 0);
