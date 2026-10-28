/**
 * 每一座副本都得有人**指名**要玩家下它 —— 认领的**覆盖率**门禁（W-E3 切片29 立账本，切片30 收口）。
 *
 * ## 这一片把什么关掉了
 *
 * 切片29 建了名册上的第十座（`sunless-oratory`），当时它两样都不占：主线九步各认领一座、
 * 三界试炼认领三座。那片不能直接让它被认领 —— 往主线插一步动的是 `quests.index` 的**存档语义**，
 * 必须配一条 v18 → v19 迁移，于是拆两片，中间那份"立着但没人指名"的状态由一枚**逐名账本**钉住
 * （`未认领账本 = ['sunless-oratory']`，只减不增）。
 *
 * 切片30 把主线那一步插进去了（第 61 格，`infinity` 之前）⇒ 账本清空。清空之后**账本这个形状本身就该没了**，
 * 留着会有两种坏形状：
 * - 空账本上的"每一枚都还在名册里"是**零次循环**，恒真；
 * - 而当年那条"认领并集不许等于名册"（满认领 ⇒ 未认领这一维恒空 ⇒ 账本记的是空气）今天正好**反过来**：
 *   满认领正是这一片要交付的东西。
 * 所以判据翻成正向覆盖率：**未认领集合必须是空集**。它不是白送的 —— ④ 那三条反面证据把同一把尺子
 * 喂给两份假名册（删一步认领 / 多一座没人认领 / 只关一维），方向各自响。
 *
 * ## 用例分四层
 * ① 认领的口径本身：两个来源各非空、并集不许超出名册（幽灵认领要红）；
 * ② 覆盖率：未认领是空集 + **一座不多一次**（主线认领的步数与座数对得上，逐座各一次）+ 账本形状不许回来；
 * ③ 认领要答得出"是谁认领的"：每座被认领的副本都指得回那一主线步，且那一步在下标语义里有位置；
 * ④ 反面证据：尺子喂给假名册必须量得到缺口。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DUNGEON_DEFS, DUNGEON_IDS, TRIAL_DUNGEON_IDS } from '../src/content/dungeons.js';
import { MAINLINE } from '../src/content/objectives.js';

/**
 * 认领口径：主线步的 `dungeonId` ∪ 三界试炼的 `trial`。
 *
 * 分区支线**不算**认领 —— 它认的是"本区任意一座下过一回"（`sideQuests.js` 的
 * `那位面的副本(zone)` + `some(...)`），从来不指名哪一座；把它算成认领，
 * 一座副本就凭空有了指路人。
 */
function 未认领的(名册, 主线步) {
  const 认领 = new Set([
    ...主线步.filter((r) => r.dungeonId).map((r) => r.dungeonId),
    ...名册.filter((d) => d.trial === true).map((d) => d.id),
  ]);
  return 名册.map((d) => d.id).filter((id) => !认领.has(id));
}

const 今天 = 未认领的(DUNGEON_DEFS, MAINLINE);
const 主线认领的 = () => MAINLINE.filter((r) => r.dungeonId).map((r) => r.dungeonId);

describe('① 认领的口径先站得住', () => {
  it('主线指名的副本都在名册里（指着一座不存在的是幽灵，不是认领）', () => {
    const 幽灵 = [...new Set(主线认领的())].filter((id) => !DUNGEON_IDS.includes(id));
    expect(幽灵.join(','), `主线这些步指着名册里没有的副本：${幽灵.join('、')}`).toBe('');
  });

  it('三界试炼那几座都在名册里，而且不是空集（空集上"每一座都清过"恒真）', () => {
    expect(TRIAL_DUNGEON_IDS.length, '没有一行 `trial: true` ⇒ 试炼成了空集').toBeGreaterThan(0);
    for (const id of TRIAL_DUNGEON_IDS) {
      expect(DUNGEON_IDS, `"${id}" 在试炼名册里，却不在副本名册里`).toContain(id);
    }
  });

  it('两个来源各自非空，且并集不许比名册还大（超出就是有人在认领不存在的座）', () => {
    const 主线认 = new Set(主线认领的());
    const 试炼认 = new Set(TRIAL_DUNGEON_IDS);
    expect(主线认.size, '主线里没有一座副本 ⇒ 认领只剩试炼那一维').toBeGreaterThan(0);
    expect(试炼认.size, '试炼里没有一座副本 ⇒ 认领只剩主线那一维').toBeGreaterThan(0);
    const 并集 = new Set([...主线认, ...试炼认]);
    expect(并集.size, `认领的并集有 ${并集.size} 座，名册只有 ${DUNGEON_DEFS.length} 座 —— 有人在认领名册之外的副本`)
      .toBeLessThanOrEqual(DUNGEON_DEFS.length);
    // 当年那条"并集不许等于名册"翻过来了：满认领正是切片30 交付的状态 ⇒ 它换成上面②那条
    // "步数 == 座数 + 逐座各一次"说话，恒真的 `并集 >= max(来源)` 不留在这里。
  });
});

