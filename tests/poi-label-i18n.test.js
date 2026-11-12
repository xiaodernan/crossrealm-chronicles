/**
 * POI 交互标签双表化（W-D2 切片19）。
 *
 * ## 为什么要有这道门禁
 *
 * POI 的 label 只有一个显示出口：`PlayerController.updatePrompt` 的交互提示
 * （`${interact} ${label}`）。切片19 把那个出口改成了 `t(label)` —— 切语言时提示
 * 跟着翻，代价是**全世界每一个 POI 的 label 必须同时是键**：漏一个，玩家眼前就是
 * 一行 `[E] [MISSING: 调查至尊石环]`，而运行期不报错、只是永远翻不过去。
 *
 * 所以这里跑**真世界**（`WorldManager.build()` + 四层致敬增强器，与
 * `poi-identity.test.js` 同一套夹具），对最终 `pointsOfInterest` 全表断言：
 *
 * 1. **结构腿**：每个 label 都是中英两表里的键；钉死的表覆盖真世界每一个 POI
 *    （多一个少一个都算漂移 —— 分母自证，防"清单永远全过"）。
 * 2. **钉文案腿**：64 处的双语文案逐字钉死。改文案必须来改这里，不允许静默漂移。
 * 3. **接线腿**：显示出口那一行真的把 label 交给了 `t()`（源码钉死 + 拼串模拟）。
 * 4. **静态腿**：11 个 POI 来源文件的 label 位上不许再有中文字面量
 *    （`'中文', () => {` 与 `label: '中文'` 两个形状各扫一遍）。
 * 5. **键数腿**：本片新建的 19 个键，同一文案在两表里最多各两个键
 *    （`tests/i18n.test.js` 那条全局规矩的本地复查）。
 *
 * 命名口径（ADR 见 `docs/MASTER_PLAN.md` §9）：致敬层 POI 复用回声条目的标题键
 * ——交互即解锁那条回声，本来就是同一个东西；区文件 POI 的提示语是指令式文案
 * （调查/进入/阅读…），与路点标签不是一句口吻，单独建 `zone_poi_*` 族。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorldManager } from '../src/world/WorldManager.js';
import { attachPopCultureZones } from '../src/world/PopCultureZoneEnhancer.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';
import { t, setLanguage } from '../src/engine/i18n.js';

const makeScene = () => ({ add() {}, remove() {} });
const makeDialog = () => ({ show() {}, toast() {} });

/** 写出全部 POI 的来源文件（含不走 addPOI 的两处对象字面量） */
const POI_SOURCE_FILES = [
  'src/world/WorldManager.js',
  'src/world/PopCultureZoneEnhancer.js',
  'src/world/PopCultureZoneEnhancerWave2.js',
  'src/world/PopCultureZoneEnhancerWave3.js',
  'src/world/PopCultureZoneEnhancerWave4.js',
  'src/world/PopCultureZoneEnhancerWave11.js',
  'src/world/PopCultureZoneEnhancerWave12.js',
  'src/world/PopCultureZoneEnhancerWave13.js',
  'src/world/zones/FantasyZone.js',
  'src/world/zones/MagicZone.js',
  'src/world/zones/SpaceZone.js',
  'src/world/zones/VoidZone.js',
  'src/world/zones/AbyssZone.js',
  'src/world/zones/GloomZone.js',
  'src/world/zones/RadiantZone.js',
];

/** 形状一：`registerPoi` / `addPOI` 的 label 参数（后面紧跟 `, () => {`） */
const 标签参数位 = /'([^']*)'\s*,\s*\(\)\s*=>/g;
/** 形状二：对象字面量里的 `label: '…'`（枢纽锚点与海报墙不走 addPOI） */
const 标签字段位 = /label:\s*'([^']*)'/g;
const 是中文 = (s) => /[\u4e00-\u9fff]/.test(s);

