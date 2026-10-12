/**
 * 支线只有一份名单 —— W-B3 切片5（结掉 W-B3 尾巴③"SideQuestSystem 的兼容层仍在"）。
 *
 * 病不在"兼容层"这三个字，而在**一份内容两个答案**：
 * 基础那 7 条住在 `src/game/SideQuestRegistry.js`，致敬那 14 条住在 `src/content/sideQuests.js`，
 * 后者靠 `attachPopCultureSideQuests()` **改写 `SideQuestSystem.checkAll` 方法**挂上来。
 * 于是"支线一共几条"有两个真源：完成检测遍历 21 条，而 `getProgress().total` 与支线页签
 * 都只数基础那 7 条。后果是两处玩家看得见的假话（改前读到过，见 §9）：
 *  - HUD 的支线计数可以写成 `(12/7)`；
 *  - 14 条致敬支线**能完成、会弹提示、会写日志**，却永远不出现在名单里（玩家无从知道它们存在）。
 * 另外两族遍历时各包着一个 `catch (_) { /* ignore *\/ }`：判据抛错的那条支线**永远完成不了**，
 * 且没有任何声响 —— 与 B36/B62/B63 同族。
 *
 * 现在：两族都在内容层，`SIDE_QUESTS_ALL` 一处合并（撞 id 当场抛），系统只遍历这一份，
 * 分母与页签同源于它；注册表那条 `checkSideQuestRosters` 管"一族被搬空 / 两族撞 id / 少一个 check"。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SIDE_QUESTS_BASE, SIDE_QUESTS_ZONE, SIDE_QUESTS_POP, SIDE_QUESTS_ALL, franchiseZone } from '../src/content/sideQuests.js';
import { keyText } from '../src/content/keyHints.js';
import { ECHOES } from '../src/content/echoes.js';
import { ZONE_IDS, ZONE_ORDER } from '../src/content/ZoneIdentity.js';
import { SideQuestSystem } from '../src/game/SideQuestSystem.js';
import { SideQuestJournalTab } from '../src/ui/SideQuestJournalTab.js';
import { SoulWispManager } from '../src/world/SoulWispManager.js';
import { checkSideQuestRosters, checkContent, CONTENT_TABLES } from '../src/content/registry.js';
import { installWindowShim } from './helpers/enemyHarness.js';



const ROOT = process.cwd();
const readSrc = (rel) => readFileSync(join(ROOT, 'src', rel), 'utf8');
/** 只核代码，不核史料：本文件的头注与函数注释里会**引用**那些被删掉的写法 */
const codeOnly = (text) => text.split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

/** 一条支线的判据想读什么都由用例给；`tally` 记下所有对外效应，好断言"完成"是真发生了事 */
function makeGame(overrides = {}) {
  const 记 = { toasts: [], souls: [], journal: [], events: [], questsCompleted: [] };
  const game = {
    stats: { 
      addSouls: (n) => 记.souls.push(n),
      onQuestCompleted: (id) => 记.questsCompleted.push(id),
    },
    dialog: { toast: (t) => 记.toasts.push(t) },
    storyJournal: { add: (e) => 记.journal.push(e) },
    quests: { chapter: 3 },
    achievements: { stats: {} },
    ...overrides,
  };
  return { game, 记 };
}
const fakePanel = () => ({ innerHTML: '', querySelectorAll: () => [] });

afterEach(() => {
  delete globalThis.window;
  delete globalThis.CustomEvent;
});

