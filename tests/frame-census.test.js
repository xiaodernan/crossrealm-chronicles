/**
 * 每帧调用点普查的尺子自证（W-C2 切片19，#15 缺的那把尺子）。
 *
 * 这一片不改任何行为，立的是**能力**：把 `window.__game.update()` 那一口 15ms 拆成
 * "哪个调用点值多少"。所以门禁量的不是游戏，是尺子自己 —— 五条性质，一条都不能少：
 * ① 名册从函数体现推（加一处调用，名册跟着涨；抄本会烂这件事在这套门禁里反复出现过，B120/B121/B143）
 * ② 接不上对象分两种（可选链 ⇒ 记名；非可选链 ⇒ 当场抛），都不许被读成"这一格 0 笔"
 * ③ 嵌套不双计（父的区间已含子），合计 = 已点名，其余 = 总 − 已点名 是**数出来的余数**
 * ④ 包装层每次调用恰两读表，不装就一读不多（这把尺不许把自己量成被测物）
 * ⑤ 卸完逐字还原（引用相等），中途有人换过同一个方法要点名
 *
 * 真读数在浏览器那一侧（`scripts/perf-smoke.mjs --census`），这里只钉形状与口径。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game } from '../src/core/Game.js';
import { 扫站点, 扫够不着, 装普查, 每帧普查 } from '../src/engine/frameCensus.js';
import { 帧普查读数问题, 普查归属下界 } from '../scripts/harness-readings.mjs';

afterEach(() => { vi.restoreAllMocks(); });

/** 忙等给定毫秒（不用定时器 —— 无头页里定时器会被饿）。 */
const 忙等 = (ms) => { const t = performance.now(); while (performance.now() - t < ms) { /* 等 */ } };

/**
 * 一个"子系统甲值 3ms、乙值 1ms"的假游戏。
 *
 * `update` 的**函数体是拼出来的字符串**（`new Function`），不是随手写的一个闭包：普查的名册
 * 是从 `String(update)` 现推的，如果这里写成 `表.forEach(([名]) => 游戏[名].update())`，
 * 函数体里根本没有 `this.甲.update()` 这种形状，扫出来就是零个站点 —— 测试会以另一种方式红，
 * 但那不是我想钉的性质（我要钉的是"体里有调用点 ⇒ 名册里就有"）。
 */
function 造游戏(表) {
  const 游戏 = { update: new Function(表.map(([名]) => `this.${名}.update();`).join('\n')) };
  for (const [名, ms] of 表) 游戏[名] = { update() { 忙等(ms); } };
  return 游戏;
}

describe('① 名册是从函数体现推的，不是抄的', () => {
  it('真 `Game.prototype.update` 扫得出七十来处调用，四族大项都在', () => {
    const 站 = 扫站点(String(Game.prototype.update));
    expect(站.length, `只扫出 ${站.length} 处 —— update() 的函数体没读到？`).toBeGreaterThan(50);
    const 键 = new Set(站.map((s) => s.键));
    for (const 一 of ['world.update', 'hud.update', 'enemyManager.update', 'weather.update', 'loot.update']) {
      expect(键.has(一), `名册里没有 ${一} 这一族：${[...键].slice(0, 6).join(' ')}`).toBe(true);
    }
  });

  it('注释里的"假站点"不算，函数自己也不算一处够不着的调用', () => {
    const 文本 = `update() {
      // 这一帧里 this.注释里的.update() 只是说法，不是调用
      /* 块注释里的 this.也在注释.update() 同理 */
      this.真的.update(1);
    }`;
    const 站 = 扫站点(文本);
    expect(站.map((s) => s.键), `扫出了不存在的站点：${站.map((s) => s.键).join(' ')}`)
      .toEqual(['真的.update']);
    expect(扫够不着(文本), '`update() {` 这个声明被当成一处调用').toEqual([]);
  });

  it('加一处调用，名册跟着涨 —— 抄本会烂在这里变成被检查的性质', () => {
    const 少 = { update() { this.a.update(); } , a: { update() {} } };
    const 多 = {
      update() { this.a.update(); this.新来的.update(); },
      a: { update() {} },
      新来的: { update() {} },
    };
    expect(扫站点(String(少.update)).map((s) => s.键)).toEqual(['a.update']);
    expect(扫站点(String(多.update)).map((s) => s.键), '新加的一处调用没进名册 ⇒ 它会静默藏进"其余"')
      .toEqual(['a.update', '新来的.update']);
  });
});

