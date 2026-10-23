/**
 * 世界氛围事件的行为门禁 —— W-B9 余项（2026-10-12）。
 *
 * ## 为什么要有这一条
 *
 * `game/WorldAmbientEvents.js` 是 **247 个源码模块里 23 个"测试从没点过名"的模块之一**，
 * 而它里面藏着一条"不报错的说错话"：改前 `update()` 写的是
 * `ZONE_EVENTS[this.zone] ?? ZONE_EVENTS.hub` —— 一个区在表里没有条目时**静默借枢纽的台词**。
 * W-B9 把区域从 5 座扩到 7 座（幽暗林地 / 辉煌圣域），三张氛围表一张都没跟着加：
 * 实测两区的条数是 **0**，玩家在幽暗林地会看到"世界之锚发出低沉嗡鸣 — 位面仍相连。"。
 *
 * 这一族（B45 / B36 / B83）的共同形状是：**加了一个新东西，没有一处会因此变红**。
 * 所以这条门禁的重点不是"台词写得好不好"，而是**逐个区域点名**：
 * 每加一座区，这里就多一行 —— 忘了加台词，当场红。
 *
 * 五层：
 * ① 分母守卫（表非空）+ 逐个真实区域点名（`ZONE_ORDER` + hub 每座都要有自己的条目）；
 * ② **没有第三种状态**：每个 `ZONE_IDS` 的值要么有自己的台词、要么在 `NO_AMBIENT_ZONES`
 *    里显式登记（走廊 / 未知）—— "悄悄缺一格"与"显式不要"必须分得开；
 * ③ 跨区回退已被删掉（查不到的键返回空池）；
 * ④ 每一条的字段形状（非空 text / 有限正 weight / minChapter 若在则是正整数）；
 * ⑤ **行为见证**：真造一个 `WorldAmbientEvents` 推到弹台词那一刻 —— 在 gloom 里弹出的
 *    必须是 gloom 自己的话（逐条对照 hub 的台词，一条都不许重合），在走廊里一条都不弹。
 *    静态那半只能回答"表里有"，回答不了"运行时真的读的是这张表"。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ZONE_IDS, ZONE_ORDER, ZONE_NAMES } from '../src/content/ZoneIdentity.js';
import { t } from '../src/engine/i18n.js';
import { keyText } from '../src/content/keyHints.js';
import {
  AMBIENT_ZONE_EVENTS,
  NO_AMBIENT_ZONES,
  ambientPoolFor,
  WorldAmbientEvents,
} from '../src/game/WorldAmbientEvents.js';

/** 真实区域 = 七座战斗区 + 枢纽（走廊与未知不是"一处地方"，见 NO_AMBIENT_ZONES 的注释） */
const 真实区域 = [ZONE_IDS.HUB, ...ZONE_ORDER];

const 全部条目 = Object.values(AMBIENT_ZONE_EVENTS).flat();

afterEach(() => { vi.restoreAllMocks(); });