describe('② 覆盖率：每一座都必须有人指名（切片29 那本账今天清空 ⇒ 翻成正向门）', () => {
  it('未认领集合是空集（不是"记在账上"，是根本不该有）', () => {
    expect(今天, `这些副本没有任何玩家路径指名要下它：${今天.join('、')}`).toEqual([]);
  });

  it('一座不多一次：主线认领副本的步数与座数相等，而且逐座各被指一次', () => {
    const 步 = 主线认领的();
    expect(步.length, `主线有 ${步.length} 步认领副本，名册只有 ${DUNGEON_DEFS.length} 座 —— 有人在重复认领`)
      .toBe(DUNGEON_DEFS.length);
    const 计 = {};
    for (const id of 步) 计[id] = (计[id] ?? 0) + 1;
    const 多 = Object.entries(计).filter(([, n]) => n > 1).map(([id, n]) => `${id}×${n}`);
    expect(多.join(' / '),
      '这些副本被主线两步同时指名 ⇒ "每座各有一步"这条口径就不成立了（要么是真重复，要么是有座没人认领而计数对不上）')
      .toBe('');
  });

  it('切片29 那本账记的那一枚今天确实被指了名，而且插在摸锚点**之前**（历史凭据）', () => {
    const 位置 = MAINLINE.findIndex((r) => r.dungeonId === 'sunless-oratory');
    expect(位置, '主线里没有一步认领无灯祷堂 ⇒ 账本只是被删了名字，状态没变').toBeGreaterThanOrEqual(0);
    const 锚点 = MAINLINE.findIndex((r) => r.id === 'infinity');
    expect(位置, '认领无灯祷堂那一步排在摸锚点之后 ⇒ 玩家通关之后才被告知该下它').toBeLessThan(锚点);
  });

  it('账本那个形状没有残留：本文件的源码里不再逐名记未认领的副本', () => {
    // 清空的账本比删掉的账本坏：它让"每一枚都还在名册里"变成零次循环的恒真。
    const 源码 = readFileSync(join(process.cwd(), 'tests', 'dungeon-claim-coverage.test.js'), 'utf8');
    expect(源码, '这份文件里还有那份逐名账本 —— 空账本上的循环不执行，那条腿是白送的').not.toMatch(/const 未认领账本\s*=/);
  });
});

describe('③ 被认领的每一座都指得回"是哪一步要我去的"', () => {
  it('每一座主线认领的副本都有一个具体的主线步（不是整表一个"打过副本"就算）', () => {
    const 缺 = [];
    for (const id of new Set(主线认领的())) {
      const 步 = MAINLINE.filter((r) => r.dungeonId === id);
      if (步.length === 0) 缺.push(id);
      // 一座副本被两步同时指名也行，但那一步必须有 id 可指（否则账无从对起）
      for (const s of 步) expect(s.id, `"${id}" 被一步没有 id 的表行认领`).toBeTruthy();
    }
    expect(缺.join(','), `这些副本认来了又没人指路：${缺.join('、')}`).toBe('');
  });

  it('认领一座副本的那一步本身在主线表里是有位置的（下标就是存档语义）', () => {
    const 下标 = MAINLINE.map((r, i) => [r.dungeonId, i]).filter(([id]) => id);
    expect(下标.length, '主线里找不到任何带 `dungeonId` 的行').toBeGreaterThan(0);
    for (const [, i] of 下标) {
      expect(Number.isInteger(i), `第 ${i} 步的下标不是整数 —— 那个下标就是存档里的 quests.index`).toBe(true);
    }
  });
});

describe('④ 反面证据：尺子喂给假名册必须量得到缺口（正向门不是白送的）', () => {
  it('把一座副本的主线步删掉 ⇒ 未认领集合当场多出它', () => {
    const 被删 = 主线认领的()[0];
    const 假 = MAINLINE.filter((r) => r.dungeonId !== 被删);
    expect(未认领的(DUNGEON_DEFS, 假), `删掉指着 "${被删}" 的那一步之后，它没有被算成未认领 ⇒ 上面那几条腿量的是空气`)
      .toEqual([被删]);
  });

  it('多建一座没人认领的 ⇒ 未认领集合多出它（第十一座偷偷进来时这里响）', () => {
    const 探针 = { ...DUNGEON_DEFS[0], id: 'probe-eleventh', trial: false };
    const 未认领 = 未认领的([...DUNGEON_DEFS, 探针], MAINLINE);
    expect(未认领, '新加一座没认领的副本，未认领集合却没多出它 ⇒ 认领口径在替它说话').toContain('probe-eleventh');
    expect(未认领.length, `今天 ${今天.length} 座全被认领，加了没认领的一座之后读数却没变 ⇒ 覆盖率那条恒绿`)
      .toBeGreaterThan(今天.length);
  });

  it('两维是**并集**不是交集：只关一维，被两维同时认领的那座不许落进未认领', () => {
    const 双认 = TRIAL_DUNGEON_IDS.find((id) => MAINLINE.some((r) => r.dungeonId === id));
    expect(双认, '试炼里没有任何一座也有主线步 ⇒ 下面三条断言量不出并集').toBeTruthy();
    const 无试炼 = DUNGEON_DEFS.map((d) => ({ ...d, trial: false }));
    const 无主线步 = MAINLINE.filter((r) => r.dungeonId !== 双认);
    expect(未认领的(DUNGEON_DEFS, 无主线步), '主线步没了但还在试炼里 ⇒ 关一维不该使它未认领')
      .not.toContain(双认);
    expect(未认领的(无试炼, MAINLINE), '试炼那一维关了但主线还指着它 ⇒ 关一维不该使它未认领')
      .not.toContain(双认);
    expect(未认领的(无试炼, 无主线步), '两维都关掉却还不算未认领 ⇒ 认领口径在凭空替它说话')
      .toContain(双认);
  });
});