/** 扫一份源码里的 label 位：返回还挂着中文字面量的那些原文 */
function 扫标签位(src) {
  const 违例 = [];
  for (const m of src.matchAll(标签参数位)) if (是中文(m[1])) 违例.push(m[1]);
  for (const m of src.matchAll(标签字段位)) if (是中文(m[1])) 违例.push(m[1]);
  return 违例;
}

/**
 * 钉死表：POI id → [label 键, 中文文案, 英文文案]。
 * 78 行与真世界逐 id 对齐（结构腿互证），改任何一处文案都必须来改这里。
 */
const POI_LABELS = {
'hub-anchor': ['hub_poi_anchor_label', '触摸世界之锚', 'Touch the World Anchor'],
  // W-E3 切片46：终局抉择的两处收尾落点
  'final-keep': ['zone_poi_final_keep_label', '锚点东侧的石阶', 'Steps East of the Anchor'],
  'final-quiet': ['zone_poi_final_quiet_label', '锚座下的熄火环', 'Snuffer Ring Beneath the Anchor'],
  'fantasy-ring': ['zone_poi_fantasy_ring_label', '调查至尊石环', 'Investigate the One Ring'],
  'fantasy-ruins': ['zone_poi_fantasy_ruins_label', '探索精灵遗迹', 'Explore the Elf Ruins'],
  'first-arrow': ['zone_poi_first_arrow_label', '石缝里的断箭', 'The Arrow in the Seam'],
  'first-camp': ['zone_poi_first_camp_label', '没熄的营地', 'The Camp That Never Went Out'],
  'fantasy-tower': ['zone_poi_fantasy_tower_label', '攀登守望塔', 'Climb the Watchtower'],
  'fantasy-boss-gate': ['zone_poi_fantasy_boss_gate_label', '进入 Boss 竞技场', 'Enter the Boss Arena'],
  'second-ember': ['zone_poi_second_ember_label', '守夜人的火盆', "The Warden's Brazier"],
  'magic-castle': ['zone_poi_magic_castle_label', '进入悬浮城堡', 'Enter the Floating Castle'],
  'ascend-founder-belfry': ['zone_poi_ascend_founder_belfry_label', '创始人的钟楼', 'The Founder Belfry'],
  'magic-forest': ['zone_poi_magic_forest_label', '禁林深处的低语', 'Whispers from the Forbidden Forest Depths'],
  'second-stone': ['zone_poi_second_stone_label', '禁林的界碑', 'The Forest Boundary Stone'],
  'echo-pages': ['zone_poi_echo_pages_label', '余烬书页', 'Ember Page'],
  'magic-boss-gate': ['zone_poi_magic_boss_gate_label', '进入奥术竞技场', 'Enter the Arcane Arena'],
  'space-tesseract': ['zone_poi_space_tesseract_label', '触碰五维_tesseract', 'Touch the Five-Dimensional Tesseract'],
  'space-lens': ['zone_poi_space_lens_label', '观测引力透镜', 'Observe the Gravitational Lens'],
  'ascend-calibration-ring': ['zone_poi_ascend_calibration_ring_label', '校准环', 'Alignment Ring'],
  'space-wreck': ['zone_poi_space_wreck_label', '搜索 Endurance 号残骸', 'Search the Endurance Wreck'],
  'void-rift': ['zone_poi_void_rift_label', '调查时线裂隙', 'Investigate the Timeline Rift'],
  'void-tablet': ['zone_poi_void_tablet_label', '阅读五维碑文', 'Read the Five-Dimensional Stele'],
  'seal-stone': ['zone_poi_seal_stone_label', '封印石座', 'Stone Seat of Sealing'],
  'void-oath-stele': ['zone_poi_void_oath_stele_label', '断誓碑', 'Broken Oath Stele'],
  'abyss-boss-gate': ['zone_poi_abyss_boss_gate_label', '混沌裂隙竞技场', 'Chaos Rift Arena'],
  'chaos-core': ['zone_poi_chaos_core_label', '触碰混沌之核', 'Touch the Core of Chaos'],
  'gloom-deep-entrance': ['zone_poi_gloom_deep_entrance_label', '幽暗林地深处', 'Depths of the Gloomy Forest'],
  'gloom-moss': ['zone_poi_gloom_moss_label', '荧光苔藓群落', 'Fluorescent Moss Colony'],
  'radiant-main-gate': ['zone_poi_radiant_main_gate_label', '辉煌圣域大门', 'Gate of the Radiant Sanctuary'],
  'radiant-altar': ['wp_label_radiant_altar', '晨曦祭坛', 'Dawn Altar'],
  'homage-broom-ring': ['echo_broom_ring_title', '飞天环赛看台', 'Broom Racing Stands'],
  'homage-potion-lab': ['echo_potion_lab_title', '魔药温室', 'Potion Greenhouse'],
  'homage-sorting-hall': ['echo_sorting_hall_title', '分院残厅', 'Ruined Great Hall'],
  'homage-murphy-shelf': ['echo_murphy_title', '墨菲书架', 'Murphy\'s Bookshelf'],
  'homage-miller-hourglass': ['echo_miller_title', '米勒沙漏', 'Miller\'s Hourglass'],
  'homage-docking-spin': ['echo_docking_title', '对接舱旋转', 'Docking Bay Spin'],
  'homage-radio-tower': ['echo_radio_tower_title', '旧镇广播塔', 'Old Town Broadcast Tower'],
  'homage-upside-rift': ['echo_upside_rift_title', '逆相裂口', 'Upside-Down Rift'],
  'homage-neon-mall': ['echo_neon_mall_title', '霓虹商场残影', 'Neon Mall Afterimage'],
  'homage-rift-hound': ['echo_rift_hound_title', '裂隙猎犬足迹', 'Rift Hound Tracks'],
  'fantasy-ring-echo': ['pop_poi_fantasy_ring_echo_label', '至尊石环（回声）', 'One Ring (Echo)'],
  'hub-poster-wall': ['echo_poster_wall_title', '位面海报墙', 'Plane Poster Wall'],
  'homage-nine-platform': ['echo_nine_platform_title', '九分又四分三站台', 'Platform Nine and Three-Quarters'],
  'homage-patronus-lake': ['echo_patronus_lake_title', '护念湖镜', 'Patronus Lake'],
  'homage-triwizard-cup': ['echo_triwizard_title', '三强赛台', 'Triwizard Stands'],
  'homage-brand-beacon': ['echo_brand_beacon_title', '曼恩假信标', 'Mann Beacon'],
  'homage-wormhole-arch': ['echo_wormhole_title', '虫洞拱门', 'Wormhole Arch'],
  'homage-love-signal': ['echo_love_signal_title', '爱即坐标', 'Love Is a Coordinate'],
  'homage-bike-trail': ['echo_bike_trail_title', '夜游单车灯串', 'Night Bicycle Light String'],
  'homage-arcade': ['echo_arcade_title', '街机厅残影', 'Arcade Afterimage'],
  'homage-vecna-clock': ['echo_vecna_clock_title', '裂相钟塔', 'Clock Tower of the Rift'],
  'homage-underground-lab': ['echo_underground_lab_title', '地下实验室残骸', 'Underground Lab Wreck'],
  'homage-saloon-mirror': ['echo_saloon_mirror_title', '沙龙镜墙', 'Saloon Mirror Wall'],
  'homage-duel-noon': ['echo_duel_noon_title', '正午决斗圈', 'Noon Duel Circle'],
  'homage-ghost-rails': ['echo_ghost_rails_title', '幽灵铁道', 'Ghost Railway'],
  'homage-speakeasy': ['echo_speakeasy_title', '禁酒窖门', 'Speakeasy Door'],
  'homage-family-shrine': ['echo_family_shrine_title', '家族圣龛', 'Family Shrine'],
  'homage-dock-crates': ['echo_dock_crates_title', '码头货仓', 'Dock Warehouse'],
  'homage-colony-dome': ['echo_colony_dome_title', '殖民穹顶', 'Colony Dome'],
  'homage-ai-core': ['echo_ai_core_title', '休眠 AI 核心', 'Dormant AI Core'],
  'homage-jump-gate': ['echo_jump_gate_title', '跃迁门阵列', 'Jump Gate Array'],
  'homage-neon-alley': ['echo_neon_alley_title', '霓虹后巷', 'Neon Back Alley'],
  'homage-chrome-clinic': ['echo_chrome_clinic_title', '铬合金诊所', 'Chrome Clinic'],
  'homage-corp-spire': ['echo_corp_spire_title', '巨企尖塔投影', 'Corporate Spire Projection'],
  'homage-torii-gate': ['echo_torii_gate_title', '鸟居残门', 'Broken Torii Gate'],
  'homage-dojo-ruins': ['echo_dojo_ruins_title', '道场废墟', 'Dojo Ruins'],
  'homage-sakura-blade': ['echo_sakura_blade_title', '樱落刃冢', 'Blade Mound under Falling Sakura'],
  'homage-tentacle-obelisk': ['echo_tentacle_obelisk_title', '触须方尖碑', 'Tentacle Obelisk'],
  'homage-mad-scribe': ['echo_mad_scribe_title', '疯癫抄写室', 'Mad Scriptorium'],
  'homage-spiral-well': ['echo_spiral_well_title', '螺旋深井', 'Spiral Well'],
  'homage-star-cantina': ['echo_star_cantina_title', '星港酒肆', 'Starport Cantina'],
  'homage-smuggler-dock': ['echo_smuggler_dock_title', '走私码头', 'Smuggler Dock'],
  'homage-holo-chart': ['echo_holo_chart_title', '全息星图室', 'Holographic Star Chart Room'],
  // W-E3 切片99：幽暗林地 · 薄暮石陪席 + 辉煌圣域 · 圣曜武士之门
  'homage-gloom-stones': ['echo_gloom_stones_title', '薄暮石陪座席', 'The Gloomstones'],
  'homage-radiant-torii': ['echo_radiant_torii_title', '圣曜武士之门', 'Gate of the Radiant Samurai'],
  // W-E3 切片102：虚空断口 · 断口星盘 + 深渊之颚 · 深颚盐碑
  'homage-void-astrolabe': ['echo_void_astrolabe_title', '断口星盘', 'The Rift Astrolabe'],
  'homage-abyss-stele': ['echo_abyss_stele_title', '深颚盐碑', 'The Salt Steles'],
  // W-E3 切片103：空口巡礼 · 日晷/珍珠 + 深颚巡礼 · 海螺/骨门
  'homage-void-sundial': ['echo_void_sundial_title', '断口日晷', 'The Rift Sundial'],
  'homage-void-pearl': ['echo_void_pearl_title', '断口珍珠', 'The Rift Pearl'],
  'homage-abyss-conch': ['echo_abyss_conch_title', '深颚海螺', 'The Deep Conch'],
  'homage-abyss-bonegate': ['echo_abyss_bonegate_title', '深颚骨门', 'The Bone Gate'],
  // W-E3 切片104：薄暮巡礼 · 灯笼行/许愿树 + 辉煌巡礼 · 残旗/悬铃
  'homage-gloom-lanterns': ['echo_gloom_lanterns_title', '幽暗灯笼行', 'The Lanterns Parade'],
  'homage-gloom-wishing-tree': ['echo_gloom_wishing_tree_title', '幽暗许愿树', 'The Wishing Tree'],
  'homage-radiant-banner': ['echo_radiant_banner_title', '辉煌残旗', 'The Faded Banners'],
  'homage-radiant-orb': ['echo_radiant_orb_title', '辉煌悬铃', 'The Hanging Bell'],
  'homage-homecoming-cairn': ['echo_homecoming_cairn_title', '归烬之碑', 'Cairn of Embers'],
  'homage-homecoming-bell': ['echo_homecoming_bell_title', '晨曦回铃', 'The Dawn Bell'],
  'homage-homecoming-beacon': ['echo_homecoming_beacon_title', '第二信标', 'The Second Beacon'],
  'homage-homecoming-tide': ['echo_homecoming_tide_title', '盐海归潮', 'The Homecoming Tide'],
  'homage-homecoming-lantern': ['echo_homecoming_lantern_title', '旅人之灯', 'The Traveler Lantern'],
  'homage-homecoming-sky-lantern': ['echo_homecoming_sky_lantern_title', '星灯祭·升空', 'Lantern Festival · Ascension'],
  'homage-homecoming-river-lamp': ['echo_homecoming_river_lamp_title', '星灯祭·水灯', 'Lantern Festival · River Lamps'],
  'homage-homecoming-paper-crane': ['echo_homecoming_paper_crane_title', '星灯祭·千羽', 'Lantern Festival · Thousand Cranes'],
  'homage-homecoming-first-snow': ['echo_homecoming_first_snow_title', '星灯祭·初雪', 'Lantern Festival · First Snow'],
  'homage-middle-earth-broken-sword': ['echo_broken_sword_title', '中洲回响·亡者之剑', 'Middle-earth Echo · The Broken Sword'],
  'homage-middle-earth-elven-harp': ['echo_elven_harp_title', '中洲回响·幽谷竖琴', 'Middle-earth Echo · The Elven Harp'],
  'homage-middle-earth-mithril-shard': ['echo_mithril_shard_title', '中洲回响·秘银矿', 'Middle-earth Echo · The Mithril Shard'],
};

