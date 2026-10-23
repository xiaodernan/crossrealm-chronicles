/**
 * 世界层 DOM 文案的换语言重算（W-D2 切片33）。
 *
 * ## 这一片解决什么
 *
 * 前 32 片收进双表的，全是**播出那一刻现取**的文案：`data-i18n` 走查、`keyText(t(键))`、
 * 对话树当场 `t()`。世界层有三处不是这个形状 —— 它们建在**世界构建期**（远早于玩家
 * 走进设置面板），把展开结果存进了自己的字段 / DOM：
 *
 * 1. `BossBeacons._addBeacon`：`<span>` 的 textContent 在 `build()` 那一刻写成 `t(name)`，
 *    那片 DOM 挂在场景里的 `CSS2DObject` 上；
 * 2. `RestPointManager.buildDefaults`：`point.name` 存的是**展开后的显示名**；
 * 3. `RestPointEnhancer._enhance`：`point.zoneLabel` 同理（`signLabelOf(id) ?? point.name`）。
 *
 * 换语言时 `applyTranslations` 的文档走查够不到 CSS2D 的容器，世界也不会重建 —— 于是
 * 这三处**静静留在旧语言**：中文玩家切英文，信标还写着"影界"、营火还叫"世界之锚休息点"、
 * 木牌还写"世界之锚"。没有一处会报错，也没有任何现成门禁会响。
 *
 * ## 机制
 *
 * 三处各加一个显式的重算入口（`refreshLabels` ×2 / `refreshNames`），由
 * `SettingsManager.applyToGame` 在换语言时按**先名后牌**的顺序叫一遍（木牌地名的回退
 * 分支读 `point.name`，顺序反了会把旧语言的回退值写进去）。键不是重新抄的：信标存的是
 * 它自己那枚键，营火按 `REST_POINT_NAMES[id]` 查同一张表 —— 于是"区名改口时营火跟着
 * 改"这条性质（W-B4 切片2）在换语言后依然成立。
 *
 * ## 用例分七层
 * ① 钉文案腿：本片经手的 9 个键的中英原值逐字钉死，并与派生表对得上；
 * ② 信标腿：`build()` 存下 5 枚键与元素，`refreshLabels()` 真的重写那片 DOM；
 * ③ 营火腿：8 座按同一张表重算，**表外 id 不动**（调用方递进来的定稿名）；
 * ④ 木牌腿：回退分支读的是重算后的 `point.name`；
 * ⑤ 集成腿：`applyToGame` 一路把三层全换成英文（这正是修掉的 bug），且中文下零变更；
 * ⑥ 静态腿：三个重算入口的调用点全仓只有 `SettingsManager.applyToGame` 一处，且顺序是先名后牌；
 * ⑦ 反面证据：尺子自己要被量过（键表过滤器的反向控制、中英原值确实不同）。
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeMarkupDom } from './helpers/fakeMarkupDom.js';
import { BossBeacons } from '../src/world/BossBeacons.js';
import { RestPointManager } from '../src/world/RestPointManager.js';
import { RestPointEnhancer } from '../src/world/RestPointEnhancer.js';
import { SettingsManager } from '../src/core/SettingsManager.js';
import { MAP_BOSSES } from '../src/game/QuestSystem.js';
import { REST_POINT_NAMES } from '../src/content/restPointNames.js';
import { ZONE_IDS } from '../src/content/ZoneIdentity.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';
import { setLanguage, t } from '../src/engine/i18n.js';

const ROOT = process.cwd();
const 读 = (p) => readFileSync(join(ROOT, p), 'utf8');
const 含汉 = /[\u4e00-\u9fff]/;

/** 本片经手的 9 个键：键 → [中文原值, 英文原值] */
const KEYS = {
  map_boss_label_shadow: ['影界', 'Shadowrealm'],
  map_boss_label_mage: ['奥术', 'Arcane'],
  map_boss_label_singularity: ['奇点', 'Singularity'],
  hud_map_anchor_timeline: ['时线', 'Timeline'],
  hud_map_anchor_chaos: ['混沌', 'Chaos'],
  rest_point_name_hub: ['世界之锚休息点', 'World Anchor Rest Point'],
  rest_point_campfire_name: ['${zone}营火', '${zone} Campfire'],
  wp_label_anchor: ['世界之锚', 'World Anchor'],
  zone_name_fantasy: ['灰白森林', 'Greywhite Forest'],
};

