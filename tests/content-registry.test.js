/**
 * 内容注册表门禁（W-B1 切片2）。
 *
 * ## 这一片要修的是什么
 *
 * `bossId` 是全仓最散的一个身份：生成、章节门槛、场地脚本、成就、CG、图鉴、音频、过场、
 * 自动演示 —— 20 多个文件里当字符串字面量用，**而没有任何一处是"有哪些 id"的清单**。
 * 把 `'shadow-warden'` 打错一个字母，症状是"那一场 Boss 不铺场 / 不记成就 / 不播 CG"，
 * 而这四件事一个都不会报错（各自的取值都退回兜底或静默跳过）。
 * 与 B36 / B37 / B45 同族：**稳定身份靠人肉复制，而复制错了不报错**。
 *
 * ## 用例分三层
 *
 * 1. **校验器本身**（`checkContent` 的引擎）：好表过、坏表红，且**一次报全部错**、
 *    错误带路径 —— 这几条是"引擎能不能用"的正面证据，每条都配一个坏表。
 * 2. **真表**：`CONTENT_TABLES` 里的每一张都过自己的 schema。
 * 3. **跨文件扫描**：`src/` 里每一处 `bossId` 字面量都必须是名册里的 id。
 *    这一层才是本片真正买到的东西 —— 前两层只保证"表本身没写错"，
 *    而**写错的地方多半不在表里，在使用处**。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, sep } from 'node:path';
import {
  CONTENT_TABLES, checkContent, checkTable, checkFields, contentSummary, ID_PATTERN,
} from '../src/content/registry.js';
import {
  BOSS_ROSTER, BOSS_IDS, DUNGEON_BOSS_PREFIX, bossById, isKnownBossId, chapterGateFor,
} from '../src/content/bossRoster.js';
import { ZONE_IDS, ZONE_NAMES } from '../src/content/ZoneIdentity.js';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return name.endsWith('.js') ? [full] : [];
  });
}

/** 只剥注释、保留字符串 —— 扫描的目标正是字符串字面量 */
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ------------------------------------------------------------------ *
 * 一、校验器引擎
 * ------------------------------------------------------------------ */