describe('② 接不上对象分两种，都不许读成"这一格 0 笔"', () => {
  it('非可选链的站点接不上 ⇒ 当场抛并点名（尺子坏了不是零开销）', () => {
    const 游戏 = { update() { this.没那个.update(); } };
    expect(() => 每帧普查(游戏, 2)).toThrow(/没那个\.update/);
  });

  it('可选链在某一态本来就是 null ⇒ 不抛，记进"未接到"', () => {
    const 游戏 = { update() { this.padInput?.poll(); this.a.update(); }, a: { update() {} } };
    expect(游戏.padInput, '这条腿要的就是"那一态没有这个东西"').toBeUndefined();
    const 出 = 每帧普查(游戏, 3);
    expect(出.未接到, 'padInput.poll 够不着却没记名').toEqual(['padInput.poll']);
    expect(出.坏站点).toEqual([]);
    expect(出.行.find((r) => r.名 === 'a.update').次数, '另一处该照样计到').toBe(3);
  });

  it('接上了却一帧都没计到 ⇒ 进"零调用"名单（getter 每帧返回新实例那一类）', () => {
    const 游戏 = {
      get 临时件() { return { update() {} }; },
      update() { this.临时件.update(); },
    };
    const 出 = 每帧普查(游戏, 4);
    expect(出.零调用, '包装打在临时件上，这条必须喊出来而不是读成 0 笔').toEqual(['临时件.update']);
    expect(出.行.find((r) => r.名 === '临时件.update').合计ms).toBe(0);
  });
});

describe('③ 计数口径：根层才计，余数是减出来的、也是数出来的', () => {
  it('父里包子：子的时间含在父的区间里，不双计', () => {
    // 站点名单手写：这个假游戏的 `update()` 体里只有 `this.父.update()`，子是**在父内部**被调的
    // —— 正是"两个都在名册上、但一个是另一个的子孙"那种形状，现推扫不到子，所以手工递进去。
    const 站点们 = [
      { 键: '父.update', 路径: '父', 方法: 'update', 可选: false },
      { 键: '子.update', 路径: '子', 方法: 'update', 可选: false },
    ];
    const 游戏 = {
      update() { this.父.update(); },
      父: { update() {} },
      子: { update() { 忙等(2); } },
    };
    // 子的调用必须发生在**父的体内**。这里不能写 `this.子` —— 父被 `this.父.update()` 调起时
    // `this` 是 父 自己，那个 `子` 根本不在它身上；闭包抓住游戏对象才是"同一个 子"。
    游戏.父.update = function () { 忙等(6); 游戏.子.update(); };
    const 手 = 装普查(游戏, 站点们);
    for (let i = 0; i < 5; i += 1) 手.一帧();
    const 出 = 手.读数();
    手.卸载();
    const 父 = 出.行.find((r) => r.名 === '父.update');
    const 子 = 出.行.find((r) => r.名 === '子.update');
    expect(父.次数, '父没被计到').toBe(5);
    expect(子.次数, '子被当成根层计了 ⇒ 合计里就是双计').toBe(0);
    expect(出.嵌套次数, '子的调用没进"嵌套"计数').toBeGreaterThanOrEqual(5);
    expect(出.已点名ms).toBeLessThanOrEqual(出.总耗时ms + 0.001);
    expect(子.合计ms, '子一行既要可见，又不能吃合计的账').toBe(0);
  });

  it('已知耗时的桩：合计 / 均值 / p95 / 其余 逐格对得上', () => {
    const 表 = [['甲', 3], ['乙', 1]];
    const 游戏 = 造游戏(表);
    const 帧数 = 12;
    const 出 = 每帧普查(游戏, 帧数);
    expect(出.帧数).toBe(帧数);
    expect(出.泵帧数, '泵帧数是"我推了几帧"，与"页一共跑了几帧"分家').toBe(帧数);
    const 甲 = 出.行.find((r) => r.名 === '甲.update');
    const 乙 = 出.行.find((r) => r.名 === '乙.update');
    expect(甲.次数).toBe(帧数);
    // 忙等的真实耗时只会**多于**给定的毫秒（量不到亚毫秒的提前退出），所以取下界为主
    expect(甲.合计ms, `甲 12 帧各 3ms，读出的合计是 ${甲.合计ms}`).toBeGreaterThanOrEqual(帧数 * 3 * 0.9);
    expect(甲.合计ms).toBeLessThan(帧数 * 3 * 4);
    expect(乙.合计ms).toBeLessThan(甲.合计ms);
    expect(出.已点名ms).toBeGreaterThanOrEqual(甲.合计ms + 乙.合计ms - 0.001);
    expect(出.其余ms, '其余 = 总 − 已点名，这条等式就是"余数可解释"的全部').toBeCloseTo(出.总耗时ms - 出.已点名ms, 6);
    expect(甲.p95ms).toBeLessThanOrEqual(甲.最慢ms);
    expect(出.行[0].合计ms, '榜要按耗时长短排').toBeGreaterThanOrEqual(出.行[1].合计ms);
    expect(出.够不着, '这个假游戏里没有够不着的调用，名单必须空').toEqual([]);
  });
});