/** 五枚信标的中英文案（表序，MAP_BOSSES 的顺序） */
const 信标五枚 = ['影界', '奥术', '奇点', '时线', '混沌'];
const 信标五枚EN = ['Shadowrealm', 'Arcane', 'Singularity', 'Timeline', 'Chaos'];

const 假场景 = () => ({ add() {}, remove() {} });
const mkBeacons = () => {
  const bb = new BossBeacons(假场景(), { getGroundHeight: () => 0 });
  bb.build();
  return bb;
};
const mkRest = () => {
  const rp = new RestPointManager(假场景(), { getGroundHeight: () => 0 });
  rp.buildDefaults();
  return rp;
};
const mkEnhancer = (rp) => new RestPointEnhancer(rp, { restPoints: rp, dialog: { toast() {} } });
const 假设置 = (language) => {
  const mgr = new SettingsManager();
  mgr.data = { ...mgr.data, language };
  mgr.save = () => {};
  return mgr;
};

beforeAll(() => {
  globalThis.document = makeMarkupDom();
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
});

beforeEach(() => { setLanguage('zh'); });

afterAll(() => {
  setLanguage('zh');
  delete globalThis.document;
  delete globalThis.localStorage;
});

/* ------------------------------------------------------------------ *
 * ① 钉文案
 * ------------------------------------------------------------------ */

describe('① 钉文案：本片经手的 9 个键，中英原值逐字钉死', () => {
  it('九个键的中英原值逐字相同（表里被改动这里就红）', () => {
    expect(Object.keys(KEYS)).toHaveLength(9);
    for (const [key, [zh, en]] of Object.entries(KEYS)) {
      expect(STRINGS_ZH[key], `zh 表里 ${key} 的原值被改了`).toBe(zh);
      expect(STRINGS_EN[key], `en 表里 ${key} 的原值被改了`).toBe(en);
    }
  });

  it('信标那 5 枚键就是 MAP_BOSSES 表序上的那 5 枚（没有第二份名单）', () => {
    expect(MAP_BOSSES.map((b) => b.label)).toEqual([
      'map_boss_label_shadow',
      'map_boss_label_mage',
      'map_boss_label_singularity',
      'hud_map_anchor_timeline',
      'hud_map_anchor_chaos',
    ]);
  });

  it('营火那 8 个 id 全在 REST_POINT_NAMES 里，枢纽那一格与其余七格不同形', () => {
    expect(Object.keys(REST_POINT_NAMES)).toHaveLength(8);
    expect(REST_POINT_NAMES[ZONE_IDS.HUB]).toBe('rest_point_name_hub');
    for (const zone of [ZONE_IDS.FANTASY, ZONE_IDS.MAGIC, ZONE_IDS.SPACE, ZONE_IDS.VOID, ZONE_IDS.ABYSS, ZONE_IDS.GLOOM, ZONE_IDS.RADIANT]) {
      expect(REST_POINT_NAMES[zone], `${zone} 该走模板键`).toBe('rest_point_campfire_name');
    }
  });

  it('模板键的占位符就叫 zone（插值按名取，写错名字就是空串）', () => {
    for (const table of [STRINGS_ZH, STRINGS_EN]) {
      expect(table.rest_point_campfire_name).toContain('${zone}');
    }
  });
});

/* ------------------------------------------------------------------ *
 * ② BossBeacons
 * ------------------------------------------------------------------ */