describe('校验器引擎：好表过、坏表红，且一次报全部错', () => {
  const entry = (table, row) => ({ kind: 'demo', shape: 'rows', table, row });
  const ctx = { ids: new Map([['others', new Set(['a-ok', 'b-ok'])]]) };
  const run = (table, row) => checkTable(entry(table, row), ctx);

  it('好表：一处都不报', () => {
    const row = { id: { t: 'id' }, n: { t: 'int', min: 1, max: 3 }, s: { t: 'string' } };
    expect(run([{ id: 'x-1', n: 2, s: '甲' }], row)).toEqual([]);
  });

  it('一次报全部错 —— 不是"改一处跑一次"', () => {
    const row = { id: { t: 'id' }, n: { t: 'int', min: 1, max: 3 }, s: { t: 'string' } };
    // 三处坏：id 形状、n 越界、s 缺失
    const errs = run([{ id: 'X_1', n: 9 }], row);
    expect(errs).toHaveLength(3);
    expect(errs.join('\n')).toMatch(/demo\[0\]\.id/);
    expect(errs.join('\n')).toMatch(/demo\[0\]\.n/);
    expect(errs.join('\n')).toMatch(/demo\[0\]\.s: 缺少必填字段/);
  });

  it('错误带路径：能直接跳到那一行', () => {
    const row = { id: { t: 'id' } };
    const errs = run([{ id: 'ok-1' }, { id: 'bad id' }], row);
    expect(errs).toEqual([expect.stringContaining('demo[1].id')]);
  });

  it('id 重复要红（同一张表里两个同 id = 后一个永远取不到）', () => {
    const row = { id: { t: 'id' } };
    const errs = run([{ id: 'same' }, { id: 'same' }], row);
    expect(errs.join('\n')).toMatch(/重复/);
  });

  it('交叉引用：指向不存在的 id 要红，且把可用值列出来', () => {
    const row = { to: { t: 'ref', of: 'others' } };
    const errs = run([{ to: 'nope' }], row);
    expect(errs.join('\n')).toMatch(/不在 others 里/);
    expect(errs.join('\n')).toMatch(/a-ok \/ b-ok/);   // 可用值列出来，省一次翻表
    expect(run([{ to: 'a-ok' }], row)).toEqual([]);
  });

  it('交叉引用允许前缀例外（副本 Boss 的 id 是动态拼的）', () => {
    const row = { to: { t: 'ref', of: 'others', allowPrefix: 'dyn-' } };
    expect(run([{ to: 'dyn-anything' }], row)).toEqual([]);
    expect(run([{ to: 'dyn-' }], row)).toEqual([]);      // 前缀本身也算过（这里只管前缀，不管后缀）
  });

  it('`required: false` 的字段缺失不算错，但给了就要合形状', () => {
    const row = { a: { t: 'int', required: false, min: 0 } };
    expect(run([{}], row)).toEqual([]);
    expect(run([{ a: -1 }], row)).toHaveLength(1);
    expect(run([{ a: 'x' }], row)).toHaveLength(1);
  });

  it('registry 自己写错也要红（未知字段类型 / 未知 shape / 未知 ref 表）', () => {
    // 行里要给值：不给会先撞上"缺少必填字段"，就走不到类型查表那一步
    expect(checkTable({ kind: 'demo', shape: 'rows', table: [{ a: 1 }], row: { a: { t: 'nope' } } }, ctx)
      .join('\n')).toMatch(/未知的字段类型/);
    expect(checkTable({ kind: 'demo', shape: 'nope', table: {} }, ctx).join('\n')).toMatch(/未知的 shape/);
    expect(checkTable({ kind: 'demo', shape: 'rows', table: [{ a: 1 }], row: { a: { t: 'ref', of: 'ghost' } } }, ctx)
      .join('\n')).toMatch(/未注册的表/);
  });

  it('`index` 形状：键要按 keyRef 校验，`keyAllow` 是显式豁免', () => {
    const e = {
      kind: 'demo', shape: 'index', table: { 'a-ok': 1, default: 1, nope: 1 },
      keyRef: { of: 'others' }, keyAllow: ['default'], value: { t: 'int' },
    };
    const errs = checkTable(e, ctx);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/nope/);
  });

  it('`rows` 值类型：值不是数组、或条数不足，都要红', () => {
    const e = { kind: 'demo', shape: 'index', table: { k: 'not-array' }, value: { t: 'rows', of: {}, minLength: 1 } };
    expect(checkTable(e, ctx).join('\n')).toMatch(/期望数组/);
    const e2 = { kind: 'demo', shape: 'index', table: { k: [] }, value: { t: 'rows', of: {}, minLength: 2 } };
    expect(checkTable(e2, ctx).join('\n')).toMatch(/至少要 2 条/);
  });

  it('门禁自证：把一行改坏，`checkContent` 必须咬得住', () => {
    const broken = CONTENT_TABLES.map((t) => (t.kind === 'bosses'
      ? { ...t, table: [...t.table, { id: 'BAD_ID', name: 'x', chapter: 0 }] }
      : t));
    const errs = checkContent(broken);
    expect(errs.join('\n')).toMatch(/BAD_ID/);
    expect(errs.join('\n')).toMatch(/chapter/);
  });
});

/* ------------------------------------------------------------------ *
 * 二、真表
 * ------------------------------------------------------------------ */