/**
 * ## ③b 帧账由 `update` 自己报（切片19 第一次真跑红出来的那一族）
 *
 * 第一版的整帧时间是**外面**的泵帧循环夹住的，于是这把尺默认"只有我在推帧"。真跑第一次就红了：
 * hub 站 `已点名 1981.70ms > 整帧 1956.10ms`（`.tmp-20261030-s22/census-r1.log`）—— 页自己的
 * rAF 循环与事件回调在两次 `evalJs` 之间也调了那些子系统，时间进了合计、那一口的整帧账却没进。
 * 榜能比整帧还大，就说明"其余"这一格会凭空多出来 —— 后面所有优化都会朝错的方向使劲。
 * 下面三条钉的是修好之后的三件事：帧外的调用**分出去**、页自己跑的帧**进账**、
 * 于是 `已点名 ≤ 总` 成了构造上成立的不等式。
 */
describe('③b 帧账：谁推的都是一帧，帧外的那一档分出去', () => {
  it('帧外调用（事件回调里直接调子系统）不吃合计，单独记名', () => {
    const 游戏 = 造游戏([['甲', 1]]);
    const 手 = 装普查(游戏, 扫站点(String(游戏.update)));
    手.一帧();
    手.一帧();
    游戏.甲.update(); // 帧外：没有 update 在跑，这是事件回调那种形状
    游戏.甲.update();
    const 出 = 手.读数();
    手.卸载();
    const 甲 = 出.行.find((r) => r.名 === '甲.update');
    expect(甲.次数, '帧内的样本被帧外的调用污染了').toBe(2);
    expect(甲.帧外次数, '帧外那两次没记名 ⇒ 榜上读起来像"这两次不存在"').toBe(2);
    expect(甲.帧外ms, '帧外的时间一分都不许进合计').toBeGreaterThan(0);
    expect(出.帧外ms).toBeGreaterThanOrEqual(甲.帧外ms);
    expect(出.已点名ms, '已点名 = 只含帧内，才能与整帧比大小').toBeLessThanOrEqual(出.总耗时ms + 0.001);
    expect(出.其余ms).toBeCloseTo(出.总耗时ms - 出.已点名ms, 6);
  });

  it('页自己跑的帧也进整帧账：`帧数 ≥ 泵帧数`，那份差是见证不是破口', () => {
    const 游戏 = 造游戏([['甲', 1]]);
    const 手 = 装普查(游戏, 扫站点(String(游戏.update)));
    手.一帧();
    手.一帧();
    游戏.update(); // 没人泵 —— rAF 那一类：它是一帧，就该进整帧账
    const 出 = 手.读数();
    手.卸载();
    expect(出.泵帧数).toBe(2);
    expect(出.帧数, '页自己那一帧没被认成帧 ⇒ 它的站点时间就会超出整帧账').toBe(3);
    expect(出.总耗时ms).toBeGreaterThan(0);
    // 那一帧里的站点调用要计进"帧内"样本（它确实是帧内），不能掉进帧外
    expect(出.行.find((r) => r.名 === '甲.update').次数).toBe(3);
    expect(出.帧外次数, '这三次都在帧内，一帧都不该算帧外').toBe(0);
  });

  it('重入（一帧里又调 update）按同一帧计，不把一帧算成两帧', () => {
    const 游戏 = { 甲: { update() { 忙等(1); } } };
    let 深度标志 = false;
    游戏.update = function () {
      if (深度标志) { this.甲.update(); return; }
      深度标志 = true;
      this.甲.update();
      游戏.update(); // 重入
      深度标志 = false;
    };
    const 手 = 装普查(游戏, 扫站点(String(游戏.update)));
    手.一帧();
    const 出 = 手.读数();
    手.卸载();
    expect(出.帧数, '一帧被记成两帧 ⇒ 均值 / p95 的分母都是假的').toBe(1);
    // 两次 甲.update 都在同一帧里、都不是另一个的子孙 ⇒ 都是根层，各记一次（这不是双计，是事实）
    expect(出.行.find((r) => r.名 === '甲.update').次数).toBe(2);
    expect(出.嵌套次数).toBe(0);
  });

  it('还原是**逐字**的：原本挂在原型上的方法卸完不许在实例上留一层影子', () => {
    class 系统 { update() { 忙等(1); } }
    class 壳 { constructor() { this.甲 = new 系统(); } update() { this.甲.update(); } }
    const 游戏 = new 壳();
    expect(Object.prototype.hasOwnProperty.call(游戏.甲, 'update'), '这条腿要的就是"方法在原型上"').toBe(false);
    const 手 = 装普查(游戏, 扫站点(String(游戏.update)));
    expect(Object.prototype.hasOwnProperty.call(游戏.甲, 'update'), '装的时候才该造自有属性').toBe(true);
    手.一帧();
    手.卸载();
    expect(游戏.甲.update, '引用要回到原件').toBe(系统.prototype.update);
    expect(Object.prototype.hasOwnProperty.call(游戏.甲, 'update'),
      '赋回原函数也算"还原"的话，实例上就永远留一层遮住原型的影子（hasOwnProperty 从此不一样）').toBe(false);
  });

  it('够不着那份名单是从**没被包装过**的那份文本扫的（第一次真跑在这里翻过车）', () => {
    // 真读数第一版把 `扫够不着(String(g.update))` 写在装补丁**之后** —— 于是名单交出来的是
    // 尺子自己的内脏（`帧源.apply` / `帧.总.push`），名字看着像样，出处一个都不是游戏的。
    const 游戏 = 造游戏([['甲', 0]]);
    游戏.update = new Function('this.甲.update(); 普查腿帮手(1);');
    globalThis.普查腿帮手 = () => { };
    let 出;
    try {
      出 = 每帧普查(游戏, 2);
    } finally {
      delete globalThis.普查腿帮手;
    }
    expect(出.够不着, '模块函数没进"够不着" ⇒ 它花的那笔账会凭空躲进"其余"').toContain('普查腿帮手');
    expect(出.够不着.join(' ')).not.toMatch(/帧源|帧\.总|performance/);
  });
});

