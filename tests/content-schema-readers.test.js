/**
 * 门禁：内容表 schema 里的每一格都必须有读者（W-B3 余项 —— 注册表不许答应没人实现的事）。
 *
 * ## 这一族的形状
 *
 * `content/registry.js` 的 `CONTENT_TABLES[].row` 是"这张表允许写哪些格"的唯一名册。它一开口
 * 答应某格，写表的人就会往行里写那一格 —— 而如果没人读它，那一格的全部作用就是**让文档显得
 * 比实现多**。动手前这里挂着五格幽灵，全在 `objectives`：
 *  - `failsOn` / `failMessage` / `onFail`：`ObjectiveEngine`（W-B3 切片4 已删）的遗物。表头
 *    注释至今写着"失败条件函数名 / 失败时显示的文案 / 失败时执行的动作"，而全仓没有任何一处读它们
 *    —— 玩家侧的"任务失败"从来没存在过，schema 却一直在承诺它（也一格里都没写）。
 *  - `branchCondition`：五行写的都是**本行 `condition` 的逐字副本**，读者为零；跳转的时机实际由
 *    表序与 `chapterGateAfter` 决定。
 *  - `revisit`：全表只有一行写过（`infinity`），没人读。
 * 同族的还有 `CONDITIONS.checkChapter3Ready` —— 它唯一的引用者就是那五行 `branchCondition`，
 * 随本片一起除名。
 *
 * ## 口径与限度（如实记）
 *
 * 这一条问的是"**有没有人用这一格的写法**"，不是"这一格在这一行上有没有被读到"。所以：
 *  - 抓得住零读者的幽灵格（上面那五格正是这么抓到的）；
 *  - 抓不住同名异主 —— `id` / `type` 这类到处都有的名字只要有任何一处 `.id` 就算有读者。
 *    要收紧得先有真正的 AST 解析，不在这一片里赊账。
 *  - 读侧范围**含 `scripts/` 与 `index.html`**：`materialSurfaces` 那一族的 `octaves` /
 *   `normalStrength` 由离线烘焙 `scripts/bake-textures.mjs` 消费，只看运行时的 `src/` 会把它们
 *   整批误报成"写了没人读"（第一刀实测错过）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CONTENT_TABLES } from '../src/content/registry.js';

const ROOT = process.cwd();

const walk = (dir) => {
  const out = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const full = join(dir, name);
    if (statSync(join(ROOT, full)).isDirectory()) out.push(...walk(full));
    else if (/\.(js|mjs|ps1|py)$/.test(name)) out.push(full);
  }
  return out;
};

/** 剥掉块注释与行注释 —— 注释里写的字段名不是读者（表头那段"没有的字段"正是这么写的）。 */
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** 读侧目录与额外文件：`scripts/` 的离线烘焙与 `index.html` 的滑杆都是**真消费者**。 */
const READER_DIRS = ['src', 'scripts'];
const EXTRA_FILES = ['index.html'];

/**
 * 全部"读某格"的写法。四条，一条都不能少（少一条就是把活代码判成幽灵格）：
 *  - `.名` —— 属性访问。正则按 **Unicode 字母**认，`层.音量` 这种中文属性名也在这里
 *    （`\w` 只认 ASCII，第一版就是这么把 `zoneAmbience.音量` 误判成无人读的）；
 *  - `['名']` 与 `'名'` —— 动态取格与**按名字查表**（难度的乘子是 `difficultyMultiplier('enemyHp')`，
 *    写的是字符串而不是点号）；
 *  - `{ 名, 别的名 }` 里没有冒号的那一项 —— 解构绑定，`for (const { lattice, amp } of octaves)`
 *    这种连 `=` 都没有（第一版要求 `\}\s*=`，就把烘焙脚本的读者读丢了）。
 */