describe('② BossBeacons：键跟着标签一起存，refreshLabels 重写那片 DOM', () => {
  it('build() 记下 5 枚信标的元素与键，中文下逐字对', () => {
    const bb = mkBeacons();
    expect(bb._labels).toHaveLength(5);
    expect(bb._labels.map((l) => l.key)).toEqual(MAP_BOSSES.map((b) => b.label));
    expect(bb._labels.every((l) => l.span), '有标签没存下 span —— 那一格换语言时改不到').toBe(true);
    expect(bb._labels.map((l) => l.span.textContent)).toEqual(信标五枚);
  });

  it('换语言本身不动那片 DOM（缺陷就在这儿：CSS2D 容器够不到 applyTranslations）', () => {
    const bb = mkBeacons();
    setLanguage('en');
    expect(bb._labels.map((l) => l.span.textContent), '没有显式重算，标签不该自己变').toEqual(信标五枚);
  });

  it('refreshLabels() 把五枚全换成当前语言，并返回重算数', () => {
    const bb = mkBeacons();
    setLanguage('en');
    expect(bb.refreshLabels()).toBe(5);
    expect(bb._labels.map((l) => l.span.textContent)).toEqual(信标五枚EN);
  });

  it('重算真的写进那片 DOM（先涂成哨兵再重算，哨兵必须被顶掉）', () => {
    const bb = mkBeacons();
    for (const l of bb._labels) l.span.textContent = '哨兵';
    expect(bb.refreshLabels()).toBe(5);
    expect(bb._labels.every((l) => l.span.textContent !== '哨兵')).toBe(true);
    expect(bb._labels[0].span.textContent).toBe('影界');
  });

  it('没有信标时返回 0，不抛（世界层可能一座 Boss 都没摆）', () => {
    const bb = new BossBeacons(假场景(), { getGroundHeight: () => 0 });
    expect(bb.refreshLabels()).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * ③ RestPointManager
 * ------------------------------------------------------------------ */

describe('③ RestPointManager：按同一张表重算，表外 id 不动', () => {
  it('buildDefaults() 八座，名字在中文下逐字对', () => {
    const rp = mkRest();
    expect(rp.points).toHaveLength(8);
    expect(rp.nameOf(ZONE_IDS.HUB)).toBe('世界之锚休息点');
    expect(rp.nameOf(ZONE_IDS.FANTASY)).toBe('灰白森林营火');
  });

  it('refreshNames() 只重算表里的 id，调用方递进来的定稿名不动', () => {
    const rp = mkRest();
    rp.addRestPoint(1, 2, '自定义营火', 'custom-1');
    expect(rp.points).toHaveLength(9);
    setLanguage('en');
    expect(rp.refreshNames(), '表里有 8 个 id，该重算 8 座').toBe(8);
    expect(rp.nameOf(ZONE_IDS.HUB)).toBe('World Anchor Rest Point');
    expect(rp.nameOf(ZONE_IDS.FANTASY)).toBe('Greywhite Forest Campfire');
    expect(rp.nameOf('custom-1'), '表外 id 的名字是调用方递进来的定稿，不是键').toBe('自定义营火');
  });

  it('模板键真的按区名展开：换语言后营火名跟着区名一起改口', () => {
    const rp = mkRest();
    expect(rp.nameOf(ZONE_IDS.MAGIC)).toBe(`${t('zone_name_magic')}营火`);
    setLanguage('en');
    rp.refreshNames();
    expect(rp.nameOf(ZONE_IDS.MAGIC)).toBe(`${t('zone_name_magic')} Campfire`);
  });

  it('一座营火都没有时返回 0，不抛', () => {
    const rp = new RestPointManager(假场景(), { getGroundHeight: () => 0 });
    expect(rp.refreshNames()).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * ④ RestPointEnhancer
 * ------------------------------------------------------------------ */

describe('④ RestPointEnhancer：回退分支读的是重算后的 point.name', () => {
  it('构造期 zoneLabel 取 signLabelOf：枢纽是「世界之锚」而不是区名', () => {
    const rp = mkRest();
    const enhancer = mkEnhancer(rp);
    const hub = rp.points.find((p) => p.id === ZONE_IDS.HUB);
    expect(hub.zoneLabel).toBe('世界之锚');
    expect(hub.zoneLabel).not.toBe(hub.name);
    expect(enhancer.refreshLabels()).toBe(8);
  });

  it('refreshLabels() 把木牌地名换成当前语言，返回座数', () => {
    const rp = mkRest();
    const enhancer = mkEnhancer(rp);
    setLanguage('en');
    expect(enhancer.refreshLabels()).toBe(8);
    expect(rp.points.find((p) => p.id === ZONE_IDS.HUB).zoneLabel).toBe('World Anchor');
    expect(rp.points.find((p) => p.id === ZONE_IDS.FANTASY).zoneLabel).toBe('Greywhite Forest');
  });

  it('表外 id 的回退分支读的是 point.name（那一格没有键，重算不动它）', () => {
    const rp = mkRest();
    rp.addRestPoint(1, 2, '自定义营火', 'custom-1');
    const enhancer = mkEnhancer(rp);
    const custom = rp.points.find((p) => p.id === 'custom-1');
    expect(custom.zoneLabel).toBe('自定义营火');
    setLanguage('en');
    rp.refreshNames();
    enhancer.refreshLabels();
    expect(custom.zoneLabel, '表外 id 没有键可重算，回退值还是调用方递来的名字').toBe('自定义营火');
  });
});

/* ------------------------------------------------------------------ *
 * ⑤ 集成腿
 * ------------------------------------------------------------------ */

describe('⑤ 集成腿：SettingsManager.applyToGame 一路把三层全换成英文', () => {
  const 装一层世界 = () => {
    const rp = mkRest();
    const enhancer = mkEnhancer(rp);
    const bb = mkBeacons();
    return {
      rp, enhancer, bb,
      game: {
        restPoints: rp,
        restPointEnhancer: enhancer,
        bossBeacons: bb,
        hud: { refreshKeyHints() {}, refreshBarColors() {} },
      },
    };
  };

  it('换语言时世界层三处一起改口（这正是修掉的 bug）', () => {
    const { game, rp, bb } = 装一层世界();
    假设置('en').applyToGame(game);
    expect(bb._labels.map((l) => l.span.textContent)).toEqual(信标五枚EN);
    expect(rp.nameOf(ZONE_IDS.HUB)).toBe('World Anchor Rest Point');
    expect(rp.points.find((p) => p.id === ZONE_IDS.HUB).zoneLabel).toBe('World Anchor');
    expect(rp.points.find((p) => p.id === ZONE_IDS.FANTASY).zoneLabel).toBe('Greywhite Forest');
  });

  it('三层都不留中文（换语言后世界里再没有一处旧语言的文案）', () => {
    const { game, rp, bb } = 装一层世界();
    假设置('en').applyToGame(game);
    for (const l of bb._labels) {
      expect(含汉.test(l.span.textContent), `信标标签还留着中文：${l.span.textContent}`).toBe(false);
    }
    for (const p of rp.points) {
      expect(含汉.test(p.name), `营火名还留着中文：${p.name}`).toBe(false);
      expect(含汉.test(p.zoneLabel), `木牌地名还留着中文：${p.zoneLabel}`).toBe(false);
    }
  });

  it('出厂语言下 applyToGame 一层都不动（机制片零视觉变更）', () => {
    const { game, rp, bb } = 装一层世界();
    假设置('zh').applyToGame(game);
    expect(bb._labels.map((l) => l.span.textContent)).toEqual(信标五枚);
    expect(rp.nameOf(ZONE_IDS.HUB)).toBe('世界之锚休息点');
    expect(rp.points.find((p) => p.id === ZONE_IDS.HUB).zoneLabel).toBe('世界之锚');
  });

  it('再切回中文也一路改回来（来回各一次，不是一次性的）', () => {
    const { game, rp, bb } = 装一层世界();
    假设置('en').applyToGame(game);
    假设置('zh').applyToGame(game);
    expect(bb._labels.map((l) => l.span.textContent)).toEqual(信标五枚);
    expect(rp.nameOf(ZONE_IDS.HUB)).toBe('世界之锚休息点');
    expect(rp.points.find((p) => p.id === ZONE_IDS.HUB).zoneLabel).toBe('世界之锚');
  });
});

/* ------------------------------------------------------------------ *
 * ⑥ 静态腿
 * ------------------------------------------------------------------ */

describe('⑥ 静态腿：三个重算入口的调用点全仓只有 applyToGame 一处', () => {
  it('SettingsManager.applyToGame 里三行调用都在场', () => {
    const src = 读('src/core/SettingsManager.js');
    const body = src.slice(src.indexOf('applyToGame(game)'));
    expect(body).toContain('game?.restPoints?.refreshNames?.()');
    expect(body).toContain('game?.restPointEnhancer?.refreshLabels?.()');
    expect(body).toContain('game?.bossBeacons?.refreshLabels?.()');
  });

  it('顺序是先名后牌再信标（木牌回退分支读 point.name，反了会写进旧语言）', () => {
    const src = 读('src/core/SettingsManager.js');
    const iName = src.indexOf('restPoints?.refreshNames');
    const iSign = src.indexOf('restPointEnhancer?.refreshLabels');
    const iBeacon = src.indexOf('bossBeacons?.refreshLabels');
    expect(iName, 'applyToGame 里没有 refreshNames 调用').toBeGreaterThan(-1);
    expect(iName).toBeLessThan(iSign);
    expect(iSign).toBeLessThan(iBeacon);
  });

  it('三个世界层重算入口的调用点全仓只有 SettingsManager 一处（不许多条路）', () => {
    const files = [];
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.js')) files.push(p.replace(/\\/g, '/').replace(`${ROOT}/`, ''));
      }
    };
    walk(join(ROOT, 'src'));
    expect(files.length, 'src 文件一个都没扫到，扫描坏了').toBeGreaterThan(50);
    // 形状限定到"挂在 game 上的那三个子系统"：`HUD.refreshLabels()` 是同名的另一回事
    // （HUD 那一个是切片27 的 keyHint 重算，与本题无关，不能一锅端）
    const 形 = /(?:restPoints|restPointEnhancer|bossBeacons)\??\.(?:refreshNames|refreshLabels)\??\.\(/;
    const 调用点 = [];
    for (const f of files) {
      // 去注释再数（承 W-D2 切片30 的扫描口径）：注释里提一句方法名不算调用点
      const src = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/\/\/[^\n]*/g, '');
      for (const line of src.split('\n')) {
        if (形.test(line)) 调用点.push(`${f}: ${line.trim()}`);
      }
    }
    expect(调用点, '世界层重算的调用点不是恰好三处 —— 换语言有多条路可走').toHaveLength(3);
    for (const c of 调用点) expect(c).toContain('src/core/SettingsManager.js');
  });
});

/* ------------------------------------------------------------------ *
 * ⑦ 反面证据
 * ------------------------------------------------------------------ */

describe('⑦ 反面证据：尺子自己要被量过', () => {
  it('键表过滤器认得出没登记的键（① 那条不是永真）', () => {
    expect(Object.keys(KEYS).filter((k) => !(k in STRINGS_ZH))).toEqual([]);
    expect(Object.keys(KEYS).filter((k) => !(k in STRINGS_EN))).toEqual([]);
    expect(['wp_label_anchor', 'no_such_key_xyz'].filter((k) => !(k in STRINGS_EN)))
      .toEqual(['no_such_key_xyz']);
  });

  it('九个键的中英原值两两不同（否则"切成英文"那条断言是永真的）', () => {
    for (const [key, [zh, en]] of Object.entries(KEYS)) {
      expect(zh, `${key} 的中英原值一样`).not.toBe(en);
    }
  });

  it('信标五枚的中英文案两两不同（②⑤ 两条不是永真）', () => {
    expect(信标五枚).toHaveLength(5);
    expect(信标五枚EN).toHaveLength(5);
    for (let i = 0; i < 信标五枚.length; i += 1) {
      expect(信标五枚[i]).not.toBe(信标五枚EN[i]);
    }
  });
});