describe('④ 这把尺不许把自己量进被测物', () => {
  it('包装层每处调用恰两读表；不装普查就一读不多', () => {
    const 游戏 = 造游戏([['甲', 0]]);
    const 站点们 = 扫站点(String(游戏.update));
    let 读表 = 0;
    const 真 = performance.now.bind(performance);
    vi.spyOn(performance, 'now').mockImplementation(() => { 读表 += 1; return 真(); });

    // 同一处调用，装前 / 装后各来一次：差值就是"包装层自己"的开销，不含整帧那一口账
    读表 = 0;
    游戏.甲.update();
    const 没装 = 读表;
    const 手 = 装普查(游戏, 站点们);
    读表 = 0;
    游戏.甲.update();
    const 装了 = 读表;
    const 见证 = 手.卸载();
    expect(见证.被人改过).toEqual([]);
    expect(装了 - 没装, '包装层每处调用应当恰好多两读表（起与止），多一寸都不是"零成本"').toBe(2);

    // 不装的时候，游戏自己的读表数不受普查影响
    读表 = 0;
    游戏.甲.update();
    expect(读表, '卸完之后还在多读表 ⇒ 补丁没干净').toBe(没装);
  });
});

describe('⑤ 卸完逐字还原', () => {
  it('每帧普查 之后每个方法都回到原引用', () => {
    const 游戏 = 造游戏([['甲', 0], ['乙', 0]]);
    const 原 = { 甲: 游戏.甲.update, 乙: 游戏.乙.update };
    每帧普查(游戏, 3);
    expect(游戏.甲.update, '甲的方法没还原成原件').toBe(原.甲);
    expect(游戏.乙.update, '乙的方法没还原成原件').toBe(原.乙);
  });

  it('中途有人替换同一个方法 ⇒ 卸载点名"被人改过"，但仍还原成原件', () => {
    const 游戏 = 造游戏([['甲', 0]]);
    const 原 = 游戏.甲.update;
    const 手 = 装普查(游戏, 扫站点(String(游戏.update)));
    手.一帧();
    const 别人的 = function 别人() { return 原.call(this); };
    游戏.甲.update = 别人的;
    const 见证 = 手.卸载();
    expect(见证.被人改过, '第三方换过方法却没被点名 ⇒ 下次谁的补丁在位都说不清').toEqual(['甲.update']);
    expect(游戏.甲.update, '点名的同时还要还原成原件').toBe(原);
  });
});