describe('真表：注册表里的每一张都过自己的 schema', () => {
  it('全表零错误（`registry.js` 加载期已经断言过一次，这里是可读的复证）', () => {
    expect(checkContent()).toEqual([]);
  });

  it('扫描集自证：清单非空，且每张表都真的读到了内容', () => {
    expect(CONTENT_TABLES.length).toBeGreaterThanOrEqual(8);
    const summary = contentSummary();
    for (const [kind, n] of Object.entries(summary)) {
      expect(n, `${kind} 一条都没有 —— 表接错了吧`).toBeGreaterThan(0);
    }
    // 每一条都要有 note：清单的价值一半在"这张表是干什么的"
    for (const t of CONTENT_TABLES) expect(t.note, `${t.kind} 没有 note`).toBeTruthy();
  });

  it('区域：每个 id 常量都有显示名，`unknown` 例外（它是兜底、不该有名字）', () => {
    const missing = Object.values(ZONE_IDS)
      .filter((id) => id !== ZONE_IDS.UNKNOWN)
      .filter((id) => !(id in ZONE_NAMES));
    expect(missing, `这些区域 id 没有显示名：${missing.join(', ')}`).toEqual([]);
    // 反向也要干净：显示名表里不许有 id 常量表里没有的键（多一个就是打字打歪了）
    const extra = Object.keys(ZONE_NAMES).filter((k) => !Object.values(ZONE_IDS).includes(k));
    expect(extra, `显示名表里有 id 常量表里没有的键：${extra.join(', ')}`).toEqual([]);
    expect(ZONE_NAMES[ZONE_IDS.UNKNOWN], 'unknown 不该有显示名 —— 它出现即接线错误').toBeUndefined();
  });

  it('注册表里没有重复 kind', () => {
    const kinds = CONTENT_TABLES.map((t) => t.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it('名册与各 Boss 类里的默认名一致 —— 免得"名册说叫甲、打起来显示乙"', () => {
    const src = readFileSync(join(SRC, 'combat/Boss.js'), 'utf8');
    const magic = readFileSync(join(SRC, 'combat/MagicBoss.js'), 'utf8');
    const space = readFileSync(join(SRC, 'combat/SpaceBoss.js'), 'utf8');
    const voidB = readFileSync(join(SRC, 'combat/VoidBoss.js'), 'utf8');
    const chaos = readFileSync(join(SRC, 'combat/ChaosBoss.js'), 'utf8');
    const named = {
      'shadow-warden': [src, /name:\s*config\.name \?\? '([^']+)'/],
      'archmagus': [magic, /name:\s*'([^']+)'/],
      'singularity-herald': [space, /name:\s*'([^']+)'/],
      'void-chronarch': [voidB, /name:\s*'([^']+)'/],
      'chaos-overlord': [chaos, /name:\s*'([^']+)'/],
    };
    for (const b of BOSS_ROSTER) {
      const [text, re] = named[b.id];
      const m = text.match(re);
      expect(m, `${b.id} 的类里找不到默认名`).toBeTruthy();
      expect(m[1], `${b.id}：名册写 "${b.name}"，类里写 "${m[1]}"`).toBe(b.name);
    }
  });

  it('章节门槛是数据：改了名册就改了门槛，代码里不再有第二份', () => {
    expect(chapterGateFor('void-chronarch')).toBe(4);
    expect(chapterGateFor('chaos-overlord')).toBe(5);
    expect(chapterGateFor('shadow-warden')).toBe(1);
    // 未登记的一律放行（副本 Boss 与将来的野生 Boss）
    expect(chapterGateFor('dungeon-crypt')).toBe(1);
    expect(chapterGateFor('野生-未登记')).toBe(1);
    const em = readFileSync(join(SRC, 'combat/EnemyManager.js'), 'utf8');
    expect(em).toMatch(/chapterGateFor\(boss\.bossId\)/);
    expect(stripComments(em)).not.toMatch(/bossId === '/);   // 两句手写的门槛已删
  });
});

/* ------------------------------------------------------------------ *
 * 三、跨文件扫描：bossId 字面量
 * ------------------------------------------------------------------ */