describe('一份名单、一个分母', () => {
  it('控制组：三族都在，合并名单是它们之和且 id 唯一', () => {
    expect(SIDE_QUESTS_BASE.length, '基础族空了 —— 这条断言就只是"什么都比"').toBeGreaterThan(0);
    expect(SIDE_QUESTS_ZONE.length, '分区族空了 —— 同上').toBeGreaterThan(0);
    expect(SIDE_QUESTS_POP.length, '致敬族空了 —— 同上').toBeGreaterThan(0);
    expect(SIDE_QUESTS_ALL.length)
      .toBe(SIDE_QUESTS_BASE.length + SIDE_QUESTS_ZONE.length + SIDE_QUESTS_POP.length);
    expect(new Set(SIDE_QUESTS_ALL.map((q) => q.id)).size).toBe(SIDE_QUESTS_ALL.length);
    // 致敬族那 14 条以前根本不在页签名单里：先钉"它确实在合并名单里"
    for (const q of SIDE_QUESTS_POP) {
      expect(SIDE_QUESTS_ALL.some((m) => m.id === q.id), `${q.id} 没进合并名单`).toBe(true);
    }
  });

  it('分母就是遍历的那一份（不是其中一族）', () => {
    installWindowShim();
    const { game } = makeGame();
    const sq = new SideQuestSystem(game);
    expect(sq.getProgress().total).toBe(SIDE_QUESTS_ALL.length);
    expect(sq.getProgress().total).toBeGreaterThan(SIDE_QUESTS_BASE.length);
  });

  it('致敬族那条也**出现在页签名单里**，且完成数与总数同源于合并名单', () => {
    installWindowShim();
    const { game } = makeGame();
    const sq = new SideQuestSystem(game);
    game.sideQuests = sq;
    const 面板 = fakePanel();
    new SideQuestJournalTab(game).render(面板);
    const 缺 = SIDE_QUESTS_ALL.filter((q) => !面板.innerHTML.includes(q.title)).map((q) => q.id);
    expect(缺, `这些支线在页签里看不见：${缺.join('、')}`).toEqual([]);
    expect(面板.innerHTML).toContain(`完成 0 / ${SIDE_QUESTS_ALL.length}`);
  });
});

describe('完成检测走 shipped 路径：致敬族与基础族同一条路', () => {
  it('致敬支线完成：加魂火、弹提示、写日志、派事件 —— 与基础族同一套事', () => {
    installWindowShim();
    const 目标 = SIDE_QUESTS_POP[0];
    const { game, 记 } = makeGame();
    const sq = new SideQuestSystem(game);
    const 事件 = [];
    globalThis.window.addEventListener('side-quest-complete', (e) => 事件.push(e.detail.id));
    // 只让这一条满足：把它的判据换成恒真，跑完再还原（其余 20 条仍走各自真判据）
    const 原 = 目标.check;
    Object.defineProperty(目标, 'check', { value: () => true, configurable: true, writable: true });
    try {
      sq.checkAll();
    } finally {
      Object.defineProperty(目标, 'check', { value: 原, configurable: true, writable: true });
    }
    expect(sq.completed.has(目标.id), '致敬族这条没被记为完成 —— 它以前根本不在遍历里').toBe(true);
    expect(记.souls).toEqual([目标.reward]);
    expect(记.toasts.join('')).toContain(目标.title);
    expect(记.journal.map((j) => j.id)).toContain(目标.id);
    expect(事件).toEqual([目标.id]);
  });

  it('全部判据同时成立时，done 能等于 total（改前 done 会超过 total：21 / 7）', () => {
    installWindowShim();
    const { game } = makeGame();
    const sq = new SideQuestSystem(game);
    const 改回来的 = [];
    for (const q of SIDE_QUESTS_ALL) {
      改回来的.push([q, Object.getOwnPropertyDescriptor(q, 'check')]);
      Object.defineProperty(q, 'check', { value: () => true, configurable: true, writable: true });
    }
    try {
      sq.checkAll();
    } finally {
      改回来的.forEach(([q, d]) => Object.defineProperty(q, 'check', { ...d, configurable: true }));
    }
    const prog = sq.getProgress();
    expect(prog.done).toBe(SIDE_QUESTS_ALL.length);
    expect(prog.done).toBeLessThanOrEqual(prog.total);
    expect(prog.total).toBe(SIDE_QUESTS_ALL.length);
  });

  it('读档后已完成集合与名单对得上：名单外那条不报错也不被算进 done', () => {
    installWindowShim();
    const { game } = makeGame();
    const sq = new SideQuestSystem(game);
    sq.fromJSON({ completed: ['side-wisp-12', 'side-早已删除'] });
    expect(sq.getProgress().done).toBe(2);   // 集合就是存档那两份，不假称"重新推导"
    sq.checkAll();                            // 只要不抛，且不会把名单外的当成本次要完成的事
    expect(sq.completed.has('side-早已删除')).toBe(true);
  });
});