/**
 * ## ⑥ 真读数那一侧的判据（`scripts/harness-readings.mjs`）
 *
 * 尺子本身对不对由上面五组钉；这一组钉的是**"这张榜是不是一次测量"**。
 * 榜要是来自一把坏尺（帧没泵够、双计、补丁没还清），后面所有优化都会朝错的方向使劲，
 * 而错的方向在日志里看起来只是"跑得慢"。判据住在无副作用的表里，所以这里能直接喂正反两种输入。
 */
describe('⑥ 榜的读数完整性：坏尺不许交出一张看起来正常的榜', () => {
  /** 一份"什么都对"的读数（240 帧、余数与账一致、榜降序、补丁还清）。 */
  const 好读数 = (改 = {}) => ({
    帧数: 240,
    泵帧数: 240,
    总耗时ms: 3600,
    已点名ms: 3000,
    其余ms: 600,
    嵌套次数: 4,
    帧外ms: 0,
    帧外次数: 0,
    行: [
      { 名: 'world.update', 次数: 240, 合计ms: 1200, 均值ms: 5, p95ms: 6, 最慢ms: 7, 帧外ms: 0, 帧外次数: 0 },
      { 名: 'hud.update', 次数: 240, 合计ms: 900, 均值ms: 3.75, p95ms: 4, 最慢ms: 5, 帧外ms: 0, 帧外次数: 0 },
    ],
    未接到: ['padInput.poll'],
    坏站点: [],
    零调用: ['playerAutoPlay.update'],
    站点总数: 72,
    站点数: 70,
    装好数: 71,
    被人改过: [],
    还原数: 71,
    够不着: ['frameTick', 'scheduler.update'],
    ...改,
  });

  it('一份正常的读数一句都不红 —— 包括"有些站点这一站本来就没调"那两类见证', () => {
    expect(帧普查读数问题('hub', 好读数(), 240), '正常读数被挑了刺').toEqual([]);
  });

  it('缺样（有一批没回来）点名，而不是交出一张合计偏小的榜', () => {
    expect(帧普查读数问题('hub', 好读数({ 泵帧数: 180, 帧数: 180 }), 240).join('\n'))
      .toMatch(/泵了 180 帧，应有 240 帧/);
  });

  it('页自己跑的帧只许让 帧数 变多；泵出去的帧没进整帧账就是账丢了', () => {
    expect(帧普查读数问题('hub', 好读数({ 帧数: 243 }), 240), '页补了几帧就被当成缺样').toEqual([]);
    expect(帧普查读数问题('hub', 好读数({ 帧数: 239 }), 240).join('\n'))
      .toMatch(/见到 239 帧却泵了 240 帧/);
  });

  it('接不上对象 ⇒ 喊坏尺，不许被读成"那一格 0 毫秒"', () => {
    expect(帧普查读数问题('hub', 好读数({ 坏站点: ['world.update'] }), 240).join('\n'))
      .toMatch(/1 处站点接不上对象：world\.update/);
  });

  it('榜比整帧还大 = 双计（父的区间本来就含子）', () => {
    const 问 = 帧普查读数问题('hub', 好读数({ 已点名ms: 3700, 其余ms: -100 }), 240).join('\n');
    expect(问).toMatch(/已点名 3700\.00ms > 整帧 3600\.00ms/);
    expect(问).toMatch(/合计里双计/);
  });

  it('"其余"必须是减出来的那一个数，另算就红', () => {
    expect(帧普查读数问题('hub', 好读数({ 其余ms: 999 }), 240).join('\n'))
      .toMatch(/余数与账对不上/);
  });

  it('榜没按合计降序 ⇒ "第一格"指错地方', () => {
    const 行 = [好读数().行[1], 好读数().行[0]];
    expect(帧普查读数问题('hub', 好读数({ 行 }), 240).join('\n')).toMatch(/没按合计降序：第一格 hud\.update/);
  });

  it('非有限数与空榜：都不是一次测量', () => {
    expect(帧普查读数问题('hub', 好读数({ 总耗时ms: NaN, 其余ms: NaN }), 240).join('\n'))
      .toMatch(/"总耗时ms" 读到 NaN/);
    // 帧外那一档也在同一张名单里：少了它，`帧外ms` 读成 NaN 时"其余"仍能凑出一个像样的数
    expect(帧普查读数问题('hub', 好读数({ 帧外ms: NaN }), 240).join('\n')).toMatch(/"帧外ms" 读到 NaN/);
    expect(帧普查读数问题('hub', 好读数({ 行: [] }), 240).join('\n')).toMatch(/榜是空的/);
    expect(帧普查读数问题('hub', null, 240).join('\n')).toMatch(/没交出普查读数对象/);
  });

  it('一处都没装上 = 空尺，单独点名（"空的"读起来像"都很便宜"）', () => {
    const 问 = 帧普查读数问题('hub', 好读数({ 装好数: 0 }), 240);
    expect(问.join('\n')).toMatch(/一处普查都没装上（名册 72 格全没接上）/);
    expect(问.length, '空尺已经说完了，不该再叠一层"余数对不上"把人带偏').toBe(1);
  });

  it('补丁没还清（被人改过 / 还原数对不上）都红 —— 后面的腿读的是同一个游戏', () => {
    expect(帧普查读数问题('hub', 好读数({ 被人改过: ['hud.update'] }), 240).join('\n'))
      .toMatch(/这些方法已不在位：hud\.update/);
    expect(帧普查读数问题('hub', 好读数({ 还原数: 70 }), 240).join('\n')).toMatch(/装了 71 处却还原 70 处/);
  });

  it('榜解释不了过半的帧就红 —— 下界有出处，不是为了让某一轮过', () => {
    // 出处：2026-10-30 第一轮真读数八站 98.6%—99.2%（`.tmp-20261030-s22/census-r2.log`）；
    // 好读数那一格是 83%，离下界还有距离 —— 这条不是"贴线放宽"，是"榜不再是收据"的那道门。
    expect(普查归属下界, '下界被抬到真读数之上 ⇒ 每一轮都会假红').toBeLessThanOrEqual(0.9);
    expect(帧普查读数问题('hub', 好读数(), 240)).toEqual([]);
    const 问 = 帧普查读数问题('hub', 好读数({ 已点名ms: 360, 其余ms: 3240 }), 240).join('\n');
    expect(问).toMatch(/只解释了整帧的 10\.0%/);
    expect(问).toMatch(/只是一张收据/);
  });
});