describe('跨文件：`bossId` 字面量必须是名册里的 id', () => {
  /**
   * 三种形态，都是仓库里真实出现过的：
   * - `bossId: 'x'` —— 赋值（生成、任务、CG、信标…）
   * - `bossId: config.bossId ?? 'x'` —— 各 Boss 类里的默认值
   * - `bossId === 'x'` / `!==` —— 比较（成就、任务统计、门槛）
   * 模板字面量 `bossId: \`dungeon-${...}\`` 由 `isKnownBossId` 的前缀规则放行。
   */
  const FORMS = [
    /bossId\s*:\s*(?:[A-Za-z_$][\w$.]*\s*\?\?\s*)?'([^']+)'/g,
    /bossId\s*[!=]==\s*'([^']+)'/g,
  ];

  /** 扫全树，返回 `{ file, literal }[]` */
  function scan() {
    const hits = [];
    for (const file of walk(SRC)) {
      const code = stripComments(readFileSync(file, 'utf8'));
      for (const re of FORMS) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(code))) {
          hits.push({ file: file.slice(SRC.length + 1).replace(/\\/g, '/'), literal: m[1] });
        }
      }
    }
    return hits;
  }

  it('扫描集自证：真的扫到了字面量（扫到空集就会一路绿灯）', () => {
    const hits = scan();
    expect(hits.length, '一处都没扫到 —— 正则或目录解析跑偏了').toBeGreaterThan(10);
    // 五个真 id 都要被扫到，否则说明只覆盖了部分写法
    for (const id of BOSS_IDS) {
      expect(hits.some((h) => h.literal === id), `没扫到 ${id}`).toBe(true);
    }
  });

  it('每一处字面量都是认得出来的 bossId', () => {
    const bad = scan().filter((h) => !isKnownBossId(h.literal));
    const detail = bad.map((h) => `  ${h.file}: '${h.literal}'`).join('\n');
    expect(bad, `这些 bossId 名册里没有（打错一个字母的典型症状是"静默不生效"）：\n${detail}`).toEqual([]);
  });

  it('门禁自证：塞一个打错的名字进去，扫描必须咬得住', () => {
    const sample = stripComments("em.spawnBoss({ bossId: 'shadow-wardne' });");
    const m = /bossId\s*:\s*(?:[A-Za-z_$][\w$.]*\s*\?\?\s*)?'([^']+)'/g.exec(sample);
    expect(m?.[1]).toBe('shadow-wardne');
    expect(isKnownBossId(m[1])).toBe(false);   // 少一个字母 → 会被记成越界
  });

  it('`isKnownBossId` 的边界：副本前缀认、空后缀不认、非字符串不认', () => {
    expect(isKnownBossId('dungeon-crypt')).toBe(true);
    expect(isKnownBossId(`${DUNGEON_BOSS_PREFIX}`)).toBe(false);
    expect(isKnownBossId('')).toBe(false);
    expect(isKnownBossId(null)).toBe(false);
    expect(isKnownBossId(123)).toBe(false);
    expect(isKnownBossId('shadow-warden')).toBe(true);
  });

  it('名册自身的 id 合法且唯一（`id` 形状与 POI / 区域同一把尺子）', () => {
    for (const b of BOSS_ROSTER) {
      expect(ID_PATTERN.test(b.id), `${b.id} 不是 kebab-case`).toBe(true);
    }
    expect(new Set(BOSS_IDS).size).toBe(BOSS_IDS.length);
    expect(bossById('nope')).toBe(null);
    expect(bossById('archmagus')?.name).toBe('大奥术师·萨尔林');
  });

  it('入口真的验了表，而且错表红得看得见（动态 import 落进 showBootError，且早于 new Game）', () => {
    const main = readFileSync(join(SRC, 'main.js'), 'utf8');
    // 错表必须落进 showBootError：静态 import 的求值在 main.js 正文之前，那条 Error
    // 只会成为控制台里一条 uncaught，页面是"永远转圈"（真机读数 S1 实测）。
    expect(main).toMatch(/try \{\s*await import\('\.\/content\/registry\.js'\);\s*\} catch \(e\) \{[\s\S]{0,200}?showBootError\(/);
    // 静态写法不许回来 —— 回来就又变成看不见的红
    expect(main).not.toMatch(/^import '\.\/content\/registry\.js';/m);
    // 验表发生在建世界之前（比的是**正文**，不比注释 —— 第一版比的就是注释里那句
    // 「在 `new Game()` 之前红」，于是索引比小了，红在自己的说明文字上）
    const body = stripComments(main);
    expect(body.indexOf("await import('./content/registry.js')"))
      .toBeLessThan(body.indexOf('new Game('));
    // registry 自己顶层仍自跑一次：任何别的导入者（含 npm test）一 import 就红
    const reg = readFileSync(join(SRC, 'content/registry.js'), 'utf8');
    expect(reg).toMatch(/^assertContent\(\);$/m);
  });
});

