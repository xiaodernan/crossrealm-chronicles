/**
 * 营火的名字只有一份 —— W-B4 切片2（修 W-A2 留下的"第四份营火名"）。
 *
 * 这一族的症状从来不是报错，而是**同一屏上两个名字**：改前站在枢纽那座火边，脚下的提示写
 * `[E] 与 锚火看守 交谈 · 休息 — 世界之锚休息点`，一秒之后按 E 开出来的对话标题是
 * `世界之锚营火`（真浏览器读过，见 §8 的 R9）。`magic` 那格抄的更是早已废弃的区名
 * '魔法遗境'（真实区名 '霍格沃兹遗境'），于是那座火的对话标题说的是一个世界里不存在的名字。
 * 两份都是合法字符串：加载期、内容校验、整仓 import 图谁都不会红 —— 只有玩家看得出。
 *
 * 现在：名字在 `content/restPointNames.js` 一张表里，世界里的六座从它取（`buildDefaults` 不再自己拼），
 * 对话标题取营火对象自己的 `name`，`checkRestDialogueTree` 第六条不许树上再长 `title`。
 *
 * 两条写法纪律：
 * - **凡按等式能通过的推导都不算全部证据**：派生关系（区名 → 营火名）问生产方，
 *   而"屏幕上到底是哪一个"要钉字面 —— 否则两张表一起改口，等式仍然成立。
 * - **反向控制喂字面桩件**，不从当前源码推导"坏掉的那一版"。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { REST_POINT_NAMES } from '../src/content/restPointNames.js';
import { REST_DIALOGUES } from '../src/content/restDialogues.js';
import { REST_NPC_DEFS } from '../src/content/restNpcDefs.js';
import { ZONE_IDS, ZONE_ORDER, ZONE_NAMES } from '../src/content/ZoneIdentity.js';
import { checkRestPointNames, checkContent, CONTENT_TABLES } from '../src/content/registry.js';
import { RestDialogue } from '../src/game/RestDialogue.js';
import { RestPointManager } from '../src/world/RestPointManager.js';
import { RestPointEnhancer } from '../src/world/RestPointEnhancer.js';
import { installWindowShim } from './helpers/enemyHarness.js';

const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/** 走 shipped 入口：只把某一张表换成种植入的，其余照原样 */
const planted = (kind, table) => checkContent(
  CONTENT_TABLES.map((t) => (t.kind === kind ? { ...t, table } : t)),
);

/**
 * 种植入时**保留真树**，只加/减我要看的那一格。
 *
 * 理由与 W-B4 切片1 同源：成对规则读的是整张表。把 hub 换成一棵小树，`restDialogueCg`
 * 里那些 `hub:souls` / `hub:rematch` 立刻变成"节点不在树里"，我要看的那一条就被埋掉了。
 */
const treeWith = (zone, extra) => ({ ...REST_DIALOGUES[zone], ...extra });
const treesOf = (over) => ({ ...REST_DIALOGUES, ...over });

function campfireGame(sunk) {
  return {
    quests: { chapter: 5, current: null, getProgressText: () => '', getAssistantHint: () => '' },
    audio: {},
    player: { combat: { restHeal: () => sunk.healed.push(1) } },
    upgrade: { show: (name) => sunk.upgraded.push(name) },
    dialog: {
      // 与生产的 `ui/Dialog.js` 同一格形状：第一个参数就是 `#dialog-title` 的文本
      showChoices: (title, html, choices, meta) => sunk.titles.push({ title, meta }),
      toast: () => {},
      hide: () => sunk.closed.push(1),
    },
    storyJournal: { add: () => {} },
    stats: { addSouls: (n) => sunk.souls.push(n), toJSON: () => ({ souls: 0 }) },
    restNpcs: { getByRestId: () => null },
  };
}
const newSunk = () => ({ titles: [], healed: [], upgraded: [], souls: [], closed: [] });
const withWindow = (fn) => {
  installWindowShim();
  try {
    return fn();
  } finally {
    delete globalThis.window;
    delete globalThis.CustomEvent;
  }
};

