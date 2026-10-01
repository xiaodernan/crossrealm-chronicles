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
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, sep } from 'node:path';
import {
  CONTENT_TABLES, checkContent, checkTable, checkFields, checkRestDialogueTree,
  contentSummary, ID_PATTERN,
} from '../src/content/registry.js';
import {
  BOSS_ROSTER, BOSS_IDS, DUNGEON_BOSS_PREFIX, bossById, isKnownBossId, chapterGateFor,
} from '../src/content/bossRoster.js';
import { ZONE_IDS, ZONE_NAMES } from '../src/content/ZoneIdentity.js';
import { REST_DIALOGUES } from '../src/content/restDialogues.js';

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
    // `bossId === 'x'` / `!==` —— 但**排除 `typeof bossId !== 'string'`**：
    // 那是类型检查，右边的字面量是类型名不是 bossId。W-B1 切片4 给 `dungeonIdOf` 加
    // `typeof bossId !== 'string'` 时就被这条误报过一次（`'string'` 恰好也长得像 kebab-case id）。
    /(?<!typeof\s)bossId\s*[!=]==\s*'([^']+)'/g,
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

  it('扫描器自证：`typeof bossId !== \'string\'` 不算一次 bossId 比较', () => {
    // 这是本片踩到的假阳性：类型检查右边的字面量是类型名，不是 bossId
    const code = stripComments("if (typeof bossId !== 'string' || !bossId) return null;");
    const m = [...code.matchAll(FORMS[1])];
    expect(m).toEqual([]);
    // 而真正的比较仍要扫到
    const real = stripComments("if (bossId !== 'shadow-warden') return;");
    expect([...real.matchAll(FORMS[1])].map((x) => x[1])).toEqual(['shadow-warden']);
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

/* ------------------------------------------------------------------ *
 * 六、W-B2 给引擎加的三件新词汇：`map` / `invariant` / `index` 键可被 ref
 *
 * 这三件都是**被真实表逼出来的**，不是先写好的通用能力：
 * - `map`：营火那棵树的 `节点 id → 节点` 是"字段本身又是一张表"，退化成 `record`
 *   就等于节点内部怎么写错都没人管；
 * - `invariant`：`next` 指向哪个节点不是字段形状问题，是整棵树的连通问题；
 * - `index` 键进 `collectIds`：`zone: { t: 'ref', of: 'zones' }` 原先没地方可查，
 *   只能退回 `t: 'id'`（"看着像 id 就行"），`zone: 'magicc'` 会一路绿到运行时。
 *
 * 所以这一节每条都配**正反两面**：坏表要红，好表不许红。
 * ------------------------------------------------------------------ */

describe('`map` 类型：表里某个字段本身又是一张表', () => {
  const ctx = { ids: new Map([['zones', new Set(['hub', 'magic'])]]) };
  const nodeOf = { name: { t: 'string' } };
  const mapSpec = (extra = {}) => ({ t: 'map', of: { t: 'row', of: nodeOf }, ...extra });
  /** 套在 `index` 形状的 value 上（真表就是这么用的） */
  const wrapped = (mapValue, spec) => checkTable(
    { kind: 'demo', shape: 'index', table: { hub: mapValue }, value: spec }, ctx,
  );

  it('好 map：键是 kebab id、值合字段表 —— 一处都不报', () => {
    expect(wrapped({ 'n-1': { name: '甲' }, 'n-2': { name: '乙' } }, mapSpec())).toEqual([]);
  });

  it('键不是 kebab-case 要红；`keySet: false` 才放宽（NPC 台词按章节号做键那种）', () => {
    const errs = wrapped({ 'Bad Key': { name: '甲' } }, mapSpec());
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/demo\["hub"\] 的键 "Bad Key": 期望 kebab-case id/);
    expect(wrapped({ 2: { name: '甲' } }, mapSpec({ keySet: false }))).toEqual([]);
  });

  it('值里的字段错带**完整路径**：一眼跳到哪个节点的哪一格', () => {
    const errs = wrapped({ 'n-1': { name: 7 } }, mapSpec());
    expect(errs).toEqual([expect.stringContaining('demo["hub"].n-1.name: 期望字符串')]);
  });

  it('键也能 ref（`keyRef`）：不存在的 id 当键要红', () => {
    const errs = checkFields(
      { m: { hub: { name: '甲' }, ghost: { name: '乙' } } },
      { m: mapSpec({ keyRef: { of: 'zones' } }) },
      'p', ctx,
    );
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/p\.m 的键 "ghost": "ghost" 不在 zones 里/);
  });

  it('map 的字段类型写错，报的是"registry 自己写错了"（不许静默通过）', () => {
    expect(wrapped({ 'n-1': 1 }, { t: 'map', of: { t: 'nope' } }).join(''))
      .toMatch(/未知的字段类型 "nope"（registry 写错了）/);
  });

  it('值不是对象（数组 / null）要红，不许当成空 map 放过', () => {
    expect(wrapped([], mapSpec()).join('')).toMatch(/demo\["hub"\]: 期望对象，实际 数组/);
    expect(wrapped(null, mapSpec()).join('')).toMatch(/demo\["hub"\]: 期望对象，实际 null/);
  });

  it('`nullable` 只放行标了它的那一格：没标的字段给 null 一样红', () => {
    // 口子存在的理由：营火 hub 的 quest 那一格文本由运行时按当前任务现填
    expect(REST_DIALOGUES.hub.nodes.quest.text).toBe(null);
    // 同一份数据换到没标 nullable 的字段上就必须红（否则"文本永远缺失"是查不出来的）
    expect(checkFields({ name: null }, nodeOf, 'p', ctx))
      .toEqual(['p.name: 期望字符串，实际 null']);
    expect(checkFields({ name: '' }, nodeOf, 'p', ctx)).toEqual(['p.name: 不许是空串']);
  });
});

