/**
 * 试炼榜（W-G2 切片1）。
 *
 * ## 这一片解决什么
 *
 * W-F3 切片6 把成绩送上了服务端第二张榜（`POST /api/trials/runs`），也写了拉取方法
 * `fetchTrialLeaderboard` —— 但**客户端没有看榜的地方**。一条写好了却没人调的路，
 * 在仓库里与不存在没有区别：玩家交上去的成绩去了一个自己永远看不到的地方。
 *
 * 这一片在试炼页补上那一块，并顺手处理日志页的第一个异步内容：
 * 其余部分都是"打开时算一次"的同步快照，而榜必须等网络。
 *
 * ## 三条纪律（也是三个用例层）
 *
 * ① **只画自己那一格**：异步回来的那一笔只重写 `[data-trial-board]`，绝不整页重渲染 ——
 *    否则玩家在等待期间切到别的页签，答案回来时会把那一页盖掉；
 * ② **发号**：连点两次范围按钮，只认最后回来的那一份；
 * ③ **服务端数据当不可信**：行只用 `textContent` 拼，`runner` 里写标签也只会显示成文字。
 *
 * ## 用例分七层
 * ① 文案腿：八枚新键中英 + 占位符对齐 + 键数 2848；
 * ② 离线腿：没有在线服务 / 关着 → 一句"取不到"，**零网络请求**，也不进"读取中"；
 * ③ 正常腿：先"读取中"后成行，名次 / 分数 / 层数 / 剩余秒逐字对；
 * ④ 空与坏：空榜一句话、拉不到一句话、抛错也一句话（不许停在"读取中"）；
 * ⑤ 范围腿：本赛季带 `season`、总榜不带；没有赛季 id 时只给一个按钮；
 * ⑥ 发号腿：两个请求乱序回来，屏幕上只留最后一次点的那个范围；
 * ⑦ 切走腿：答案回来时那一格已经不在了 —— 不抛、不碰 DOM。
 */