describe('世界氛围事件（W-B9 余项：每个真实区域都有自己的台词）', () => {
  it('分母守卫：表非空，且**逐个真实区域**都有自己的条目', () => {
    expect(全部条目.length, '氛围表整个空了 —— 下面每条都会变成空转').toBeGreaterThan(20);
    const 缺 = 真实区域.filter((id) => ambientPoolFor(id, 1).length === 0);
    expect(
      缺.map((id) => `${id}(${ZONE_NAMES[id] ?? '?'})`).join(' / '),
      '这些真实区域在氛围表里一条台词都没有 —— 改前它们会静默借枢纽的台词（正是本片修的那件事）'
    ).toBe('');
  });

  it('没有第三种状态：每个 ZONE_IDS 要么有自己的台词、要么在 NO_AMBIENT_ZONES 里显式登记', () => {
    const 名单外 = Object.values(ZONE_IDS).filter(
      (id) => !AMBIENT_ZONE_EVENTS[id] && !NO_AMBIENT_ZONES.includes(id)
    );
    expect(
      名单外.join(' / '),
      '这些 id 既没有氛围台词、又没在 NO_AMBIENT_ZONES 里写明"故意不要" —— '
      + '"悄悄缺一格"与"显式不要"必须分得开'
    ).toBe('');
    // 反向：NO_AMBIENT_ZONES 里不许混进真实区域（否则等于用名单把缺口盖住）
    for (const id of NO_AMBIENT_ZONES) {
      expect(真实区域, `NO_AMBIENT_ZONES 里混进了真实区域 "${id}"`).not.toContain(id);
      expect(Object.values(ZONE_IDS), `NO_AMBIENT_ZONES 里的 "${id}" 不是 ZONE_IDS 的值`).toContain(id);
    }
  });

  it('跨区回退已被删掉：查不到的键返回空池，不借别处的台词', () => {
    expect(ambientPoolFor('no-such-zone', 1), '认不出的区借到了台词 —— 回退又回来了').toEqual([]);
    expect(ambientPoolFor(undefined, 1)).toEqual([]);
    // 走廊与未知是**故意**空池的两个区（不是漏了）
    for (const id of NO_AMBIENT_ZONES) {
      expect(ambientPoolFor(id, 1), `${id} 应当没有氛围台词（见 NO_AMBIENT_ZONES 的理由）`).toEqual([]);
    }
  });

  it('每一条的字段形状：非空 text / 有限正 weight / minChapter 若在则是正整数', () => {
    for (const [zone, list] of Object.entries(AMBIENT_ZONE_EVENTS)) {
      expect(Array.isArray(list), `${zone} 的条目不是数组`).toBe(true);
      for (const [i, e] of list.entries()) {
        expect(typeof e?.text === 'string' && e.text.trim().length > 0, `${zone}[${i}] 的 text 是空的`).toBe(true);
        expect(Number.isFinite(e?.weight) && e.weight > 0, `${zone}[${i}] 的 weight 不是有限正数`).toBe(true);
        if ('minChapter' in e) {
          expect(Number.isInteger(e.minChapter) && e.minChapter > 0, `${zone}[${i}] 的 minChapter 不是正整数`).toBe(true);
        }
      }
    }
  });

  it('章节过滤是真的在滤（拿表里唯一那条 minChapter 当靶子，不另造样本）', () => {
    // 表里只有一条带 minChapter（`fantasy` 的影界守护者信标，minChapter: 2）——
    // 它必须第 1 章不在池里、第 2 章在池里。没有这一条，"过滤"与"不过滤"读数上一模一样。
    const 带门槛 = 全部条目.filter((e) => e.minChapter);
    expect(带门槛.length, '表里一条带 minChapter 的都没有 —— 这条用例成了空转').toBeGreaterThan(0);
    const 第1章 = ambientPoolFor(ZONE_IDS.FANTASY, 1);
    const 第2章 = ambientPoolFor(ZONE_IDS.FANTASY, 2);
    for (const e of 带门槛.filter((x) => x.minChapter > 1)) {
      expect(第1章.includes(e), `第 1 章不该出现 minChapter=${e.minChapter} 的那条`).toBe(false);
      expect(第2章.includes(e), `第 ${e.minChapter} 章该出现的那条没出现`).toBe(true);
    }
    // 池子只会越往后越大（追加，不是替换）
    expect(第2章.length).toBeGreaterThanOrEqual(第1章.length);
  });

  it('行为见证：gloom 里弹出来的是 gloom 自己的话，走廊里一条都不弹', () => {
    const 造游戏 = (zone) => {
      const toasts = [];
      const journal = [];
      return {
        toasts, journal,
        game: {
          dialog: { open: false, toast: (t) => toasts.push(t) },
          combatCamera: { blocksInput: () => false },
          dungeons: { active: false },
          quests: { chapter: 5 },
          storyJournal: { add: (e) => journal.push(e) },
          audio: { loreDiscover() {} },
          zone,
        },
      };
    };

    // 把随机数钉住，让"弹哪一条"是确定的；池子本身仍是真的
    for (const zone of 真实区域) {
      const { game, toasts } = 造游戏(zone);
      const amb = new WorldAmbientEvents(game);
      amb.setZone(zone);
      amb.timer = 0;
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      amb.update(1 / 60, { x: 0, z: 0 });
      expect(toasts.length, `${zone} 推了一帧却没弹出任何氛围台词`).toBe(1);
      // `e.text` 现在是**文案键**（W-D2 切片16a），弹出来的是展开后的那句 ——
      // 比的是展开后的同一份，不是键（键是内部地址，玩家看不见）。
      const 本区 = ambientPoolFor(zone, 5).map((e) => keyText(t(e.text)));
      expect(本区, `${zone} 弹出的"${toasts[0]}"不在本区的池子里`).toContain(toasts[0]);
    }

    // 反向：走廊里不该弹 —— 而且**尤其**不该弹出枢纽那两句（改前正是这样）
    const 枢纽台词 = ambientPoolFor(ZONE_IDS.HUB, 5).map((e) => keyText(t(e.text)));
    const { game: 走廊游戏, toasts: 走廊吐司 } = 造游戏(ZONE_IDS.CORRIDOR);
    const 走廊氛围 = new WorldAmbientEvents(走廊游戏);
    走廊氛围.setZone(ZONE_IDS.CORRIDOR);
    走廊氛围.timer = 0;
    走廊氛围.update(1 / 60, { x: 0, z: 0 });
    expect(走廊吐司, '走廊里弹出了氛围台词').toEqual([]);
    for (const t of 走廊吐司) expect(枢纽台词, `走廊弹出了枢纽的台词"${t}"`).not.toContain(t);
  });

  it('每一条 `text` 都是**已登记的文案键**（W-D2 切片16a：数据层只存键）', () => {
    // 反向控制：一个没登记的键必须回 `[MISSING: …]`（证明解析路径是活的）
    expect(t('ambient_hub_0')).not.toContain('[MISSING');
    const 坏 = [];
    for (const [zone, list] of Object.entries(AMBIENT_ZONE_EVENTS)) {
      for (const [i, e] of list.entries()) {
        const 展开 = t(e.text);
        if (展开.startsWith('[MISSING:')) 坏.push(`${zone}[${i}] ${e.text}`);
      }
    }
    expect(坏.join(' / '), '这些氛围台词的键没有登记在双表里 —— 玩家会看到 [MISSING: …]').toBe('');
  });

  it('`seen` 去重账用键而不是文案：换语言不会让同一句重新弹一遍', () => {
    const 造游戏 = () => ({
      toasts: [], journal: [],
      game: {
        dialog: { open: false, toast: (t) => {} },
        combatCamera: { blocksInput: () => false },
        dungeons: { active: false },
        quests: { chapter: 5 },
        storyJournal: { add: (e) => {} },
        audio: { loreDiscover() {} },
        zone: ZONE_IDS.HUB,
      },
    });
    const { game } = 造游戏();
    const amb = new WorldAmbientEvents(game);
    amb.setZone(ZONE_IDS.HUB);
    amb.timer = 0;
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    amb.update(1 / 60, { x: 0, z: 0 });
    // seen 里的每一格都带**键**，不带展开后的文案
    for (const s of amb.seen) {
      expect(s, `seen 的一格"${s}"不是键的形状（应当含 ambient_ 前缀）`).toContain('ambient_');
    }
  });
  it('氛围条目进日志时，标题展开成「旅途见闻」（私有化标题键的行为腿）', () => {
    // AMBIENT_JOURNAL_TITLE 于 2026-10-23 过导出决断收成模块内私有（外部零 import）。
    // 私有化不许把行为带走：日志那一条的标题必须真的是展开后的那句话，
    // 而不是键本身、更不是某个裸常量 —— 这条腿盯着的就是这个。
    const journal = [];
    const game = {
      dialog: { open: false, toast: () => {} },
      combatCamera: { blocksInput: () => false },
      dungeons: { active: false },
      quests: { chapter: 5 },
      storyJournal: { add: (e) => journal.push(e) },
      audio: { loreDiscover() {} },
      zone: ZONE_IDS.HUB,
    };
    const amb = new WorldAmbientEvents(game);
    amb.setZone(ZONE_IDS.HUB);
    amb.timer = 0;
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    amb.update(1 / 60, { x: 0, z: 0 });
    expect(journal.length, '弹了氛围台词却没有写进日志').toBe(1);
    expect(journal[0].title, '标题还是没展开的键').toBe(keyText(t('ambient_journal_title')));
    expect(journal[0].title, '标题不是文案表里那句话').toBe('旅途见闻');
    expect(journal[0].title).not.toContain('ambient_journal_title');
  });});
