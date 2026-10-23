/**
 * 致敬层 POI 对话文案双表化（W-D2 切片20）。
 *
 * ## 为什么要有这道门禁
 *
 * 切片19 把 POI 的**交互标签**收进了双表，但同一批 POI 的**对话标题/正文**
 * （`game.dialog.show(标题, 正文)`，43 处）仍是裸中文 —— 英文玩家走近一个致敬点，
 * 按下交互键，弹出来的整篇对话是中文。这是 §8 W-D2 余项里点名的一族
 * （`PopCultureZoneEnhancer*` 131 处）的主体。
 *
 * 这里跑**真世界**（`WorldManager.build()` + `attachPopCultureZones`，与
 * `poi-identity.test.js` 同一套夹具），把每个 POI 的 `onInteract` 真调一遍，
 * 用桩 dialog 收下 `show` 的两个参数：
 *
 * 1. **结构腿**：43 个对话的标题/正文都是中英两表里的键（分母自证：钉的表与
 *    真世界逐 id 互证，多一个少一个都算漂移）。
 * 2. **钉文案腿**：43 × 6 格（标题键/中文/英文/正文键/中文/英文）逐字钉死。
 * 3. **行为腿**：切中/切英后逐个 POI 重放交互，桩收到的必须是**展开句**——
 *    这条同时钉住"t() 真的包在调用点上"与"切语言真的换字"。
 * 4. **静态腿**：四个文件的 `dialog.show` 必须把两个参数都交给 `t()`，
 *    `discovery` 派发的 `title`/`text` 同理（人造源码反向控制）。
 * 5. **新键不孤儿**：38 个新键都得在四个文件里被 `t()` 引用（建了键没人用 =
 *    死键，`i18n.test.js` 那条账本上限会被它顶着）。
 * 6. **键数腿**：38 个新键的文案在两表里最多各两个键（全局规矩的本地复查）。
 *
 * 复用口径（ADR 见 `docs/MASTER_PLAN.md` §9）：标题/正文与**这个 POI 自己的**
 * 回声条目（`echo_*_title` / `echo_*_desc`）或路点标签（`wp_label_one_ring`）
 * 逐字相同就指向那一格 —— 交互即解锁那条回声，同一指称不建第二格；
 * 没有同指称键可指的（`飞天环赛` / `霓虹商场` / `裂隙猎犬` / `地下实验室` /
 * `巨企尖塔` 五个短标题与 32 段正文）才新建 `pop_dlg_*`。
 * CG 画廊字幕（`cg_caption_*`）**不借**：那是另一块显示面的策展文案，
 * 英文表的值本来就不是一句（`cg_caption_magic_broom` = "Broom Ring Race"）。
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
const makeDialog = () => ({ show() {}, toast() {} });

/** 写出全部致敬层 POI 的四个文件 */
const POP_FILES = [
  'src/world/PopCultureZoneEnhancer.js',
  'src/world/PopCultureZoneEnhancerWave2.js',
  'src/world/PopCultureZoneEnhancerWave3.js',
  'src/world/PopCultureZoneEnhancerWave4.js',
];

/**
 * 钉死表：POI id → [标题键, 标题中, 标题英, 正文键, 正文中, 正文英]。
 * 43 行与真世界逐 id 对齐（结构腿互证），改任何一处文案都必须来改这里。
 */