describe('营火树的 `invariant`：形状表达不了的"这棵树连不连得起来"', () => {
  /** 一棵合法小树：start → b → 回 start，另有一格 `action: rest` */
  const legal = {
    start: { speaker: '甲', text: '……', choices: [{ label: '去', next: 'b' }, { label: '歇', action: 'rest' }] },
    b: { speaker: '甲', text: '……', choices: [{ label: '回', next: 'start' }] },
  };

  /**
   * 下面几条都要把种下去的那一棵**并进真表**再校验，不能只交一棵。
   *
   * 理由不是"写法偏好"：`checkRestDialogueTree` 现在多了一条成对规则（W-B4 切片1）——
   * `REST_NPC_DEFS` 里有定义而表里没有那棵树，也要红。只交 `{ hub: … }` 的旧写法于是白拿
   * 5 条"别的五座没树"的错，把我要看的那一条埋在下面。真表打底，红才只可能来自种植入的那一棵。
   */
  const whole = (over) => ({ ...REST_DIALOGUES, ...over });
  const treeOf = (over) => checkRestDialogueTree(whole(over));

  it('控制组：合法树零错误（少了这条，下面五条只是"什么都报"）', () => {
    expect(treeOf({ hub: { nodes: legal } })).toEqual([]);
  });

  it('控制组反面：只交一棵树要红 —— 成对规则读的是整张表，不是那一棵', () => {
    const errs = checkRestDialogueTree({ hub: { nodes: legal } });
    // 五座有定义却没树的营火各报一次（旧写法把这五条当成"我要看的错"，其实一条都不是）
    expect(errs).toHaveLength(5);
    expect(errs.every((e) => /有 NPC 定义却没有对话树/.test(e))).toBe(true);
  });

  it('死 `next`：本树没有这一节点（运行时是 `if (!node) return`，玩家只看见窗口自己关掉）', () => {
    const errs = treeOf({
      hub: { nodes: { start: { speaker: '甲', text: '甲', choices: [{ label: 'x', next: 'b' }] } } },
    });
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/next 指向 "b"，但 hub 这棵树里没有这个节点/);
  });

  it('跨区互跳也算死 `next`：树按营火取，别的区有这一节点不算', () => {
    const errs = treeOf({
      hub: { nodes: { start: { speaker: '甲', text: '甲', choices: [{ label: 'x', next: 'magic-node' }] } } },
      magic: {
        nodes: {
          start: { speaker: '乙', text: '乙', choices: [{ label: '歇', action: 'rest' }] },
          'magic-node': { speaker: '乙', text: '乙', choices: [{ label: '歇', action: 'rest' }] },
        },
      },
    });
    // hub 里指不到 magic-node；顺带 magic 那一格成了孤儿（没有选择通向它）
    expect(errs.join('\n')).toMatch(/hub\/start\.choices\[0\]: next 指向 "magic-node"/);
    expect(errs.join('\n')).toMatch(/magic\/magic-node: 没有任何选择通向它/);
  });

  it('孤儿节点：写了，但没有任何选择通向它 → 玩家永远看不到', () => {
    const rest = [{ label: '歇', action: 'rest' }];
    const errs = treeOf({
      hub: {
        nodes: {
          start: { speaker: '甲', text: '甲', choices: rest },
          'deep-cut': { speaker: '甲', text: '甲', choices: rest },
        },
      },
    });
    expect(errs).toEqual([expect.stringContaining('hub/deep-cut: 没有任何选择通向它')]);
  });

  it('一格选择既没 `next` 也没 `action`：点它只有关窗（`_pick` 的兜底路径）', () => {
    const errs = treeOf({
      hub: { nodes: { start: { speaker: '甲', text: '甲', choices: [{ label: '随便' }] } } },
    });
    expect(errs.join('\n')).toMatch(/既没有 next 也没有 action/);
  });

  it('`next` 与 `action` 同时给：运行时先认 action，next 是白写的 → 要红', () => {
    const errs = treeOf({
      hub: { nodes: { start: { speaker: '甲', text: '甲', choices: [{ label: 'x', next: 'start', action: 'rest' }] } } },
    });
    expect(errs.join('\n')).toMatch(/next 与 action 同时给了/);
  });

  it('`choices` 不是数组：直接报，不钻进去', () => {
    const errs = treeOf({
      hub: { nodes: { start: { speaker: '甲', text: '甲', choices: { a: 1 } } } },
    });
    expect(errs).toEqual([expect.stringContaining('hub/start: choices 不是数组')]);
  });

  it('invariant 真的挂在 `checkTable` 上，而且形状层看不见这类错（它挣到了这个槽位）', () => {
    const entry = CONTENT_TABLES.find((t) => t.kind === 'restDialogues');
    const bad = {
      ...entry,
      table: whole({
        hub: {
          nodes: { start: { speaker: '甲', text: '甲', choices: [{ label: 'l', next: 'ghost-node' }] } },
        },
      }),
    };
    // `zones` 的键集合直接从真表取：手抄一份"有哪六座"会在表变动时先红在这里（跟要看的错无关）
    const errs = checkTable(bad, { ids: new Map([['zones', new Set(Object.keys(REST_DIALOGUES))]]) });
    expect(errs.join('\n')).toMatch(/next 指向 "ghost-node"/);
    // `ghost-node` 是合法 kebab id，字段表逐格全过 —— 剩下的错只可能来自 invariant
    expect(errs.filter((e) => !/没有这个节点/.test(e))).toEqual([]);
  });

  it('门禁自证：把**真空表**里一处 next 的目标节点删掉，`checkContent` 必须红', () => {
    let removed = null;
    const tables = CONTENT_TABLES.map((t) => {
      if (t.kind !== 'restDialogues') return t;
      const clone = structuredClone(t.table);
      for (const [zone, tree] of Object.entries(clone)) {
        const withNext = Object.values(tree.nodes)
          .flatMap((n) => n.choices ?? [])
          .find((c) => c.next && c.next !== 'start');
        if (withNext) {
          delete clone[zone].nodes[withNext.next];
          removed = `${zone}/${withNext.next}`;
          return { ...t, table: clone };
        }
      }
      return t;
    });
    // 先证这刀真的砍得下去（砍不动的话，下面的红只是白捡）
    expect(removed, '营火树里找不到一处可删的 next 目标 —— 表形状变了，这条要跟着改').toBeTruthy();
    expect(checkContent(tables).join('\n')).toMatch(new RegExp(`next 指向 "${removed.split('/')[1]}"`));
  });
});