describe('营火名与另两张名册配成一对', () => {
  const roster = [ZONE_IDS.HUB, ...ZONE_ORDER];
  const keys = (t) => Object.keys(t).sort();

  it('控制组：三张名册（名字 / 对话树 / NPC 定义）逐格是同一批营火', () => {
    expect(roster.length, '区名单本身几乎是空的 —— 下面几条就只是"什么都比"').toBeGreaterThan(1);
    expect(keys(REST_POINT_NAMES), '名字表与"枢纽 + 五座位面"不是同一批').toEqual([...roster].sort());
    expect(keys(REST_DIALOGUES), '对话树与名字表不同名册').toEqual(keys(REST_POINT_NAMES));
    expect(keys(REST_NPC_DEFS), 'NPC 定义与名字表不同名册').toEqual(keys(REST_POINT_NAMES));
  });

  it('五座位面营火的名字由区名派生：改区名，营火名跟着改（问的是生产方）', () => {
    for (const zone of ZONE_ORDER) {
      expect(REST_POINT_NAMES[zone], `${zone} 那座不是"区名 + 营火"那个形状`)
        .toBe(`${ZONE_NAMES[zone]}营火`);
    }
  });

  it('枢纽那座是显式例外：不等于"区名 + 营火"，而它自己的写法钉字面', () => {
    expect(REST_POINT_NAMES[ZONE_IDS.HUB]).not.toBe(`${ZONE_NAMES[ZONE_IDS.HUB]}营火`);
    // 与上一条等式同时为真时，只有这个字面能挡住"两张表一起改口"
    expect(REST_POINT_NAMES[ZONE_IDS.HUB]).toBe('世界之锚休息点');
  });

  it('营火名里的区名部分必须是当前仍在用的那一个（废弃区名是实物病例）', () => {
    const 现役区名 = Object.values(ZONE_NAMES);
    const 漏网的 = [];
    for (const [id, name] of Object.entries(REST_POINT_NAMES)) {
      if (id === ZONE_IDS.HUB) continue;   // 枢纽那座不叫"交汇枢纽营火"，见名字表头注
      const 区名部分 = name.replace(/营火$/, '');
      if (!现役区名.includes(区名部分)) 漏网的.push(`${id}: "${name}" 的区名部分 "${区名部分}" 不在 ${现役区名.join(' / ')} 里`);
    }
    expect(漏网的, `这些营火名带的是废弃区名：\n${漏网的.join('\n')}`).toEqual([]);
  });
});

describe('第四份抄本已经删掉（树上不再长 title）', () => {
  it('六棵树每一棵都没有 `title` 这一格', () => {
    for (const [zone, tree] of Object.entries(REST_DIALOGUES)) {
      expect(tree, `${zone} 那棵树又自带名字了`).not.toHaveProperty('title');
    }
  });

  it('源文件层面也认这一条：`restDialogues.js` 的树顶层不再出现 `title:`', () => {
    const 树顶层 = src('content/restDialogues.js').split('\n').filter((l) => /^ {4}title: /.test(l));
    expect(树顶层, `这些行又把营火名抄回对话树里了：\n${树顶层.join('\n')}`).toEqual([]);
    // 反向见证：判据不是"扫不到东西"—— 同一条正则喂"抄回来的那一版"必须命中
    const 人造 = '  hub: {\n    title: "世界之锚营火",\n    nodes: {},\n  },';
    expect(人造.split('\n').filter((l) => /^ {4}title: /.test(l))).toHaveLength(1);
  });

  it('开机校验认这一条：真树原样零错，给 hub 加回 title 必须点名', () => {
    expect(planted('restDialogues', treesOf({ hub: treeWith('hub', {}) })), '真表打底不该报错').toEqual([]);
    const errs = planted('restDialogues', treesOf({ hub: treeWith('hub', { title: '世界之锚营火' }) }));
    expect(errs.join('\n'), '把第四份抄本种回去，注册表没意见？').toMatch(/hub: 树上又带了 title/);
  });

  it('名字表三条成对规则各配一次反向，且真表零错（不是"什么都报"）', () => {
    expect(checkRestPointNames(REST_POINT_NAMES)).toEqual([]);
    const 少hub = { ...REST_POINT_NAMES };
    delete 少hub[ZONE_IDS.HUB];
    expect(checkRestPointNames(少hub).join('\n')).toMatch(/营火 hub: 名字表里没有这一格/);
    expect(checkRestPointNames({ ...REST_POINT_NAMES, ghostfire: '陌生火营火' }).join('\n'))
      .toMatch(/"ghostfire": 有名字却没有对话树/);
    expect(checkRestPointNames({ ...REST_POINT_NAMES, magic: '' }).join('\n'))
      .toMatch(/"magic": 名字不是非空字符串/);
    // 同一族也走得通的 shipped 入口
    expect(planted('restPointNames', 少hub).join('\n')).toMatch(/名字表里没有这一格/);
  });
});