const collectReads = () => {
  const files = [...READER_DIRS.flatMap(walk), ...EXTRA_FILES.filter((f) => statSync(join(ROOT, f)).isFile())];
  const read = new Set();
  for (const f of files) {
    const body = stripComments(readFileSync(join(ROOT, f), 'utf8'));
    for (const m of body.matchAll(/\.([\p{L}\p{N}_$][\p{L}\p{N}_$]*)/gu)) read.add(m[1]);
    for (const m of body.matchAll(/['"]([\p{L}\p{N}_$][\p{L}\p{N}_$]*)['"]/gu)) read.add(m[1]);
    for (const m of body.matchAll(/\{([^{}]*)\}/g)) {
      for (const part of m[1].split(',')) {
        const item = part.trim();
        if (item.includes(':')) continue; // `{ 名: 值 }` 是写，不是读
        const name = item.replace(/^\.\.\./, '').trim();
        if (/^[\p{L}\p{N}_$][\p{L}\p{N}_$]*$/u.test(name)) read.add(name);
      }
    }
  }
  return { read, 文件数: files.length };
};

/**
 * schema 里声明的每一格（**含嵌套**）。
 * 只走顶层会漏掉一整族：`materialSurfaces` 用的是 `value.of`，`octaves` 那一族的
 * `lattice` / `amp` 又嵌在 `of.of` 里 —— 而"注册表答应了、没人读"这件事与格子嵌几层无关。
 * `t:'enum'` 的 `of` 是取值名单而不是子 schema，所以只在 `of` 是普通对象时下降。
 */
const schemaFields = (tables = CONTENT_TABLES) => {
  const out = [];
  const descend = (kind, 路径, spec) => {
    for (const [name, def] of Object.entries(spec ?? {})) {
      const 全 = 路径 ? `${路径}.${name}` : name;
      out.push({ kind, field: name, 路径: 全 });
      const 子 = def?.of;
      if (子 && typeof 子 === 'object' && !Array.isArray(子)) descend(kind, 全, 子);
    }
  };
  for (const entry of tables) {
    const spec = entry?.row ?? (entry?.value?.of ?? (entry?.value?.t === 'row' ? entry.value.of : null)) ?? {};
    descend(entry.kind, '', spec);
  }
  return out;
};

const { read: 读者集合, 文件数 } = collectReads();

/** 一张假表：判据只认 `CONTENT_TABLES` 的那个形状，测试往里塞幽灵格、塞"有读者的格"用的是同一把尺子。 */
const _ghostTable = (名) => [{ kind: 'probe', row: { [名]: { t: 'string' } } }];

describe('① 每一格都有读者（真表）', () => {
  it('读侧真的扫到了东西（分母不许是空的）', () => {
    expect(文件数, '读侧一个文件都没扫 —— 这一组在空转').toBeGreaterThan(200);
    expect(读者集合.size).toBeGreaterThan(1000);
  });

  it('CONTENT_TABLES 里声明的格名，逐个都有一位读者', () => {
    const 全部 = schemaFields();
    expect(全部.length, 'schema 一格都没抠出来 —— 判据在看一份空表').toBeGreaterThan(150);
    const 无主 = 全部.filter(({ field }) => !读者集合.has(field));
    expect(
      无主.map((o) => `${o.kind}.${o.路径}`).sort(),
      '这些格注册表答应得很响，全仓没有一处读它们：写进行里不会有任何后果（B 族"装饰性声明"）',
    ).toEqual([]);
  });
});

describe('② arming：判据不是摆设', () => {
  it('塞进一格没人读的幽灵 ⇒ 当场点名', () => {
    const 表 = [...schemaFields().slice(0, 1), ...schemaFields(_ghostTable('ghostFieldNobodyReads'))];
    const 无主 = 表.filter(({ field }) => !读者集合.has(field));
    expect(无主.map((o) => o.field)).toEqual(['ghostFieldNobodyReads']);
  });

  it('幽灵有了读者 ⇒ 不再点名（判据认的是读者，不是新格子）', () => {
    const 有主 = [{ kind: 'probe', field: 'condition' }, { kind: 'probe', field: 'waypoint' }];
    for (const o of 有主) expect(读者集合.has(o.field), `${o.field} 本该有读者`).toBe(true);
    expect(有主.filter(({ field }) => !读者集合.has(field))).toEqual([]);
  });

  it('注释里的字段名不算读者（表头那段"没有的字段"说的就是这件事）', () => {
    const 剥 = stripComments('/** branchCondition: 分支条件函数名 */\nconst x = 1; // revisit\n');
    expect(剥).not.toMatch(/branchCondition/);
    expect(剥).not.toMatch(/revisit/);
  });
});

describe('③ 历史钉子：那五格不许回流', () => {
  const 名 = ['failsOn', 'failMessage', 'onFail', 'branchCondition', 'revisit'];
  const objectives = CONTENT_TABLES.find((e) => e.kind === 'objectives');

  it('objectives 的 row schema 里没有它们', () => {
    for (const k of 名) expect(objectives.row, `schema 又把 ${k} 答应回来了`).not.toHaveProperty(k);
  });

  it('表里也没有一行还写着它们（写了没人读 = 下一片又要来删）', () => {
    const 表 = objectives.table ?? [];
    for (const k of 名) {
      const 还写着 = 表.filter((r) => r && Object.prototype.hasOwnProperty.call(r, k)).map((r) => r.id);
      expect(还写着, `${k} 还挂在这些行上：${还写着.join(' / ')}`).toEqual([]);
    }
  });

  it('表头注释把"为什么没有"写明（删掉而不解释，下一个人会照着旧记忆加回来）', () => {
    const 源 = readFileSync(join(ROOT, 'src/content/objectives.js'), 'utf8');
    expect(源).toMatch(/没有的字段/);
    for (const k of 名) expect(源, `表头那段没点名 ${k}`).toContain(k);
  });

  it('`checkChapter3Ready` 随它的唯一引用者一起除名（CONDITIONS 不留没人指的条件）', () => {
    const 源 = readFileSync(join(ROOT, 'src/content/objectives.js'), 'utf8');
    expect(源).not.toMatch(/checkChapter3Ready/);
  });
});