describe('POI 交互标签双表化（W-D2 切片19）', () => {
  let world;

  beforeEach(() => {
    const handlers = new Map();
    globalThis.window = {
      addEventListener(type, fn) {
        if (!handlers.has(type)) handlers.set(type, new Set());
        handlers.get(type).add(fn);
      },
      dispatchEvent(event) {
        handlers.get(event.type)?.forEach((fn) => fn(event));
        return true;
      },
    };
    globalThis.CustomEvent = class {
      constructor(type, init) { this.type = type; this.detail = init?.detail; }
    };
    world = new WorldManager(makeScene(), makeDialog());
    world.build();
    attachPopCultureZones({ world, dialog: makeDialog(), scene: makeScene() });
    setLanguage('zh');
  });

  afterEach(() => {
    delete globalThis.window;
    delete globalThis.CustomEvent;
    setLanguage('zh');
  });

  it('每个 POI 的 label 都是中英两表里的键（分母自证：73 处一个不落）', () => {
    const pois = world.pointsOfInterest;
    expect(pois.length, 'POI 总数对不上 —— 世界构建坏了').toBeGreaterThanOrEqual(60);
    const 缺 = [];
    for (const poi of pois) {
      if (STRINGS_ZH[poi.label] === undefined) 缺.push(`中文表没有 "${poi.label}"（${poi.id}）`);
      if (STRINGS_EN[poi.label] === undefined) 缺.push(`英文表没有 "${poi.label}"（${poi.id}）`);
    }
    expect(缺, '这些 POI 的 label 不是键 —— 玩家会看到 [MISSING:]').toEqual([]);
  });

  it('钉死的表与真世界逐 id 对齐（多一个少一个都算漂移）', () => {
    const 钉住 = new Set(Object.keys(POI_LABELS));
    const 真世界 = new Set(world.pointsOfInterest.map((p) => p.id));
    expect([...真世界].filter((id) => !钉住.has(id)), '真世界有没钉住的 POI').toEqual([]);
    expect([...钉住].filter((id) => !真世界.has(id)), '钉的表里有已不存在的 POI').toEqual([]);
    expect(钉住.size, '钉住的条数太少，清单本身要复核').toBeGreaterThanOrEqual(60);
  });

  it('每个 POI 的双语文案逐字钉死（改文案必须来改这里）', () => {
    for (const poi of world.pointsOfInterest) {
      const [键, 中, 英] = POI_LABELS[poi.id];
      expect(poi.label, `${poi.id} 的 label 键变了`).toBe(键);
      setLanguage('zh');
      expect(t(poi.label), `${poi.id} 的中文文案变了`).toBe(中);
      setLanguage('en');
      expect(t(poi.label), `${poi.id} 的英文文案变了`).toBe(英);
    }
  });

  it('显示出口那一行把 label 交给了 t()（源码钉死，含反向控制）', () => {
    const src = readFileSync(join(process.cwd(), 'src/player/PlayerController.js'), 'utf8');
    const 接线后 = 'prompt.textContent = `${interact} ${t(this.nearbyPoint.label)}`;';
    const 没接线 = 'prompt.textContent = `${interact} ${this.nearbyPoint.label}`;';
    expect(src, '显示出口没有把 label 交给 t()').toContain(接线后);
    expect(src, '没接线的那一版还在 —— 说明改回去过').not.toContain(没接线);
  });

  it('交互提示串按当前语言出话（行为腿：模拟显示出口拼串）', () => {
    // 键名部分（[E]）是 keyText 的职责，另有门禁钉；这里只验 label 段的语言切换
    const interact = '[E]';
    for (const poi of world.pointsOfInterest) {
      const [, 中, 英] = POI_LABELS[poi.id];
      setLanguage('zh');
      expect(`${interact} ${t(poi.label)}`, poi.id).toBe(`${interact} ${中}`);
      setLanguage('en');
      expect(`${interact} ${t(poi.label)}`, poi.id).toBe(`${interact} ${英}`);
    }
  });

  it('11 个 POI 来源文件的 label 位上没有中文字面量', () => {
    const 违例 = [];
    for (const rel of POI_SOURCE_FILES) {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      for (const 原文 of 扫标签位(src)) 违例.push(`${rel}: ${原文}`);
    }
    expect(违例, '这些 label 位还挂着中文字面量 —— 切英文时它们翻不过去').toEqual([]);
  });

  it('反向控制：假 POI 与人造源码必须被点名（防扫描恒绿）', () => {
    const 假POI = [{ id: 'fake-poi', label: '一处没迁移的中文标签' }];
    const 缺 = 假POI.filter((p) => STRINGS_ZH[p.label] === undefined || STRINGS_EN[p.label] === undefined);
    expect(缺.map((p) => p.id)).toEqual(['fake-poi']);

    const 人造 = [
      "registerPoi(world, zone, { x: 0, y: 0, z: 0 }, '没迁移的标签', () => {});",
      "const poi = { id: 'x', label: '也是中文', position: { x: 0, y: 0, z: 0 } };",
    ].join('\n');
    expect(扫标签位(人造)).toEqual(['没迁移的标签', '也是中文']);
    // 对照：全都迁移干净的源码一把扫空
    expect(扫标签位("registerPoi(world, zone, { x: 0, y: 0, z: 0 }, 'echo_broom_ring_title', () => {});")).toEqual([]);
  });

  it('本片新建的 POI 标签键：同一文案在两表里最多两个键（全局规矩的本地复查）', () => {
    const 新建 = [...new Set(Object.values(POI_LABELS).map(([键]) => 键))]
      .filter((k) => k.startsWith('zone_poi_') || k.startsWith('pop_poi_') || k === 'hub_poi_anchor_label');
    expect(新建.length, '新建键数对不上 —— 切片范围变了？').toBe(30);
    for (const [名, table] of [['zh', STRINGS_ZH], ['en', STRINGS_EN]]) {
      const 计数 = new Map();
      for (const v of Object.values(table)) 计数.set(v, (计数.get(v) ?? 0) + 1);
      for (const 键 of 新建) {
        expect(计数.get(table[键]) ?? 0, `${名} 表里 "${键}" 的文案出现了 ${计数.get(table[键])} 次`).toBeLessThanOrEqual(2);
      }
    }
  });
});