import { describe, it, expect } from 'vitest';
import { TrialJournalTab } from '../src/ui/TrialJournalTab.js';
import { STRINGS_ZH, STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRINGS_EN, STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
import { 键数问题 } from './helpers/i18nKeyCount.js';
import { setLanguage } from '../src/engine/i18n.js';
import { makeMarkupDom, node } from './helpers/fakeMarkupDom.js';

const 含汉 = /[\u4e00-\u9fff]/;

/** 八枚新键：键 → [中文原值, 英文原值] */
const NEW_KEYS = {
  trial_board_title: ['试炼榜', 'Trial board'],
  trial_board_scope_season: ['本赛季', 'This season'],
  trial_board_scope_all: ['跨季总榜', 'All seasons'],
  trial_board_loading: ['正在读取…', 'Reading…'],
  trial_board_empty: ['这一张榜还是空的', 'No runs on this board yet'],
  trial_board_offline: ['取不到榜 · 在线服务未开启，或网关连不上', 'Board unavailable · online service off or gateway unreachable'],
  trial_board_row_fmt: ['#${rank} ${runner} · ${score} 分 · ${layers} 层 · 余 ${clock}', '#${rank} ${runner} · ${score} pts · ${layers} layers · ${clock} left'],
  trial_board_note_fmt: ['范围：${scope} · 成绩在通关或失败时自动提交，这里是只读快照', 'Scope: ${scope} · runs are submitted automatically when a trial ends; this is a read-only snapshot'],
};

const flush = () => new Promise((r) => { setTimeout(r, 0); });

/** 试炼状态快照：`state` 可换，其余给一份"未开始"的形状 */
function trialState(over = {}) {
  return {
    state: 'idle',
    layer: 1,
    maxLayers: 5,
    layersCleared: 0,
    secondsLeft: 0,
    quota: 0,
    kills: 0,
    score: 0,
    lastReason: null,
    affixIds: [],
    active: { timeDelta: 0, quotaDelta: 0, burnDps: 0, fogMul: 1 },
    spawnScale: null,
    spawnScaleLive: false,
    spawnerLive: false,
    spawnedThisLayer: 0,
    aliveCount: 0,
    arena: null,
    best: { score: 0, layersCleared: 0 },
    ...over,
  };
}

/**
 * 在线服务桩：请求不自动完成，由用例决定什么时候、以什么结果回来。
 * 这一片量的就是"回来的顺序"，所以不能让它自己 resolve。
 */
function onlineHarness({ enabled = true } = {}) {
  const calls = [];
  const pending = [];
  return {
    calls,
    pending,
    enabled: () => enabled,
    fetchTrialLeaderboard(seasonId, limit) {
      calls.push({ seasonId, limit });
      const d = {};
      d.promise = new Promise((resolve, reject) => { d.resolve = resolve; d.reject = reject; });
      pending.push(d);
      return d.promise;
    },
  };
}

function boot({ seasons = true, online = onlineHarness(), trial = trialState() } = {}) {
  const doc = makeMarkupDom();
  globalThis.document = doc;
  const panel = node('div', doc);
  doc.body.appendChild(panel);
  const game = {
    trial: { getState: () => trial, start: () => {}, abandon: () => {} },
    onlineServices: online,
  };
  if (seasons) game.seasons = { getState: () => ({ id: 'ember', modifierIds: ['glass-cannon'] }) };
  const tab = new TrialJournalTab(game);
  return { doc, panel, game, tab, online };
}

/** 榜那一格里的文字（行 = 逐行文本数组） */
const rowsOf = (panel) => (panel.querySelector('.trial-board-list')?.children ?? []).map((li) => li.textContent);
const msgOf = (panel) => panel.querySelector('.trial-board-msg')?.textContent ?? '';
const scopesOf = (panel) => (panel.querySelector('.trial-board-head')?.children ?? [])
  .filter((el) => el.tag === 'button').map((b) => b.textContent);

/* ------------------------------------------------------------------ *
 * ① 文案腿
 * ------------------------------------------------------------------ */

describe('① 文案腿：八枚新键两表对齐', () => {
  it('中英原值逐字钉死', () => {
    for (const [key, [zh, en]] of Object.entries(NEW_KEYS)) {
      expect(STRINGS_ZH[key], `zh 表里 ${key} 的原值被改了`).toBe(zh);
      expect(STRINGS_EN[key], `en 表里 ${key} 的原值被改了`).toBe(en);
    }
  });

  it('带占位的两枚键中英占位符一致', () => {
    const 占位 = (s) => [...s.matchAll(/\$\{(\w+)(?:\|[^}]*)?\}/g)].map((m) => m[1]).sort();
    for (const key of ['trial_board_row_fmt', 'trial_board_note_fmt']) {
      expect(占位(STRINGS_EN[key]), `${key} 中英占位符不一致`).toEqual(占位(STRINGS_ZH[key]));
    }
  });

  it('键数 2848：两表相等且等于登记值', () => {
    expect(ZH_KEYS.length).toBe(EN_KEYS.length);
    expect(键数问题(ZH_KEYS, EN_KEYS), '键数与登记值不符').toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * ② 离线腿
 * ------------------------------------------------------------------ */

describe('② 离线腿：没有在线服务时零网络', () => {
  it('game.onlineServices 缺省 → 一句"取不到"，且没进过"读取中"', () => {
    setLanguage('zh');
    const { panel, tab } = boot();
    // 把在线服务摘掉（离线装机就是没有这一层）
    tab.game.onlineServices = undefined;
    tab.render(panel);
    expect(msgOf(panel)).toBe('取不到榜 · 在线服务未开启，或网关连不上');
    expect(tab._board.state).toBe('off');
  });

  it('服务关着 → 同样零请求（enabled() 为假时连方法都不该被调）', () => {
    setLanguage('zh');
    const online = onlineHarness({ enabled: false });
    const { panel, tab } = boot({ online });
    tab.render(panel);
    expect(online.calls).toEqual([]);
    expect(msgOf(panel)).toBe('取不到榜 · 在线服务未开启，或网关连不上');
  });
});

/* ------------------------------------------------------------------ *
 * ③ 正常腿
 * ------------------------------------------------------------------ */

describe('③ 正常腿：先"读取中"，答案回来后成行', () => {
  it('三行按服务端顺序落，名次从 1 起，秒数走 m:ss', async () => {
    setLanguage('zh');
    const online = onlineHarness();
    const { panel, tab } = boot({ online });
    tab.render(panel);
    expect(msgOf(panel)).toBe('正在读取…');
    expect(online.calls).toEqual([{ seasonId: 'ember', limit: 10 }]);

    online.pending[0].resolve({
      items: [
        { runner: '阿岚', score: 700, layersCleared: 5, secondsLeft: 72 },
        { runner: 'Bramble', score: 613, layersCleared: 5, secondsLeft: 9 },
        { runner: '无名', score: 0, layersCleared: 0, secondsLeft: 0 },
      ],
      count: 3,
      season: 'ember',
      maxLimit: 50,
    });
    await flush();
    expect(rowsOf(panel)).toEqual([
      '#1 阿岚 · 700 分 · 5 层 · 余 1:12',
      '#2 Bramble · 613 分 · 5 层 · 余 0:09',
      '#3 无名 · 0 分 · 0 层 · 余 0:00',
    ]);
    expect(msgOf(panel), '成行之后不该还留着状态句').toBe('');
    expect(tab._board.state).toBe('ready');
  });

  it('范围说明写上赛季名（榜上的分数带赛季，不说清就是一张会骗人的表）', () => {
    setLanguage('zh');
    const { panel, tab } = boot();
    tab.render(panel);
    const note = panel.querySelector('.trial-board-note').textContent;
    expect(note).toContain('范围：');
    expect(note).toContain('自动提交');
    expect(note, '本赛季那一张要写出赛季名').toContain(STRINGS_ZH.season_ember_name);
  });

  it('服务端数据当不可信：runner 里写标签只显示成文字，页面里不会多出一个 img', async () => {
    setLanguage('zh');
    const online = onlineHarness();
    const { panel, tab } = boot({ online });
    tab.render(panel);
    online.pending[0].resolve({
      items: [{ runner: '<img src=x onerror="alert(1)">', score: 1, layersCleared: 1, secondsLeft: 1 }],
    });
    await flush();
    expect(rowsOf(panel)[0]).toContain('<img src=x onerror="alert(1)">');
    expect(panel.querySelectorAll('img').length, '字符串被当成标记解析了').toBe(0);
  });

  it('脏行不产 NaN：缺字段按 0 / 破折号落', async () => {
    setLanguage('zh');
    const online = onlineHarness();
    const { panel, tab } = boot({ online });
    tab.render(panel);
    online.pending[0].resolve({ items: [{}, { score: 'x', layersCleared: null, secondsLeft: 'y' }] });
    await flush();
    expect(rowsOf(panel)).toEqual([
      '#1 — · 0 分 · 0 层 · 余 0:00',
      '#2 — · 0 分 · 0 层 · 余 0:00',
    ]);
    expect(rowsOf(panel).join('')).not.toContain('NaN');
  });

  it('切英文后整块（标题 / 按钮 / 行 / 说明）不留中文', async () => {
    setLanguage('zh');
    const online = onlineHarness();
    const { panel, tab } = boot({ online });
    tab.render(panel);
    online.pending[0].resolve({ items: [{ runner: 'Bramble', score: 613, layersCleared: 5, secondsLeft: 9 }] });
    await flush();

    setLanguage('en');
    tab.render(panel);                       // 页签重开就是重渲染（日志页的既有口径）
    online.pending[1].resolve({ items: [{ runner: 'Bramble', score: 613, layersCleared: 5, secondsLeft: 9 }] });
    await flush();

    const block = panel.querySelector('[data-trial-board]').textContent;
    expect(block).toContain('Trial board');
    expect(block).toContain('#1 Bramble · 613 pts · 5 layers · 0:09 left');
    expect(block).toContain('Scope:');
    expect(block, '英文界面下榜里夹了中文').not.toMatch(含汉);
    expect(block).not.toContain('[MISSING:');
    setLanguage('zh');
  });
});

/* ------------------------------------------------------------------ *
 * ④ 空与坏
 * ------------------------------------------------------------------ */

describe('④ 空与坏：三种结局都不许停在"读取中"', () => {
  it('空榜 → 一句话', async () => {
    setLanguage('zh');
    const online = onlineHarness();
    const { panel, tab } = boot({ online });
    tab.render(panel);
    online.pending[0].resolve({ items: [], count: 0, season: 'ember', maxLimit: 50 });
    await flush();
    expect(msgOf(panel)).toBe('这一张榜还是空的');
    expect(rowsOf(panel)).toEqual([]);
  });

  it('返回 null（未启用 / 非 2xx / 超时）→ "取不到"', async () => {
    setLanguage('zh');
    const online = onlineHarness();
    const { panel, tab } = boot({ online });
    tab.render(panel);
    online.pending[0].resolve(null);
    await flush();
    expect(msgOf(panel)).toBe('取不到榜 · 在线服务未开启，或网关连不上');
  });

  it('请求抛出来 → 也是"取不到"，不是永远"读取中"', async () => {
    setLanguage('zh');
    const online = onlineHarness();
    const { panel, tab } = boot({ online });
    tab.render(panel);
    online.pending[0].reject(new Error('boom'));
    await flush();
    expect(msgOf(panel)).toBe('取不到榜 · 在线服务未开启，或网关连不上');
    expect(tab._board.state).toBe('off');
  });

  it('形状不对（items 不是数组）→ 按"取不到"，不按"空榜"', async () => {
    setLanguage('zh');
    const online = onlineHarness();
    const { panel, tab } = boot({ online });
    tab.render(panel);
    online.pending[0].resolve({ items: 'nope' });
    await flush();
    expect(tab._board.state).toBe('off');
  });
});

/* ------------------------------------------------------------------ *
 * ⑤ 范围腿
 * ------------------------------------------------------------------ */

describe('⑤ 范围腿：本赛季带 season，总榜不带', () => {
  it('默认看本赛季（带 id）；点"跨季总榜"改成空串', async () => {
    setLanguage('zh');
    const online = onlineHarness();
    const { panel, tab } = boot({ online });
    tab.render(panel);
    expect(online.calls[0].seasonId).toBe('ember');
    online.pending[0].resolve({ items: [] });
    await flush();

    const total = panel.querySelector('.trial-board-head').children
      .filter((el) => el.tag === 'button')[1];
    total.click();
    expect(online.calls[1].seasonId, '总榜不带赛季过滤').toBe('');
    online.pending[1].resolve({ items: [] });
    await flush();
    expect(tab._board.key).toBe('all:ember');
  });

  it('没有赛季系统时只给一个按钮，且请求不带 season', () => {
    setLanguage('zh');
    const online = onlineHarness();
    const { panel, tab } = boot({ online, seasons: false });
    tab.render(panel);
    expect(scopesOf(panel)).toEqual(['跨季总榜']);
    expect(online.calls[0].seasonId).toBe('');
    expect(tab._board.key).toBe('all:');
  });
});

/* ------------------------------------------------------------------ *
 * ⑥ 发号腿
 * ------------------------------------------------------------------ */

describe('⑥ 发号腿：两个请求乱序回来只认最后一个', () => {
  it('先点总榜、再点本赛季 —— 先发的那个答案晚到也不许覆盖', async () => {
    setLanguage('zh');
    const online = onlineHarness();
    const { panel, tab } = boot({ online });
    tab.render(panel);                       // ① 本赛季
    const btns = panel.querySelector('.trial-board-head').children.filter((el) => el.tag === 'button');
    btns[1].click();                         // ② 总榜
    expect(online.calls.length).toBe(2);

    // 先回来的那一份（本赛季）作废
    online.pending[0].resolve({ items: [{ runner: '旧答案', score: 1, layersCleared: 1, secondsLeft: 1 }] });
    await flush();
    expect(rowsOf(panel)).toEqual([]);

    // 后回来的那一份（总榜）才是屏幕上的
    online.pending[1].resolve({ items: [{ runner: '新答案', score: 2, layersCleared: 2, secondsLeft: 2 }] });
    await flush();
    expect(rowsOf(panel)).toEqual(['#1 新答案 · 2 分 · 2 层 · 余 0:02']);
    expect(tab._scope).toBe('all');
  });
});

/* ------------------------------------------------------------------ *
 * ⑦ 切走腿
 * ------------------------------------------------------------------ */

describe('⑦ 切走腿：答案回来时那一格已经不在了', () => {
  it('面板被换成别的页签内容 → 不抛、不覆盖', async () => {
    setLanguage('zh');
    const online = onlineHarness();
    const { panel, tab } = boot({ online });
    tab.render(panel);
    // 玩家在等网络的时候切到了"图鉴"页：整块面板被换掉
    panel.innerHTML = '<div class="bestiary-card">别人的内容</div>';
    online.pending[0].resolve({ items: [{ runner: '阿岚', score: 700, layersCleared: 5, secondsLeft: 72 }] });
    await flush();
    expect(panel.innerHTML).toContain('别人的内容');
    expect(panel.innerHTML).not.toContain('阿岚');
    // 快照还是记下了（下次打开能看到吗？不会 —— 每次打开都重拉；这里只保证没写坏 DOM）
    expect(tab._board.state).toBe('ready');
  });

  it('render 之后面板被清空也不炸', async () => {
    setLanguage('zh');
    const online = onlineHarness();
    const { panel, tab } = boot({ online });
    tab.render(panel);
    panel.innerHTML = '';
    online.pending[0].reject(new Error('boom'));
    await flush();
    expect(panel.innerHTML).toBe('');
  });
});

/* ------------------------------------------------------------------ *
 * ⑧ 结构腿
 * ------------------------------------------------------------------ */

describe('⑧ 结构腿：异步只碰自己那一格', () => {
  it('榜块有独立钩子，异步回来不整页重渲染', () => {
    setLanguage('zh');
    const { panel, tab } = boot();
    tab.render(panel);
    expect(panel.querySelector('[data-trial-board]'), '模板里少了 data-trial-board 钩子').not.toBeNull();
    // 换个说法钉住实现：`_loadBoard` / `_paintBoard` 里不许出现 render(panelEl)
    const src = TrialJournalTab.prototype._paintBoard.toString() + TrialJournalTab.prototype._loadBoard.toString();
    expect(src).toContain('_paintBoard');
    expect(src, '异步路径里又调用了整页 render —— 会把玩家切走后的页签盖掉').not.toContain('this.render(');
  });
});