/**
 * ## ⑦ 接线：这把尺真的架在 `npm run perf:census` 上
 *
 * 能力没人调用等于没有：`frameCensus.js` 会像 `RestNpcGestureClipLoader.js` 那样变成一个
 * 零引用源文件，而下一次"15ms 里住着谁"的问题又只能用一句猜测回答。
 * 这些腿咬的是**语句形状**（调用点、门、抛），不是词面 —— 臂把守卫改成恒假时，
 * 只找词面的腿照常绿（切片12 那条腿踩过一次）。
 */
describe('⑦ 接线：perf:census 真的装尺、泵帧、卸尺、判读数', () => {
  const 脚本源 = readFileSync(new URL('../scripts/perf-smoke.mjs', import.meta.url), 'utf8');

  it('脚本 import 并**调用**判据，不合格是抛（读数作废）而不是记为通过', () => {
    expect(脚本源).toMatch(/import \{[^}]*帧普查读数问题[^}]*\} from '\.\/harness-readings\.mjs'/);
    expect(脚本源, '判据没被真的调用（只剩 import 或注释不算）').toMatch(/const 问 = 帧普查读数问题\(站id, 出, 应有帧数\);/);
    expect(脚本源, '普查腿不合格被降级成越预算').toMatch(/的每帧普查腿不是一次测量：\\n - ` \+ 问\.join/);
  });

  it('这一腿要明说才走：常规 `npm run perf` 一步都不多推（改了页龄就等于改了所有站的测量条件）', () => {
    expect(脚本源).toMatch(/const 开普查 = process\.argv\.includes\('--census'\);/);
    expect(脚本源, '普查腿没挂在开关上 ⇒ 它会在每一次预算判定里多推 2400 帧').toMatch(/if \(开普查\) \{/);
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(pkg.scripts['perf:census'], 'package.json 里没有 perf:census').toBe('node scripts/perf-smoke.mjs --census');
    expect(pkg.scripts.perf, '常规 perf 被塞进了 --census').toBe('node scripts/perf-smoke.mjs');
  });

  it('站点不另立、坐标不抄、帧数不抄：三处都从已有的真源取', () => {
    expect(脚本源, '普查另列了一份站点名单').toMatch(/for \(const 站id of 名册\.stationIds\) \{\s*\n\s*const 装 = /);
    // 与 draw 腿同一句：区实例自己的 center（抄坐标 = 区域一搬家抄本烂在原地）
    expect(脚本源, '普查自己抄了坐标').toMatch(/x = 找\.center\.x; z = 找\.center\.z;/);
    expect(脚本源, '泵帧的帧数没跟着 每批帧数 走').toMatch(/for \(let i = 0; i < \$\{每批帧数\}; i \+= 1\) 手\.一帧\(\);/);
    expect(脚本源, '批数没跟着 计时批数 走').toMatch(/for \(let b = 0; b < 计时批数; b \+= 1\) \{\s*\n\s*const 交 = await evalJs/);
    // 每批回来都对一次"累计泵帧数"：少一批就是缺样，而缺样只会让榜偏小，抓不到
    expect(脚本源, '分批回来的那一眼问的不是泵帧数（问 帧数 会把页自己跑的帧算成超样）').toMatch(/return 手\.读数\(\)\.泵帧数;/);
    expect(脚本源).toMatch(/第 \$\{b \+ 1\} 批泵完应到 \$\{\(b \+ 1\) \* 每批帧数\} 帧/);
  });

  it('名册与"够不着"都从**装之前**的那份文本扫（包装层的内脏不是游戏的名字）', () => {
    expect(脚本源, '没在装补丁前把 update 的文本取好').toMatch(/const 文本 = String\(g\.update\);/);
    expect(脚本源).toMatch(/const 站点们 = 源\.扫站点\(文本\);/);
    expect(脚本源, '够不着改回从 String(g.update) 扫 ⇒ 装完之后扫到的是尺子自己').not.toMatch(/扫够不着\(String\(g\.update\)\)/);
    expect(脚本源).toMatch(/够不着: 源\.扫够不着\(文本\)/);
  });

  it('用完必须还：句柄置空、还原数与被人改过一起交给判据', () => {
    expect(脚本源).toMatch(/const 卸 = 手\.卸载\(\);/);
    expect(脚本源, '取完账没摘句柄 ⇒ 下一站会泵在上一站的尺子上').toMatch(/window\.__普查 = null;/);
    expect(脚本源, '装的时候没先问坏站点 ⇒ 榜会在第一站就静默空掉').toMatch(/if \(先\.坏站点\.length\) \{/);
    expect(脚本源).toMatch(/被人改过: 卸\.被人改过, 还原数: 卸\.还原数/);
  });

  it('十站一站不落：覆盖判据吃的是名册，不是这一腿自己凑的名单', () => {
    expect(脚本源, '普查腿没问覆盖').toMatch(/const 覆 = 覆盖问题\(名册\.stationIds, 普查站点\);/);
    expect(脚本源).toMatch(/每帧普查腿的站点覆盖不成立/);
  });

  it('榜与两份见证都进日志 —— 归因靠日志，只进对象的话下一次没人看得见', () => {
    expect(脚本源).toMatch(/出\.行\.slice\(0, 15\)/);
    for (const 词 of ['归属率=', '已点名=', '其余=', '未接到=', '零调用=', '够不着=']) {
      expect(脚本源, `日志那行没打 ${词} —— 这一格下次只能重跑探针`).toContain(词);
    }
  });

  it('榜只有一个分母：整帧账与每格次数除的是同一个帧数', () => {
    /*
     * `总耗时ms` 由 `update` 那层自己记、`次数` 由站点那层自己记，两者吃的都是**账上的全部帧**
     * （页自己跑的那几帧两边都在）。混着除就自己造出一个假症状：每帧一次的 `weather.update`
     * 读成 1.02次/帧，下一个人去查一个根本不存在的重复调用。所以钉除数的形状，不钉读数。
     */
    expect(脚本源, '每帧那个除子不再是"某一个量 / 某一个帧数"的单一形状').toMatch(/const 每帧 = \(v\) => \(v \/ 出\.帧数\)\.toFixed\(2\);/);
    expect(脚本源, '次/帧 那一格没走 每帧() ⇒ 两处各除各的分母').toMatch(/String\(每帧\(一\.次数\)\)\.padStart\(5\)}次\/帧/);
    expect(脚本源, '榜里又出现了一次除以 泵帧数').not.toMatch(/\/ 出\.泵帧数/);
    expect(脚本源, '泵帧数 从日志里消失了 ⇒ "我要求了几帧"与"账上有几帧"的差是见证，得看得见')
      .toMatch(/泵=\$\{出\.泵帧数\} 页外帧=\$\{出\.帧数 - 出\.泵帧数\}/);
  });

  it('真 `Game.prototype.update` 的站点在假游戏那条路上同样装得起来（尺子对准真形状）', () => {
    const 站 = 扫站点(String(Game.prototype.update));
    // 这里不装真游戏（那是浏览器那一侧的腿），只钉"名册不是空的、且没有一个站点是可选链之外的怪形状"
    expect(站.every((s) => s.方法.length > 0), '名册里有一格没有方法名').toBe(true);
    expect(站.some((s) => s.可选), '真 update() 里一处可选链都没有？那 `未接到` 这格就没人为它存在').toBe(true);
  });
});