const POI_DIALOGS = {
'homage-broom-ring': ['pop_dlg_broom_ring_title', '飞天环赛', 'Broom Racing', 'pop_dlg_broom_ring_text', '三根悬浮金环是旧时代「扫帚竞速」的赛道。\n\n传说有学徒曾在这里追一颗会飞的鬼火 — 那其实是位面渗漏的魂火萤。', 'Three floating gold rings — the old track of the broom races.\n\nLegend says an apprentice once chased a will-o\'-the-wisp here; it was really soul-fire leaking in from another plane.'],
  'homage-potion-lab': ['echo_potion_lab_title', '魔药温室', 'Potion Greenhouse', 'pop_dlg_potion_lab_text', '玻璃下种着会尖叫的根 — 别在满月夜靠近。', 'Screaming roots grow under the glass — don\'t come near on a full-moon night.'],
  'homage-sorting-hall': ['echo_sorting_hall_title', '分院残厅', 'Ruined Great Hall', 'pop_dlg_sorting_hall_text', '四色横幅已褪色 — 分院帽低语：「去冒险，别回头。」', 'The four-colored banners have faded — the Sorting Hat whispers: "Go on an adventure, and don\'t look back."'],
  'homage-murphy-shelf': ['echo_murphy_title', '墨菲书架', 'Murphy\'s Bookshelf', 'pop_dlg_murphy_shelf_text', '引力在书页间留下幽灵笔迹 — 像在说 Stay。', 'Gravity has left ghostly handwriting between the pages — as if saying Stay.'],
  'homage-miller-hourglass': ['echo_miller_title', '米勒沙漏', 'Miller\'s Hourglass', 'pop_dlg_miller_hourglass_text', '这里的一小时，可能是枢纽的七年。', 'One hour here may be seven years back at the hub.'],
  'homage-docking-spin': ['echo_docking_title', '对接舱旋转', 'Docking Bay Spin', 'pop_dlg_docking_spin_text', '两艘船必须以相同转速相遇 — 否则就是金属的葬礼。', 'Two ships must meet at the same spin — otherwise it is a funeral of metal.'],
  'homage-radio-tower': ['echo_radio_tower_title', '旧镇广播塔', 'Old Town Broadcast Tower', 'pop_dlg_radio_tower_text', '1983 年的电台仍在循环 — 你听见的是另一个维度的 SOS。', 'The 1983 radio station still loops — what you hear is an SOS from another dimension.'],
  'homage-upside-rift': ['echo_upside_rift_title', '逆相裂口', 'Upside-Down Rift', 'pop_dlg_upside_rift_text', '天空像被撕开，红色孢子飘落 — 逆相界的风是冷的。', 'The sky looks torn open, red spores drifting down — the wind of the Upside Down is cold.'],
  'homage-neon-mall': ['pop_dlg_neon_mall_title', '霓虹商场', 'Neon Mall', 'pop_dlg_neon_mall_text', '粉色与青色霓虹 — 像从未关门的 80 年代。', 'Pink and cyan neon — like an eighties mall that never closed.'],
  'homage-rift-hound': ['pop_dlg_rift_hound_title', '裂隙猎犬', 'Rift Hound', 'pop_dlg_rift_hound_text', '爪印通向没有星星的方向 — 别在夜里单独追。', 'The paw prints lead where there are no stars — don\'t follow them alone at night.'],
  'fantasy-ring-echo': ['wp_label_one_ring', '至尊石环', 'One Ring', 'echo_one_ring_desc', 'One Realm to bind them all… 戒指已碎，石环仍在。', 'One Realm to bind them all… the ring is broken, the stone still stands.'],
  'hub-poster-wall': ['echo_poster_wall_title', '位面海报墙', 'Plane Poster Wall', 'pop_dlg_hub_poster_wall_text', '九张褪色海报：咒术学院 · 米勒沙漏 · 逆相裂口 · 至尊石环 · 混沌边境 · 世界之锚 · 边境往事 · 幽冥帮派 · 深空纪元\n\n{journal} → 次元回声 按系列筛选已共鸣条目。', 'Nine faded posters: Wand Academy · Miller Hourglass · Upside Rift · One Ring · Chaos Border · World Anchor · Border Tales · Nether Syndicate · Deep Space Era\n\n{journal} → Dimensional Echoes: filter resonated entries by series.'],
  'homage-nine-platform': ['echo_nine_platform_title', '九分又四分三站台', 'Platform Nine and Three-Quarters', 'pop_dlg_nine_platform_text', '砖墙在月台中央裂开 — 魂火萤像列车汽笛一样掠过。\n\n「相信」不是咒语，是脚步。', 'The brick wall splits down the middle of the platform — soul-fire wisps streak past like a train whistle.\n\n"Believing" is not a spell — it is footsteps.'],
  'homage-patronus-lake': ['echo_patronus_lake_title', '护念湖镜', 'Patronus Lake', 'pop_dlg_patronus_lake_text', '湖面映出的不是脸 — 是你最需要的勇气形状。', 'The lake reflects not your face — but the shape of the courage you need most.'],
  'homage-triwizard-cup': ['echo_triwizard_title', '三强赛台', 'Triwizard Stands', 'pop_dlg_triwizard_cup_text', '三只高脚杯已空 — 龙息与迷宫的回声仍在石台打转。', 'The three goblets are empty — dragon breath and the maze\'s echo still circle the stone platform.'],
  'homage-brand-beacon': ['echo_brand_beacon_title', '曼恩假信标', 'Mann Beacon', 'pop_dlg_brand_beacon_text', '信标在冰原上闪烁 — 日志写「完美」，脚印写「谎言」。', 'The beacon blinks over the ice — the log says "perfect", the footprints say "lie".'],
  'homage-wormhole-arch': ['echo_wormhole_title', '虫洞拱门', 'Wormhole Arch', 'echo_wormhole_desc', '光在环中折叠 — 穿过它的人，年龄与记忆不同步。', 'Light folds inside the ring — those who pass through come out with age and memory out of sync.'],
  'homage-love-signal': ['echo_love_signal_title', '爱即坐标', 'Love Is a Coordinate', 'echo_love_signal_desc', '五维_tesseract 里，唯一不变的导航星是「不要放手」。', 'In the five-dimensional tesseract, the only fixed navigation star is "do not let go".'],
  'homage-bike-trail': ['echo_bike_trail_title', '夜游单车灯串', 'Night Bicycle Light String', 'echo_bike_trail_desc', '四盏车灯在雾中排成线 — 像有人还在找失踪的朋友。', 'Four bicycle lamps line up in the fog — as if someone were still looking for a missing friend.'],
  'homage-arcade': ['echo_arcade_title', '街机厅残影', 'Arcade Afterimage', 'echo_arcade_desc', '吃豆人与恶魔在 CRT 里循环 — 投币口塞满红色孢子。', 'Pac-Man and the demons loop on a CRT — the coin slot is packed with red spores.'],
  'homage-vecna-clock': ['echo_vecna_clock_title', '裂相钟塔', 'Clock Tower of the Rift', 'echo_vecna_clock_desc', '指针停在 11 点 6 分 — 每次钟声，天花板就远一点。', 'The hands stopped at 11:06 — every chime, the ceiling gets a little further away.'],
  'homage-underground-lab': ['pop_dlg_underground_lab_title', '地下实验室', 'Underground Lab', 'echo_underground_lab_desc', '编号门牌 rusted shut — 门后仍有低频嗡鸣，像未关的实验。', 'A numbered door rusted shut — behind it still hums, like an experiment never ended.'],
  'homage-saloon-mirror': ['echo_saloon_mirror_title', '沙龙镜墙', 'Saloon Mirror Wall', 'echo_saloon_mirror_desc', '旋转门后是一面裂镜 — 决斗者的倒影永远比你快半拍。', 'Behind the turning door is a cracked mirror — a duelist\'s reflection is always half a beat ahead.'],
  'homage-duel-noon': ['echo_duel_noon_title', '正午决斗圈', 'Noon Duel Circle', 'pop_dlg_duel_noon_text', ' chalk 圈里的太阳不会移动 — 直到有人拔剑。', 'The sun inside the chalk circle never moves — until someone draws a sword.'],
  'homage-ghost-rails': ['echo_ghost_rails_title', '幽灵铁道', 'Ghost Railway', 'echo_ghost_rails_desc', '铁轨通向已消失的镇 — 汽笛声在雾里，火车从不到站。', 'The rails lead to a vanished town — the whistle sounds in the fog, but the train never arrives.'],
  'homage-speakeasy': ['echo_speakeasy_title', '禁酒窖门', 'Speakeasy Door', 'echo_speakeasy_desc', '无标记的后巷入口 — 里面谈的不是酒，是界与界的关税。', 'An unmarked back-alley entrance — inside they are not talking about drink, but the tariff between worlds.'],
  'homage-family-shrine': ['echo_family_shrine_title', '家族圣龛', 'Family Shrine', 'pop_dlg_family_shrine_text', '三支蜡烛照一面黑镜 — 镜里映出上一任引路人。', 'Three candles light a black mirror — the figure inside is the previous guide.'],
  'homage-dock-crates': ['echo_dock_crates_title', '码头货仓', 'Dock Warehouse', 'pop_dlg_dock_crates_text', '木箱烙着旧家族纹章 — 打开全是位面走私的魂火。', 'The crates bear the old family crest — open one and it is full of soul-fire smuggled between planes.'],
  'homage-colony-dome': ['echo_colony_dome_title', '殖民穹顶', 'Colony Dome', 'pop_dlg_colony_dome_text', '穹顶内是人工黄昏 — 外面是荒原，里面是另一个天空。', 'Inside the dome is an artificial dusk — wasteland outside, another sky within.'],
  'homage-ai-core': ['echo_ai_core_title', '休眠 AI 核心', 'Dormant AI Core', 'echo_ai_core_desc', '核心低语：「任务未完成。」 — 它指的不是飞船，是你。', 'The core whispers: "Mission not complete." — It is not talking about the ship. It is talking about you.'],
  'homage-jump-gate': ['echo_jump_gate_title', '跃迁门阵列', 'Jump Gate Array', 'pop_dlg_jump_gate_text', '三门同相才能跃迁 — 错相的人会在门里永远循环第一秒。', 'All three gates must be in phase to jump — the out-of-phase loop their first second inside forever.'],
  'homage-neon-alley': ['echo_neon_alley_title', '霓虹后巷', 'Neon Back Alley', 'pop_dlg_neon_alley_text', '全息广告短路 — 义眼记录的不一定是真相。', 'The holographic ads short-circuit — what the optic implants record is not necessarily the truth.'],
  'homage-chrome-clinic': ['echo_chrome_clinic_title', '铬合金诊所', 'Chrome Clinic', 'pop_dlg_chrome_clinic_text', '魔药与芯片同柜 — 升级有两种读音。', 'Potions and chips in the same cabinet — "upgrade" has two readings here.'],
  'homage-corp-spire': ['pop_dlg_corp_spire_title', '巨企尖塔', 'Corporate Spire', 'pop_dlg_corp_spire_text', 'Slogan 循环播放 — 魂火也算 KPI。', 'The slogan loops on and on — even soul-fire counts toward the KPI.'],
  'homage-torii-gate': ['echo_torii_gate_title', '鸟居残门', 'Broken Torii Gate', 'pop_dlg_torii_gate_text', '门后不是神域，是未结束的决斗。', 'Behind the gate is no divine realm — only a duel that never ended.'],
  'homage-dojo-ruins': ['echo_dojo_ruins_title', '道场废墟', 'Dojo Ruins', 'pop_dlg_dojo_ruins_text', '木桩刀痕比树年轮密。', 'The blade marks on the post are denser than the tree\'s growth rings.'],
  'homage-sakura-blade': ['echo_sakura_blade_title', '樱落刃冢', 'Blade Mound under Falling Sakura', 'pop_dlg_sakura_blade_text', '落樱盖住断刃 — 杀气像未散。', 'Falling sakura cover the broken blade — the killing intent still lingers.'],
  'homage-tentacle-obelisk': ['echo_tentacle_obelisk_title', '触须方尖碑', 'Tentacle Obelisk', 'pop_dlg_tentacle_obelisk_text', '铭文是盯着你的角度。', 'The inscription is an angle — the one from which it watches you.'],
  'homage-mad-scribe': ['echo_mad_scribe_title', '疯癫抄写室', 'Mad Scriptorium', 'pop_dlg_mad_scribe_text', '羽毛笔自己写 — 墨水像海水与铁锈。', 'The quill writes by itself — the ink like seawater and rust.'],
  'homage-spiral-well': ['echo_spiral_well_title', '螺旋深井', 'Spiral Well', 'pop_dlg_spiral_well_text', '井底回声在数数 — 数到你。', 'The echo at the bottom of the well is counting — and it counts to you.'],
  'homage-star-cantina': ['echo_star_cantina_title', '星港酒肆', 'Starport Cantina', 'pop_dlg_star_cantina_text', '赏金、走私、跃迁合同在同一张桌。', 'Bounties, smuggling and jump contracts share one table.'],
  'homage-smuggler-dock': ['echo_smuggler_dock_title', '走私码头', 'Smuggler Dock', 'pop_dlg_smuggler_dock_text', '集装箱编号是位面坐标。', 'The container numbers are plane coordinates.'],
  'homage-holo-chart': ['echo_holo_chart_title', '全息星图室', 'Holographic Star Chart Room', 'pop_dlg_holo_chart_text', '航线是谈判出来的。', 'A route is something you negotiate.'],
};

