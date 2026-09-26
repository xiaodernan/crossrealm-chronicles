/**
 * 日志抽屉的子页签要回得去清单（W-B2 切片5 的真浏览器读数抓到的洞）。
 *
 * 读数里的形状：出厂那一轮点第一格（位面秘典）成功，之后五格全部报"清单里没有这个页签"——
 * 一开始以为是自己写坏的脚本，直到看清 DOM：**点进子页签之后，整块 `#journal-panel` 被子面板换掉，
 * 页签条（`.journal-tabs`）连同"回清单"那一格一起消失了**。八个子页签里只有 CG 与营火记忆
 * 自己写了返回按钮，其余六格点进去就只能关抽屉；而关抽屉再开仍停在同一格（`journalTab` 记的就是它），
 * 于是键盘/手柄玩家**再也回不到清单** —— 鼠标另开一次也别无选择。
 *
 * 这一片要钉的是三件事：
 * 1. **每一格都回得去**：八格逐一走"点进去 → 找到返回按钮 → 点它 → 页签条又在了"。
 * 2. **回得去那一格走得到**：返回按钮必须在 `navItems` 清单里（↑↓ / 十字键能停上去），
 *    光有按钮、只有鼠标点得动，等于没修。
 * 3. **补按钮的是出口而不是各面板的自觉**：反向控制 —— 直接调子面板自己的 `render()`，
 *    六个面板里查无返回按钮。这条红了就说明"统一补"退回了"各写各的"。
 *
 * 桩用的是会解析 `innerHTML` 的那一份（`helpers/fakeMarkupDom.js`）：清单里的按钮必须是
 * 真被写进 `innerHTML` 的那一颗 —— 手工摆好的桩会把"忘了重挂监听"也一起替生产作弊掉。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { HUD } from '../src/ui/HUD.js';
import { navItems } from '../src/ui/FocusNav.js';
import { CgJournalTab } from '../src/ui/CgJournalTab.js';
import { AchievementsJournalTab } from '../src/ui/AchievementsJournalTab.js';
import { LoreCodexJournalTab } from '../src/ui/LoreCodexJournalTab.js';
import { CampfireMemoryJournalTab } from '../src/ui/CampfireMemoryJournalTab.js';
import { DungeonJournalTab } from '../src/ui/DungeonJournalTab.js';
import { WeaponSkillJournalTab } from '../src/ui/WeaponSkillJournalTab.js';
import { SideQuestJournalTab } from '../src/ui/SideQuestJournalTab.js';
import { PopCultureJournalTab } from '../src/ui/PopCultureJournalTab.js';
import { makeMarkupDom } from './helpers/fakeMarkupDom.js';

/** 八个走子面板渲染的页签（其余类别是清单模板，本身就在清单里） */
const SUB_TABS = ['cg', 'achievements', 'codex', 'memory', 'dungeons', 'skills', 'side', 'echoes'];
/** 自己没写返回按钮的那六格：修法生效与否正看在它们身上 */
const NO_OWN_BACK = ['achievements', 'codex', 'dungeons', 'skills', 'side', 'echoes'];

const stats = (n) => ({ unlocked: n, total: n + 4, percent: 40, nodeCount: 0, zones: 1, favorites: 0 });

function mount() {
  const doc = makeMarkupDom();
  globalThis.document = doc;
  const host = doc.createElement('div');
  host.id = 'journal-panel';
  doc.hosts['journal-panel'] = host;
  doc.activeElement = null;

  const game = {
    quests: { chapter: 1, current: null, getProgressText: () => '' },
    storyJournal: { entries: [], getCounts: () => ({}), getFiltered: () => [] },
    cgGallery: { getStats: () => stats(0), getEntries: () => [], getLockedPreview: () => [], favorites: new Set(), viewCounts: {}, recordView() {} },
    loreCodex: { getStats: () => stats(0), getEntries: () => [], unlocked: new Set() },
    popCulture: { getStats: () => stats(0), getEntries: () => [], unlocked: new Set() },
    campfireMemory: { getStats: () => ({ ...stats(0), total: 0 }), getMemories: () => [], restCount: {} },
    weaponSkills: { unlocked: new Set(), skillPoints: 0 },
    sideQuests: { completed: new Set(), getProgress: () => ({ done: 0, total: 3 }) },
    achievements: { unlocked: new Set(), stats: {} },
    dungeonRuns: { getStats: () => ({ totalClears: 0, dungeons: 0, runs: 0 }), runs: [], clears: {} },
    restPoints: { nameOf: (id) => id, ids: () => [] },
    dialogCg: { render: () => 'data:,' },
  };
  game.cgJournalTab = new CgJournalTab(game);
  game.achievementsJournalTab = new AchievementsJournalTab(game);
  game.loreCodexTab = new LoreCodexJournalTab(game);
  game.campfireMemoryTab = new CampfireMemoryJournalTab(game);
  game.dungeonJournalTab = new DungeonJournalTab(game);
  game.weaponSkillJournalTab = new WeaponSkillJournalTab(game);
  game.sideQuestJournalTab = new SideQuestJournalTab(game);
  game.popCultureTab = new PopCultureJournalTab(game);

  const hud = Object.create(HUD.prototype);
  hud.game = game;
  game.hud = hud;
  hud.journalPanel = host;
  hud.journalOpen = true;
  hud.journalTab = 'all';
  return { hud, host, doc };
}

/** 清单里的页签按钮（按 `data-tab` 认，与玩家看到的那一排同一份 DOM） */
const tabBtn = (host, key) => host.querySelector(`.journal-tab[data-tab="${key}"]`);
const backBtn = (host) => host.querySelector('.journal-back-btn');
/** 从清单出发点进某一格（不清内部状态：走不走得回去全靠玩家那一次点击） */
function enter(hud, host, key) {
  hud.renderJournal();
  const btn = tabBtn(host, key);
  expect(btn, `清单里没有 ${key} 这一格`).toBeTruthy();
  btn.click();
}