/* ------------------------------------------------------------------ *
 * 四、字段级引擎的细枝末节（`checkFields` 直测）
 * ------------------------------------------------------------------ */

describe('checkFields：字段级规则', () => {
  const ctx = { ids: new Map() };

  it('非对象行直接报"期望对象"，不继续钻字段', () => {
    expect(checkFields(null, { a: { t: 'int' } }, 'p', ctx)).toEqual(['p: 期望对象，实际 null']);
    expect(checkFields([], { a: { t: 'int' } }, 'p', ctx)).toEqual(['p: 期望对象，实际 数组']);
  });

  it('数值边界：`min` / `max` / `exclusiveMin` 各自生效', () => {
    const spec = { a: { t: 'number', exclusiveMin: 0, max: 1 } };
    expect(checkFields({ a: 0 }, spec, 'p', ctx)).toHaveLength(1);   // 0 不满足 > 0
    expect(checkFields({ a: 1 }, spec, 'p', ctx)).toEqual([]);
    expect(checkFields({ a: 1.1 }, spec, 'p', ctx)).toHaveLength(1);
    expect(checkFields({ a: NaN }, spec, 'p', ctx)).toHaveLength(1);
  });

  it('`enum` 把可用值列出来（省一次翻表）', () => {
    const errs = checkFields({ a: 'z' }, { a: { t: 'enum', of: ['x', 'y'] } }, 'p', ctx);
    expect(errs[0]).toMatch(/x \/ y/);
  });

  it('`record` 只要求是对象，键值不查（如元素抗性表）', () => {
    expect(checkFields({ a: {} }, { a: { t: 'record' } }, 'p', ctx)).toEqual([]);
    expect(checkFields({ a: [] }, { a: { t: 'record' } }, 'p', ctx)).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ *
 * 五、分层：`content/` 必须自洽
 * ------------------------------------------------------------------ */

describe('`content/` 自洽：这一层谁也不依赖', () => {
  /**
   * 这条不变量是切片1 断边与切片2 做注册表的共同地基：
   * `content/` 只要有一处 import 了特性层，任何块读它就会形成回边（B37 复发的形状），
   * 而注册表本身也会被拖进"谁来初始化谁"的先后问题。
   *
   * 本片就踩过一次：`registry.js` 一开始直接 `import { BOSS_DEFEAT_LINES } from '../game/BossDialogue.js'`
   * —— 表在 `game/` 里、注册表在 `content/` 里，一句话就把地基打穿了。
   * 正确做法是把**数据**搬进 `content/`（那次搬的是整份 `BossDialogue.js`），
   * 而不是让 `content/` 去够 `game/`。
   */
  const CONTENT = join(SRC, 'content');
  /**
   * 四种写法都要吃到：`import { x } from '...'`（最常见）、`export { x } from '...'`（再导出，
   * 由 `from` 那一半覆盖）、副作用 import `import '...'`（**没有 `from`，第一版正则吃不到的那种**）
   * 与动态 `import('...')`。
   */
  const IMPORT_RE = /(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;

  /**
   * 取一份 spec 清单。**先归零 `lastIndex`**：共享的全局正则会跨用例残留位置 ——
   * 上一条用例若中途抛错（本片第一版就抛了 `resolve is not defined`），
   * 下一条 `matchAll` 会从残留处开始读，于是"少读一句"看起来像正则漏了一种写法。
   * 判据、清单入口各只有一份，两处都不许自己再写一遍。
   */
  const importSpecs = (code) => {
    IMPORT_RE.lastIndex = 0;
    return [...code.matchAll(IMPORT_RE)].map((m) => m[1]);
  };

  /**
   * 这一句 import 是否**越出了 `content/`** —— 全片唯一的判据，扫描与自证都调它。
   *
   * 判据是**解析后的落点**，不是字面量：`../content/keybinds.js` 从 `content/tuning.js`
   * 出发仍然落在本层里（合法），而 `../game/Foo.js` 才是越界。按字面量判会把前者误伤。
   *
   * 第一版写的是 `if (spec.startsWith('.')) continue;` —— 一句把**所有**相对 import
   * 放行（向上够的那些也全放了），门禁当场死掉；而它的"自证"用的是另一套判据
   * （`!startsWith('./')`），于是照常绿。**自证与被判必须共用同一句话**，否则自证只是
   * 在复述自己以为的规则 —— 这一条由变异 K9（在 `content/` 里现造一个文件、向上
   * `import` 特性层，两种写法各一句）实测逼出来。
   */
  const escapesContent = (spec, fromFile) => {
    if (!spec.startsWith('.')) return false;                 // 包依赖（three 这类）不算越界
    const target = resolve(dirname(fromFile), spec);
    return target !== CONTENT && !target.startsWith(CONTENT + sep);
  };

  it('`content/` 里没有一处 import 指向 `content/` 之外', () => {
    const files = walk(CONTENT);
    expect(files.length, '扫描集空了 —— 目录解析跑偏，这条会一路绿灯').toBeGreaterThanOrEqual(10);
    const offenders = [];
    for (const file of files) {
      const code = stripComments(readFileSync(file, 'utf8'));
      for (const spec of importSpecs(code)) {
        if (escapesContent(spec, file)) {
          offenders.push(`  ${file.slice(SRC.length + 1).replace(/\\/g, '/')} -> ${spec}`);
        }
      }
    }
    expect(offenders, `content/ 是地基层，不许向上够：\n${offenders.join('\n')}`).toEqual([]);
  });

  it('门禁自证：塞一句向上 import，扫描必须咬得住（同一个判据，不是复述）', () => {
    const fake = join(CONTENT, 'selfCheck.js');
    const code = stripComments([
      "import { x } from '../game/Foo.js';",
      "import { y } from './bar.js';",
      "import { z } from '../content/keybinds.js';",
      "import * as THREE from 'three';",
      "import '../engine/Scheduler.js';",            // 副作用 import：没有 `from`，第一版正则吃不到
      "const p = import('./lazy.js');",              // 动态 import
    ].join('\n'));
    const specs = importSpecs(code);
    // 先证"四种写法都读得到"（读不到的那条不会变成红，只会在真实代码里静默漏网）
    expect(specs.sort(), '正则漏了一种 import 写法').toEqual(
      ['../content/keybinds.js', '../engine/Scheduler.js', '../game/Foo.js', './bar.js', './lazy.js', 'three'].sort(),
    );
    // 再用**同一个判据**筛越界的：只有真的越出 content/ 的那两句
    const hits = specs.filter((s) => escapesContent(s, fake));
    expect(hits.sort(), '向上够的那句必须被同一个判据抓出来')
      .toEqual(['../engine/Scheduler.js', '../game/Foo.js'].sort());
    // 反面也钉住：同层、绕一圈回来的同层、包依赖、动态同层，四种都不许误伤
    expect(escapesContent('./bar.js', fake)).toBe(false);
    expect(escapesContent('../content/keybinds.js', fake)).toBe(false);
    expect(escapesContent('three', fake)).toBe(false);
    expect(escapesContent('./lazy.js', fake)).toBe(false);
    expect(escapesContent('../game/Foo.js', fake)).toBe(true);
  });
});