/** 扫一份源码的对话出口：返回没走 t() 的调用与派发（原文片段） */
function 扫对话出口(src) {
  const 违例 = [];
  for (const m of src.matchAll(/game\.dialog\.show\(/g)) {
    const rest = src.slice(m.index + m[0].length);
    if (!/^\s*t\('/.test(rest)) 违例.push(rest.slice(0, 40).split('\n')[0]);
  }
  // discovery 派发的 title/text 也必须是展开句（对象字面量里带引号就是没包 t()）
  for (const m of src.matchAll(/title:\s*'[^']*',\s*text:\s*'[^']*'/g)) 违例.push(m[0]);
  return 违例;
}

describe('致敬层 POI 对话文案双表化（W-D2 切片20）', () => {
  let world;
  /** 每个 POI 最近一次交互时 dialog.show 收到的两个参数 */
  let shown;

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
    shown = [];
    attachPopCultureZones({
      world,
      dialog: { show: (a, b) => shown.push([a, b]), toast() {} },
      scene: makeScene(),
    });
    setLanguage('zh');
  });

  afterEach(() => {
    delete globalThis.window;
    delete globalThis.CustomEvent;
    setLanguage('zh');
  });

  /** 真调一遍某个 POI 的交互，收回 dialog.show 的两个参数 */
  function 播对话(poi) {
    shown = [];
    poi.onInteract();
    expect(shown.length, poi.id + ' 没有弹出对话').toBe(1);
    return shown[0];
  }

  it('结构腿：43 个对话的标题/正文都是中英两表里的键（分母自证）', () => {
    const 有对话 = world.pointsOfInterest.filter((p) => typeof p.onInteract === 'function' && POI_DIALOGS[p.id]);
    expect(有对话.length, '带对话的 POI 数对不上').toBeGreaterThanOrEqual(40);
    const 缺 = [];
    for (const poi of 有对话) {
      const [tk, , , bk] = POI_DIALOGS[poi.id];
      for (const k of [tk, bk]) {
        if (STRINGS_ZH[k] === undefined) 缺.push(`中文表没有 "${k}"（${poi.id}）`);
        if (STRINGS_EN[k] === undefined) 缺.push(`英文表没有 "${k}"（${poi.id}）`);
      }
    }
    expect(缺, '这些对话参数不是键 —— 玩家会看到 [MISSING:]').toEqual([]);
  });

  it('钉死的表与真世界逐 id 对齐（多一个少一个都算漂移）', () => {
    const 钉住 = new Set(Object.keys(POI_DIALOGS));
    const 真世界 = new Set(world.pointsOfInterest.filter((p) => POI_DIALOGS[p.id]).map((p) => p.id));
    expect([...真世界].filter((id) => !钉住.has(id)), '真世界有没钉住的对话').toEqual([]);
    expect([...钉住].filter((id) => !真世界.has(id)), '钉的表里有已不存在的 POI').toEqual([]);
    expect(钉住.size, '钉住的条数太少，清单本身要复核').toBeGreaterThanOrEqual(40);
  });

  it('钉文案腿：43 × 6 格逐字钉死（改文案必须来改这里）', () => {
    for (const poi of world.pointsOfInterest) {
      const pin = POI_DIALOGS[poi.id];
      if (!pin) continue;
      const [标题键, 标题中, 标题英, 正文键, 正文中, 正文英] = pin;
      expect(STRINGS_ZH[标题键], `${poi.id} 标题中文变了`).toBe(标题中);
      expect(STRINGS_EN[标题键], `${poi.id} 标题英文变了`).toBe(标题英);
      expect(STRINGS_ZH[正文键], `${poi.id} 正文中文变了`).toBe(正文中);
      expect(STRINGS_EN[正文键], `${poi.id} 正文英文变了`).toBe(正文英);
    }
  });

  it('行为腿：对话播出的是展开句，切语言真的换字（中英双语逐 POI）', () => {
    for (const poi of world.pointsOfInterest) {
      const pin = POI_DIALOGS[poi.id];
      if (!pin) continue;
      const [, 标题中, 标题英, , 正文中, 正文英] = pin;
      setLanguage('zh');
      expect(播对话(poi), poi.id).toEqual([标题中, 正文中]);
      setLanguage('en');
      expect(播对话(poi), poi.id).toEqual([标题英, 正文英]);
    }
  });

  it('静态腿：四个文件的 dialog.show 与 discovery 派发全走 t()', () => {
    const 违例 = [];
    for (const rel of POP_FILES) {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      for (const 原文 of 扫对话出口(src)) 违例.push(`${rel}: ${原文}`);
    }
    expect(违例, '这些对话出口没有把参数交给 t()').toEqual([]);
  });

  it('静态腿反向控制：人造源码必须被点名（防扫描恒绿）', () => {
    const 人造 = [
      "game.dialog.show('没迁移的标题', '没迁移的正文');",
      "window.dispatchEvent(new CustomEvent('discovery', { detail: { id: 'x', title: '中文标题', text: '中文正文' } }));",
      "game.dialog.show(t('pop_dlg_x_title'), t('pop_dlg_x_text'));",
      "window.dispatchEvent(new CustomEvent('discovery', { detail: { id: 'x', title: t('a'), text: t('b') } }));",
    ].join('\n');
    expect(扫对话出口(人造)).toEqual([
      "'没迁移的标题', '没迁移的正文');",
      "title: '中文标题', text: '中文正文'",
    ]);
  });

  it('新键不孤儿：38 个新键都在四个文件里被 t() 引用', () => {
    const 新键 = [...new Set([
      ...Object.values(POI_DIALOGS).flatMap(([tk, , , bk]) => [tk, bk]),
      'pop_disc_fantasy_ring_text',
    ])].filter((k) => k.startsWith('pop_dlg_') || k.startsWith('pop_disc_'));
    expect(新键.length, '新键数对不上 —— 切片范围变了？').toBe(38);
    const 源码 = POP_FILES.map((rel) => readFileSync(join(process.cwd(), rel), 'utf8')).join('\n');
    const 没人用 = 新键.filter((k) => !源码.includes("t('" + k + "')"));
    expect(没人用, '这些新键建了却没人引用（死键）').toEqual([]);
  });

  it('键数腿：38 个新键的文案在两表里最多两个键（全局规矩的本地复查）', () => {
    const 新键 = [...new Set(Object.values(POI_DIALOGS).flatMap(([tk, , , bk]) => [tk, bk]))]
      .filter((k) => k.startsWith('pop_dlg_'));
    for (const [名, table] of [['zh', STRINGS_ZH], ['en', STRINGS_EN]]) {
      const 计数 = new Map();
      for (const v of Object.values(table)) 计数.set(v, (计数.get(v) ?? 0) + 1);
      for (const 键 of 新键) {
        expect(计数.get(table[键]) ?? 0, `${名} 表里 "${键}" 的文案出现了 ${计数.get(table[键])} 次`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('反向控制：不在表里的假键必须被点名（防结构腿恒绿）', () => {
    const 假 = ['pop_dlg_根本不存在_xyz', 'pop_disc_也不存在_abc'];
    const 缺 = 假.filter((k) => STRINGS_ZH[k] === undefined || STRINGS_EN[k] === undefined);
    expect(缺).toEqual(假);
  });
});