afterEach(() => { delete globalThis.document; });

describe('日志子页签：点进去要回得来', () => {
  it('清单本身：页签条在，返回按钮不该凭空多出来', () => {
    const { hud, host } = mount();
    hud.renderJournal();
    expect([...tabKeys(host)]).toEqual(expect.arrayContaining(SUB_TABS));
    expect(backBtn(host)).toBe(null);
  });

  it('八个子页签逐一走一遍：点进去 → 有返回按钮 → 点了真的回到清单', () => {
    const 回不去 = [];
    for (const key of SUB_TABS) {
      // 每格一份干净抽屉：一格卡住不该掩盖后面五格的读数（第一版就是 cg 之后整排崩）
      const { hud, host } = mount();
      hud.renderJournal();
      const btn = tabBtn(host, key);
      if (!btn) { 回不去.push(key + '(清单里没这一格)'); continue; }
      btn.click();
      const back = backBtn(host);
      if (!back) { 回不去.push(key + '(进去就没得回)'); continue; }
      back.click();
      /** 回到"清单"= 页签条又在了。营火记忆那一格的返回按钮回到 `campfire` 类别（清单带筛选），
       *  与 `all` 一样是清单 —— 判据只看玩家还能不能看见别的页签，不看内部记了哪个字。 */
      if (!host.querySelector('.journal-tabs') || !tabBtn(host, key)) 回不去.push(key + '(点了没回清单)');
    }
    expect(回不去, `这些页签点进去就回不到清单：${回不去.join('、')}`).toEqual([]);
  });

  it('返回按钮在走焦清单里：只有鼠标点得动等于没修', () => {
    const 走不进 = [];
    for (const key of SUB_TABS) {
      const { hud, host } = mount();
      enter(hud, host, key);
      const back = backBtn(host);
      if (!navItems(host).includes(back)) 走不进.push(key);
    }
    expect(走不进).toEqual([]);
  });

  it('子面板自己有返回按钮时不重复补一颗（CG 那一颗是它自己写的）', () => {
    const { hud, host } = mount();
    for (const key of ['cg', 'memory']) {
      enter(hud, host, key);
      expect(host.querySelectorAll('.journal-back-btn'), `${key} 补出了第二颗`).toHaveLength(1);
      backBtn(host).click();
    }
  });

  /** 反向控制：绕开渲染出口直接调子面板自己的 render —— 六格里查无返回按钮，
   *  于是"统一补"这一层被撤掉时，上面那几条一起红，而不是悄悄变成"各面板自己写写看" */
  it('反向控制：这六格自己不产出返回按钮，补齐的是渲染出口', () => {
    const { hud, host } = mount();
    const renderers = {
      achievements: () => hud.game.achievementsJournalTab,
      codex: () => hud.game.loreCodexTab,
      memory: () => hud.game.campfireMemoryTab,
      dungeons: () => hud.game.dungeonJournalTab,
      skills: () => hud.game.weaponSkillJournalTab,
      side: () => hud.game.sideQuestJournalTab,
      echoes: () => hud.game.popCultureTab,
      cg: () => hud.game.cgJournalTab,
    };
    const 自带 = [];
    for (const [key, get] of Object.entries(renderers)) {
      host.innerHTML = '';
      get().render(host);
      if (backBtn(host)) 自带.push(key);
    }
    expect(自带.sort()).toEqual(['cg', 'memory']);
    expect(NO_OWN_BACK.every((k) => !自带.includes(k))).toBe(true);
  });

  it('清单标题的键名跟着生效表（返回按钮不抄键名，所以它自己一个字都不写）', () => {
    const { hud, host } = mount();
    hud.journalTab = 'codex';
    hud.renderJournal();
    expect(host.querySelector('h2').textContent).toBe('位面秘典 · J 关闭');
    expect(backBtn(host).textContent).toBe('← 返回日志清单');
  });
});

function tabKeys(host) {
  return host.querySelectorAll('.journal-tab').map((b) => b.dataset.tab);
}

/**
 * 桩自检：这一片所有判据都建立在"选择器真的按形状筛"上。
 * 第一版桩把 `#id` 写成"有 id 就算"，于是 CG 那颗返回按钮的监听挂到了 `<h2>` 上，
 * "点了回不来"读起来像是生产漏了补 —— 桩少实现一层，判据就从行为退化成字符串。
 */
describe('假 DOM 自检：选择器按形状筛', () => {
  it('`#id` 认 id、`.类` 认类，查无此格给空', () => {
    const { hud, host } = mount();
    enter(hud, host, 'cg');
    expect(host.querySelector('#journal-back-all')).toBeTruthy();    // CG 自己那颗有 id
    expect(host.querySelector('#no-such-id')).toBe(null);
    expect(host.querySelector('.no-such-class')).toBe(null);
    expect(host.querySelectorAll('.journal-back-btn')).toHaveLength(1);
    expect(tabKeys(host)).toEqual([]);                               // 子面板里没有页签条 —— 洞就在这
    backBtn(host).click();
    enter(hud, host, 'codex');
    expect(backBtn(host).id).toBe('');                               // 出口补出来的那颗不带 id
  });

  it(':not(...) 真的筛掉禁用格（走焦清单不收它）', () => {
    const { hud, host } = mount();
    enter(hud, host, 'codex');
    const back = backBtn(host);
    expect(navItems(host).includes(back)).toBe(true);
    back.disabled = true;
    expect(navItems(host).includes(back)).toBe(false);
  });
});
