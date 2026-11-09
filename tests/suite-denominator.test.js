/**
 * 全量套件的**分母**门禁（W-B4 切片1 追加留下的尾巴）。
 *
 * ## 为什么需要它
 *
 * §8 与 §9 每条验收都得写"多少例 / 多少个文件"，而这个数字以前**取决于工作区里堆了多少草稿**：
 * vitest 默认 include 是"全树找 `.test` / `.spec` 后缀"那条模式，默认 exclude 只挡
 * `.idea` / `.git` / `.cache` / `.output` / `.temp` 这几类点目录 —— 挡不住本仓库的
 * `.tmp-*` 草稿目录（gitignored 但文件在磁盘上）。实测：一次全量跑收到 80 个文件，
 * 其中一个是 `.tmp-wb3-slice3/replay.test.js`。
 * 于是"78 个文件"和"79 个文件"这种记录其实是在描述草稿堆，不是描述仓库。
 *
 * 修法是把分母钉成 `tests/`（见 `vite.config.js` 的 `test.include`）。**但收窄本身有个新坑**：
 * 今后谁把用例写到 `tests/` 之外，它不会红，而是**静默不参与全量跑** —— 那比原来的漂更糟。
 * 所以这条门禁守的是收窄的前提：非点目录下凡是长得像测试的文件，必须都在 `tests/` 里。
 *
 * ## 四条断言各管一件事
 *
 * - **口径只有一处定义**：断言读的是真实的 `vite.config.js`（不抄一份名单进测试，
 *   否则改了配置它还在那份旧名单上报绿 —— 与 §0.3 说的"验证工具坏了时它报一切正常"同源）。
 * - **前提当场成立**：walk 到的测试文件名单里，`tests/` 之外的必须为空；同时 walk 自己得
 *   不是瞎的（与直接列 `tests/` 目录的数量互证，防"扫描器空转还绿"）。
 * - **草稿不许落在分母里**：`walk` 跳点命名，可 vitest 的 include **不跳** —— 一枚
 *   `tests/.tmp-*.test.js` 会把全量跑的文件数真的抬高一格（实测 391 → 392）。
 *   那一族由独立的第四条点名，因为前三条里没有任何一条会说出"这是草稿"这句话。
 * - **反向控制**：把同一套判据喂给人造的名单（含一枚 `src/` 里的测试文件），必须点名它。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, lstatSync, statSync } from 'node:fs';
import { join, relative, sep, basename } from 'node:path';
import config from '../vite.config.js';

const ROOT = process.cwd();

/** 与 vitest 默认 include 同族、但只覆盖本仓库实际用的 js/mjs 两种后缀 */
const TEST_LIKE = /\.(test|spec)\.[cm]?js$/;

/** 不进分母的目录：依赖与构建产物 */
const SKIP_DIRS = new Set(['node_modules', 'dist']);

function isTestLike(name) {
  return TEST_LIKE.test(name);
}

/**
 * 递归收集"仓库里真存在的测试文件"。
 *
 * 跳过两类东西：点开头的目录（草稿区，`.tmp-*` 全在这一族里）与**符号链接**。
 * 不跟随链接不是风格问题：本仓库根部真有一枚断链 `resume-stack`（指向已不存在的
 * `~/Downloads/l-package`），`statSync` 打在它身上直接 ENOENT —— 第一版的 walk 就是
 * 在这儿炸的，而"扫描器遇到意外就抛"会让这条门禁变成一条噪声。
 */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (lstatSync(full).isSymbolicLink()) continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (isTestLike(name)) out.push(relative(ROOT, full).replace(/\\/g, '/'));
  }
  return out;
}

/** 判据本体：从一份名单里挑出"既不在草稿区、又不在 tests/ 里"的测试文件 */
function straysOf(paths) {
  return paths.filter((p) => !p.startsWith('.') && !p.startsWith('tests/'));
}

/**
 * 判据本体（第二把）：`tests/` 内部**点命名**的测试文件 —— 草稿混进了分母的那一层。
 *
 * 为什么要有它：`walk` 跳点命名是为了"草稿不进分母"，可 vitest 的 include 认得到
 * `tests/` 里的点命名文件（实测：一枚 `tests/.tmp-*.test.js` 把全量跑从 391 个文件抬到 392）。
 * 也就是"分母只认 `tests/`"这句话里，`tests/` 自己那一层没人守 —— 草稿一落进来就当场改掉
 * 分母，而这正是这条门禁立项要防的那种漂。
 */
