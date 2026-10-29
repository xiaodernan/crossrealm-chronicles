/**
 * 区文件 POI 对话/发现文案双表化（W-D2 切片21）。
 *
 * ## 为什么要有这道门禁
 *
 * 切片19/20 收掉了**致敬层** POI 的标签与对话，但 7 个区文件 + 枢纽锚点里的
 * 18 处 `dialog.show` 与 14 处 `discovery` 派发仍是裸中文 —— 英文玩家调查
 * 至尊石环、读五维碑文、走到 Boss 竞技场门口，看到的都是中文。
 *
 * 与切片20 不同的两处：
 * - 对话走的是 **zone 自己的 `this.dialog`**（`WorldManager` 构造时传进去的那个），
 *  桩要挂在 `WorldManager` 上才收得到；
 * - `discovery` 派发的 `title`/`text` 会被 `StoryJournal` **存进日志**、被 HUD
 *  拼进 toast —— 是"快照出口"：派发那一刻就必须是展开句（`t()` 在派发点展开），
 *  存键名进去日志里显示的就是键名本身。
 *
 * 腿（与切片20 同构）：
 * 1. 结构腿：21 个 POI 的对话/发现参数全是双表键（分母自证：钉表与真世界逐 id 互证）。
 * 2. 钉文案腿：21 × 12 格逐字钉死。
 * 3. 行为腿：切中/切英逐个 POI 重放交互，dialog 与 discovery 收到的都是展开句。
 * 4. 静态腿：8 个文件的 `.dialog.show` 与 `discovery` 派发必须走 `t()`（附反向控制）。
 * 5. 新键不孤儿：38 个新键都得在 8 个文件里被 `t()` 引用。
 * 6. 键数腿：38 个新键的文案在两表里最多各两个键。
 *
 * 复用口径（ADR 见 `docs/MASTER_PLAN.md` §9）：标题只借**同指称**的键 ——
 * 主线目标题（`obj_*_title`）、回声标题（`echo_tesseract_title`）、路点标签
 * （`wp_label_*`）、切片19 建的 POI 标签（`zone_poi_*_label`）；正文与发现描述
 * 没有同指称键可指，全部新建 `zone_dlg_*_text` / `zone_disc_*_text`。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorldManager } from '../src/world/WorldManager.js';
import { attachPopCultureZones } from '../src/world/PopCultureZoneEnhancer.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';
import { setLanguage } from '../src/engine/i18n.js';

const makeScene = () => ({ add() {}, remove() {} });

/** 写出全部区文件 POI 的来源（7 个区 + 枢纽锚点） */
const ZONE_FILES = [
  'src/world/zones/FantasyZone.js',
  'src/world/zones/MagicZone.js',
  'src/world/zones/SpaceZone.js',
  'src/world/zones/VoidZone.js',
  'src/world/zones/AbyssZone.js',
  'src/world/zones/GloomZone.js',
  'src/world/zones/RadiantZone.js',
  'src/world/WorldManager.js',
];

/** 致敬层 POI 不归本片（切片20 的门禁管它们） */
const 是致敬层 = (id) => id.startsWith('homage-') || id === 'hub-poster-wall' || id === 'fantasy-ring-echo';

/**
 * 钉死表：POI id → [对话标题键, 题中, 题英, 对话正文键, 文中, 文英,
 *                   发现标题键, 题中, 题英, 发现正文键, 文中, 文英]。
 * 没有对话/没有发现的那一侧是 null（void-tablet 无对话；Boss 门无发现）。
 * 21 行与真世界逐 id 对齐（结构腿互证）—— 切片35 之后 19 + 两座仪式落点（echo-pages、seal-stone）。
 */