describe('营火名的消费者：世界与对话都问同一个源', () => {
  const makeManager = () => new RestPointManager({ add() {}, remove() {} }, { getGroundHeight: () => 0 });

  it('世界里那六座营火的名字就是名字表那六格，且互不相同', () => {
    const mgr = makeManager();
    mgr.buildDefaults();
    expect(mgr.points).toHaveLength(Object.keys(REST_POINT_NAMES).length);
    for (const p of mgr.points) {
      expect(p.name, `${p.id} 那座在营火列表里的名字与名字表不同`).toBe(REST_POINT_NAMES[p.id]);
    }
    // 同名会让"按名字认路"的老链路跳错地方（B36 那一族的旧账），这里把它钉成不变式
    expect(new Set(mgr.points.map((p) => p.name)).size).toBe(mgr.points.length);
  });

  it('`buildDefaults` 不再自己拼名字（扫那一段函数体，不是整个文件）', () => {
    const 文件 = src('world/RestPointManager.js');
    const 起 = 文件.indexOf('buildDefaults() {');
    const 体 = 文件.slice(起, 文件.indexOf('\n  }', 起));
    expect(体.includes('buildDefaults'), '切到的不是那一段（判据会空转）').toBe(true);
    const 代码 = 体.split('\n').filter((l) => !/^\s*\/\//.test(l));
    // 判据不是"不许出现'营火'两个字" —— 那放得过 `'世界之锚休息点'` 这种字面抄本。
    // 这一段里根本不该再有字符串：名字一律从表里取。
    const 带字符串的 = 代码.filter((l) => /['"`]/.test(l));
    expect(带字符串的, `buildDefaults 里还有自己写死的文案：\n${带字符串的.join('\n')}`).toEqual([]);
    expect(代码.filter((l) => l.includes('REST_POINT_NAMES[')).length, '六座各自问一次名字表')
      .toBe(Object.keys(REST_POINT_NAMES).length);
  });

  it('缺名字的营火在构建期就抛（与"缺 id"同族）；给齐了不该抛', () => {
    const mgr = makeManager();
    expect(() => mgr.addRestPoint(0, 0, '', 'hub')).toThrow(/缺少显示名/);
    expect(() => mgr.addRestPoint(0, 0, undefined, 'hub')).toThrow(/缺少显示名/);
    expect(() => mgr.addRestPoint(0, 0, '有名字的火', 'hub')).not.toThrow();
  });

  it('营火木牌上的地名取当前区名（同一族里的第五份抄本，废弃名实测在 magic 那一格）', () => {
    const points = Object.keys(REST_POINT_NAMES).map((id) => ({
      id, name: REST_POINT_NAMES[id], mesh: { add() {} },
    }));
    const game = { restPoints: { points }, dialog: { toast() {} }, quests: { chapter: 1 } };
    new RestPointEnhancer({ points }, game);
    const 错的 = [];
    for (const p of points) {
      // 枢纽那座牌上不写片区名 '交汇枢纽'：木牌指的是场地中央那件东西（钉字面）
      const 期望 = p.id === ZONE_IDS.HUB ? '世界之锚' : ZONE_NAMES[p.id];
      if (p.zoneLabel !== 期望) 错的.push(`${p.id}: 牌上 "${p.zoneLabel}"，当前该叫 "${期望}"`);
    }
    expect(错的, `这些营火牌上写的是废弃地名：\n${错的.join('\n')}`).toEqual([]);
  });

  it('六座逐个开对话：屏幕上的标题就是那一座的名字', () => {
    withWindow(() => {
      const sunk = newSunk();
      const rd = new RestDialogue(campfireGame(sunk));
      for (const [id, name] of Object.entries(REST_POINT_NAMES)) rd.start({ id, name });
      const ids = Object.keys(REST_POINT_NAMES);
      expect(sunk.titles).toHaveLength(ids.length);
      ids.forEach((id, i) => {
        expect(sunk.titles[i].title, `${id} 的对话标题不是营火名`).toBe(REST_POINT_NAMES[id]);
        expect(sunk.titles[i].meta.restId, `${id} 的对话 meta 走错了营火`).toBe(id);
      });
    });
  });

  it('钉两处字面：漂移过的 hub 与 magic 在屏幕上叫什么（等式挡不住两张表一起改口）', () => {
    withWindow(() => {
      const sunk = newSunk();
      const rd = new RestDialogue(campfireGame(sunk));
      rd.start({ id: 'hub', name: REST_POINT_NAMES.hub });
      rd.start({ id: 'magic', name: REST_POINT_NAMES.magic });
      expect(sunk.titles[0].title).toBe('世界之锚休息点');
      expect(sunk.titles[1].title).toBe('霍格沃兹遗境营火');
    });
  });

  it('反向控制（字面桩件）：树里塞一份不同的 title，屏幕上仍必须是营火本名', () => {
    withWindow(() => {
      const sunk = newSunk();
      const rd = new RestDialogue(campfireGame(sunk));
      rd.activeRest = { id: 'hub', name: '营火本名' };
      rd._showNode(treeWith('hub', { title: '抄本标题' }), 'start');
      expect(sunk.titles.map((t) => t.title), '标题又从树上抄了一份').toEqual(['营火本名']);
    });
  });

});