describe('`ref` 能查 `index` 形状的表：收的是键，不是行里的 id 字段', () => {
  const zones = { kind: 'zones', shape: 'index', table: { hub: 'A', magic: 'B' }, value: { t: 'string' } };
  const things = (rows) => ({
    kind: 'things',
    shape: 'rows',
    table: rows,
    row: { id: { t: 'id' }, zone: { t: 'ref', of: 'zones' } },
  });

  it('好引用零错误，坏引用一条不多报（可用值列出来，省一次翻表）', () => {
    expect(checkContent([zones, things([{ id: 'a-1', zone: 'hub' }])])).toEqual([]);
    const errs = checkContent([zones, things([{ id: 'a-1', zone: 'magicc' }])]);
    expect(errs).toEqual([
      expect.stringContaining('"magicc" 不在 zones 里（可用：hub / magic）'),
    ]);
  });

  it('门禁自证：把真回声目录某条的 `zone` 打错一个字母，加载期就红', () => {
    const tables = CONTENT_TABLES.map((t) => (t.kind === 'echoes'
      ? { ...t, table: [...t.table, { ...t.table[0], id: 'probe-typo-zone', zone: 'magicc' }] }
      : t));
    const errs = checkContent(tables);
    expect(errs.filter((e) => /magicc/.test(e))).toHaveLength(1);
    expect(errs[0]).toMatch(/echoes\[49\]\.zone/);
  });
});