const ZONE_POI_COPY = {
'hub-anchor': ['wp_label_anchor', '世界之锚', 'World Anchor', 'zone_dlg_hub_anchor_text', '三块位面碎片在此交汇。穿越者的使命，是重铸锚点，阻止诸界崩塌。向西进入灰白森林，向南踏入霍格沃兹遗境，向东前往米勒荒原——每一处都藏有一枚位面碎片。', 'Three plane fragments meet here. The traveler\'s mission is to reforge the anchor and stop the collapse of every realm. West into the Greywhite Forest, south into the Hogwarts Ruins, east to Miller\'s Wastes — each hides one fragment.', 'wp_label_anchor', '世界之锚', 'World Anchor', 'zone_disc_hub_anchor_text', '三界交汇的核心。', 'The heart where three realms meet.'],
  'fantasy-ring': ['wp_label_one_ring', '至尊石环', 'One Ring', 'zone_dlg_fantasy_ring_text', '你发现了一枚古老的铭文：「One Realm to bind them all...」石环微微发热——这是第一枚位面碎片的回响。', 'You find an ancient inscription: "One Realm to bind them all..." The stone ring grows warm — this is the echo of the first plane fragment.', 'wp_label_one_ring', '至尊石环', 'One Ring', 'zone_disc_fantasy_ring_text', '第一枚位面碎片的回响。', 'The echo of the first plane fragment.'],
  'fantasy-ruins': ['wp_label_fantasy_ruins', '精灵遗迹', 'Elf Ruins', 'zone_dlg_fantasy_ruins_text', '残破的壁画描绘着跨位面旅行的场景。精灵们曾在此记录诸界交汇的坐标——其中一条路径指向星空深处。', 'Crumbling murals depict travel between planes. The elves once recorded the coordinates where realms meet — one of those paths points deep into the starfield.', 'wp_label_fantasy_ruins', '精灵遗迹', 'Elf Ruins', 'zone_disc_fantasy_ruins_text', '壁画记录了跨位面坐标。', 'The murals record cross-plane coordinates.'],
  'fantasy-tower': ['zone_dlg_fantasy_tower_title', '灰白守望塔', 'Ashen Watchtower', 'zone_dlg_fantasy_tower_text', '从塔顶望去，三条位面之路清晰可见。北方是霍格沃兹遗境的紫色光柱，东方是米勒荒原的引力透镜。', 'From the tower top the three plane roads are clear: the violet pillar of the Hogwarts Ruins to the north, the gravitational lens of Miller\'s Wastes to the east.', 'zone_dlg_fantasy_tower_title', '灰白守望塔', 'Ashen Watchtower', 'zone_disc_fantasy_tower_text', '可俯瞰三界交汇。', 'Overlooks the meeting of three realms.'],
  'fantasy-boss-gate': ['zone_dlg_fantasy_boss_gate_title', '影界竞技场', 'Shadowrealm Arena', 'zone_dlg_fantasy_boss_gate_text', '踏入此门，影界守护者将苏醒。确保已掌握：\n· 观察敌人脚下红圈，0.75 秒后攻击落地\n· {roll} 闪避可躲开\n· 重击快速打满架势条造成硬直', 'Step through and the Shadowrealm Warden will wake. Make sure you have mastered:\n· Watch the red circle under enemies — attacks land 0.75s later\n· {roll} dodge gets you out of the way\n· Heavy attacks fill the posture bar fast and cause a stagger', null, null, null, null, null, null],
  'magic-castle': ['demo_step_magic_castle', '悬浮城堡', 'Floating Castle', 'zone_dlg_magic_castle_text', '魔法屏障闪烁…「只有被选中的穿越者才能踏入。」城堡内部的时间似乎静止了——第二枚位面碎片就藏在移动楼梯的顶端。', 'The magic barrier flickers... "Only the chosen traveler may enter." Time inside the castle seems frozen — the second plane fragment hides at the top of the moving staircase.', 'demo_step_magic_castle', '悬浮城堡', 'Floating Castle', 'zone_disc_magic_castle_text', '第二枚位面碎片藏于楼梯顶端。', 'The second plane fragment hides at the top of the staircase.'],
  'magic-forest': ['obj_magic_forest_title', '禁林低语', 'Whispers in the Forest', 'zone_dlg_magic_forest_text', '独角兽的幻影一闪而过，留下一枚闪烁的羽毛。羽毛上的符文与霍格沃兹创始人的封印如出一辙——魔法与诸界本是一体。', 'A unicorn\'s phantom flashes past, leaving a shimmering feather. The runes on it match the Hogwarts founders\' seals exactly — magic and all realms were always one.', 'obj_magic_forest_title', '禁林低语', 'Whispers in the Forest', 'zone_disc_magic_forest_text', '独角兽留下了位面线索。', 'A unicorn left a clue about the planes.'],
  'echo-pages': ['obj_study_rite_title', '研习仪式', 'Rite of Study', 'zone_disc_echo_pages_text', '灰烬里压着半页没烧完的虚空文字，边角还在发亮。', 'Half a page of Void script lies pressed in the ash, its edges still glowing.', 'obj_study_rite_title', '研习仪式', 'Rite of Study', 'zone_disc_echo_pages_text', '灰烬里压着半页没烧完的虚空文字，边角还在发亮。', 'Half a page of Void script lies pressed in the ash, its edges still glowing.'],
  'magic-boss-gate': ['zone_dlg_magic_boss_gate_title', '奥术竞技场', 'Arcane Arena', 'zone_dlg_magic_boss_gate_text', '大奥术师·萨尔林 awaits。他的法球会追踪你——闪避，或用法术位面斩 ({skill}) 清理。', 'The Grand Arcanist Salrin awaits. His orbs will track you — dodge, or cut them down with a plane-slash spell ({skill}).', null, null, null, null, null, null],
  'space-tesseract': ['echo_tesseract_title', '五维_tesseract', 'Five-Dimensional Tesseract', 'zone_dlg_space_tesseract_text', '无数时间线的画面涌入脑海…你看到了其他位面的自己。在 tesseract 的中心，第三枚位面碎片以引力波的形式震荡。', 'Images of countless timelines flood your mind... you see other versions of yourself from other planes. At the tesseract\'s heart, the third plane fragment oscillates as a gravitational wave.', 'echo_tesseract_title', '五维_tesseract', 'Five-Dimensional Tesseract', 'zone_disc_space_tesseract_text', '第三枚碎片以引力波形式存在。', 'The third fragment exists as a gravitational wave.'],
  'space-lens': ['obj_space_lens_title', '引力透镜', 'The Gravity Lens', 'zone_dlg_space_lens_text', '黑洞的吸积盘在时空中弯曲…这里的时间流速与其他区域不同。每过一秒，外界或许已流逝一小时——这正是位面碎片的力量。', 'The black hole\'s accretion disk bends spacetime... time flows differently here. Each second within may be an hour outside — such is the power of a plane fragment.', 'obj_space_lens_title', '引力透镜', 'The Gravity Lens', 'zone_disc_space_lens_text', '时间在此扭曲。', 'Time is distorted here.'],
  'space-wreck': ['zone_dlg_space_wreck_title', 'Endurance 号', 'Endurance', 'zone_dlg_space_wreck_text', '飞船日志最后一条记录：「不要温和地走进那个良夜。」船载 AI 的数据核心里，藏着通往五维空间的密钥。', 'The ship\'s log ends with: "Do not go gentle into that good night." Inside the onboard AI\'s data core lies the key to five-dimensional space.', 'zone_dlg_space_wreck_title', 'Endurance 号', 'Endurance', 'zone_disc_space_wreck_text', '残骸中藏有五维密钥。', 'The wreck hides the key to five-dimensional space.'],
  'void-rift': ['obj_void_rift_title', '时线裂隙', 'Timeline Rift', 'zone_dlg_void_rift_text', '第四枚位面碎片在时环中心闪烁。完成 Chapter 3 飞升后，时线执政官才会完全苏醒。\n\n蓄力法术（长按 {spell1}/{spell2}/{spell3}）可打断其「时停」攻击。', 'The fourth plane fragment flickers at the center of the time ring. Only after the Chapter 3 ascension will the Chronarch fully awaken.\n\nCharged spells (hold {spell1}/{spell2}/{spell3}) can interrupt its "time stop" attack.', 'obj_void_rift_title', '时线裂隙', 'Timeline Rift', 'zone_disc_void_rift_text', '隐藏的第四碎片。', 'The hidden fourth fragment.'],
  'void-tablet': [null, null, null, null, null, null, 'obj_void_tablet_title', '五维碑文', 'Five-Dimensional Stele', 'zone_disc_void_tablet_text', '「Love is the one thing that transcends time and space.」', '"Love is the one thing that transcends time and space."'],
  'seal-stone': [null, null, null, null, null, null, 'obj_seal_rite_title', '封印仪式', 'Rite of Sealing', 'zone_disc_seal_stone_text', '石座上有一道刚合拢的缝，缝里还透出一点冷光。', 'A seam has just closed on the stone seat; a little cold light still leaks through.'],
  'abyss-boss-gate': ['zone_poi_abyss_boss_gate_label', '混沌裂隙竞技场', 'Chaos Rift Arena', 'zone_dlg_abyss_boss_gate_text', 'Chapter 5 解锁后，踏入红圈将唤醒「混沌裂隙领主」。\n\n坐标：X≈-200, Z≈285 · 建议先解锁 3 个武器技能。', 'After Chapter 5 unlocks, stepping into the red circle will wake the "Chaos Rift Overlord".\n\nCoordinates: X≈-200, Z≈285 · Unlock 3 weapon skills first.', null, null, null, null, null, null],
  'chaos-core': ['obj_chaos_core_title', '混沌之核', 'Chaos Core', 'zone_dlg_chaos_core_text', '此处可感悟武器技能——在营火用「技能点」解锁剑/杖流派。\n\n完成 Chapter 4 后，边境会完全显现。', 'Here you can attune to weapon skills — spend skill points at the campfire to unlock the sword/staff styles.\n\nAfter Chapter 4, the Border will fully reveal itself.', 'obj_chaos_core_title', '混沌之核', 'Chaos Core', 'zone_disc_chaos_core_text', '第五位面的不稳定能量源。', 'The unstable energy source of the fifth plane.'],
  'gloom-deep-entrance': ['zone_poi_gloom_deep_entrance_label', '幽暗林地深处', 'Depths of the Gloomy Forest', 'zone_dlg_gloom_deep_entrance_text', '迷雾最浓处藏着古老的秘密。\n\n坐标：X≈180, Z≈170 · 需完成相关支线才能进入核心区域。', 'Where the fog is thickest lies an ancient secret.\n\nCoordinates: X≈180, Z≈170 · Complete the relevant side quest to enter the core area.', null, null, null, null, null, null],
  'gloom-moss': ['zone_poi_gloom_moss_label', '荧光苔藓群落', 'Fluorescent Moss Colony', 'zone_dlg_gloom_moss_text', '采集荧光苔藓可制作照明道具。\n\n在营火处可将其炼制为「迷雾灯笼」。', 'Gather fluorescent moss to craft light sources.\n\nAt the campfire it can be refined into a "Mist Lantern".', 'wp_label_gloom_moss', '荧光苔藓', 'Glowing Moss', 'zone_disc_gloom_moss_text', '只在幽暗林地生长的发光苔藓，能指引迷途者。', 'Glowing moss that grows only in the Gloomy Woodland; it guides the lost.'],
  'radiant-main-gate': ['zone_poi_radiant_main_gate_label', '辉煌圣域大门', 'Gate of the Radiant Sanctuary', 'zone_dlg_radiant_main_gate_text', '金光洗礼过的巨门，守护着圣域的核心。\n\n坐标：X≈-180, Z≈-95 · 需完成相关支线才能进入内殿。', 'The great gate, bathed in golden light, guards the heart of the Sanctuary.\n\nCoordinates: X≈-180, Z≈-95 · Complete the relevant side quest to enter the inner hall.', null, null, null, null, null, null],
  'radiant-altar': ['wp_label_radiant_altar', '晨曦祭坛', 'Dawn Altar', 'zone_dlg_radiant_altar_text', '在晨曦时分（游戏内 5:00-7:00）祈祷可获得「晨曦祝福」。\n\n祝福效果：下一次营火休息恢复双倍体力。', 'Pray at dawn (in-game 5:00-7:00) to receive the "Dawn Blessing".\n\nEffect: your next campfire rest restores double stamina.', 'wp_label_radiant_altar', '晨曦祭坛', 'Dawn Altar', 'zone_disc_radiant_altar_text', '晨曦初照时，祭坛会释放祝福之光。', 'At first light of dawn, the altar releases its blessing light.'],
};