describe('判据抛错不许再静默', () => {
  it('一条坏判据：喊一次（带 id）、其余支线照常完成、第二次不重复喊', () => {
    installWindowShim();
    const { game, 记 } = makeGame();
    const 坏 = SIDE_QUESTS_BASE[0];
    const 好 = SIDE_QUESTS_BASE[1];
    const 原坏 = 坏.check, 原好 = 好.check;
    Object.defineProperty(坏, 'check', { value: () => { throw new Error('桩：判据读了一个不存在的字段'); }, configurable: true, writable: true });
    Object.defineProperty(好, 'check', { value: () => true, configurable: true, writable: true });
    const 收 = [];
    const 原error = console.error;
    console.error = (...a) => { 收.push(a.join(' ')); };
    const sq = new SideQuestSystem(game);
    try {
      sq.checkAll();
      sq.checkAll();
    } finally {
      console.error = 原error;
      Object.defineProperty(坏, 'check', { value: 原坏, configurable: true, writable: true });
      Object.defineProperty(好, 'check', { value: 原好, configurable: true, writable: true });
    }
    expect(收.length, '判据抛错却一声不响 —— 那条支线就永远完成不了').toBe(1);
    expect(收[0]).toContain(坏.id);
    expect(sq.completed.has(好.id), '一条坏判据把这一帧的其余支线拖垮了').toBe(true);
    expect(记.souls).toEqual([好.reward]);
  });
});