/* ------------------------------------------------------------------ *
 * 七、内容普查：搬表不许掉行
 *
 * W-B2 把十三张表从 `game/**` + `ui/**` 搬进 `content/`，而 HEAD 那边是
 * `merge*Wave4(merge*Wave3(merge(base)))` 的**四层合并链**。链式合并最怕的一件事是
 * "搬的时候只搬了 base"：症状不是崩溃，是图鉴少三条、营火少一段 —— 静态扫描全绿。
 * 这些数字是从 HEAD 逐条深比对之后实测钉下来的（`.tmp-wb2/audit2.mjs`），不是估的。
 * ------------------------------------------------------------------ */

describe('W-B2 内容普查：条数钉死', () => {
  it('每张表的条数 = 与 HEAD 深比对那天实测的数', () => {
    expect(contentSummary()).toMatchObject({
      echoes: 49,
      ambientZoneEvents: 6,
      loreFragments: 18,
      npcLines: 3,
      restDialogues: 6,
      achievementsExtra: 7,
      achievementsPopCulture: 14,
      cgGalleryBonusExtra: 5,
      sideQuestsPop: 14,
      helpSectionsExtra: 3,
    });
  });

  it('营火树：6 个营火 / 77 个节点 / 178 格选择（节点与选择藏在 map 里，`contentSummary` 数不到）', () => {
    let nodes = 0;
    let choices = 0;
    for (const tree of Object.values(REST_DIALOGUES)) {
      const list = Object.values(tree.nodes);
      nodes += list.length;
      choices += list.reduce((n, node) => n + (node.choices?.length ?? 0), 0);
    }
    expect({ zones: Object.keys(REST_DIALOGUES).length, nodes, choices })
      .toEqual({ zones: 6, nodes: 77, choices: 178 });
  });

  it('六大区域各有营火树，且每棵树都真的能被 `RestDialogue` 取到（键就是营火 id）', () => {
    for (const zone of ['hub', 'fantasy', 'magic', 'space', 'void', 'abyss']) {
      expect(REST_DIALOGUES[zone], `${zone} 没有营火对话树`).toBeTruthy();
      expect(Object.keys(REST_DIALOGUES[zone].nodes)).toContain('start');
    }
  });
});

/* ------------------------------------------------------------------ *
 * 八、不得回头：删掉的"增量数据文件"不能再生回来，搬过来的表不能有两份
 * ------------------------------------------------------------------ */