/** 扫一份源码的对话/发现出口：返回没走 t() 的片段 */
function 扫出口(src) {
  const 违例 = [];
  for (const m of src.matchAll(/\.dialog\.show\(/g)) {
    const rest = src.slice(m.index + m[0].length);
    if (!/^\s*t\('/.test(rest)) 违例.push(rest.slice(0, 40).split('\n')[0]);
  }
  for (const m of src.matchAll(/title:\s*'[^']*',\s*text:\s*'[^']*'/g)) 违例.push(m[0]);
  return 违例;
}

describe('区文件 POI 对话/发现文案双表化（W-D2 切片21）', () => {
  let world;
  let shown;
  let discovered;

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
    shown = [];
    discovered = [];
    // 注意：桩 dialog 必须挂在 WorldManager 上 —— 区文件的对话走 zone 自己的 this.dialog
    const recDialog = { show: (a, b) => shown.push([a, b]), toast() {} };
    world = new WorldManager(makeScene(), recDialog);
    world.build();
    window.addEventListener('discovery', (e) => discovered.push(e.detail));
    attachPopCultureZones({ world, dialog: recDialog, scene: makeScene() });
    setLanguage('zh');
  });

  afterEach(() => {
    delete globalThis.window;
    delete globalThis.CustomEvent;
    setLanguage('zh');
  });

  /** 真调一遍某个 POI 的交互，收回 dialog 与 discovery 的参数 */
  function 播(poi) {
    shown = [];
    discovered = [];
    poi.onInteract();
    return { dlg: shown.length ? shown[0] : null, disc: discovered.length ? discovered[0] : null };
  }

  it('结构腿：21 个区/枢纽 POI 的对话与发现参数全是双表键（分母自证）', () => {
    const 本片 = world.pointsOfInterest.filter((p) => !是致敬层(p.id));
    expect(本片.length, '区/枢纽 POI 数对不上').toBeGreaterThanOrEqual(18);
    const 缺 = [];
    for (const poi of 本片) {
      const pin = ZONE_POI_COPY[poi.id];
      expect(pin, `${poi.id} 没有钉住`).toBeTruthy();
      for (const k of [pin[0], pin[3], pin[6], pin[9]]) {
        if (k === null) continue;
        if (STRINGS_ZH[k] === undefined) 缺.push(`中文表没有 "${k}"（${poi.id}）`);
        if (STRINGS_EN[k] === undefined) 缺.push(`英文表没有 "${k}"（${poi.id}）`);
      }
    }
    expect(缺, '这些参数不是键 —— 玩家会看到 [MISSING:]').toEqual([]);
  });

  it('钉死的表与真世界逐 id 对齐（多一个少一个都算漂移）', () => {
    const 钉住 = new Set(Object.keys(ZONE_POI_COPY));
    const 真世界 = new Set(world.pointsOfInterest.filter((p) => !是致敬层(p.id)).map((p) => p.id));
    expect([...真世界].filter((id) => !钉住.has(id)), '真世界有没钉住的 POI').toEqual([]);
    expect([...钉住].filter((id) => !真世界.has(id)), '钉的表里有已不存在的 POI').toEqual([]);
    expect(钉住.size, '钉住的条数太少，清单本身要复核').toBeGreaterThanOrEqual(18);
  });

  it('钉文案腿：19 × 12 格逐字钉死（改文案必须来改这里）', () => {
    for (const poi of world.pointsOfInterest) {
      const pin = ZONE_POI_COPY[poi.id];
      if (!pin) continue;
      for (let i = 0; i < 12; i += 3) {
        const [键, 中, 英] = [pin[i], pin[i + 1], pin[i + 2]];
        if (键 === null) continue;
        expect(STRINGS_ZH[键], `${poi.id} 第 ${i / 3 + 1} 格中文变了`).toBe(中);
        expect(STRINGS_EN[键], `${poi.id} 第 ${i / 3 + 1} 格英文变了`).toBe(英);
      }
    }
  });

  it('行为腿：切中/切英逐个 POI 重放，dialog 与 discovery 都出展开句', () => {
    for (const poi of world.pointsOfInterest) {
      const pin = ZONE_POI_COPY[poi.id];
      if (!pin) continue;
      setLanguage('zh');
      const zh = 播(poi);
      setLanguage('en');
      const en = 播(poi);
      if (pin[0] !== null) {
        expect(zh.dlg, poi.id).toEqual([pin[1], pin[4]]);
        expect(en.dlg, poi.id).toEqual([pin[2], pin[5]]);
      } else {
        expect(zh.dlg, poi.id).toBeNull();
      }
      if (pin[6] !== null) {
        expect([zh.disc.title, zh.disc.text], poi.id).toEqual([pin[7], pin[10]]);
        expect([en.disc.title, en.disc.text], poi.id).toEqual([pin[8], pin[11]]);
      } else {
        expect(zh.disc, poi.id).toBeNull();
      }
    }
  });

  it('静态腿：8 个文件的 dialog.show 与 discovery 派发全走 t()', () => {
    const 违例 = [];
    for (const rel of ZONE_FILES) {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      for (const 原文 of 扫出口(src)) 违例.push(`${rel}: ${原文}`);
    }
    expect(违例, '这些出口没有把参数交给 t()').toEqual([]);
  });

  it('静态腿反向控制：人造源码必须被点名（防扫描恒绿）', () => {
    const 人造 = [
      "this.dialog.show('没迁移的标题', '没迁移的正文');",
      "window.dispatchEvent(new CustomEvent('discovery', { detail: { id: 'x', title: '中文标题', text: '中文正文' } }));",
      "this.dialog.show(t('zone_dlg_x_title'), t('zone_dlg_x_text'));",
      "window.dispatchEvent(new CustomEvent('discovery', { detail: { id: 'x', title: t('a'), text: t('b') } }));",
    ].join('\n');
    expect(扫出口(人造)).toEqual([
      "'没迁移的标题', '没迁移的正文');",
      "title: '中文标题', text: '中文正文'",
    ]);
  });

  it('新键不孤儿：38 个新键都在 8 个文件里被 t() 引用', () => {
    const 新键 = [...new Set(Object.values(ZONE_POI_COPY).flat())]
      .filter((k) => typeof k === 'string' && (k.startsWith('zone_dlg_') || k.startsWith('zone_disc_')));
    expect(新键.length, '新键数对不上 —— 切片范围变了？').toBe(38);
    const 源码 = ZONE_FILES.map((rel) => readFileSync(join(process.cwd(), rel), 'utf8')).join('\n');
    const 没人用 = 新键.filter((k) => !源码.includes("t('" + k + "')"));
    expect(没人用, '这些新键建了却没人引用（死键）').toEqual([]);
  });

  it('键数腿：38 个新键的文案在两表里最多两个键（全局规矩的本地复查）', () => {
    const 新键 = [...new Set(Object.values(ZONE_POI_COPY).flat())]
      .filter((k) => typeof k === 'string' && (k.startsWith('zone_dlg_') || k.startsWith('zone_disc_')));
    for (const [名, table] of [['zh', STRINGS_ZH], ['en', STRINGS_EN]]) {
      const 计数 = new Map();
      for (const v of Object.values(table)) 计数.set(v, (计数.get(v) ?? 0) + 1);
      for (const 键 of 新键) {
        expect(计数.get(table[键]) ?? 0, `${名} 表里 "${键}" 的文案出现了 ${计数.get(table[键])} 次`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('反向控制：不在表里的假键必须被点名（防结构腿恒绿）', () => {
    const 假 = ['zone_dlg_根本不存在_xyz', 'zone_disc_也不存在_abc'];
    const 缺 = 假.filter((k) => STRINGS_ZH[k] === undefined || STRINGS_EN[k] === undefined);
    expect(缺).toEqual(假);
  });
});