function 草稿在区内(paths) {
  return paths
    .filter((p) => isTestLike(basename(p)))
    .filter((p) => p.split('/').some((段) => 段.startsWith('.')));
}

/** `tests/` 里的测试文件（含点命名那一族 —— `walk` 故意看不到它们，这一把就是要看见） */
function 区内全量() {
  return readdirSync(join(ROOT, 'tests'), { recursive: true, encoding: 'utf8' })
    .map((p) => `tests/${String(p).split(sep).join('/')}`);
}

describe('全量套件的分母只认 tests/', () => {
  it('include 非空，且每一条都从 `tests/` 起头（口径只有一处定义）', () => {
    const patterns = config.test?.include;
    expect(Array.isArray(patterns), '`vite.config.js` 里 `test.include` 必须是数组').toBe(true);
    expect(patterns.length, '`test.include` 不能是空数组（空数组等于什么都不跑）').toBeGreaterThan(0);
    for (const p of patterns) {
      expect(p, `include 有一条不从 tests/ 起头：${p} —— 分母又开始认别的地方了`).toMatch(/^tests\//);
    }
  });

  it('仓库里（跳过草稿区与符号链接）`tests/` 之外不许有测试文件 —— 否则它会被静默跳过', () => {
    const found = walk(ROOT);
    expect(found.length, 'walk 一个测试文件都没找到 —— 扫描器坏了，这条断言不能算通过').toBeGreaterThan(0);
    const strays = straysOf(found);
    expect(
      strays,
      `有测试文件长在 tests/ 之外：${strays.join('、')} —— 而 test.include 只认 tests/，` +
        '它不会红，只会不参与全量跑。请移进 tests/，或改 include 并把这条判据一起改。'
    ).toEqual([]);
  });

  it('walk 与"直接列 tests/ 目录"两种推导互相印证（防空转）', () => {
    const walked = walk(ROOT).filter((p) => p.startsWith('tests/')).sort();
    const listed = readdirSync(join(ROOT, 'tests'))
      .filter((name) => statSync(join(ROOT, 'tests', name)).isFile() && isTestLike(name))
      // 点命名那一族不进互证：`walk` 天生看不见它，两把尺子必须量同一件事。
      // 它由下面那条"草稿在区内"单独点名 —— 各说各的，红的时候才知道该找谁。
      .filter((name) => !name.startsWith('.'))
      .map((name) => `tests/${name}`)
      .sort();
    expect(walked, 'walk 漏了 tests/ 里的文件（或 tests/ 里多出一层它没走进去的目录）').toEqual(listed);
    expect(listed.length, 'tests/ 目录本身列不出测试文件 —— 这条互证不能空转').toBeGreaterThan(0);
  });

  it('草稿不许落在 tests/ 里：include 认得到点命名文件，落进来就是当场改掉分母', () => {
    const 区内 = 区内全量();
    expect(
      区内.filter((p) => isTestLike(basename(p))).length,
      'tests/ 一个测试文件都列不出来 —— 这把尺子会在空集上恒真'
    ).toBeGreaterThan(300);
    const 草稿 = 草稿在区内(区内);
    expect(
      草稿,
      `这几枚点命名的文件在 tests/ 里面，而 vitest 的 include 真的会把它们跑进全量：${草稿.join('、')} ` +
        '—— 请移到根目录的 `.tmp-*` 草稿区（那里不进分母）或直接删掉。'
    ).toEqual([]);
    // 反向控制：同一把尺子喂进人造名单，必须点名文件与目录两种形态，且不误伤正常路径
    expect(草稿在区内([
      'tests/a.test.js', 'tests/helpers/b.test.js', 'tests/.tmp-x.test.js', 'tests/.tmp-y/c.test.js',
    ])).toEqual(['tests/.tmp-x.test.js', 'tests/.tmp-y/c.test.js']);
    expect(草稿在区内(['tests/dontmindme.test.js'])).toEqual([]);
  });

  it('反向控制：同一套判据喂给人造名单，必须点名 tests/ 之外的那几枚', () => {
    const plant = ['tests/a.test.js', 'src/b.test.js', 'scripts/c.spec.mjs', 'tests/helpers/d.js'];
    expect(straysOf(plant)).toEqual(['src/b.test.js', 'scripts/c.spec.mjs']);
    // 草稿区不参与判据：`.tmp-*` 里的同名文件不该被算进分母（它们连 include 都进不去）
    expect(straysOf(['tests/a.test.js', '.tmp-wb9/replay.test.js'])).toEqual([]);
  });
});