describe('搬完不许回头', () => {
  /** W-B2 切片3 删除的文件（四层合并链 + 各自的 Extra/Extras 增量档） */
  const DELETED = [
    'src/game/AchievementExtras.js',
    'src/game/CgGalleryRegistryExtras.js',
    'src/game/LoreFragmentsPopCulture.js',
    'src/game/PopCultureHomageRegistry.js',
    'src/game/PopCultureHomageRegistryWave2.js',
    'src/game/PopCultureHomageRegistryWave3.js',
    'src/game/PopCultureHomageRegistryWave4.js',
    'src/game/RestDialogueExtras.js',
    'src/game/RestDialogueExtras2.js',
    'src/game/RestDialoguePopCulture.js',
    'src/game/RestDialoguePopCultureWave2.js',
    'src/game/RestDialoguePopCultureWave3.js',
    'src/game/RestDialoguePopCultureWave4.js',
    'src/game/WorldAmbientPopCulture.js',
    'src/game/WorldAmbientPopCultureWave3.js',
    'src/game/WorldAmbientPopCultureWave4.js',
    'src/ui/HelpManualExtras.js',
  ];

  it('那批增量数据文件今天确实不在磁盘上（再生回来就是第二份真源）', () => {
    const back = DELETED.filter((rel) => existsSync(join(ROOT, rel)));
    expect(back, `这些已被合并的文件又出现了：\n${back.join('\n')}`).toEqual([]);
    expect(DELETED.length).toBe(17);
  });

  /**
   * 判据只有一份：扫描与自证共用它。
   * 「声明」和「转口」都算第二份 —— 转口不改数据，但它让"这张表的真源在哪"
   * 重新变成两个答案（`game/RestDialogue.js` 切片3 收尾时就挂着这么一句）。
   */
  const movedNames = [
    'ECHOES', 'ZONE_EVENTS_POP', 'LORE_FRAGMENTS_POP', 'NPC_LINES_POP', 'REST_DIALOGUES',
    'ACHIEVEMENTS_EXTRA', 'ACHIEVEMENTS_POP_CULTURE', 'ALL_ACHIEVEMENTS_EXTRA',
    'ECHO_FRANCHISE_BUCKETS', 'CG_GALLERY_BONUS_EXTRA', 'SIDE_QUESTS_POP', 'HELP_SECTIONS_EXTRA',
    // HEAD 的旧名：目录搬走之后这个名字就不该再被声明或转口（它曾经是"两份真源"的入口）
    'POP_CULTURE_ECHOES',
  ];
  const isSecondSource = (code, name) => new RegExp(
    `export\\s+(?:const|let|var)\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b`,
  ).test(code);

  it('`content/` 之外没有任何一处再声明或转口这些表', () => {
    const dupes = [];
    for (const file of walk(SRC)) {
      const rel = file.slice(SRC.length + 1).replace(/\\/g, '/');
      if (rel.startsWith('content/')) continue;
      const code = stripComments(readFileSync(file, 'utf8'));
      for (const name of movedNames) {
        if (isSecondSource(code, name)) dupes.push(`  ${rel}: ${name}`);
      }
    }
    expect(dupes, `一张表只能有一份真源：\n${dupes.join('\n')}`).toEqual([]);
  });

  it('门禁自证：转口一句 `export { REST_DIALOGUES }` 必须被同一个判据抓出来', () => {
    const shim = "import { REST_DIALOGUES } from '../content/restDialogues.js';\nexport { REST_DIALOGUES };";
    expect(isSecondSource(stripComments(shim), 'REST_DIALOGUES')).toBe(true);
    // 反面：只是**用**它（import 后在类里取值）不许误伤 —— 真源在 content/，消费者在 game/
    expect(isSecondSource(
      stripComments("import { REST_DIALOGUES } from '../content/restDialogues.js';\nconst t = REST_DIALOGUES.hub;"),
      'REST_DIALOGUES',
    )).toBe(false);
    // 名字前缀重叠也不误伤：`ALL_ACHIEVEMENTS_EXTRA` 不是 `ACHIEVEMENTS_EXTRA`
    expect(isSecondSource('export const ALL_ACHIEVEMENTS_EXTRA = [];', 'ACHIEVEMENTS_EXTRA')).toBe(false);
  });
});
