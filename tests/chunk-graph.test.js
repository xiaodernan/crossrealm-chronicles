/**
 * 分块图门禁（W-B1 切片1，修 B37）。
 *
 * ## 为什么需要它
 *
 * B37 是"分块循环依赖"，它有三个特点让静态门禁成为唯一划算的防线：
 * 1. **只在构建期出声**：`npm test` 不会红，`npm run dev` 也不报，只有 `vite build`
 *    打一行 `Circular chunk` —— 而那一行混在 chunk 体积告警里，很容易被当成噪声。
 * 2. **不会立刻炸**：循环分块今天没有运行时症状（所有块都在启动时加载），
 *    所以它只会安静地把"哪块先加载"变成一个没有答案的问题，然后拦住 W-D5 的真分包。
 * 3. **靠人眼守不住**：只要有人写一句 `import ... from '../ui/xxx.js'`，
 *    一条新的回边就成立了 —— 而那句话本身完全正常，code review 看不出来。
 *
 * ## 关键设计：门禁不抄规则
 *
 * 它 `import` 真实的 `vite.config.js` 并调用里面那个 `manualChunks` 函数。
 * 抄一份规则进测试是最容易犯的错：改了一处、另一处没改，门禁就会在**错误的图上**
 * 报绿 —— 与 §0.3 说的"验证工具自己坏了的时候它会报告一切正常"同源。
 *
 * ## 三条断言各管一件事
 *
 * - **无环**：分块之间必须是 DAG。
 * - **`chunk-core` 是叶子**：共享基础层谁也不许读（它一旦回读特性块，"共享"就不成立了）。
 * - **`index` 是唯一的根**：没有任何块允许反向依赖入口块。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, normalize, relative } from 'node:path';
import config from '../vite.config.js';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const manualChunks = config.build.rollupOptions.output.manualChunks;

/** 分块图里"共享基础层"与"入口"的名字：三条断言要按名字认它们 */
const CORE = 'chunk-core';
const ENTRY = 'index';

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return name.endsWith('.js') ? [full] : [];
  });
}

/**
 * 只剥注释，**保留字符串**。
 *
 * 剥字符串会把 import 路径一起抹掉；而只剥注释这一条本身就踩过一次坑：
 * 第一版分析脚本没剥注释，于是 `content/dialogueCgPresets.js` 头注里那句
 * "只能 import ... from '../ui/DialogCGRenderer.js'"（讲的是**修前**的样子）
 * 被当成了一条真实回边 —— 门禁报出一条根本不存在的环。下面的自证用例钉住这件事。
 */
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const IMPORT_RE = /from\s+'([^']+)'/g;

/** 模块 → 分块；路径统一成正斜杠，`manualChunks` 里判的是 `/src/xxx/` */
function buildChunkMap() {
  const files = walk(SRC);
  const map = new Map();
  for (const file of files) {
    const id = file.replace(/\\/g, '/');
    map.set(id, manualChunks(id) ?? ENTRY);
  }
  return map;
}

/** 分块图 + 造成每条边的具体 import（报错时要能直接指出该改哪一行） */
function buildGraph(chunkMap) {
  const edges = new Map();
  const why = new Map();
  for (const [file, from] of chunkMap) {
    const code = stripComments(readFileSync(file, 'utf8'));
    IMPORT_RE.lastIndex = 0;
    let m;
    while ((m = IMPORT_RE.exec(code))) {
      const spec = m[1];
      if (!spec.startsWith('.')) continue;
      const target = normalize(join(dirname(file), spec)).replace(/\\/g, '/');
      const to = chunkMap.get(target);
      if (!to || to === from) continue;
      if (!edges.has(from)) edges.set(from, new Set());
      edges.get(from).add(to);
      why.set(`${from}->${to}`, `${relative(ROOT, file).replace(/\\/g, '/')} -> ${relative(ROOT, target).replace(/\\/g, '/')}`);
    }
  }
  return { edges, why };
}

/** 找出所有环（节点少，朴素 DFS 够用；找到一条就够报错了） */
function findCycle(edges) {
  const seen = new Set();
  const stack = [];
  let found = null;
  const visit = (node) => {
    if (found) return;
    if (stack.includes(node)) {
      found = [...stack.slice(stack.indexOf(node)), node];
      return;
    }
    if (seen.has(node)) return;
    seen.add(node);
    stack.push(node);
    for (const next of edges.get(node) ?? []) visit(next);
    stack.pop();
  };
  for (const node of edges.keys()) visit(node);
  return found;
}

describe('分块图', () => {
  const chunkMap = buildChunkMap();
  const { edges, why } = buildGraph(chunkMap);

  it('扫描集自证：真的读到了源码树，且每个分块都非空', () => {
    expect(chunkMap.size).toBeGreaterThan(180);
    const byChunk = new Map();
    for (const chunk of chunkMap.values()) byChunk.set(chunk, (byChunk.get(chunk) ?? 0) + 1);
    for (const name of [CORE, ENTRY, 'chunk-combat', 'chunk-ui', 'chunk-world']) {
      expect(byChunk.get(name) ?? 0, `分块 ${name} 里一个模块都没有`).toBeGreaterThan(0);
    }
  });

  it('无环：分块之间是 DAG（B37 的正面断言）', () => {
    const cycle = findCycle(edges);
    const detail = cycle
      ? cycle.slice(0, -1).map((c, i) => `${c} -> ${cycle[i + 1]}  [${why.get(`${c}->${cycle[i + 1]}`)}]`).join('\n  ')
      : '';
    expect(cycle, `分块成环：\n  ${detail}`).toBe(null);
  });

  it('`chunk-core` 是叶子：共享基础层谁也不许读', () => {
    const out = [...(edges.get(CORE) ?? [])];
    const detail = out.map((to) => `  ${CORE} -> ${to}  [${why.get(`${CORE}->${to}`)}]`).join('\n');
    expect(out, `共享层回读了特性块：\n${detail}`).toEqual([]);
  });

  it('`index` 是唯一的根：没有块允许反向依赖入口块', () => {
    const offenders = [];
    for (const [from, tos] of edges) {
      if (from === ENTRY) continue;
      if (tos.has(ENTRY)) offenders.push(`  ${from} -> ${ENTRY}  [${why.get(`${from}->${ENTRY}`)}]`);
    }
    expect(offenders, `入口块被反向依赖：\n${offenders.join('\n')}`).toEqual([]);
  });

  it('门禁自证 ①：注释里的 import 路径不算边（第一版就是被这条坑掉的）', () => {
    const sample = stripComments("/* 修前是 from '../ui/X.js' */\nimport { a } from '../ui/Y.js';");
    const hits = [...sample.matchAll(IMPORT_RE)].map((m) => m[1]);
    expect(hits).toEqual(['../ui/Y.js']);
  });

  it('门禁自证 ②：塞一条真回边进去，`findCycle` 必须咬得住', () => {
    const fake = new Map([[CORE, new Set(['chunk-ui'])], ['chunk-ui', new Set([CORE])]]);
    expect(findCycle(fake)).toEqual([CORE, 'chunk-ui', CORE]);
  });
});