describe('挂载那层 monkey-patch 删净了，注册表三条各配一次反向', () => {
  it('两个旧文件不在了，`Game.js` 里也不再改写 `checkAll`', () => {
    expect(existsSync(join(ROOT, 'src/game/SideQuestRegistry.js')), '基础名单还在老地方').toBe(false);
    expect(existsSync(join(ROOT, 'src/game/SideQuestPopCulture.js')), '改写方法的挂载层还在').toBe(false);
    expect(codeOnly(readSrc('core/Game.js'))).not.toMatch(/attachPopCultureSideQuests/);
    expect(codeOnly(readSrc('game/SideQuestSystem.js'))).not.toMatch(/catch \(_\) \{/);
  });

  it('真表零错（不是"什么都报"），三种各点名一次', () => {
    expect(checkSideQuestRosters(SIDE_QUESTS_BASE)).toEqual([]);
    expect(checkSideQuestRosters([]).join('\n')).toMatch(/一族支线空了/);
    // 撞名的桩件要拿**致敬族那一格**当基础族喂进来：与模块里真那份 POP 才构成交叉
    const 撞 = [{ ...SIDE_QUESTS_POP[0] }];
    expect(checkSideQuestRosters(撞).join('\n')).toMatch(/同时在 "sideQuestsBase" 与 "sideQuestsPop" 里/);
    const 缺判据 = SIDE_QUESTS_BASE.map((q, i) => (i === 0 ? { ...q, check: undefined } : q));
    expect(checkSideQuestRosters(缺判据).join('\n')).toMatch(/没有 check 函数/);
  });

  it('这条不变式挂在 shipped 的开机校验上（走 `checkContent`，不是只被本文件调）', () => {
    const planted = (kind, table) => checkContent(
      CONTENT_TABLES.map((t) => (t.kind === kind ? { ...t, table } : t)),
    );
    expect(planted('sideQuestsBase', SIDE_QUESTS_BASE)).toEqual([]);
    expect(planted('sideQuestsBase', []).join('\n')).toMatch(/一族支线空了/);
    // reward 从 `min: 0` 收到 `min: 1`：0 奖励的支线是能过的"完成"，玩家只会看到一条没奖励的任务
    expect(planted('sideQuestsBase', [{ ...SIDE_QUESTS_BASE[0], reward: 0 }]).join('\n'))
      .toMatch(/reward/);
  });
});

describe('W-B12 切片1：每个位面至少一条专属支线，而且那条真的能完成', () => {
  /** 分区支线读的两份持久化状态，摆到位（或只摆一半） */
  const 摆状态 = (game, zone, { 歇满 = true, 看过图 = true } = {}) => {
    // 两份桩都带生产里那两处判据会读的方法 —— 少一格的话，别的支线会走进"判据抛错"那条路，
    // 测试噪声会盖住真正要看的那件事（桩的形状必须像生产，见 §9 B63 那条）
    game.campfireMemory = {
      restCount: { [zone]: 歇满 ? 3 : 2 },
      getStats: () => ({ zones: 1, total: 3, nodeCount: 0 }),
    };
    game.cgGallery = {
      unlocked: new Set(看过图 ? [`${zone}:start`] : []),
      getStats: () => ({ unlocked: 看过图 ? 1 : 0, total: 64, percent: 看过图 ? 2 : 0 }),
    };
  };

  it('五座位面各有一条专属支线，且都标了自己的 `zone`', () => {
    const 有专属 = ZONE_ORDER.filter((z) => SIDE_QUESTS_ALL.some((q) => q.zone === z));
    expect(有专属, `这些位面一条专属支线都没有：${ZONE_ORDER.filter((z) => !有专属.includes(z)).join('、')}`)
      .toEqual([...ZONE_ORDER]);
    for (const q of SIDE_QUESTS_ALL) {
      expect(['global', ...ZONE_ORDER], `${q.id} 的 zone 写的是没登记过的 "${q.zone}"`).toContain(q.zone);
    }
  });

  it('分区支线的判据只读**已持久化**的事实：裸 discovered 仍禁，restPointEnhancer.discovered 放行（v7 起落库）', () => {
    const 源码 = readSrc('content/sideQuests.js');
    // 从两条判据助手那几行起切：判据是 `认得一座(zone)` / `拾遗一座(zone)` 造出来的，读的东西都在助手里
    const 起点 = 源码.indexOf('const 歇过 = ');
    const 分区段 = codeOnly(源码.slice(起点, 源码.indexOf('export const SIDE_QUESTS_ALL')));
    expect(分区段.includes('认得一座'), '切到的不是那一段（判据会空转）').toBe(true);
    expect(分区段.includes('拾遗一座'), '切片2 的助手不在这段里 —— 切段切早了').toBe(true);
    for (const 不该读 of ['getPoi(', 'world.']) {
      expect(分区段, `分区支线的判据读了 "${不该读}"`).not.toContain(不该读);
    }
    // 裸的 discovered 仍是禁区：`POI.discovered` 全仓没有读者、没人写、也不进存档。
    // `restPointEnhancer.discovered` 是营火地标自己的账、存档 v7 起落库（B66）—— 只有带这个名字
    // 前缀的读法放行（前后环视把两种写法都认了：`restPointEnhancer.discovered` / `restPointEnhancer?.discovered`）。
    const 裸discovered = 分区段.match(/(?<!restPointEnhancer\?\.)(?<!restPointEnhancer\.)\bdiscovered\b/g) ?? [];
    expect(裸discovered, '分区判据读了不带 restPointEnhancer 前缀的 discovered —— 那格不进存档，读档后支线会凭空退回').toEqual([]);
    expect(分区段).toContain('restCount');          // 在那座火边歇过几次
    expect(分区段).toContain('unlocked');           // 看过那张门口插画
    expect(分区段).toContain('collectedInZone');    // 该位面的萤火（切片2）
    expect(分区段).toContain('restPointEnhancer');  // 火牌发现（切片2，v7 落库）
  });

  it.each(ZONE_ORDER.map((z) => [z]))('位面 %s 那条：状态摆满就完成，缺一半就不完成', (zone) => {
    installWindowShim();
    const 支线 = SIDE_QUESTS_ZONE.find((q) => q.zone === zone);
    expect(支线, `${zone} 没有专属支线`).toBeTruthy();
    const { game, 记 } = makeGame();
    const sq = new SideQuestSystem(game);
    摆状态(game, zone, { 歇满: true, 看过图: false });
    sq.checkAll();
    expect(sq.completed.has(支线.id), '只看了一张图就该还没完成').toBe(false);
    摆状态(game, zone, { 歇满: false, 看过图: true });
    sq.checkAll();
    expect(sq.completed.has(支线.id), '只歇了两次就该还没完成').toBe(false);
    摆状态(game, zone, { 歇满: true, 看过图: true });
    sq.checkAll();
    expect(sq.completed.has(支线.id)).toBe(true);
    expect(记.souls).toEqual([支线.reward]);
    expect(记.toasts.join('')).toContain(支线.title);
  });

  it('不变式咬得住：抹掉某一座位面的专属支线，走 shipped 入口点名那一座', () => {
    const 最后一座 = ZONE_ORDER[ZONE_ORDER.length - 1];
    const planted = (kind, table) => checkContent(
      CONTENT_TABLES.map((t) => (t.kind === kind ? { ...t, table } : t)),
    );
    expect(planted('sideQuestsZone', SIDE_QUESTS_ZONE)).toEqual([]);        // accept 方向
    const 缺 = SIDE_QUESTS_ZONE.filter((q) => q.zone !== 最后一座);
    const issues = planted('sideQuestsZone', 缺);
    expect(issues.join(' ; '), `少了 "${最后一座}" 的专属支线，覆盖门禁没意见？`)
      .toMatch(new RegExp(`位面 "${最后一座}" 一条专属支线都没有`));
    // 反向的第二向：给一个没登记的 zone 也要红（不然"分区"只是一个自由文本）
    const 野值 = [...SIDE_QUESTS_ZONE, { ...SIDE_QUESTS_ZONE[0], id: 'side-zone-ghost', zone: '月亮城' }];
    expect(planted('sideQuestsZone', 野值).join(' ; ')).toMatch(/zone/);
  });
});

describe('W-B12 切片2：每位面第二条专属支线 —— 萤火与火牌，两样都在存档里', () => {
  /** 拾遗判据读的两份持久化状态，摆到位（或只摆一半） */
  const 摆 = (game, zone, { 收 = 2, 认 = true } = {}) => {
    game.soulWisps = { collectedInZone: (z) => (z === zone ? 收 : 0) };
    game.restPointEnhancer = { discovered: new Set(认 ? [zone] : []) };
  };

  it('五座位面各有一条"拾遗"支线：每位面的专属支线 ≥2，id 成对出现', () => {
    for (const zone of ZONE_ORDER) {
      const 条数 = SIDE_QUESTS_ZONE.filter((q) => q.zone === zone).length;
      expect(条数, `位面 ${zone} 的专属支线只有 ${条数} 条 —— 切片2 门禁是 ≥2`).toBeGreaterThanOrEqual(2);
      expect(SIDE_QUESTS_ZONE.some((q) => q.id === `side-wisp-${zone}` && q.zone === zone),
        `位面 ${zone} 缺 side-wisp-<zone> 那一条`).toBe(true);
    }
    expect(SIDE_QUESTS_ALL.length).toBe(SIDE_QUESTS_BASE.length + SIDE_QUESTS_ZONE.length + SIDE_QUESTS_POP.length);
  });

  it.each(ZONE_ORDER.map((z) => [z]))('位面 %s 拾遗那条：缺一样不完成，两样齐才完成', (zone) => {
    installWindowShim();
    const 支线 = SIDE_QUESTS_ZONE.find((q) => q.id === `side-wisp-${zone}`);
    expect(支线, `${zone} 没有拾遗支线`).toBeTruthy();
    const { game, 记 } = makeGame();
    const sq = new SideQuestSystem(game);
    摆(game, zone, { 收: 1, 认: true });
    sq.checkAll();
    expect(sq.completed.has(支线.id), '只收了一枚萤火就该还没完成').toBe(false);
    摆(game, zone, { 收: 2, 认: false });
    sq.checkAll();
    expect(sq.completed.has(支线.id), '萤火收齐但没认过火牌就该还没完成').toBe(false);
    摆(game, zone, { 收: 2, 认: true });
    sq.checkAll();
    expect(sq.completed.has(支线.id)).toBe(true);
    expect(记.souls).toEqual([支线.reward]);
    expect(记.toasts.join('')).toContain(支线.title);
    // 其余四座的拾遗支线不得被这一座的账误完成
    const 别座的 = SIDE_QUESTS_ZONE.filter((q) => q.id.startsWith('side-wisp-') && q.zone !== zone);
    expect(别座的.every((q) => !sq.completed.has(q.id)), '别的位面凭空完成了').toBe(true);
  });

  it('soulWisps.collectedInZone 按出生点表数账（位面归属只在表上那一格，不在 id 前缀里）', () => {
    installWindowShim();
    const 场景 = { add: () => {} };
    const 世界 = { getGroundHeight: () => 0 };
    const mgr = new SoulWispManager(场景, 世界, { addSouls: () => {} }, { toast: () => {} }, {});
    expect(mgr.collectedInZone(ZONE_IDS.FANTASY)).toBe(0);
    // 走读档路径摆状态：fromJSON 是存档往返的另一半，读档后这个数必须不失真
    mgr.fromJSON(['wisp-fantasy', 'wisp-fantasy2', 'wisp-magic']);
    expect(mgr.collectedInZone(ZONE_IDS.FANTASY)).toBe(2);
    expect(mgr.collectedInZone(ZONE_IDS.MAGIC)).toBe(1);
    expect(mgr.collectedInZone(ZONE_IDS.SPACE)).toBe(0);
    expect(mgr.collectedInZone(ZONE_IDS.HUB)).toBe(0);
    expect(mgr.toJSON()).toEqual(['wisp-fantasy', 'wisp-fantasy2', 'wisp-magic']);
  });

  it('门禁升到 ≥2 咬得住：只留切片1 那五条时，每一位面都被点名', () => {
    const planted = (kind, table) => checkContent(
      CONTENT_TABLES.map((t) => (t.kind === kind ? { ...t, table } : t)),
    );
    expect(planted('sideQuestsZone', SIDE_QUESTS_ZONE)).toEqual([]);   // 全量通过
    const 只有切片一 = SIDE_QUESTS_ZONE.filter((q) => !q.id.startsWith('side-wisp-'));
    expect(只有切片一.length).toBe(ZONE_ORDER.length);                 // 桩本身是"每位面恰好一条"
    const issues = planted('sideQuestsZone', 只有切片一);
    expect(issues.join('\n')).toMatch(new RegExp(`位面 "${ZONE_ORDER[0]}" 的专属支线只有 1 条`));
    expect(issues.filter((l) => l.includes('只有 1 条')).length, '五座位面都得被点名')
      .toBe(ZONE_ORDER.length);
  });
});

describe('W-B12 切片3：单系列致敬支线的 zone 由回声表推，不再手抄', () => {
  /** 与生产同一条规则的独立复算：系列 → 它所有回声住的（唯一那座）位面 */
  const 复算 = (franchise) => {
    const 座 = new Set(ECHOES.filter((e) => e.franchise === franchise).map((e) => e.zone));
    return 座.size === 1 ? [...座][0] : null;
  };
  const 单系列条目 = SIDE_QUESTS_POP.filter((q) => q.id.endsWith('-tour'));

  it('十条单系列致敬支线的 zone 与回声表一致（边写死边漂的情况不存在）', () => {
    expect(单系列条目.length).toBe(10);
    for (const q of 单系列条目) {
      expect(q.zone, `${q.id} 的 zone 不是回声表推出来的那座`)
        .toBe(复算({ 'side-wizard-tour': 'wizard', 'side-space-tour': 'interstellar', 'side-upside-tour': 'upside', 'side-western-tour': 'border', 'side-gangster-tour': 'family', 'side-scifi-tour': 'deepspace', 'side-cyber-tour': 'cyber', 'side-samurai-tour': 'samurai', 'side-cosmic-tour': 'cosmic', 'side-starport-tour': 'starport' }[q.id]));
    }
  });

  it('多系列 / 全局百分比那四条仍标 global —— 任何一座位面都装不下它们', () => {
    const 仍全局 = SIDE_QUESTS_POP.filter((q) => !q.id.endsWith('-tour'));
    expect(仍全局.map((q) => q.id).sort()).toEqual(
      ['side-echo-full', 'side-echo-half', 'side-triad-master', 'side-wave4-master'],
    );
    expect(仍全局.every((q) => q.zone === 'global')).toBe(true);
  });

  it('franchiseZone 自己的门：系列散进两位面 / 一条回声都没有时当场抛', () => {
    const 人造表 = [
      { franchise: '散的', zone: ZONE_IDS.MAGIC },
      { franchise: '散的', zone: ZONE_IDS.SPACE },
      { franchise: '独苗', zone: ZONE_IDS.ABYSS },
    ];
    expect(() => franchiseZone('散的', 人造表)).toThrow(/两个以上位面/);
    expect(franchiseZone('独苗', 人造表)).toBe(ZONE_IDS.ABYSS);
    expect(() => franchiseZone('不存在的系列', 人造表)).toThrow(/一条都没有/);
  });

  it('POP 表的 zone 已进 registry 的枚举门禁（野值红、合法值绿）', () => {
    const planted = (kind, table) => checkContent(
      CONTENT_TABLES.map((t) => (t.kind === kind ? { ...t, table } : t)),
    );
    expect(planted('sideQuestsPop', SIDE_QUESTS_POP)).toEqual([]);
    const 野值 = SIDE_QUESTS_POP.map((q, i) => (i === 0 ? { ...q, zone: '月亮城' } : q));
    expect(planted('sideQuestsPop', 野值).join('\n')).toMatch(/zone/);
    const 缺格 = SIDE_QUESTS_POP.map((q, i) => (i === 1 ? { ...q, zone: undefined } : q));
    expect(planted('sideQuestsPop', 缺格).join('\n')).toMatch(/缺少必填字段/);
  });

  it('每条支线的 desc 过一遍真渲染 keyText() 不抛 —— 写错的 {动作} token 打开 [J] 面板就崩', () => {
    // SideQuestJournalTab 渲染每条 desc 走 keyText(q.desc)；keyText 遇到两张键位表
    // 都不认识的 {action} 会直接 throw，崩掉整个支线面板（OVERHAUL_PLAN 点名的 {pray} 类）。
    // 这条门禁把"名单里任何一条 desc 写错键名"当场钉红，而不是等玩家打开面板才崩。
    for (const q of SIDE_QUESTS_ALL) {
      expect(() => keyText(q.desc), `支线 ${q.id} 的 desc 渲染失败`).not.toThrow();
    }
    // 反证：门禁真的会咬 —— 一个两表都不认识的 token 必须抛（否则上面是假绿）。
    expect(() => keyText('用 {photMode} 拍照')).toThrow(/不是任何已登记的动作/);
  });

});
